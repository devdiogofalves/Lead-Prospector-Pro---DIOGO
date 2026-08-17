// Enfileira leads para disparo humanizado nativo (sem n8n).
// Recebe { leads: [{source, source_id, nome_empresa, telefone, mensagem?}], proxy_url? }
// Cria registros em dispatch_queue com scheduled_at espaçado conforme dispatch_settings do usuário.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const leads = Array.isArray(body?.leads) ? body.leads : [];
    const proxyUrl: string | null = body?.proxy_url ?? null;
    // `immediate: true` (vindo do botão "Disparar Agora" da tela Meus Leads)
    // ignora o cursor da fila e agenda scheduled_at = agora — o dispatch-worker
    // pega no próximo tick do cron (1 min). NÃO é instantâneo, só fura a fila
    // de warm-up. Manter audio_ratio + business_hours pra não trigger anti-spam.
    const immediate: boolean = body?.immediate === true;
    if (!leads.length) return json({ error: "leads vazio" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Roteamento por canal ──────────────────────────────────────────────
    // LinkedIn não usa dispatch_queue/WhatsApp — ativa a cadência nativa
    // (linkedin-cadence-worker → linkedin-dm) direto em linkedin_contacts.
    const pickChannel = (l: any): string => {
      const c = String(l.channel || "").toLowerCase();
      if (c) return c;
      if (l.source === "linkedin") return "linkedin";
      return "whatsapp";
    };
    const UNIPILE_QUEUE_CHANNELS = new Set(["instagram", "telegram", "email", "messenger"]);
    const linkedinLeads = leads.filter((l: any) => pickChannel(l) === "linkedin");
    const unipileLeads = leads.filter((l: any) => UNIPILE_QUEUE_CHANNELS.has(pickChannel(l)));
    const waLeads = leads.filter((l: any) => pickChannel(l) === "whatsapp");

    // Processa LinkedIn primeiro: inicia cadência DM nativa.
    let linkedinActivated = 0;
    if (linkedinLeads.length) {
      const ids = linkedinLeads.map((l: any) => l.source_id || l.id).filter(Boolean);
      if (ids.length) {
        const { data: upd, error: lErr } = await admin
          .from("linkedin_contacts")
          .update({
            cadencia_status: "active",
            etapa_atual: "nota_conexao",
            data_prox_disparo: new Date().toISOString(),
            cadencia_falhas: 0,
            ultima_falha: null,
            // Cadência ainda não enviou nada — reverte stamp falso de "disparado"
            disparo: "Não",
            data_disparo: null,
          })
          .in("id", ids)
          .eq("user_id", userId)
          .select("id");
        if (lErr) return json({ error: `LinkedIn cadence: ${lErr.message}` }, 500);
        linkedinActivated = upd?.length ?? 0;
      }
    }

    // Carrega/cria settings antes de qualquer fila (WhatsApp ou Unipile).
    let { data: settings } = await admin.from("dispatch_settings")
      .select("*").eq("user_id", userId).maybeSingle();
    if (!settings) {
      const { data: created } = await admin.from("dispatch_settings")
        .insert({ user_id: userId }).select("*").single();
      settings = created;
    }

    const minD = settings?.min_delay_seconds ?? 45;
    const maxD = settings?.max_delay_seconds ?? 180;
    const useAudio = settings?.use_audio ?? true;
    const audioRatio = Number(settings?.audio_ratio ?? 0.25);

    // Distribuição Gaussian (Box-Muller) para delays mais humanos
    function gaussianDelay(minS: number, maxS: number): number {
      const mu = (minS + maxS) / 2;
      const sigma = (maxS - minS) / 4;
      const u1 = Math.random() || 1e-9;
      const u2 = Math.random() || 1e-9;
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const sample = mu + sigma * z;
      return Math.max(minS, Math.min(maxS * 1.5, sample)) * 1000;
    }

    // Instagram/Telegram/E-mail/Messenger não dependem de chip WhatsApp.
    let unipileQueued = 0;
    if (unipileLeads.length) {
      let cursor = Date.now();
      const unipileRows = unipileLeads.map((l: any, idx: number) => {
        const channel = pickChannel(l);
        if (!immediate) cursor += gaussianDelay(minD, maxD);
        const identifier = String(
          l.recipient_handle || l.username || l.email || l.identificador || l.telefone || "",
        ).trim();
        return {
          user_id: userId,
          channel,
          source: l.source || channel,
          source_id: l.source_id || l.id || null,
          nome_empresa: l.nome_empresa || null,
          nome_contato: l.nome_contato || l.nome || null,
          telefone: channel === "email" ? null : identifier,
          email: channel === "email" ? identifier : (l.email || null),
          recipient_handle: identifier,
          username: channel === "instagram" ? identifier.replace(/^@+/, "") : (l.username || null),
          mensagem: l.mensagem || null,
          send_as_audio: false,
          scheduled_at: immediate ? new Date().toISOString() : new Date(cursor + idx * 1000).toISOString(),
          proxy_url: proxyUrl,
          site: l.site || null,
          linkedin_url: l.linkedin_url || null,
          instagram_url: l.instagram_url || null,
          especialidades: l.especialidades || null,
        };
      }).filter((r: any) => r.recipient_handle || r.email || r.chat_id || r.unipile_chat_id);

      if (unipileRows.length) {
        const { data: insertedUni, error: uniErr } = await admin
          .from("dispatch_queue").insert(unipileRows).select("id");
        if (uniErr) throw uniErr;
        unipileQueued = insertedUni?.length ?? 0;
      }
    }

    // Se não havia WhatsApp, retorna sem exigir chip WhatsApp.
    if (!waLeads.length) {
      return json({
        ok: true,
        queued: unipileQueued,
        linkedin_cadence_activated: linkedinActivated,
        unipile_queued: unipileQueued,
        message: linkedinActivated
          ? `${linkedinActivated} contato(s) LinkedIn entraram na cadência DM (nota de conexão agendada para o próximo ciclo do worker).`
          : unipileQueued
            ? `${unipileQueued} contato(s) entraram na fila multicanal.`
            : "Nenhum lead processado.",
      });
    }

    // Daqui pra baixo: fluxo WhatsApp (waLeads).
    // Gate multi-chip: precisa de PELO MENOS UMA instância ativa e conectada
    const { data: allActiveInstances } = await admin.from("whatsapp_instances")
      .select("*").eq("user_id", userId).eq("active", true);
    const instances = (allActiveInstances ?? []).filter((i: any) => !i.paused);
    if (!instances?.length) {
      const pausedOpen = (allActiveInstances ?? []).filter((i: any) => i.paused && i.status === "open").length;
      const pausedAny = (allActiveInstances ?? []).filter((i: any) => i.paused).length;
      if (pausedOpen > 0) {
        return json({ error: `${pausedOpen} chip(s) WhatsApp estão conectados, mas pausados para disparo. Retome o chip em Configurações → WhatsApp ou no alerta do Disparo Humanizado.` }, 400);
      }
      if (pausedAny > 0) {
        return json({ error: `${pausedAny} chip(s) WhatsApp estão pausados. Retome ao menos um chip antes de enfileirar disparos.` }, 400);
      }
      return json({ error: "Nenhum chip WhatsApp ativo. Conecte ao menos uma instância em Configurações → WhatsApp." }, 400);
    }
    let MAND_URL = (Deno.env.get("MANDRACK_URL") ?? "https://api.mandrackstudio.ia.br").trim().replace(/\/$/, "");
    if (!/^https?:\/\//i.test(MAND_URL)) MAND_URL = `https://${MAND_URL}`;
    // Valida quais instâncias estão logadas (paralelo)
    const checks = await Promise.all(instances.map(async (inst: any) => {
      try {
        const r = await fetch(`${MAND_URL}/session/status`, { headers: { token: inst.mandrack_instance_token } });
        const j: any = await r.json().catch(() => ({}));
        return { inst, loggedIn: j?.data?.loggedIn === true };
      } catch (_) {
        return { inst, loggedIn: false };
      }
    }));
    const liveInstances = checks.filter((c) => c.loggedIn).map((c) => c.inst);
    if (!liveInstances.length) {
      return json({ error: `Nenhum dos ${instances.length} chip(s) ativos e não pausados está conectado no Mandrack agora. Abra Configurações → WhatsApp e atualize/reconecte o chip.` }, 400);
    }

    // Calcula cota restante hoje para cada chip vivo
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    // P1 fix: conta APENAS 'sent' via sent_at (mesma métrica do worker).
    // Antes contava sent+running por scheduled_at, o que bloqueava o operador logo
    // pela manhã quando havia lote agendado pra hoje mas nada foi enviado ainda.
    const quotas = await Promise.all(liveInstances.map(async (inst: any) => {
      const { count } = await admin.from("dispatch_queue")
        .select("id", { count: "exact", head: true })
        .eq("whatsapp_instance_id", inst.id)
        .eq("status", "sent")
        .gte("sent_at", todayStart.toISOString());
      const limit = inst.daily_limit ?? 15;
      return { inst, remaining: Math.max(0, limit - (count ?? 0)) };
    }));
    let totalRemaining = quotas.reduce((s, q) => s + q.remaining, 0);
    if (totalRemaining === 0) {
      return json({ error: `Todos os chips atingiram o limite diário (${liveInstances.length} chip(s) ativos). Adicione mais chips ou aumente o limite.` }, 400);
    }

    // Gate: precisa de pelo menos uma chave de IA (OpenAI ou Gemini) — caso contrário, o
    // dispatch-worker falha silenciosamente após 3 tentativas e auto-pausa a conta.
    // Falhar aqui evita que 100 leads virem 100 falhas no banco.
    const { data: apiKeys } = await admin.from("user_api_keys")
      .select("provider").eq("user_id", userId);
    const providers = new Set((apiKeys ?? []).map((k: any) => k.provider));
    if (!providers.has("openai") && !providers.has("gemini")) {
      return json({ error: "Chave de IA não configurada. Adicione OpenAI ou Gemini em Configurações → APIs antes de disparar (a IA gera cada mensagem automaticamente)." }, 400);
    }

    // Cursor por instância (delay independente por chip)
    const lastByInstance = new Map<string, number>();
    for (const q of quotas) {
      const { data: last } = await admin.from("dispatch_queue")
        .select("scheduled_at")
        .eq("whatsapp_instance_id", q.inst.id)
        .in("status", ["pending", "running"])
        .order("scheduled_at", { ascending: false })
        .limit(1).maybeSingle();
      lastByInstance.set(q.inst.id, last?.scheduled_at ? new Date(last.scheduled_at).getTime() : Date.now());
    }

    // Round-robin aleatório respeitando cota por chip
    function pickInstanceWithQuota(): any | null {
      const available = quotas.filter((q) => q.remaining > 0);
      if (!available.length) return null;
      const pick = available[Math.floor(Math.random() * available.length)];
      pick.remaining--;
      return pick.inst;
    }

    // Coffee break por chip: a cada 12 msgs no mesmo chip, +20-45min
    const msgCountByInstance = new Map<string, number>();
    const skippedNoQuota: number[] = [];
    // Valida telefone BR: aceita 12/13 dígitos com 55 + DDD válido (+9 se 13)

    function normalizeBRPhone(t: any): string | null {
      const raw = String(t ?? "").replace(/\D/g, "");
      let n = raw;
      if (raw.length === 10 || raw.length === 11) n = "55" + raw;
      const dd = Number(n.slice(2, 4));
      const ok =
        (n.length === 12 || n.length === 13) &&
        n.startsWith("55") &&
        dd >= 11 && dd <= 99 &&
        (n.length === 12 || n[4] === "9");
      return ok ? n : null;
    }

    const invalidPhones: string[] = [];
    const rows = waLeads.map((l: any, idx: number) => {
      const phone = normalizeBRPhone(l.telefone);
      if (!phone) { invalidPhones.push(String(l.telefone ?? "").slice(0, 30)); return null; }
      const inst = pickInstanceWithQuota();
      if (!inst) { skippedNoQuota.push(idx); return null; }
      const instId = inst.id;
      const msgCount = (msgCountByInstance.get(instId) ?? 0) + 1;
      msgCountByInstance.set(instId, msgCount);
      let scheduledAt: string;
      if (immediate) {
        scheduledAt = new Date().toISOString();
      } else {
        let delay = gaussianDelay(minD, maxD);
        if (msgCount > 0 && msgCount % 12 === 0) {
          delay += (20 + Math.random() * 25) * 60 * 1000;
        }
        const cur = (lastByInstance.get(instId) ?? Date.now()) + delay;
        lastByInstance.set(instId, cur);
        scheduledAt = new Date(cur).toISOString();
      }
      const sendAsAudio = useAudio && Math.random() < audioRatio;
      return {
        user_id: userId,
        whatsapp_instance_id: instId,
        channel: "whatsapp",
        source: l.source || "manual",
        source_id: l.source_id || l.id || null,
        nome_empresa: l.nome_empresa || null,
        nome_contato: l.nome_contato || l.nome || null,
        cargo: l.cargo || null,
        cidade: l.cidade || null,
        segmento: l.segmento || null,
        telefone: phone,
        mensagem: l.mensagem || null,
        send_as_audio: sendAsAudio,
        scheduled_at: scheduledAt,
        proxy_url: proxyUrl,
        site: l.site || null,
        linkedin_url: l.linkedin_url || null,
        instagram_url: l.instagram_url || null,
        especialidades: l.especialidades || null,
      };
    }).filter((r: any) => r && r.telefone);


    if (!rows.length) {
      const msg = invalidPhones.length
        ? `Nenhum telefone WhatsApp BR válido (${invalidPhones.length} rejeitados por formato: ex ${invalidPhones.slice(0, 3).join(", ")}). Verifique se os leads têm celular com DDD.`
        : "nenhum telefone válido";
      return json({
        ok: true,
        queued: 0,
        linkedin_cadence_activated: linkedinActivated,
        invalid_phones: invalidPhones.length,
        error: waLeads.length ? msg : undefined,
      }, waLeads.length ? 400 : 200);
    }

    const { data: inserted, error } = await admin
      .from("dispatch_queue").insert(rows).select("id, scheduled_at");
    if (error) throw error;

    const eta = inserted?.[inserted.length - 1]?.scheduled_at;
    return json({
      ok: true,
      queued: inserted?.length ?? 0,
      linkedin_cadence_activated: linkedinActivated,
      unipile_queued: unipileQueued,
      eta,
      instances_used: liveInstances.length,
      skipped_no_quota: skippedNoQuota.length,
      invalid_phones: invalidPhones.length,
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