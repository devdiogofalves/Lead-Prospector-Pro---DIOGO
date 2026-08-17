// Unipile notify_url callback. Receives { status, account_id, name } when a hosted-auth flow completes.
// We map `name` (set to user_id at link-creation time) back to the user and persist account_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-token",
};

function allowInsecureWebhooks() {
  return Deno.env.get("ALLOW_INSECURE_WEBHOOKS") === "true";
}

function validateWebhookSecret(req: Request, url: URL): Response | null {
  const requiredSecret = Deno.env.get("UNIPILE_WEBHOOK_SECRET") ?? "";
  if (!requiredSecret && !allowInsecureWebhooks()) {
    console.error("[unipile-webhook] UNIPILE_WEBHOOK_SECRET ausente");
    return new Response(JSON.stringify({ ok: false, error: "webhook secret not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (requiredSecret) {
    const token = url.searchParams.get("token") ?? req.headers.get("X-Webhook-Token") ?? "";
    if (token !== requiredSecret) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return null;
}

const HTML_OK = `<!doctype html><meta charset="utf-8"><title>Conectado</title>
<body style="font-family:system-ui;background:#0b0b10;color:#e7e7ea;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center;max-width:420px;padding:24px">
<h2 style="margin:0 0 8px">✓ Conta conectada</h2>
<p style="opacity:.7;margin:0 0 16px">Sua conta foi vinculada via Unipile.</p>
<p style="opacity:.5;font-size:13px">Você pode fechar esta aba.</p>
</div><script>setTimeout(()=>window.close(),1500)</script></body>`;

const HTML_FAIL = `<!doctype html><meta charset="utf-8"><title>Falhou</title>
<body style="font-family:system-ui;background:#0b0b10;color:#e7e7ea;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center;max-width:420px;padding:24px">
<h2 style="margin:0 0 8px">⚠️ Conexão falhou</h2>
<p style="opacity:.7;margin:0 0 16px">Tente novamente pelo painel.</p>
</div></body>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);

  // GET = redirect from Unipile after success/failure (just show a friendly page)
  if (req.method === "GET") {
    const ok = url.searchParams.get("ok") === "1";
    return new Response(ok ? HTML_OK : HTML_FAIL, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // POST = notify_url callback (server-to-server)
  try {
    const url = new URL(req.url);
    const secretError = validateWebhookSecret(req, url);
    if (secretError) return secretError;

    const provider = (url.searchParams.get("provider") ?? "LINKEDIN").toUpperCase();
    const body = await req.json();
    // Unipile sends: { status, account_id, name }
    const status = body.status;
    const accountId = body.account_id;
    const userId = body.name; // we passed user_id as `name` when creating the link

    if (status !== "CREATION_SUCCESS" || !accountId || !userId) {
      return new Response(JSON.stringify({ ok: false, ignored: true, body }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row } = await admin
      .from("user_api_keys")
      .select("api_key, extra")
      .eq("user_id", userId)
      .eq("provider", "unipile")
      .maybeSingle();

    if (!row) {
      return new Response(JSON.stringify({ ok: false, error: "user key not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const cacheKey = provider === "LINKEDIN" ? "account_id" : `account_id_${provider.toLowerCase()}`;
    const { data: duplicate } = await admin
      .from("user_api_keys")
      .select("user_id")
      .eq("provider", "unipile")
      .neq("user_id", userId)
      .contains("extra", { [cacheKey]: accountId })
      .limit(1);
    if ((duplicate ?? []).length > 0) {
      return new Response(JSON.stringify({ ok: false, error: "account already linked to another panel" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    const newExtra = { ...(row.extra || {}), [cacheKey]: accountId, [`connected_at_${provider.toLowerCase()}`]: new Date().toISOString() };
    await admin
      .from("user_api_keys")
      .update({ extra: newExtra })
      .eq("user_id", userId)
      .eq("provider", "unipile");

    return new Response(JSON.stringify({ ok: true, provider, account_id_key: cacheKey }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});