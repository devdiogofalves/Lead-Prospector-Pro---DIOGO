// v1 — Re-engajamento de conversas ativas que ficaram no vácuo.
// Diferente do dispatch-followup-worker (que cutuca lead que NUNCA respondeu),
// aqui atacamos conversas onde o lead JÁ respondeu ao menos uma vez e depois
// sumiu por X horas sem retornar. Enfileira uma mensagem em dispatch_queue
// com source='reengagement' — o dispatch-worker envia usando o chip que já
// tocava a conversa. Idempotente e limitado por tenant (reengagement_max_attempts).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_TEMPLATE =
  "Oi! Só passando aqui pra retomar nossa conversa — quer que eu te chame em outro horário melhor pra você?";

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
    const { data: tenants, error: tErr } = await admin
      .from("qualification_settings")
      .select("user_id, reengagement_delay_hours, reengagement_max_attempts, reengagement_template")
      .eq("reengagement_enabled", true);
    if (tErr) throw tErr;

    for (const t of tenants ?? []) {
      try {
        const delayH = Math.max(1, Number(t.reengagement_delay_hours ?? 24));
        const maxAtt = Math.max(1, Number(t.reengagement_max_attempts ?? 2));
        const template = String(t.reengagement_template || DEFAULT_TEMPLATE).trim();
        const cutoff = new Date(Date.now() - delayH * 3600_000).toISOString();

        // Conversas ativas: já teve inbound (lead respondeu), não qualificada,
        // não em handoff, lead calado há > delayH, e ainda dentro do limite.
        const { data: convs, error: cErr } = await admin
          .from("qualification_conversations")
          .select("id, telefone, nome, nome_contato, whatsapp_instance_id, reengagements_sent, last_inbound_at, channel")
          .eq("user_id", t.user_id)
          .eq("qualified", false)
          .not("last_inbound_at", "is", null)
          .lte("last_inbound_at", cutoff)
          .lt("reengagements_sent", maxAtt)
          .not("telefone", "is", null)
          .neq("status", "handoff")
          .order("last_inbound_at", { ascending: true })
          .limit(50);
        if (cErr) throw cErr;

        for (const c of convs ?? []) {
          scanned++;
          if ((c.channel ?? "whatsapp") !== "whatsapp") continue;

          // Skip: última mensagem foi do LEAD (ele já retomou); só reengaja quando
          // a última fala é da IA/assistente e o lead ficou no vácuo.
          const { data: lastMsg } = await admin
            .from("qualification_messages")
            .select("role, created_at")
            .eq("user_id", t.user_id)
            .eq("telefone", c.telefone)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!lastMsg || lastMsg.role === "user") continue;

          // Skip se já existe reengajamento pendente/rodando
          const { count: pending } = await admin
            .from("dispatch_queue")
            .select("id", { count: "exact", head: true })
            .eq("user_id", t.user_id)
            .eq("telefone", c.telefone)
            .eq("source", "reengagement")
            .in("status", ["pending", "running"]);
          if ((pending ?? 0) > 0) continue;

          const nextStage = `reengagement_${(c.reengagements_sent ?? 0) + 1}`;
          const { error: insErr } = await admin.from("dispatch_queue").insert({
            user_id: t.user_id,
            whatsapp_instance_id: c.whatsapp_instance_id,
            channel: "whatsapp",
            source: "reengagement",
            source_id: c.id,
            nome_empresa: c.nome,
            nome_contato: c.nome_contato ?? c.nome,
            telefone: c.telefone,
            mensagem: template,
            send_as_audio: false,
            scheduled_at: new Date().toISOString(),
            last_followup_stage: nextStage,
          });
          if (insErr) { failures.push({ user_id: t.user_id, err: insErr.message }); continue; }

          await admin.from("qualification_conversations")
            .update({
              reengagements_sent: (c.reengagements_sent ?? 0) + 1,
              last_reengagement_at: new Date().toISOString(),
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
