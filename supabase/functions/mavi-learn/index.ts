// redeploy 2026-07-10f gemini auth
// Roda diário via pg_cron (03:00 BRT) ou sob demanda.
// Lê conversas dos últimos 7 dias, classifica outcome via chave IA do cliente,
// agrega padrões e atualiza mavi_briefing.learned_patterns.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const GEMINI_OAI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const ANALYZE_TOOL = {
  type: "function",
  function: {
    name: "analyze_conversation",
    description: "Classifica o outcome de uma conversa de prospecção.",
    parameters: {
      type: "object",
      properties: {
        outcome: { type: "string", enum: ["qualificado", "descartado", "sem_resposta", "objecao"] },
        objection_type: { type: "string", description: "Curto e genérico: 'preco', 'sem_interesse', 'ja_tem_fornecedor', 'sem_orcamento', 'timing', ou null", nullable: true },
        segment: { type: "string", description: "Segmento de negócio identificado (ex: clínica odontológica, distribuidora). Vazio se não detectado.", nullable: true },
        porte: { type: "string", description: "MEI, ME, EPP, Médio, Grande, ou vazio.", nullable: true },
        spin_phase_reached: { type: "string", enum: ["Situacao", "Problema", "Implicacao", "NeedPayoff", "Nenhuma"] },
        opening_quality: { type: "string", enum: ["alta", "media", "baixa"], description: "Qualidade da abertura inicial usada pelo agente." },
      },
      required: ["outcome", "spin_phase_reached", "opening_quality"],
      additionalProperties: false,
    },
  },
};

async function callAI(messages: any[], tool: any, keys: { openaiKey?: string; geminiKey?: string }) {
  const payload = {
    messages,
    tools: [tool],
    tool_choice: { type: "function", function: { name: tool.function.name } },
  };

  let r: Response;
  if (keys.openaiKey) {
    r = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${keys.openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", ...payload }),
    });
  } else if (keys.geminiKey) {
    r = await fetch(GEMINI_OAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${keys.geminiKey}` },
      body: JSON.stringify({ model: "gemini-2.5-flash", ...payload }),
    });
  } else {
    // Gateway Lovable descontinuado: sem OpenAI/Gemini não há como aprender.
    throw new Error("Configure sua chave OpenAI ou Gemini em Configurações > APIs para a IA aprender com as conversas.");
  }

  if (!r.ok) throw new Error(`AI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const call = j.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return null;
  try { return JSON.parse(call.function.arguments); } catch { return null; }
}

function topN(arr: string[], n = 5) {
  const map = new Map<string, number>();
  for (const x of arr) {
    if (!x) continue;
    const k = String(x).toLowerCase().trim();
    if (!k || k === "null" || k === "nenhuma" || k === "vazio" || k === "n/a" || k === "none") continue;
    if (isInvalidLearnedSegment(k)) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, count]) => ({ label, count }));
}

