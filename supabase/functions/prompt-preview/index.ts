// prompt-preview — retorna o system prompt REAL que cada canal usaria hoje
// para o tenant autenticado. Útil pra auditar o que a IA está lendo antes de
// disparar/atender. Somente leitura — não modifica nada.
// v1 2026-07-25
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadProspectContext, buildSpinSystem, type Channel } from "../_shared/spin-prompt.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Auth: derive user from JWT (anon client + user's token)
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return resp({ error: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return resp({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Carrega todas as fontes que os workers leem
    const [
      { data: branding },
      { data: profile },
      { data: settings },
      { data: briefing },
      { data: calRow },
    ] = await Promise.all([
      admin.from("company_branding").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("prospecting_profiles").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("qualification_settings").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("mavi_briefing").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("google_calendar_tokens").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);

    const agentName = branding?.agent_name?.trim() || "IA assistente";
    const companyName = branding?.company_name?.trim() || "nossa empresa";
    const hasCalendar = !!calRow;
    const flowMode = String((settings as any)?.flow_mode ?? "").trim().toLowerCase();

    // === CANAIS DE DISPARO (buildSpinSystem) ===
    const ctx = await loadProspectContext(admin, userId);
    const dispatchChannels: Channel[] = ["email", "instagram", "telegram", "whatsapp", "linkedin", "campaign", "followup"];
    const dispatchPreviews: Record<string, { prompt: string; length: number }> = {};
    for (const ch of dispatchChannels) {
      const prompt = buildSpinSystem({ channel: ch, stage: "abertura", ctx });
      dispatchPreviews[ch] = { prompt, length: prompt.length };
    }

    // === ATENDIMENTO (qualification-worker) — devolve LAYERS separadas ===
    const assistantPrompt = String((profile as any)?.system_prompt ?? "").trim()
      || String((profile as any)?.agent_system_prompt ?? "").trim();
    const responseInstructions = String((settings as any)?.response_instructions ?? "").trim();
    const legacyQualificationPrompt = String((settings as any)?.system_prompt ?? "").trim();

    const layers = [
      {
        id: "behavior_contract",
        label: "1. Contrato de comportamento (9 seções)",
        source: "Hardcoded no qualification-worker",
        editable: false,
        preview: `## PAPEL\nVocê é ${agentName}, atendente REAL da ${companyName}...\n\n## PERSONALIDADE E TOM\n- Sem gênero em auto-referências (usa nome ${agentName})\n- Máx 2 frases, 35 palavras, 1 pergunta\n- Vocabulário PROIBIDO: prezado, segue abaixo, notei que você é...\n\n## OBJETIVO\nConduzir SPIN discreto → convidar para call por VÍDEO (Meet) quando qualificado.\n\n## SOP (12 passos)\n1. Responder o que o lead perguntou.\n2. Se saudação, devolver saudação + pergunta de contexto.\n[...] 12 passos completos.\n\n## FERRAMENTAS INTERNAS\n- Tag [QUALIFICADO] → cria card no CRM\n- Handoff quando pedido humano\n- Transcrição áudio automática`,
      },
      {
        id: "user_system_prompt",
        label: "2. System prompt do Treinar IA (prospecting_profiles.system_prompt)",
        source: "Página /assistente → aba Negócio → campo System Prompt",
        editable: true,
        edit_route: "/assistente",
        preview: assistantPrompt || "(vazio — usando fallback buildDefaultPrompt gerado a partir de produto/publico_alvo/etc)",
      },
      flowMode === "simple" ? {
        id: "flow_simple_override",
        label: "3. MODO SIMPLES ativo (sobrescreve SPIN)",
        source: "qualification_settings.flow_mode = 'simple'",
        editable: true,
        edit_route: "/qualificacao-conversas?tab=configurar",
        preview: "IGNORE SPIN. Siga LITERALMENTE o roteiro do prompt acima, sem adicionar perguntas extras. Marque [QUALIFICADO] quando o roteiro definir.",
      } : {
        id: "flow_spin_active",
        label: "3. Modo SPIN padrão ativo",
        source: "qualification_settings.flow_mode = null",
        editable: true,
        edit_route: "/qualificacao-conversas?tab=configurar",
        preview: "SPIN Selling em ordem: S → P → I → N. Uma fase por mensagem. Não pular etapa.",
      },
      {
        id: "response_instructions",
        label: "4. Instruções operacionais (Configurar IA)",
        source: "qualification_settings.response_instructions",
        editable: true,
        edit_route: "/qualificacao-conversas?tab=configurar",
        preview: responseInstructions || "(vazio)",
      },
      {
        id: "briefing",
        label: "5. Briefing + Knowledge Pack (mavi_briefing)",
        source: "Página /assistente → aba Knowledge Pack",
        editable: true,
        edit_route: "/assistente",
        preview: briefing
          ? [
              briefing.icp_descricao && `ICP: ${briefing.icp_descricao}`,
              briefing.value_props && `Value Props: ${JSON.stringify(briefing.value_props).slice(0, 300)}`,
              briefing.clientes_referencia && `Clientes ref: ${JSON.stringify(briefing.clientes_referencia).slice(0, 200)}`,
              briefing.objecoes_comuns && `Objeções: ${JSON.stringify(briefing.objecoes_comuns).slice(0, 200)}`,
            ].filter(Boolean).join("\n") || "(campos vazios)"
          : "(sem briefing salvo)",
      },
      hasCalendar ? {
        id: "meet_now",
        label: "6. Meet Agora habilitado (Google Calendar conectado)",
        source: "google_calendar_tokens",
        editable: false,
        preview: "IA pode inserir [GERAR_MEET_AGORA] quando lead pedir call imediata.",
      } : {
        id: "meet_now_disabled",
        label: "6. Meet Agora DESABILITADO",
        source: "google_calendar_tokens vazio",
        editable: true,
        edit_route: "/google-calendar",
        preview: "Conecte Google Calendar em /google-calendar pra habilitar agendamento automático.",
      },
      (settings as any)?.fixed_link ? {
        id: "fixed_link",
        label: "7. Link oficial autorizado",
        source: "qualification_settings.fixed_link",
        editable: true,
        edit_route: "/qualificacao-conversas?tab=configurar",
        preview: `${(settings as any).fixed_link_label ?? "Link"}: ${(settings as any).fixed_link}`,
      } : null,
      (settings as any)?.fixed_image_url ? {
        id: "fixed_image",
        label: "8. Imagem fixa disponível (marcador [ENVIAR_IMAGEM])",
        source: "qualification_settings.fixed_image_url",
        editable: true,
        edit_route: "/qualificacao-conversas?tab=configurar",
        preview: `URL: ${(settings as any).fixed_image_url}`,
      } : null,
      (settings as any)?.fixed_video_url ? {
        id: "fixed_video",
        label: "9. Vídeo fixo disponível (marcador [ENVIAR_VIDEO])",
        source: "qualification_settings.fixed_video_url",
        editable: true,
        edit_route: "/qualificacao-conversas?tab=configurar",
        preview: `URL: ${(settings as any).fixed_video_url}`,
      } : null,
      legacyQualificationPrompt ? {
        id: "legacy_qual_prompt",
        label: "⚠️ Prompt legado detectado (só é usado se Treinar IA estiver vazio)",
        source: "qualification_settings.system_prompt (DEPRECATED)",
        editable: true,
        edit_route: "/qualificacao-conversas?tab=configurar",
        preview: legacyQualificationPrompt.slice(0, 400),
      } : null,
    ].filter(Boolean);

    return resp({
      ok: true,
      tenant: {
        agent_name: agentName,
        company_name: companyName,
        has_training: !!(profile?.produto || profile?.publico_alvo || profile?.diferenciais),
        has_calendar: hasCalendar,
        flow_mode: flowMode || "spin",
      },
      dispatch: dispatchPreviews,
      attendance_layers: layers,
      warnings: [
        !assistantPrompt && !profile?.produto && "Treinar IA está vazio — a IA vai responder genérico. Preencha /assistente.",
        legacyQualificationPrompt && "Prompt legado em qualification_settings.system_prompt existe mas está sendo ignorado (Treinar IA tem prioridade).",
        !branding?.company_name && "Branding sem company_name — cai no fallback 'nossa empresa'.",
      ].filter(Boolean),
    });
  } catch (e: any) {
    return resp({ error: String(e?.message ?? e).slice(0, 400) }, 500);
  }
});
