// DisparoBooster - campaign-enqueue
// Lê uma campanha do usuário, resolve destinatários pelas fontes configuradas
// e enfileira o PRIMEIRO passo da sequência em dispatch_queue.
// O worker (dispatch-worker) cuida do envio + avança próximos passos via advanceCampaignSequence.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SOURCE_MAP: Record<string, (r: any) => { telefone: string | null; nome_empresa: string | null; nome_contato: string | null; cargo: string | null }> = {
  leads: (r) => ({ telefone: r.telefone, nome_empresa: r.nome_empresa, nome_contato: null, cargo: null }),
  instagram_contacts: (r) => ({ telefone: r.whatsapp, nome_empresa: r.nome || r.username, nome_contato: r.nome, cargo: null }),
  linkedin_contacts: (r) => ({ telefone: r.telefone, nome_empresa: r.empresa, nome_contato: r.nome, cargo: r.cargo }),
  empresas_enriquecidas: (r) => ({ telefone: r.telefone, nome_empresa: r.nome_empresa, nome_contato: null, cargo: null }),
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
    const campaignId = body?.campaign_id;
    if (!campaignId) return json({ error: "campaign_id obrigatório" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: campaign, error: cErr } = await admin.from("campaigns")
      .select("*").eq("id", campaignId).eq("user_id", userId).maybeSingle();
    if (cErr || !campaign) return json({ error: "Campanha não encontrada" }, 404);

    const sequence = Array.isArray(campaign.sequence) ? campaign.sequence : [];
    if (sequence.length === 0) return json({ error: "Campanha sem passos na sequência" }, 400);
    const step0 = sequence[0];

    // Chips: usa os selecionados na campanha (campaign.chips_ids); se vazio, todos ativos.
    const selectedChipIds: string[] = Array.isArray(campaign.chips_ids) ? campaign.chips_ids : [];
    let chipsQ = admin.from("whatsapp_instances")
      .select("id").eq("user_id", userId).eq("active", true).eq("paused", false);
    if (selectedChipIds.length) chipsQ = chipsQ.in("id", selectedChipIds);
    const { data: chips } = await chipsQ;
    if (!chips?.length) {
      return json({ error: "Nenhum chip WhatsApp ativo selecionado. Conecte/selecione em Integrações → WhatsApp." }, 400);
    }
    const chipIds = chips.map((c: any) => c.id);

    // Resolve destinatários
    const filters = campaign.source_filters ?? {};
    const sources: string[] = Array.isArray(filters.sources) && filters.sources.length
      ? filters.sources : ["leads", "instagram_contacts", "linkedin_contacts", "empresas_enriquecidas"];
    const explicitIds: Record<string, string[]> = filters.ids ?? {};
    const limit: number = Math.min(2000, Number(filters.limit ?? 200));

    const candidates: Array<{ source: string; source_id: string; telefone: string; nome_empresa: string | null; nome_contato: string | null; cargo: string | null }> = [];

    for (const src of sources) {
      if (!SOURCE_MAP[src]) continue;
      let q = admin.from(src).select("*").eq("user_id", userId).limit(limit);
      const ids = explicitIds[src];
      if (Array.isArray(ids) && ids.length) q = q.in("id", ids);
      else q = q.or("disparo.is.null,disparo.eq.Não");
      const { data: rows } = await q;
      for (const r of (rows ?? [])) {
        const mapped = SOURCE_MAP[src](r);
        const tel = String(mapped.telefone ?? "").replace(/\D/g, "");
        if (tel.length < 10) continue;
        candidates.push({
          source: src, source_id: r.id, telefone: mapped.telefone!,
          nome_empresa: mapped.nome_empresa, nome_contato: mapped.nome_contato, cargo: mapped.cargo,
        });
      }
    }

    if (candidates.length === 0) {
      return json({ error: "Nenhum destinatário válido encontrado nas fontes/filtros." }, 400);
    }

    // Espaça scheduled_at conforme dispatch_settings
    const { data: settings } = await admin.from("dispatch_settings")
      .select("min_delay_seconds,max_delay_seconds").eq("user_id", userId).maybeSingle();
    const minD = Number(settings?.min_delay_seconds ?? 45);
    const maxD = Number(settings?.max_delay_seconds ?? 180);

    // Cursor: começa após o último pendente do user
    const { data: lastPending } = await admin.from("dispatch_queue")
      .select("scheduled_at").eq("user_id", userId).eq("status", "pending")
      .order("scheduled_at", { ascending: false }).limit(1).maybeSingle();
    let cursor = lastPending?.scheduled_at
      ? new Date(lastPending.scheduled_at).getTime()
      : Date.now();

    const recipientRows: any[] = [];
    const queueRows: any[] = [];
    let chipCursor = 0;
    for (const c of candidates) {
      cursor += (minD + Math.random() * (maxD - minD)) * 1000;
      const scheduled = new Date(cursor).toISOString();
      const chipId = chipIds[chipCursor % chipIds.length];
      chipCursor++;

      const { data: rcpt, error: rErr } = await admin.from("campaign_recipients").insert({
        campaign_id: campaign.id, user_id: userId,
        source: c.source, source_id: c.source_id, telefone: c.telefone,
        nome_empresa: c.nome_empresa, nome_contato: c.nome_contato, cargo: c.cargo,
        step_atual: 0, status: "active",
      }).select("id").single();
      if (rErr) continue;

      const stepMediaType = (step0 as any).media_type ?? (step0.use_audio ? "audio" : "text");
      const stepMediaUrl = (step0 as any).media_url ?? null;

      const { data: dq, error: qErr } = await admin.from("dispatch_queue").insert({
        user_id: userId, source: c.source, source_id: c.source_id,
        telefone: c.telefone, nome_empresa: c.nome_empresa,
        nome_contato: c.nome_contato, cargo: c.cargo,
        mensagem: step0.mensagem ?? null,
        send_as_audio: !!step0.use_audio || stepMediaType === "audio",
        media_type: stepMediaType,
        media_url: stepMediaUrl,
        whatsapp_instance_id: chipId,
        scheduled_at: scheduled, status: "pending",
        campaign_id: campaign.id, sequence_step: 0,
      }).select("id").single();
      if (qErr) continue;

      await admin.from("campaign_recipients").update({
        dispatch_queue_ids: [dq.id],
      }).eq("id", rcpt.id);

      recipientRows.push(rcpt);
      queueRows.push(dq);
    }

    await admin.from("campaigns").update({
      status: "sending",
      started_at: new Date().toISOString(),
      total_recipients: recipientRows.length,
    }).eq("id", campaign.id);

    return json({
      ok: true,
      campaign_id: campaign.id,
      enqueued: queueRows.length,
      total_recipients: recipientRows.length,
    });
  } catch (e: any) {
    console.error("[campaign-enqueue] error:", e?.message);
    return json({ error: e?.message ?? "Erro inesperado" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
