// v1 — Follow-up automático para leads que receberam disparo e não responderam.
// Rodado por pg_cron a cada 15 min (opcional). Só age em tenants com
// dispatch_settings.followup_enabled = true. Idempotente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_TEMPLATE =
  "Oi! Passei aqui só pra saber se recebeu minha mensagem — se agora não for hora boa me avisa que eu retomo depois, sem pressa.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const started = Date.now();
  let enqueued = 0;
  let scanned = 0;
  const failures: Array<{ user_id: string; err: string }> = [];

  try {
    // Tenants com follow-up habilitado
    const { data: tenants, error: tErr } = await admin
      .from("dispatch_settings")
      .select("user_id, followup_delay_hours, followup_max_attempts, followup_template")
      .eq("followup_enabled", true);
    if (tErr) throw tErr;

    for (const t of tenants ?? []) {
      try {
        const delayH = Math.max(1, Number(t.followup_delay_hours ?? 24));
        const maxAtt = Math.max(1, Number(t.followup_max_attempts ?? 2));
        const template = String(t.followup_template || DEFAULT_TEMPLATE).trim();
        const cutoff = new Date(Date.now() - delayH * 3600_000).toISOString();

        // Candidatos: msgs enviadas via WhatsApp (sent OU delivered), sem resposta
        // e ainda dentro do limite de tentativas.
        const { data: candidates, error: cErr } = await admin
          .from("dispatch_queue")
          .select("id, telefone, nome_empresa, nome_contato, source, source_id, whatsapp_instance_id, followups_sent, sent_at")
          .eq("user_id", t.user_id)
          .eq("channel", "whatsapp")
          .eq("status", "sent")
          .lte("sent_at", cutoff)
          .lt("followups_sent", maxAtt)
          .not("telefone", "is", null)
          .order("sent_at", { ascending: true })
          .limit(50);
        if (cErr) throw cErr;

        for (const c of candidates ?? []) {
          scanned++;
          // Skip se lead já respondeu
          const { count: replied } = await admin
            .from("qualification_messages")
            .select("id", { count: "exact", head: true })
            .eq("user_id", t.user_id)
            .eq("telefone", c.telefone)
            .eq("role", "user");
          if ((replied ?? 0) > 0) continue;

          // Skip se já existe follow-up pendente/rodando pro mesmo lead
          const { count: pending } = await admin
            .from("dispatch_queue")
            .select("id", { count: "exact", head: true })
            .eq("user_id", t.user_id)
            .eq("telefone", c.telefone)
            .eq("source", "followup")
            .in("status", ["pending", "running"]);
          if ((pending ?? 0) > 0) continue;

          const nextStage = `followup_${(c.followups_sent ?? 0) + 1}`;
          const { error: insErr } = await admin.from("dispatch_queue").insert({
            user_id: t.user_id,
            whatsapp_instance_id: c.whatsapp_instance_id,
            channel: "whatsapp",
            source: "followup",
            source_id: c.source_id,
            nome_empresa: c.nome_empresa,
            nome_contato: c.nome_contato,
            telefone: c.telefone,
            mensagem: template,
            send_as_audio: false,
            scheduled_at: new Date().toISOString(),
            last_followup_stage: nextStage,
          });
          if (insErr) { failures.push({ user_id: t.user_id, err: insErr.message }); continue; }

          await admin.from("dispatch_queue")
            .update({
              followups_sent: (c.followups_sent ?? 0) + 1,
              last_followup_at: new Date().toISOString(),
              last_followup_stage: nextStage,
            })
            .eq("id", c.id);
          enqueued++;
        }
      } catch (e) {
        failures.push({ user_id: t.user_id, err: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({
      ok: true, tenants: tenants?.length ?? 0, scanned, enqueued, failures,
      elapsed_ms: Date.now() - started,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
