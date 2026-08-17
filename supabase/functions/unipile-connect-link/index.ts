// Generates a Unipile Hosted Auth Wizard URL so the user can connect LinkedIn/Instagram/Telegram/e-mail via popup.
// Requires user_api_keys row with provider='unipile' (api_key + extra.dsn).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function allowInsecureWebhooks() {
  return Deno.env.get("ALLOW_INSECURE_WEBHOOKS") === "true";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: keyRow } = await admin
      .from("user_api_keys")
      .select("api_key, extra")
      .eq("user_id", u.user.id)
      .eq("provider", "unipile")
      .maybeSingle();

    if (!keyRow?.api_key) {
      return json({ error: "Configure sua API Key Unipile primeiro." }, 400);
    }
    const dsn: string | undefined = (keyRow.extra as any)?.dsn;
    if (!dsn) {
      return json({ error: "Configure o DSN do Unipile (ex.: https://apiXX.unipile.com:14XXX) no campo 'dsn' do extra da chave." }, 400);
    }

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookSecret = Deno.env.get("UNIPILE_WEBHOOK_SECRET") ?? "";
    if (!webhookSecret && !allowInsecureWebhooks()) {
      return json({ error: "Configure UNIPILE_WEBHOOK_SECRET antes de gerar links de conexão Unipile em produção." }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const requestedProvider = String(body.provider ?? "LINKEDIN").toUpperCase();
    const allowedProviders = new Set(["LINKEDIN", "INSTAGRAM", "TELEGRAM", "GOOGLE", "OUTLOOK", "IMAP", "MESSENGER", "FACEBOOK"]);
    if (!allowedProviders.has(requestedProvider)) {
      return json({ error: "Provider Unipile inválido." }, 400);
    }
    const notifyUrl = webhookSecret
      ? `${supaUrl}/functions/v1/unipile-webhook?provider=${requestedProvider}&token=${encodeURIComponent(webhookSecret)}`
      : `${supaUrl}/functions/v1/unipile-webhook?provider=${requestedProvider}`;
    const successUrl = body.success_redirect_url || `${supaUrl}/functions/v1/unipile-webhook?ok=1`;
    const failureUrl = body.failure_redirect_url || `${supaUrl}/functions/v1/unipile-webhook?ok=0`;

    // Expires in 1h
    const expiresOn = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const payload = {
      type: "create",
      providers: [requestedProvider],
      api_url: dsn,
      expiresOn,
      notify_url: notifyUrl,
      success_redirect_url: successUrl,
      failure_redirect_url: failureUrl,
      name: u.user.id, // round-trips back in the webhook so we know which user connected
      ...(requestedProvider === "INSTAGRAM"
        ? {
            config: {
              instagram: {
                allow_methods: ["credentials", "cookies"],
              },
            },
          }
        : {}),
    };

    const r = await fetch(`${dsn}/api/v1/hosted/accounts/link`, {
      method: "POST",
      headers: {
        "X-API-KEY": keyRow.api_key,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const txt = await r.text();
    if (!r.ok) {
      if (r.status === 401) {
        return json({
          error: "Unipile rejeitou suas credenciais (401). Verifique se a API Key + DSN em Configurações → APIs → Unipile estão corretos e ativos no dashboard.unipile.com. Gere uma nova chave se necessário.",
          raw: txt,
        }, 401);
      }
      return json({ error: `Unipile ${r.status}: ${txt}` }, 502);
    }
    const data = JSON.parse(txt);
    return json({ url: data.url, expiresOn });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}