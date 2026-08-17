// unipile-register-webhook — Garante que o webhook de mensagens da Unipile
// receba eventos de TODAS as contas do tenant (LinkedIn, Instagram, Telegram, etc).
//
// Chamado:
//   - Manualmente pelo usuário via UI ("Reparar webhooks")
//   - Automaticamente após conectar/reconectar uma conta (unipile-webhook)
//
// Estratégia: cria (ou substitui) o webhook "LeadsBooster - Messages" SEM filtro
// de account_ids — assim toda conta nova do tenant é coberta sem re-inscrição.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WEBHOOK_NAME = "LeadsBooster - Messages";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve user_id: via JWT (chamada da UI) ou body.user_id (interno)
  let userId: string | null = null;
  const auth = req.headers.get("Authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    const { data } = await admin.auth.getUser(auth.slice(7));
    userId = data?.user?.id ?? null;
  }
  if (!userId) {
    try {
      const body = await req.json();
      userId = body?.user_id ?? null;
    } catch { /* noop */ }
  }
  if (!userId) return json({ ok: false, error: "unauthenticated" }, 401);

  // Busca credenciais Unipile do tenant
  const { data: row } = await admin
    .from("user_api_keys")
    .select("api_key, extra")
    .eq("user_id", userId)
    .eq("provider", "unipile")
    .maybeSingle();

  const apiKey = (row?.api_key ?? "").trim();
  const extra = (row?.extra as any) ?? {};
  const dsn = (extra.dsn ?? "").replace(/\/+$/, "");
  if (!apiKey || !dsn) return json({ ok: false, error: "unipile_not_configured" }, 400);

  const webhookSecret = Deno.env.get("UNIPILE_WEBHOOK_SECRET") ?? "";
  const projectUrl = Deno.env.get("SUPABASE_URL")!;
  const requestUrl = `${projectUrl}/functions/v1/unipile-message-webhook${webhookSecret ? `?token=${encodeURIComponent(webhookSecret)}` : ""}`;

  const headers = {
    "X-API-KEY": apiKey,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };

  // 1) Lista webhooks existentes e apaga qualquer um com o mesmo nome/URL
  //    (evita duplicatas e garante configuração limpa)
  let deletedCount = 0;
  try {
    const listRes = await fetch(`${dsn}/api/v1/webhooks`, { headers });
    if (listRes.ok) {
      const list = await listRes.json();
      const items: any[] = list?.items ?? list?.data ?? list ?? [];
      for (const w of items) {
        const matchName = String(w?.name ?? "").toLowerCase().includes("leadsbooster");
        const matchUrl = String(w?.request_url ?? "").includes("unipile-message-webhook");
        if (matchName || matchUrl) {
          const wid = w?.id ?? w?.webhook_id;
          if (wid) {
            const del = await fetch(`${dsn}/api/v1/webhooks/${wid}`, { method: "DELETE", headers });
            if (del.ok) deletedCount++;
          }
        }
      }
    }
  } catch (e) {
    console.warn("[unipile-register-webhook] list/delete failed:", (e as Error).message);
  }

  // 2) Cria webhook novo — SEM account_ids = captura todas as contas do tenant
  const createBody = {
    source: "messaging",
    name: WEBHOOK_NAME,
    request_url: requestUrl,
    format: "json",
    events: ["message_received"],
  };

  const createRes = await fetch(`${dsn}/api/v1/webhooks`, {
    method: "POST",
    headers,
    body: JSON.stringify(createBody),
  });
  const createText = await createRes.text();
  if (!createRes.ok) {
    console.error("[unipile-register-webhook] create failed:", createRes.status, createText);
    return json({ ok: false, error: `Unipile ${createRes.status}: ${createText}`, deleted: deletedCount }, 502);
  }

  const created = safeJson(createText);
  console.log("[unipile-register-webhook] webhook registered:", created?.id ?? created?.webhook_id);

  // 3) (Opcional) registra webhook de account status também
  try {
    const acctUrl = `${projectUrl}/functions/v1/unipile-account-webhook${webhookSecret ? `?token=${encodeURIComponent(webhookSecret)}` : ""}`;
    await fetch(`${dsn}/api/v1/webhooks`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        source: "account_status",
        name: "LeadsBooster - Account Status",
        request_url: acctUrl,
        format: "json",
      }),
    });
  } catch { /* best-effort */ }

  // 4) Marca timestamp no tenant pra UI mostrar "webhook OK"
  const newExtra = { ...extra, webhook_registered_at: new Date().toISOString(), webhook_id: created?.id ?? null };
  await admin.from("user_api_keys").update({ extra: newExtra })
    .eq("user_id", userId).eq("provider", "unipile");

  return json({ ok: true, deleted: deletedCount, webhook_id: created?.id ?? created?.webhook_id ?? null, request_url: requestUrl });
});

function safeJson(txt: string) { try { return JSON.parse(txt); } catch { return null; } }
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
