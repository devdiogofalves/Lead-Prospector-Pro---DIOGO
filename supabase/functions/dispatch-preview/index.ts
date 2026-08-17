// redeploy 2026-07-10f gemini auth
// dispatch-preview — gera a mensagem que a agente do tenant enviaria para um lead,
// SEM enfileirar nada. Crítico para anti-ceticismo: o operador cético
// precisa VER o que a IA vai dizer antes de confiar e disparar em massa.
//
// Duplica deliberadamente generateMessage + helpers do dispatch-worker
// para mantê-lo independente (padrão do projeto). Pesquisa Google
// (groundedResearch) é OPCIONAL — operador escolhe via with_grounding.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const GEMINI_OAI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

// ── Helpers duplicados do dispatch-worker (mantém edge function self-contained)
function formatMentalTriggers(mt: any): string[] {
  if (!mt) return [];
  const items: string[] = [];
  const arr = Array.isArray(mt) ? mt : Array.isArray(mt?.gatilhos) ? mt.gatilhos : null;
  if (arr) {
    for (const t of arr.slice(0, 6)) {
      if (typeof t === "string") { items.push(t); continue; }
      const nome = t?.nome ?? t?.titulo ?? t?.label ?? "";
      const exemplo = t?.exemplo_frase ?? t?.exemplo ?? "";
      if (nome && exemplo) items.push(`${nome} — "${String(exemplo).slice(0, 140)}"`);
      else if (nome) items.push(String(nome));
    }
  } else if (typeof mt?.raw === "string") items.push(mt.raw.slice(0, 400));
  return items.filter(Boolean);
}

function formatLivePanelData(p: any): string {
  if (!p) return "";
  const clean = (s: any, n: number): string => {
    if (typeof s !== "string") return "";
    const t = s.trim();
    if (!t) return "";
    return t.length > n ? t.slice(0, n) + "…" : t;
  };
  const lines: string[] = [];
  const add = (label: string, value: any, max: number) => {
    const v = clean(value, max);
    if (v) lines.push(`- ${label}: ${v}`);
  };
  add("Produto/serviço", p.produto, 240);
  add("Público-alvo (ICP do painel)", p.publico_alvo, 240);
  add("Ticket médio", p.ticket_medio, 80);
  add("Região", p.regiao, 80);
  add("Diferenciais", p.diferenciais, 320);
  add("O que já tentou (evite repetir)", p.ja_tentou, 240);
  if (!lines.length) return "";
  return "DADOS ATUAIS DO NEGÓCIO (valores vivos do painel — PRIORIZE estes sobre qualquer valor narrativo anterior do prompt principal):\n" + lines.join("\n");
}

function formatKnowledgePack(b: any, company: string): string[] {
  if (!b) return [];
  const parts: string[] = [];
  if (b.personas_alvo?.length) parts.push(`Personas decisoras (cargos-alvo): ${b.personas_alvo.slice(0, 8).join(", ")}`);
  if (b.clientes_referencia?.length) {
    parts.push(`Clientes-referência da ${company} (cite 1-2 APENAS quando o lead estiver em setor compatível — JAMAIS lista inteira): ${b.clientes_referencia.slice(0, 20).join(", ")}`);
  }
  const sb = b.spin_bank ?? {};
  const spinLines: string[] = [];
  const pickTop = (arr: any, n: number) => Array.isArray(arr) ? arr.filter((x: any) => typeof x === "string").slice(0, n) : [];
  const sit = pickTop(sb.situacao, 3);
  const prob = pickTop(sb.problema, 3);
  const imp = pickTop(sb.implicacao, 3);
  const np = pickTop(sb.need_payoff, 3);
  if (sit.length) spinLines.push(`S (Situação): ${sit.join(" | ")}`);
  if (prob.length) spinLines.push(`P (Problema): ${prob.join(" | ")}`);
  if (imp.length) spinLines.push(`I (Implicação): ${imp.join(" | ")}`);
  if (np.length) spinLines.push(`N (Need Payoff): ${np.join(" | ")}`);
  if (spinLines.length) parts.push(`Banco SPIN da ${company} (inspiração contextual — escolha 1 pergunta apropriada por mensagem, NÃO liste todas):\n` + spinLines.join("\n"));
  if (b.value_props?.length) {
    parts.push(`Value props da ${company} (⚠️ USE SOMENTE na fase N do SPIN, quando o lead já verbalizou a dor — JAMAIS na abertura ou nas fases S/P/I):\n- ${b.value_props.slice(0, 6).join("\n- ")}`);
  }
  return parts;
}

