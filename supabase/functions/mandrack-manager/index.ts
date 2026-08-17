// version: 2026-07-21-chip-status-no-false-close
// Gerencia instâncias Mandrack Studio para o cliente.
// MANDRACK_API_KEY = ADMIN_TOKEN do servidor Mandrack (cabeçalho Authorization, em /admin/*).
// MANDRACK_URL     = host da API (ex: https://api.mandrackstudio.ia.br).
// Cada usuário tem sua própria instância (user em /admin/users) com um token próprio
// usado no cabeçalho `token` para /session/*, /chat/*, /group/*, /webhook.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeMandrackSessionState(body: any, ok: boolean, httpStatus: number, fallbackState = "unknown") {
  const data = body?.data ?? {};
  const raw = String(
    data?.Status ?? data?.status ?? data?.state ?? data?.connection ?? body?.status ?? body?.state ?? "",
  ).toLowerCase();
  if (data?.loggedIn === true || data?.isLoggedIn === true) return { state: "open", transient: false };
  if (/open|connected|online|ready|working|authorized/.test(raw)) return { state: "open", transient: false };
  if (data?.connected === true || /connecting|pair|qr|scan/.test(raw)) return { state: "connecting", transient: false };
  if (/close|closed|disconnect|logged.?out|unauthori[sz]ed|no.?session/.test(raw)) return { state: "close", transient: false };
  if (data?.loggedIn === false && data?.connected === false) return { state: "close", transient: false };
  if (httpStatus === 401 || httpStatus === 403) return { state: "close", transient: false };
  if (!ok) return { state: fallbackState, transient: true };
  return { state: raw || fallbackState, transient: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData, error: uerr } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (uerr || !userId) {
      console.error("mandrack-manager auth failed:", uerr?.message);
      return json({ error: "Unauthorized" }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ADMIN_TOKEN = Deno.env.get("MANDRACK_API_KEY");
    const DEFAULT_MAND_URL = "https://api.mandrackstudio.ia.br";
    let MAND_URL = (Deno.env.get("MANDRACK_URL") ?? DEFAULT_MAND_URL).trim().replace(/\/$/, "");
    if (!/^https?:\/\//i.test(MAND_URL)) MAND_URL = `https://${MAND_URL}`;
    // Guarda contra URLs inválidas / IPs não-roteáveis (ex.: 0.x, 127.x, 10.x, 192.168.x, localhost)
    try {
      const host = new URL(MAND_URL).hostname;
      const invalid =
        host === "localhost" ||
        /^0\./.test(host) ||
        /^127\./.test(host) ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^169\.254\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host);
      if (invalid) {
        console.warn(`MANDRACK_URL inválido (${MAND_URL}); usando default ${DEFAULT_MAND_URL}`);
        MAND_URL = DEFAULT_MAND_URL;
      }
    } catch {
      MAND_URL = DEFAULT_MAND_URL;
    }
    if (!ADMIN_TOKEN) {
      return json({ error: "Serviço WhatsApp indisponível. Contate o suporte.", fallback: true }, 200);
    }

    // Multi-chip: cada operação aceita `whatsappInstanceId` (linha em whatsapp_instances)
    const reqBodyForId = await req.clone().json().catch(() => ({} as any));
    const wpInstanceId: string | null = reqBodyForId?.whatsappInstanceId ?? null;

    // Carrega instância alvo (se informada) OU 1ª ativa do usuário (compat)
    let targetInst: any = null;
    if (wpInstanceId) {
      const { data } = await admin.from("whatsapp_instances")
        .select("*").eq("id", wpInstanceId).eq("user_id", userId).maybeSingle();
      targetInst = data;
    } else {
      const { data } = await admin.from("whatsapp_instances")
        .select("*").eq("user_id", userId).order("created_at", { ascending: true });
      const rows = data ?? [];
      // Multi-chip: quando a UI ainda não mandou whatsappInstanceId, não use o
      // chip mais antigo às cegas. Isso fazia o painel dizer "desconectado" para
      // Lucas mesmo existindo vários chips abertos, porque o primeiro chip era
      // um atendente/legado fechado.
      targetInst = rows.find((i: any) => i.active && !i.paused && i.status === "open")
        ?? rows.find((i: any) => i.active && i.status === "open")
        ?? rows.find((i: any) => i.active && !i.paused)
        ?? rows[0]
        ?? null;
    }

    const instanceName = targetInst?.instance_name ?? null;
    const instanceId = targetInst?.mandrack_instance_id ?? null;
    const instanceToken = targetInst?.mandrack_instance_token ?? null;

    // call() helper: usa Authorization (admin) ou token (instance)
    async function call(path: string, init: RequestInit & { useAdmin?: boolean; instToken?: string } = {}) {
      const { useAdmin, instToken, headers: extra, ...rest } = init as any;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(extra || {}),
      };
      if (useAdmin) headers["Authorization"] = ADMIN_TOKEN!;
      else headers["token"] = instToken ?? instanceToken ?? "";
      const fullUrl = `${MAND_URL}${path}`;
      try {
        const r = await fetch(fullUrl, { ...rest, headers });
        const text = await r.text();
        let body: any = text;
        try { body = JSON.parse(text); } catch {}
        const isHtml = typeof text === "string" && text.trim().startsWith("<");
        if (isHtml) console.error(`[mandrack] HTML from ${fullUrl} (${r.status})`);
        return { ok: r.ok, status: r.status, body, isHtml, url: fullUrl };
      } catch (err) {
        console.error(`[mandrack] network error on ${fullUrl}:`, (err as Error)?.message);
        return {
          ok: false,
          status: 503,
          body: { error: "Serviço WhatsApp temporariamente indisponível.", fallback: true },
          isHtml: false,
          url: fullUrl,
        };
      }
    }

    const reqBody = reqBodyForId;
    const { action, phone, instanceName: providedName } = reqBody;

    // ── admin-install-webhook: só nucleodameta ─────────────────────────────
    // Instala webhook de qualificação em um chip específico de qualquer user.
    // Uso: { action:"admin-install-webhook", target_user_id, target_instance_id }
    if (action === "admin-install-webhook") {
      const callerEmail = userData?.user?.email ?? "";
      if (callerEmail !== "nucleodameta@gmail.com") return json({ error: "forbidden" }, 403);
      const targetUserId = String(reqBody.target_user_id ?? "");
      const targetInstanceId = String(reqBody.target_instance_id ?? "");
      if (!targetUserId || !targetInstanceId) return json({ error: "target_user_id + target_instance_id obrigatórios" }, 400);
      const { data: chip } = await admin.from("whatsapp_instances")
        .select("id, mandrack_instance_token, instance_name")
        .eq("id", targetInstanceId).eq("user_id", targetUserId).maybeSingle();
      if (!chip?.mandrack_instance_token) return json({ error: "chip não encontrado ou sem token" }, 404);
      const supaUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
      const secret = Deno.env.get("WEBHOOK_QUALIFICATION_SECRET") ?? "";
      if (!secret) return json({ error: "WEBHOOK_QUALIFICATION_SECRET ausente" }, 500);
      const webhookUrl = `${supaUrl}/functions/v1/webhook-qualification/${targetUserId}/${chip.id}?token=${encodeURIComponent(secret)}`;
      const r = await call(`/webhook`, {
        method: "POST",
        instToken: chip.mandrack_instance_token,
        body: JSON.stringify({ url: webhookUrl, events: ["Message", "ReadReceipt"] }),
      });
      return json({ ok: r.ok, instance: chip.instance_name, response: r.body });
    }

    // ── auto_reconnect: força /session/connect quando o chip está close ────
    if (action === "auto_reconnect") {
      if (!targetInst) return json({ error: "chip não encontrado" }, 404);
      if (!instanceToken) return json({ error: "chip sem token" }, 400);
      const r = await call(`/session/connect`, { method: "POST", body: JSON.stringify({ immediate: true }) });
      const s = await call(`/session/status`, { method: "GET" });
      const parsed = normalizeMandrackSessionState(s.body, s.ok, s.status, targetInst.status ?? "unknown");
      const state = parsed.state;
      const patch: Record<string, unknown> = { last_health_check_at: new Date().toISOString() };
      if (!parsed.transient) patch.status = state;
      await admin.from("whatsapp_instances").update(patch).eq("id", targetInst.id);
      return json({ ok: r.ok, state, needsQr: state !== "open", raw: r.body });
    }

    // ── test_send: dispara 1 mensagem de teste para o próprio número ──────
    if (action === "test_send") {
      if (!instanceToken) return json({ error: "chip sem token" }, 400);
      const target = String(reqBody.phone ?? "").replace(/\D/g, "");
      if (!target) return json({ error: "phone obrigatório" }, 400);
      const text = String(reqBody.text ?? `✅ Teste de envio do chip ${instanceName ?? ""} — ${new Date().toLocaleTimeString("pt-BR")}`);
      const r = await call(`/chat/send/text`, {
        method: "POST",
        body: JSON.stringify({ phone: target, body: text, delay: true }),
      });
      return json({ ok: r.ok, response: r.body }, r.ok ? 200 : 400);
    }



    // ── list: retorna todas as instâncias do usuário ───────────────────────
    if (action === "list") {
      const { data: rows } = await admin.from("whatsapp_instances")
        .select("id, instance_name, mandrack_instance_id, daily_limit, active, paused, status, last_used_at, created_at")
        .eq("user_id", userId).order("created_at", { ascending: true });
      return json({ instances: rows ?? [] });
    }

    // ── update: ajusta limite/active/paused de uma instância ───────────────
    if (action === "update") {
      if (!targetInst) return json({ ok: true, skipped: "instance_not_found" });
      const patch: any = {};
      if (typeof reqBody.daily_limit === "number") {
        patch.daily_limit = Math.max(1, Math.min(200, reqBody.daily_limit));
      }
      if (typeof reqBody.active === "boolean") patch.active = reqBody.active;
      if (typeof reqBody.paused === "boolean") {
        patch.paused = reqBody.paused;
        if (!reqBody.paused) patch.failure_count = 0;
      }
      if (!Object.keys(patch).length) return json({ error: "nada para atualizar" }, 400);
      const { error: upErr } = await admin.from("whatsapp_instances")
        .update(patch).eq("id", targetInst.id);
      if (upErr) return json({ error: upErr.message }, 500);
      return json({ ok: true });
    }

    // ── status ──────────────────────────────────────────────────────────────
    if (action === "status") {
      if (!instanceToken) return json({ instance: null, state: "not_configured" });
      const r = await call(`/session/status`, { method: "GET" });
      if (r.isHtml) return json({ error: "URL Mandrack inválida", details: `Host ${MAND_URL} retornou HTML.` }, 502);
      const parsed = normalizeMandrackSessionState(r.body, r.ok, r.status, targetInst?.status ?? "unknown");
      const state = parsed.state;
      // Atualiza status no DB pra UI não precisar pollar sempre
      if (targetInst?.id) {
        const patch: Record<string, unknown> = { last_health_check_at: new Date().toISOString() };
        if (!parsed.transient) patch.status = state;
        await admin.from("whatsapp_instances").update(patch).eq("id", targetInst.id);
      }
      // Safety-net: se o chip está logado mas o webhook de qualificação ainda
      // não está instalado nele, instala agora. Cobre chips antigos criados
      // antes do auto-install e casos raros em que o Mandrack perdeu o hook.
      if (state === "open" && targetInst?.id) {
        try {
          const supaUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
          const secret = Deno.env.get("WEBHOOK_QUALIFICATION_SECRET") ?? "";
          if (supaUrl && secret) {
            const expected = `${supaUrl}/functions/v1/webhook-qualification/${userId}/${targetInst.id}?token=${encodeURIComponent(secret)}`;
            const data = r.body?.data ?? {};
            const existing = Array.isArray(data.webhooks) ? data.webhooks : [];
            const alreadyOk = existing.some((u: string) => typeof u === "string" && u.includes("/webhook-qualification/") && u.includes(`/${targetInst.id}`));
            if (!alreadyOk) {
              await call(`/webhook`, {
                method: "POST",
                body: JSON.stringify({ url: expected, events: ["Message", "ReadReceipt"] }),
              }).catch(() => null);
            }
          }
        } catch (_) { /* silencioso */ }
      }
      return json({ instance: instanceName, state, transient: parsed.transient, raw: r.body });
    }

    // ── create ──────────────────────────────────────────────────────────────
    if (action === "create") {
      const inst = (providedName ?? "").trim();
      if (!inst) return json({ error: "Nome da instância é obrigatório." }, 400);
      if (!/^[a-zA-Z0-9_-]{3,40}$/.test(inst)) {
        return json({ error: "Nome inválido. Use letras, números, - ou _ (3 a 40 chars)." }, 400);
      }

      // Já existe com esse nome pra esse user?
      const { data: existing } = await admin.from("whatsapp_instances")
        .select("id").eq("user_id", userId).eq("instance_name", inst).maybeSingle();
      if (existing) {
        return json({ instance: inst, ok: true, reused: true, whatsappInstanceId: existing.id });
      }

      const newToken = randomToken();
      const r = await call(`/admin/users`, {
        method: "POST",
        useAdmin: true,
        body: JSON.stringify({ name: inst, token: newToken, expiration: 0 }),
      });
      if (r.isHtml) {
        return json({ error: "URL Mandrack inválida", details: `POST ${r.url} retornou HTML.` }, 502);
      }
      if (!r.ok) {
        return json({ error: "Falha ao criar instância.", details: r.body }, 400);
      }
      const created = r.body?.data ?? {};
      const newId = created.id;
      const savedToken = created.token ?? newToken;

      const { data: insertedInst, error: insErr } = await admin.from("whatsapp_instances").insert({
        user_id: userId,
        instance_name: inst,
        mandrack_instance_id: String(newId ?? ""),
        mandrack_instance_token: savedToken,
        daily_limit: 15,
        active: true,
        paused: false,
        status: "created",
      }).select("id").single();
      if (insErr) return json({ error: insErr.message }, 500);

      // Compat: se for a 1ª instância, espelha em user_integrations
      // (qualification-worker antigo sem migration usa esse fallback)
      const { count } = await admin.from("whatsapp_instances")
        .select("id", { count: "exact", head: true }).eq("user_id", userId);
      if ((count ?? 0) === 1) {
        await admin.from("user_integrations").upsert(
          { user_id: userId, evolution_instance: inst, mandrack_instance_id: String(newId ?? ""), mandrack_instance_token: savedToken },
          { onConflict: "user_id" },
        );
      }

      // Auto-instala o webhook de qualificação na instância recém-criada.
      // URL: {SUPABASE_URL}/functions/v1/webhook-qualification/{userId}/{instanceId}?token=SECRET
      // Assim o cliente NÃO precisa colar webhook em lugar nenhum — funciona out of the box.
      let webhookInstalled = false;
      try {
        const supaUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
        const secret = Deno.env.get("WEBHOOK_QUALIFICATION_SECRET") ?? "";
        if (supaUrl && secret && insertedInst?.id) {
          const webhookUrl = `${supaUrl}/functions/v1/webhook-qualification/${userId}/${insertedInst.id}?token=${encodeURIComponent(secret)}`;
          const wr = await call(`/webhook`, {
            method: "POST",
            instToken: savedToken,
            body: JSON.stringify({ url: webhookUrl, events: ["Message", "ReadReceipt"] }),
          });
          webhookInstalled = !!wr.ok;
          if (!wr.ok) console.warn("auto-install webhook falhou:", wr.status, JSON.stringify(wr.body).slice(0, 300));
        } else {
          console.warn("auto-install webhook: SUPABASE_URL ou WEBHOOK_QUALIFICATION_SECRET ausentes");
        }
      } catch (e: any) {
        console.warn("auto-install webhook exception:", e?.message);
      }

      return json({ instance: inst, id: newId, ok: true, whatsappInstanceId: insertedInst?.id, webhookInstalled });
    }

    // ── qr ──────────────────────────────────────────────────────────────────
    if (action === "qr") {
      if (!instanceToken) return json({ error: "Crie a instância primeiro." }, 400);
      // Garante session iniciada — ignora 500 "already connected"
      const conn = await call(`/session/connect`, {
        method: "POST",
        body: JSON.stringify({ immediate: true }),
      });
      if (!conn.ok && !String(conn.body?.error || "").includes("already connected")) {
        // Status pode dar QR mesmo assim — segue
      }
      // Tenta pegar o QR — API real retorna `qrCode` (camelCase) em /session/qr,
      // mas o /session/status já traz o QR atual em `qrCode` também.
      let qr = "";
      for (let i = 0; i < 6; i++) {
        const r = await call(`/session/qr`, { method: "GET" });
        qr = r.body?.data?.qrCode ?? r.body?.data?.QRCode ?? "";
        if (qr) break;
        const s = await call(`/session/status`, { method: "GET" });
        qr = s.body?.data?.qrCode ?? s.body?.data?.QRCode ?? "";
        if (qr) break;
        await new Promise((res) => setTimeout(res, 700));
      }
      // QR não obtido após polling — retornar erro claro
      if (!qr) {
        return json({
          error: "QR Code não disponível. Verifique se o Mandrack está online e tente novamente em alguns segundos.",
          instance: instanceName,
        }, 502);
      }
      // Resposta no formato que a UI espera
      return json({
        instance: instanceName,
        base64: qr,                 // já vem como data:image/png;base64,...
        qrcode: qr,
        code: qr,
      });
    }

    // ── pairing ─────────────────────────────────────────────────────────────
    if (action === "pairing") {
      if (!instanceToken) return json({ error: "Crie a instância primeiro." }, 400);
      if (!phone) return json({ error: "Número obrigatório (ex: 5511999999999)." }, 400);
      await call(`/session/connect`, { method: "POST", body: JSON.stringify({ immediate: true }) });
      const r = await call(`/session/pairphone`, {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      const code = r.body?.data?.LinkingCode ?? "";
      return json({ instance: instanceName, pairingCode: code, code });
    }

    // ── delete ──────────────────────────────────────────────────────────────
    if (action === "delete") {
      if (!targetInst) return json({ ok: true, skipped: "instance_not_found" });
      if (instanceToken) {
        await call(`/session/logout`, { method: "POST" }).catch(() => {});
      }
      if (instanceId) {
        await call(`/admin/users/${instanceId}`, { method: "DELETE", useAdmin: true }).catch(() => {});
      }
      await admin.from("whatsapp_instances").delete().eq("id", targetInst.id);

      // Se era a instância espelhada em user_integrations, limpa o espelho
      const { data: integ } = await admin.from("user_integrations")
        .select("evolution_instance").eq("user_id", userId).maybeSingle();
      if (integ?.evolution_instance === instanceName) {
        await admin.from("user_integrations").update({
          evolution_instance: null, mandrack_instance_id: null, mandrack_instance_token: null,
        }).eq("user_id", userId);
      }
      return json({ ok: true });
    }

    // ── send text ───────────────────────────────────────────────────────────
    if (action === "send-text") {
      if (!instanceToken) return json({ error: "Instância não configurada." }, 400);
      const targetPhone = String(reqBody.phone ?? "").replace(/\D/g, "");
      const text = String(reqBody.text ?? "").trim();
      if (!targetPhone) return json({ error: "Telefone obrigatório." }, 400);
      if (!text) return json({ error: "Mensagem obrigatória." }, 400);
      const r = await call(`/chat/send/text`, {
        method: "POST",
        body: JSON.stringify({ phone: targetPhone, body: text, delay: true }),
      });
      return json({ ok: r.ok, response: r.body }, r.ok ? 200 : 400);
    }

    // ── send handoff (foto do lead + resumo) ────────────────────────────────
    if (action === "send-handoff") {
      if (!instanceToken) return json({ error: "Instância não configurada." }, 400);
      const target = String(reqBody.target ?? "").trim();    // group jid (xxx@g.us) ou phone
      const leadPhone = String(reqBody.leadPhone ?? "").replace(/\D/g, "");
      const caption = String(reqBody.caption ?? "").trim();
      if (!target) return json({ error: "Destino obrigatório." }, 400);
      if (!caption) return json({ error: "Resumo obrigatório." }, 400);

      // 1) tenta obter foto do lead (preview/full) — falha silenciosa
      let avatarUrl = "";
      if (leadPhone) {
        try {
          const av = await call(`/user/avatar?phone=${leadPhone}&preview=false`, { method: "GET" });
          avatarUrl = av.body?.data?.URL || av.body?.data?.url || "";
        } catch (_) { /* ignore */ }
        if (!avatarUrl) {
          try {
            const av2 = await call(`/user/avatar?phone=${leadPhone}&preview=true`, { method: "GET" });
            avatarUrl = av2.body?.data?.URL || av2.body?.data?.url || "";
          } catch (_) { /* ignore */ }
        }
      }

      // 2) envia imagem com legenda; fallback texto puro
      if (avatarUrl) {
        const r = await call(`/chat/send/image`, {
          method: "POST",
          body: JSON.stringify({ phone: target, image: avatarUrl, caption, delay: true }),
        });
        if (r.ok) return json({ ok: true, withPhoto: true, response: r.body });
      }
      const r = await call(`/chat/send/text`, {
        method: "POST",
        body: JSON.stringify({ phone: target, body: caption, delay: true }),
      });
      return json({ ok: r.ok, withPhoto: false, response: r.body }, r.ok ? 200 : 400);
    }

    // ── groups ──────────────────────────────────────────────────────────────
    if (action === "groups") {
      if (!instanceToken) return json({ error: "Instância não configurada." }, 400);

      // 0) Verifica se a sessão está logada — sem sessão, não dá pra listar grupos
      const st = await call(`/session/status`, { method: "GET" });
      const stData = st.body?.data ?? {};
      const loggedIn = !!(stData.loggedIn || stData.connected);
      if (!loggedIn) {
        // Tenta reconectar (best-effort) antes de devolver erro amigável
        await call(`/session/connect`, { method: "POST", body: JSON.stringify({ immediate: true }) }).catch(() => null);
        return json({
          groups: [],
          empty_reason: "WhatsApp desconectado. Vá em Integrações → WhatsApp, escaneie o QR Code e tente novamente.",
          not_logged_in: true,
        });
      }

      // Tenta forçar sync antes (endpoints comuns; falha silenciosa)
      for (const sp of ["/group/sync", "/group/refresh", "/group/fetchAll"]) {
        await call(sp, { method: "POST" }).catch(() => null);
      }
      const r = await call(`/group/list`, { method: "GET" });
      if (!r.ok) {
        const errMsg = String(r.body?.error || "").toLowerCase();
        if (errMsg.includes("no session") || errMsg.includes("not logged")) {
          return json({
            groups: [],
            empty_reason: "WhatsApp desconectado. Vá em Integrações → WhatsApp, escaneie o QR Code e tente novamente.",
            not_logged_in: true,
          });
        }
        return json({
          groups: [],
          empty_reason: `Falha ao buscar grupos no Mandrack (${r.status}). Tente novamente em alguns segundos.`,
        });
      }
      const raw = r.body?.data?.groups ?? r.body?.groups ?? r.body?.data ?? [];
      const arr: any[] = Array.isArray(raw) ? raw : [];
      const list = arr
        .map((g: any) => {
          const jid = g.jid || g.id || g.remoteJid || g.groupJid || g.chatId || g.wa_chatid || "";
          const name = g.name || g.subject || g.title || g.subjectName || g.wa_name || jid;
          return { jid: String(jid), name: String(name) };
        })
        .filter((g: any) => g.jid && (g.jid.endsWith("@g.us") || g.jid.includes("-")));
      return json({
        groups: list,
        empty_reason: list.length === 0
          ? "Nenhum grupo encontrado. Verifique se este número faz parte de algum grupo no WhatsApp e aguarde alguns segundos (a sincronização pode levar até 1 min)."
          : null,
      });
    }

    // ── set-webhook ─────────────────────────────────────────────────────────
    // Instala o webhook em TODAS as instâncias do usuário (multi-chip).
    // Isso garante que tanto o chip atendente quanto qualquer chip de disparo
    // que receba resposta inbound encaminhe a mensagem para o Lovable.
    if (action === "set-webhook") {
      const webhookUrl = reqBody.webhook_url;
      const evs = reqBody.events || ["Message"];
      if (!webhookUrl) return json({ error: "webhook_url obrigatório" }, 400);

      const { data: allInstances } = await admin
        .from("whatsapp_instances")
        .select("id, instance_name, mandrack_instance_token")
        .eq("user_id", userId);

      if (!allInstances?.length) {
        return json({ error: "Nenhum chip WhatsApp conectado. Conecte ao menos um chip antes de instalar o webhook." }, 400);
      }

      const results: any[] = [];
      for (const inst of allInstances) {
        if (!inst.mandrack_instance_token) {
          results.push({ instance: inst.instance_name, ok: false, skipped: "no_token" });
          continue;
        }
        try {
          const status = await call(`/session/status`, { method: "GET", instToken: inst.mandrack_instance_token });
          const webhooks = status.body?.data?.webhooks;
          if (Array.isArray(webhooks) && webhooks.includes(webhookUrl)) {
            results.push({ instance: inst.instance_name, ok: true, alreadyConfigured: true });
            continue;
          }
          const r = await call(`/webhook`, {
            method: "POST",
            instToken: inst.mandrack_instance_token,
            body: JSON.stringify({ url: webhookUrl, events: evs }),
          });
          results.push({ instance: inst.instance_name, ok: r.ok, response: r.body });
        } catch (err: any) {
          results.push({ instance: inst.instance_name, ok: false, error: err?.message });
        }
      }

      const successCount = results.filter((r) => r.ok).length;
      return json({
        ok: successCount > 0,
        installed: successCount,
        total: allInstances.length,
        results,
      });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (e: any) {
    console.error("mandrack-manager error:", e?.message);
    return json({ error: e?.message || "erro interno" }, 500);
  }
});
