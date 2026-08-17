// DisparoBooster - campaign-ai-message
// Gera ou OTIMIZA uma mensagem usando o MESMO contexto do dispatch-worker:
// - agent_system_prompt do prospecting_profiles (treino do usuário)
// - mavi_briefing (ICP, value props, objeções, SPIN bank — Knowledge Pack)
// - company_branding (nome empresa/agente — white-label)
// - LOVABLE_API_KEY via Lovable AI Gateway (failover)
// Garante 100% de sincronia com "Treinar IA".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateAIContent } from "../_shared/ai-json.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: ud } = await userClient.auth.getUser();
    const userId = ud?.user?.id;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const mode: "generate" | "optimize" = body?.mode === "optimize" ? "optimize" : "generate";
    const currentText: string = String(body?.text ?? "");
    const stepIndex: number = Number(body?.step_index ?? 0);
    const totalSteps: number = Number(body?.total_steps ?? 1);
    const exampleLead = body?.example_lead ?? null;
    const variables: string[] = Array.isArray(body?.variables) ? body.variables : [
      "nome", "empresa", "cidade", "segmento", "cargo",
    ];

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [{ data: prof }, { data: briefing }, { data: brand }] = await Promise.all([
      admin.from("prospecting_profiles")
        .select("agent_system_prompt, system_prompt, produto, publico_alvo, diferenciais, ticket_medio")
        .eq("user_id", userId).maybeSingle(),
      admin.from("mavi_briefing")
        .select("icp_descricao, value_props, objecoes_comuns, gatilhos_compra, spin_bank, abordagem_preferida")
        .eq("user_id", userId).maybeSingle(),
      admin.from("company_branding")
        .select("company_name, agent_name").eq("user_id", userId).maybeSingle(),
    ]);

    // Fonte real do Treinar IA: Assistente salva em `system_prompt`.
    // `agent_system_prompt` é legado/backfill e não pode sobrescrever edição nova.
    const systemPrompt = String(prof?.system_prompt ?? "").trim() || String(prof?.agent_system_prompt ?? "").trim();
    const company = brand?.company_name || "nossa empresa";
    const agent = brand?.agent_name || "IA assistente";

    const stepBrief = totalSteps > 1
      ? `Esta é a mensagem ${stepIndex + 1} de ${totalSteps} numa sequência de cadência (cada passo intervala dias).`
      : `Esta é uma mensagem única de abertura.`;

    const variablesGuide = `Você PODE usar as variáveis ${variables.map((v) => `{{${v}}}`).join(", ")} no texto. Elas serão substituídas pelos dados reais do lead na hora do envio.`;

    const sysInstruction = `${systemPrompt}

# CONTEXTO DA EMPRESA
- Empresa: ${company}
- Agente: ${agent}
- Produto: ${prof?.produto ?? "-"}
- Público-alvo: ${prof?.publico_alvo ?? "-"}
- Diferenciais: ${prof?.diferenciais ?? "-"}
- Ticket médio: ${prof?.ticket_medio ?? "-"}

# KNOWLEDGE PACK (Treino IA)
- ICP: ${briefing?.icp_descricao ?? "-"}
- Value props: ${(briefing?.value_props ?? []).join(" | ")}
- Objeções comuns: ${(briefing?.objecoes_comuns ?? []).join(" | ")}
- Gatilhos de compra: ${(briefing?.gatilhos_compra ?? []).join(" | ")}
- Abordagem preferida: ${briefing?.abordagem_preferida ?? "-"}
- Banco SPIN Situação: ${(briefing?.spin_bank?.situacao ?? []).join(" | ")}
- Banco SPIN Problema: ${(briefing?.spin_bank?.problema ?? []).join(" | ")}
- Banco SPIN Implicação: ${(briefing?.spin_bank?.implicacao ?? []).join(" | ")}
- Banco SPIN Need Payoff: ${(briefing?.spin_bank?.need_payoff ?? []).join(" | ")}

# REGRAS OBRIGATÓRIAS
- SPIN Selling: uma pergunta por mensagem.
- WhatsApp curto (3-6 linhas), tom humano, sem emoji exagerado.
- Sem link, sem preço, sem promessa na abertura.
${variablesGuide}
${stepBrief}

# FORMATO DE RESPOSTA
Retorne APENAS o texto da mensagem pronta, sem aspas, sem cabeçalho, sem explicações.`;

    const userPrompt = mode === "optimize" && currentText
      ? `Otimize a mensagem abaixo mantendo o sentido mas deixando-a mais humana, persuasiva e aderente ao SPIN. Lead exemplo: ${JSON.stringify(exampleLead ?? {})}.

MENSAGEM ATUAL:
"""${currentText}"""

Retorne só a versão otimizada.`
      : `Gere uma mensagem de prospecção WhatsApp para o lead exemplo: ${JSON.stringify(exampleLead ?? {})}. Use variáveis ${variables.map((v) => `{{${v}}}`).join(", ")} quando fizer sentido.`;

    let text = "";
    try {
      text = (await generateAIContent(admin, userId, {
        system: sysInstruction,
        user: userPrompt,
        temperature: 0.7,
      })).trim();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (/429|rate/i.test(msg)) return json({ error: "Limite de requisições. Tente novamente em alguns segundos." }, 429);
      if (/402|payment|credits|insufficient_quota|quota_exceeded|billing/i.test(msg)) {
        return json({ error: "Créditos de IA esgotados. Configure OpenAI/Gemini em Configurações → APIs ou adicione créditos." }, 402);
      }
      return json({ error: `IA falhou: ${msg.slice(0, 200)}` }, 500);
    }
    if (!text) return json({ error: "IA retornou vazio" }, 500);

    return json({ ok: true, text, mode });
  } catch (e: any) {
    console.error("[campaign-ai-message] error:", e?.message);
    return json({ error: e?.message ?? "Erro inesperado" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
