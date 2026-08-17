// unipile-account-webhook — recebe eventos `account_status` da Unipile.
// Pausa cadências quando a conta LinkedIn perde credenciais; reativa quando volta.
//
// Status Unipile observados:
//   OK                    → conta saudável
//   CREDENTIALS           → cookies expirados / 2FA pendente
//   ERROR                 → falha geral
//   STOPPED / DISCONNECTED → desconectada
//
// CONFIGURAR no painel Unipile como "Account Status Webhook":
//   https://<project>.supabase.co/functions/v1/unipile-account-webhook?token=<UNIPILE_WEBHOOK_SECRET>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function allowInsecureWebhooks() {
  return Deno.env.get("ALLOW_INSECURE_WEBHOOKS") === "true";
}

const HEALTHY = new Set(["OK", "CREATION_SUCCESS", "RECONNECTED", "CONNECTED"]);
const UNHEALTHY = new Set(["CREDENTIALS", "ERROR", "STOPPED", "DISCONNECTED", "EXPIRED"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Use POST", { status: 405, headers: corsHeaders });

  const requiredSecret = Deno.env.get("UNIPILE_WEBHOOK_SECRET") ?? "";
  if (!requiredSecret && !allowInsecureWebhooks()) {
    console.error("[unipile-account-webhook] UNIPILE_WEBHOOK_SECRET ausente");
    return json({ ok: false, error: "webhook secret not configured" }, 500);
  }
  if (requiredSecret) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? req.headers.get("X-Webhook-Token");
    if (token !== requiredSecret) return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  let payload: any;
  try { payload = await req.json(); }
  catch { return new Response("Invalid JSON", { status: 400, headers: corsHeaders }); }

  console.log("[unipile-account-webhook] payload:", JSON.stringify(payload).slice(0, 600));

  const accountId = payload?.account_id ?? payload?.account?.id ?? payload?.data?.account_id;
  const status = String(payload?.status ?? payload?.account?.status ?? payload?.data?.status ?? "").toUpperCase();

  if (!accountId || !status) return json({ ok: true, skipped: "missing_account_id_or_status" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve user_id — procura em qualquer account_id_* dentro do extra JSON
  const { data: rows } = await admin
    .from("user_api_keys")
    .select("user_id, extra")
    .eq("provider", "unipile");

  const keyRow = (rows ?? []).find((r: any) => {
    const ex = r.extra ?? {};
    return Object.values(ex).some((v: any) => v === accountId);
  });

  if (!keyRow?.user_id) return json({ ok: true, skipped: "account_id_not_mapped", account_id: accountId });

  // Atualiza status na chave (para UI exibir)
  const newExtra = { ...(keyRow.extra || {}), account_status: status, status_updated_at: new Date().toISOString() };
  await admin.from("user_api_keys").update({ extra: newExtra })
    .eq("user_id", keyRow.user_id).eq("provider", "unipile");

  // UNHEALTHY → pausa todas cadências ativas do user
  if (UNHEALTHY.has(status)) {
    const { count } = await admin.from("linkedin_contacts")
      .update({ cadencia_status: "paused", ultima_falha: `Conta Unipile: ${status}` }, { count: "exact" })
      .eq("user_id", keyRow.user_id)
      .eq("cadencia_status", "active");

    console.log(`[unipile-account-webhook] ${status} → ${count ?? 0} cadências pausadas para user ${keyRow.user_id}`);
    return json({ ok: true, action: "paused", count, status });
  }

  // HEALTHY → reativa só as que foram pausadas por motivo de conta
  if (HEALTHY.has(status)) {
    const { count } = await admin.from("linkedin_contacts")
      .update({ cadencia_status: "active", ultima_falha: null }, { count: "exact" })
      .eq("user_id", keyRow.user_id)
      .eq("cadencia_status", "paused")
      .ilike("ultima_falha", "Conta Unipile:%");

    console.log(`[unipile-account-webhook] ${status} → ${count ?? 0} cadências reativadas para user ${keyRow.user_id}`);
    return json({ ok: true, action: "reactivated", count, status });
  }

  return json({ ok: true, skipped: "neutral_status", status });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}