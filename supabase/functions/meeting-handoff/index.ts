// meeting-handoff — handoff de reunião do funil do tenant
//
// Quando uma reunião é criada (manualmente em SchedulingTab ou automaticamente
// via qualification-worker.tryAutoSchedule), esta função:
//   1. Envia WhatsApp pro lead com link Meet (formato correto Mandrack /chat/send/text)
//   2. Envia WhatsApp pro grupo handoff com card formatado (nome, empresa, link Meet, hora)
//   3. Atualiza pipeline_card relacionado com observação contendo link Meet
//
// Antes, SchedulingTab usava endpoint Mandrack errado (/message/sendText/{instance}
// com header `apikey`) — formato Evolution antigo, possivelmente quebrado. E não
// notificava o grupo nem atualizava o pipeline. Esta function corrige tudo.
//
// Auth: service role (do qualification-worker) ou JWT do usuário (do SchedulingTab).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendText(base: string, token: string, phone: string, text: string) {
  const url = `${base.replace(/\/$/, "")}/chat/send/text`;
  const r = await fetch(url, {
    method: "POST",
    headers: { token, "Content-Type": "application/json" },
    body: JSON.stringify({ phone, body: text, delay: false }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Mandrack ${r.status}: ${txt.slice(0, 200)}`);
  return txt;
}

function fmtBR(d: Date): string {
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json();
    const meetingId = body?.meeting_id;
    if (!meetingId) return json({ error: "meeting_id obrigatório" }, 400);
    const notifyLead = body?.notify_lead !== false;
    const notifyGroup = body?.notify_group !== false;
    const updatePipeline = body?.update_pipeline !== false;

    // Auth: service role OR user JWT
    const isServiceRole = authHeader === `Bearer ${SERVICE_ROLE}`;
    let userId: string;
    if (isServiceRole) {
      userId = body?.user_id;
      if (!userId) return json({ error: "user_id obrigatório quando service role" }, 400);
    } else {
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      userId = userData.user.id;
    }

    // 1. Lê a reunião
    const { data: meeting } = await admin.from("scheduled_meetings")
      .select("id, conversation_id, lead_nome, lead_telefone, lead_email, titulo, descricao, start_at, end_at, meet_link, notified_lead, notified_group")
      .eq("id", meetingId).eq("user_id", userId).maybeSingle();
    if (!meeting) return json({ error: "reunião não encontrada" }, 404);

    // 2. Resolve WhatsApp (Mandrack) — prioriza multi-chip (whatsapp_instances),
    //    mantendo continuidade com o chip que conduziu a conversa; fallback legado.
    const { data: qSet } = await admin.from("qualification_settings")
      .select("attendant_instance_id").eq("user_id", userId).maybeSingle();
    let convChipId: string | null = null;
    if (meeting.conversation_id) {
      const { data: conv } = await admin.from("qualification_conversations")
        .select("whatsapp_instance_id").eq("id", meeting.conversation_id).maybeSingle();
      convChipId = (conv as any)?.whatsapp_instance_id ?? null;
    }
    const chipId = convChipId ?? (qSet as any)?.attendant_instance_id ?? null;
    let mandToken: string | undefined;
    if (chipId) {
      const { data: chip } = await admin.from("whatsapp_instances")
        .select("mandrack_instance_token").eq("id", chipId).eq("user_id", userId).maybeSingle();
      mandToken = (chip as any)?.mandrack_instance_token || undefined;
    }
    if (!mandToken) {
      const { data: anyChip } = await admin.from("whatsapp_instances")
        .select("mandrack_instance_token").eq("user_id", userId).eq("active", true)
        .not("mandrack_instance_token", "is", null).limit(1).maybeSingle();
      mandToken = (anyChip as any)?.mandrack_instance_token || undefined;
    }
    if (!mandToken) {
      const { data: integ } = await admin.from("user_integrations")
        .select("mandrack_instance_token").eq("user_id", userId).maybeSingle();
      mandToken = (integ as any)?.mandrack_instance_token || undefined;
    }
    let mandUrl = (Deno.env.get("MANDRACK_URL") ?? "https://api.mandrackstudio.ia.br").trim().replace(/\/$/, "");
    if (!/^https?:\/\//i.test(mandUrl)) mandUrl = `https://${mandUrl}`;

    const summary: Record<string, any> = { meeting_id: meetingId };
    const startDate = new Date(meeting.start_at);

    // 3. Notifica o lead via WhatsApp (idempotente — só se ainda não notificou)
    if (notifyLead && !meeting.notified_lead && meeting.lead_telefone && mandToken) {
      const firstName = (meeting.lead_nome ?? "").split(" ")[0];
      const leadMsg = `Olá${firstName ? " " + firstName : ""}! 👋

Reunião agendada:
📅 ${fmtBR(startDate)}
${meeting.meet_link ? `🎥 ${meeting.meet_link}` : "(sem link Meet — confirmaremos depois)"}

Já está na minha agenda. Qualquer coisa, é só me chamar por aqui.`;
      try {
        await sendText(mandUrl, mandToken, meeting.lead_telefone, leadMsg);
        await admin.from("scheduled_meetings").update({ notified_lead: true }).eq("id", meetingId);
        summary.lead_notified = true;
      } catch (e: any) {
        summary.lead_notified = false;
        summary.lead_notify_error = e.message;
      }
    } else {
      summary.lead_notified = meeting.notified_lead === true;
    }

    // 4. Notifica grupo handoff
    if (notifyGroup && !meeting.notified_group && mandToken) {
      const [{ data: qSettings }, { data: branding }] = await Promise.all([
        admin.from("qualification_settings").select("handoff_group_jid").eq("user_id", userId).maybeSingle(),
        admin.from("company_branding").select("company_name").eq("user_id", userId).maybeSingle(),
      ]);
      const groupJid = qSettings?.handoff_group_jid;
      const companyName = branding?.company_name ?? "Reunião";
      if (groupJid) {
        // Busca nome_contato/cargo da conversa pra enriquecer o card
        const { data: conv } = meeting.conversation_id
          ? await admin.from("qualification_conversations")
              .select("nome, nome_contato, cargo")
              .eq("id", meeting.conversation_id).maybeSingle()
          : { data: null };

        const empresa = conv?.nome ?? meeting.lead_nome ?? "(empresa)";
        const contato = (conv as any)?.nome_contato ?? meeting.lead_nome ?? "(contato)";
        const cargo = (conv as any)?.cargo ? ` — ${(conv as any).cargo}` : "";
        const groupMsg = `📅 *REUNIÃO AGENDADA — ${companyName.toUpperCase()}*

🏢 ${empresa}
👤 ${contato}${cargo}
📱 wa.me/${(meeting.lead_telefone ?? "").replace(/\D/g, "")}
🕐 ${fmtBR(startDate)}
${meeting.meet_link ? `🎥 ${meeting.meet_link}` : "(sem link Meet)"}

_${meeting.titulo}_`;
        try {
          await sendText(mandUrl, mandToken, groupJid, groupMsg);
          await admin.from("scheduled_meetings").update({ notified_group: true }).eq("id", meetingId);
          summary.group_notified = true;
        } catch (e: any) {
          summary.group_notified = false;
          summary.group_notify_error = e.message;
        }
      } else {
        summary.group_notified = false;
        summary.group_notify_error = "handoff_group_jid não configurado em qualification_settings";
      }
    } else {
      summary.group_notified = meeting.notified_group === true;
    }

    // 5. Atualiza pipeline_card relacionado com link Meet
    if (updatePipeline && meeting.lead_telefone) {
      try {
        // Lookup priorizado:
        // 1º (preferido): card vinculado à conversa de qualificação que originou
        //                 a reunião (source_table + source_id). Garante 1:1.
        // 2º (fallback): card mais recente pelo telefone do lead. Pode pegar
        //                card errado se o lead tem múltiplas fontes (Maps +
        //                LinkedIn), mas é a única opção quando a meeting foi
        //                criada manualmente sem conversation_id.
        let card: { id: string; observacoes: string | null; estagio?: string | null } | null = null;
        if (meeting.conversation_id) {
          const { data } = await admin.from("pipeline_cards")
            .select("id, observacoes, estagio")
            .eq("user_id", userId)
            .eq("source_table", "qualification_conversations")
            .eq("source_id", meeting.conversation_id)
            .maybeSingle();
          card = data ?? null;
        }
        if (!card) {
          const { data } = await admin.from("pipeline_cards")
            .select("id, observacoes, estagio")
            .eq("user_id", userId)
            .eq("telefone", meeting.lead_telefone)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          card = data ?? null;
        }

        if (card?.id) {
          const newObs = [
            `📅 Reunião: ${fmtBR(startDate)}`,
            meeting.meet_link ? `🎥 ${meeting.meet_link}` : null,
            card.observacoes ?? "",
          ].filter(Boolean).join("\n");
          // Update conservador: não força estagio. Antes setávamos sempre
          // 'negociando', o que regredia cards já em 'proposta_enviada' ou
          // 'fechado'. Só promove pra 'negociando' se card ainda está num
          // estágio anterior à negociação (novo_lead/qualificando/etc).
          const earlyStages = new Set([
            "prospectado", "novo_lead", "primeiro_contato",
            "follow_up_1", "follow_up_2", "follow_up_3", "qualificando",
          ]);
          const update: Record<string, any> = {
            observacoes: newObs,
            proximo_followup_at: meeting.start_at,
          };
          if (card.estagio && earlyStages.has(card.estagio)) {
            update.estagio = "negociando";
          }
          await admin.from("pipeline_cards").update(update).eq("id", card.id);
          summary.pipeline_updated = true;
          summary.pipeline_stage_promoted = update.estagio === "negociando";
        } else {
          summary.pipeline_updated = false;
          summary.pipeline_skip = "no_card_found";
        }
      } catch (e: any) {
        summary.pipeline_updated = false;
        summary.pipeline_error = e.message;
      }
    }

    return json({ ok: true, summary });
  } catch (e: any) {
    console.error("[meeting-handoff] error:", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