async function buildBriefingBlock(admin: any, userId: string): Promise<string> {
  try {
    const [{ data: b }, { data: p }, { data: br }] = await Promise.all([
      admin.from("mavi_briefing").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("prospecting_profiles")
        .select("mental_triggers, produto, publico_alvo, ticket_medio, regiao, diferenciais, ja_tentou")
        .eq("user_id", userId).maybeSingle(),
      admin.from("company_branding").select("company_name").eq("user_id", userId).maybeSingle(),
    ]);
    const company = br?.company_name ?? "nossa empresa";
    const body: string[] = [];
    const live = formatLivePanelData(p);
    if (live) body.push(live);
    if (b?.icp_descricao) body.push(`ICP: ${b.icp_descricao}`);
    if (b?.segmentos_alvo?.length) body.push(`Segmentos-alvo: ${b.segmentos_alvo.join(", ")}`);
    if (b?.portes_alvo?.length) body.push(`Portes-alvo: ${b.portes_alvo.join(", ")}`);
    if (b?.gatilhos_compra?.length) body.push(`Gatilhos de compra: ${b.gatilhos_compra.join(", ")}`);
    if (b?.objecoes_comuns?.length) body.push(`Objeções comuns a contornar: ${b.objecoes_comuns.join(", ")}`);
    if (b?.abordagem_preferida) body.push(`Abordagem preferida: ${b.abordagem_preferida}`);
    body.push(...formatKnowledgePack(b, company));
    const triggers = formatMentalTriggers(p?.mental_triggers);
    if (triggers.length) body.push(`Gatilhos mentais (inspire-se, NÃO copie literal):\n- ${triggers.join("\n- ")}`);
    const lp = b?.learned_patterns ?? {};
    if (lp.top_segmentos_qualificados?.length) {
      body.push(`Segmentos que mais qualificam: ${lp.top_segmentos_qualificados.map((x: any) => x.label).join(", ")}`);
    }
    if (!body.length) return "";
    return [`\n\n=== BRIEFING ${company} ===`, ...body, "=== FIM BRIEFING ==="].join("\n");
  } catch { return ""; }
}

async function groundedResearch(item: any, apiKey: string): Promise<string> {
  if (!item?.nome_empresa) return "";
  const query = `${item.nome_empresa} ${item.cidade ?? ""} ${item.especialidades ?? ""}`.trim();
  try {
    const r = await fetch(GEMINI_OAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você pesquisa empresas reais via Google Search. Responda em PT-BR com fatos verificáveis." },
          { role: "user", content: `Pesquise resumidamente: ${query}\n\nForneça em 3-5 linhas: setor real, porte aproximado, produtos principais, qualquer dado público relevante.` },
        ],
        web_search_options: { search_context_size: "low" },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return "";
    const j = await r.json();
    return String(j.choices?.[0]?.message?.content ?? "").slice(0, 3000);
  } catch { return ""; }
}

function parseMessageParts(mensagem: string): string[] {
  if (!mensagem) return [];
  try {
    const parsed = JSON.parse(mensagem);
    if (Array.isArray(parsed?.messages)) {
      return parsed.messages
        .sort((a: any, b: any) => (a.part ?? 0) - (b.part ?? 0))
        .map((m: any) => String(m.message ?? "").trim())
        .filter((m: string) => m.length > 0);
    }
  } catch (_) { /* fallback */ }
  const parts = mensagem.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
  return parts.length >= 2 ? parts : [mensagem];
}

// ── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const lead = body?.lead ?? {};
    const withGrounding = body?.with_grounding === true;

    if (!lead.nome_empresa && !lead.telefone) {
      return json({ error: "Forneça ao menos nome_empresa ou telefone no lead." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Carrega chaves do usuário
    const { data: apiKeys } = await admin.from("user_api_keys")
      .select("provider, api_key").eq("user_id", userId);
    const providers = new Set((apiKeys ?? []).map((k: any) => k.provider));
    if (!providers.has("openai") && !providers.has("gemini")) {
      return json({
        success: false,
        error: "Sem chave de IA configurada (OpenAI ou Gemini). Adicione em Configurações → APIs.",
      });
    }
    const openaiKey = apiKeys?.find((k: any) => k.provider === "openai")?.api_key ?? "";
    const geminiKey = apiKeys?.find((k: any) => k.provider === "gemini")?.api_key ?? "";

    // Carrega profile + briefing + branding
    const [{ data: profile }, { data: branding }] = await Promise.all([
      admin.from("prospecting_profiles")
        .select("system_prompt, produto, publico_alvo, diferenciais")
        .eq("user_id", userId).maybeSingle(),
      admin.from("company_branding").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    const briefingBlock = await buildBriefingBlock(admin, userId);
    const agentName = branding?.agent_name ?? "IA assistente";
    const companyName = branding?.company_name ?? "nossa empresa";

    // Pesquisa Google opcional (só se operador pediu — pode levar até 20s)
    let researched = "";
    if (withGrounding && geminiKey) {
      researched = await groundedResearch(lead, geminiKey);
    }

    // Constroi system prompt final (mesma lógica do dispatch-worker)
    const sys = profile?.system_prompt ?? `Você é a ${agentName}, SDR consultiva da ${companyName}. Aplica RAPPORT + SPIN Selling no WhatsApp.

Você NÃO pita a ${companyName} na abertura. Primeiro cria conexão e faz UMA pergunta diagnóstica (Fase S — Situação).

ESTRUTURA OBRIGATÓRIA — 2 partes:
PARTE 1 (RAPPORT): Observação específica sobre o lead/empresa, sem mencionar a ${companyName} nem produto.
PARTE 2 (SPIN-S): UMA única pergunta aberta de situação sobre o dia-a-dia do lead.

Retorne APENAS JSON: {"messages":[{"part":1,"message":"..."},{"part":2,"message":"..."}]}`;

    const sysWithBriefing = sys + (briefingBlock || "");
    const contextBlock = researched
      ? `\n\nCONTEXTO REAL DO PROSPECT (pesquisado via Google):\n${researched.slice(0, 3000)}`
      : "";
    const userPrompt = `PROSPECT (potencial cliente da ${companyName}):
Empresa: ${lead.nome_empresa ?? "(não informado)"}
Contato: ${lead.nome_contato ?? "(sem nome)"}
Setor / nicho: ${lead.especialidades ?? "não identificado"}
Cidade: ${lead.cidade ?? "Brasil"}${contextBlock}

Gere as 2 partes da mensagem de abertura. Responda APENAS com JSON {"messages":[{"part":1,"message":"..."},{"part":2,"message":"..."}]}.`;

    // Chama IA
    let raw = "";
    let used_fallback = false;
    let fallback_reason = "";
    try {
      if (openaiKey) {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: sysWithBriefing }, { role: "user", content: userPrompt }],
            response_format: { type: "json_object" },
          }),
        });
        if (!r.ok) {
          used_fallback = true;
          fallback_reason = `OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`;
        } else {
          const j = await r.json();
          raw = j.choices?.[0]?.message?.content?.trim() ?? "";
        }
      } else {
        const r = await fetch(GEMINI_OAI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${geminiKey}` },
          body: JSON.stringify({
            model: "gemini-2.5-flash",
            messages: [{ role: "system", content: sysWithBriefing }, { role: "user", content: userPrompt }],
          }),
        });
        if (!r.ok) {
          used_fallback = true;
          fallback_reason = `Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`;
        } else {
          const j = await r.json();
          raw = j.choices?.[0]?.message?.content?.trim() ?? "";
        }
      }
    } catch (e: any) {
      used_fallback = true;
      fallback_reason = `Erro de rede: ${String(e?.message || e).slice(0, 200)}`;
    }

    const parts = used_fallback
      ? [`Oi! Vi aqui que a ${lead.nome_empresa ?? "vocês"} atua no setor de ${lead.especialidades ?? "B2B"} — chamei sua atenção rapidinho pra trocar uma ideia.`,
         `Pergunto porque trabalho com empresas do seu segmento: como funciona aí no dia-a-dia hoje?`]
      : parseMessageParts(raw);

    return json({
      success: true,
      parts,
      used_fallback,
      fallback_reason: fallback_reason || undefined,
      // Detalhes técnicos (accordion no UI)
      briefing_loaded: briefingBlock.length > 0,
      briefing_chars: briefingBlock.length,
      researched_chars: researched.length,
      researched_preview: researched.slice(0, 800),
      ia_provider: openaiKey ? "openai/gpt-4o-mini" : "gemini-2.5-flash",
      lead_context_used: {
        nome_empresa: lead.nome_empresa ?? null,
        especialidades: lead.especialidades ?? null,
        cidade: lead.cidade ?? null,
        site: lead.site ?? null,
        linkedin_url: lead.linkedin_url ?? null,
      },
      // System prompt completo (pra accordion "Detalhes técnicos")
      system_prompt_preview: sysWithBriefing,
      user_prompt_preview: userPrompt,
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