function isInvalidLearnedSegment(value: string | null | undefined) {
  const k = String(value ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim();
  if (!k || k.length < 4 || k.includes("?") || k.includes(" ou ")) return true;
  // Segmentos amplos demais ou inferidos de cargo/empresa do lead viravam falso aprendizado.
  return [
    "instituicao financeira",
    "setor financeiro",
    "financeiro",
    "energia ou financeiro",
    "nao identificado",
    "desconhecido",
  ].includes(k);
}

function normalizeSpinPhase(value: string | null | undefined) {
  const k = String(value ?? "").toLowerCase().trim();
  if (k.includes("need")) return "NeedPayoff";
  if (k.includes("implica")) return "Implicacao";
  if (k.includes("proble")) return "Problema";
  if (k.includes("situa")) return "Situacao";
  return "Nenhuma";
}

function displaySpinPhase(value: string | null | undefined) {
  const normalized = normalizeSpinPhase(value);
  return normalized === "Nenhuma" ? null : normalized;
}

function fallbackSegmentFromText(text: string) {
  const normalized = text.replace(/[*_]/g, " ").replace(/\s+/g, " ").trim();
  const patterns = [
    /atuam com\s+(.+?)(?:\s+e\s+imagino|\s*,|\s*\.|$)/i,
    /atua com\s+(.+?)(?:\s+e\s+imagino|\s*,|\s*\.|$)/i,
    /setor de\s+(.+?)(?:\s+e\s+imagino|\s*,|\s*\.|$)/i,
    /mercado de\s+(.+?)(?:\s+e\s+imagino|\s*,|\s*\.|$)/i,
  ];
  for (const p of patterns) {
    const found = normalized.match(p)?.[1]?.trim();
    if (found && found.length >= 4 && found.length <= 80 && !isInvalidLearnedSegment(found)) return found;
  }
  return null;
}

function validateLearnedSegment(candidate: string | null | undefined, transcript: string, businessContext: string) {
  const raw = String(candidate ?? "").trim();
  if (isInvalidLearnedSegment(raw)) return null;
  const normalized = raw.toLowerCase();
  // Se já está no treino validado pelo operador, pode entrar.
  if (businessContext.toLowerCase().includes(normalized)) return raw;
  // Senão, só aceita quando aparece nas falas do lead — não em abertura ruim da IA.
  const leadOnly = transcript
    .split("\n")
    .filter((line) => /^Lead:/i.test(line))
    .join("\n")
    .toLowerCase();
  return leadOnly.includes(normalized) ? raw : null;
}

async function runForUser(admin: any, userId: string) {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [{ data: apiKeys }, { data: branding }, { data: profile }, { data: briefing }] = await Promise.all([
    admin.from("user_api_keys").select("provider, api_key").eq("user_id", userId),
    admin.from("company_branding").select("company_name, agent_name").eq("user_id", userId).maybeSingle(),
    admin.from("prospecting_profiles").select("produto, publico_alvo, diferenciais").eq("user_id", userId).maybeSingle(),
    admin.from("mavi_briefing").select("icp_descricao, segmentos_alvo, objecoes_comuns, abordagem_preferida").eq("user_id", userId).maybeSingle(),
  ]);
  const openaiKey = apiKeys?.find((k: any) => k.provider === "openai")?.api_key ?? "";
  const geminiKey = apiKeys?.find((k: any) => k.provider === "gemini")?.api_key ?? "";
  const companyName = branding?.company_name ?? "a empresa do usuário";
  const agentName = branding?.agent_name ?? "IA assistente";
  const businessContext = [
    `Empresa: ${companyName}`,
    `Agente: ${agentName}`,
    profile?.produto ? `Produto/serviço: ${profile.produto}` : null,
    profile?.publico_alvo ? `Público-alvo: ${profile.publico_alvo}` : null,
    profile?.diferenciais ? `Diferenciais: ${profile.diferenciais}` : null,
    briefing?.icp_descricao ? `ICP: ${briefing.icp_descricao}` : null,
    briefing?.segmentos_alvo?.length ? `Segmentos-alvo: ${briefing.segmentos_alvo.join(", ")}` : null,
    briefing?.objecoes_comuns?.length ? `Objeções comuns: ${briefing.objecoes_comuns.join(", ")}` : null,
    briefing?.abordagem_preferida ? `Abordagem preferida: ${briefing.abordagem_preferida}` : null,
  ].filter(Boolean).join("\n");

  const { data: convs } = await admin
    .from("qualification_conversations")
    .select("id, nome, telefone, status, qualified")
    .eq("user_id", userId)
    .gte("last_message_at", since)
    .limit(100);

  if (!convs?.length) return { user_id: userId, outcomes: 0 };

  // Outcomes já calculados (não reprocessa)
  const { data: existingRows } = await admin
    .from("mavi_conversation_outcomes")
    .select("conversation_id")
    .eq("user_id", userId)
    .in("conversation_id", convs.map((c: any) => c.id));
  const done = new Set((existingRows ?? []).map((r: any) => r.conversation_id));
  const todo = convs.filter((c: any) => !done.has(c.id));

  const outcomes: any[] = [];
  for (const c of todo) {
    const { data: msgs } = await admin
      .from("qualification_messages")
      .select("role, content")
      .eq("conversation_id", c.id)
      .order("created_at", { ascending: true })
      .limit(40);
    if (!msgs?.length) continue;
    const transcript = msgs.map((m: any) => `${m.role === "user" ? "Lead" : "Agente"}: ${m.content || ""}`).join("\n");
    const opening = msgs.find((m: any) => m.role === "assistant")?.content?.slice(0, 200) ?? "";
    try {
      const analysis = await callAI([
        { role: "system", content: `Você analisa conversas de prospecção da empresa abaixo. Classifique o outcome com base no contexto real do cliente, na conduta SPIN e no engajamento do lead.\n\nREGRAS DE VALIDAÇÃO:\n- Não invente segmento. Só retorne segment se ele estiver explicitamente no contexto validado do negócio OU nas falas do lead.\n- Nome/cargo/empregador do lead não é segmento validado. Ex.: "Fundação Bradesco" não autoriza retornar "instituição financeira".\n- Se houver dúvida entre dois segmentos, retorne null.\n- Nunca use perguntas da IA como fonte de segmento.\n\n${businessContext}` },
        { role: "user", content: `Transcrição:\n${transcript}\n\nAnalise. IMPORTANTE: se não conseguir validar segmento/porte/objeção, retorne null (não use "vazio" ou "n/a").` },
      ], ANALYZE_TOOL, { openaiKey, geminiKey });
      if (!analysis) continue;
      const segment = validateLearnedSegment(analysis.segment, transcript, businessContext) || fallbackSegmentFromText(transcript);
      outcomes.push({
        user_id: userId,
        conversation_id: c.id,
        outcome: analysis.outcome,
        objection_type: analysis.objection_type || null,
        segment: segment || null,
        porte: analysis.porte || null,
        spin_phase_reached: normalizeSpinPhase(analysis.spin_phase_reached),
        opening_used: opening,
        analysis: { opening_quality: analysis.opening_quality },
      });
    } catch (e: any) {
      console.warn("analyze fail", c.id, e.message);
    }
  }

  if (outcomes.length) {
    await admin.from("mavi_conversation_outcomes").upsert(outcomes, { onConflict: "conversation_id" });
  }

  // Agrega padrões considerando TODOS os outcomes recentes do usuário (não só os novos)
  const { data: all } = await admin
    .from("mavi_conversation_outcomes")
    .select("outcome, objection_type, segment, porte, spin_phase_reached, opening_used, analysis")
    .eq("user_id", userId)
    .gte("created_at", since);

  const qualificados = (all ?? []).filter((r: any) => r.outcome === "qualificado");
  const comObjecao = (all ?? []).filter((r: any) => r.objection_type);
  const fasesTravadas = (all ?? [])
    .filter((r: any) => r.outcome !== "qualificado" && r.spin_phase_reached && r.spin_phase_reached !== "NeedPayoff")
    .map((r: any) => normalizeSpinPhase(r.spin_phase_reached));
  const allSegments = (all ?? []).map((r: any) => r.segment || fallbackSegmentFromText(r.opening_used || "")).filter(Boolean);
  const qualifiedSegments = qualificados.map((r: any) => r.segment || fallbackSegmentFromText(r.opening_used || "")).filter(Boolean);

  const learned_patterns = {
    total_conversas: all?.length ?? 0,
    total_qualificados: qualificados.length,
    taxa_qualificacao_pct: all?.length ? Math.round((qualificados.length / all.length) * 100) : 0,
    top_segmentos_qualificados: topN(qualifiedSegments, 5),
    top_segmentos_conversados: topN(allSegments, 5),
    top_objecoes: topN(comObjecao.map((r: any) => r.objection_type).filter(Boolean), 5),
    melhores_aberturas: qualificados
      .filter((r: any) => r.analysis?.opening_quality === "alta" && r.opening_used)
      .slice(0, 5)
      .map((r: any) => ({ label: r.opening_used })),
    fase_spin_mais_travada: displaySpinPhase(topN(fasesTravadas, 1)[0]?.label) ?? null,
  };

  // Garante registro de briefing
  const { data: existing } = await admin.from("mavi_briefing").select("id").eq("user_id", userId).maybeSingle();
  if (existing) {
    await admin.from("mavi_briefing").update({
      learned_patterns,
      last_learned_at: new Date().toISOString(),
    }).eq("user_id", userId);
  } else {
    await admin.from("mavi_briefing").insert({
      user_id: userId,
      learned_patterns,
      last_learned_at: new Date().toISOString(),
    });
  }

  return { user_id: userId, outcomes: outcomes.length, total_outcomes: all?.length ?? 0, learned_patterns };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const manual = body?.manual === true;
    const reanalyze = body?.reanalyze === true;

    let userIds: string[] = [];
    if (manual) {
      const auth = req.headers.get("Authorization") || "";
      const token = auth.replace("Bearer ", "");
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      );
      const { data: userData } = await userClient.auth.getUser(token);
      if (!userData?.user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userIds = [userData.user.id];
      if (reanalyze) {
        await admin.from("mavi_conversation_outcomes").delete().eq("user_id", userData.user.id);
      }
    } else {
      // Cron branch — aceita x-cron-secret OU Authorization: Bearer <SERVICE_ROLE>.
      // Antes: qualquer anon key executava e recebia learned_patterns de todos os tenants.
      const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
      const providedCron = req.headers.get("x-cron-secret") ?? "";
      const authHdr = req.headers.get("Authorization") ?? "";
      const bearerToken = authHdr.startsWith("Bearer ") ? authHdr.slice(7) : "";
      const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const cronOk = (cronSecret && providedCron === cronSecret) || (serviceRole && bearerToken === serviceRole);
      if (!cronOk) {
        return new Response(JSON.stringify({ error: "cron_unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Cron: roda para todos com briefing existente OU com conversas recentes
      const { data: rows } = await admin
        .from("qualification_conversations")
        .select("user_id")
        .gte("last_message_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
        .limit(1000);
      userIds = [...new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean))];
    }

    const results: any[] = [];
    let totalOutcomes = 0;
    let totalConsidered = 0;
    for (const uid of userIds) {
      try {
        const r = await runForUser(admin, uid);
        totalOutcomes += r.outcomes ?? 0;
        totalConsidered += r.total_outcomes ?? 0;
        results.push(r);
      } catch (e: any) {
        results.push({ user_id: uid, error: e.message });
      }
    }

    if (manual && results.length === 1 && results[0]?.error) {
      return new Response(JSON.stringify({ error: results[0].error, results }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, outcomes_analyzed: totalOutcomes, total_considered: totalConsidered, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
