// redeploy 2026-07-14 real-permissions-capture
// redeploy 2026-07-12a oauth-state signed
// redeploy 2026-07-10g instagram login
// Meta Instagram OAuth — CALLBACK (Método B: Instagram API with Instagram Login)
// Troca o code por token do Instagram (curto → longo, ~60 dias), resolve o perfil
// e assina o webhook — tudo via graph.instagram.com, SEM Página do Facebook.
//
// Env: META_INSTAGRAM_APP_ID/SECRET (fallback META_IG_APP_ID/SECRET) — devem ser as
// credenciais do produto Instagram do app.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyOAuthState } from "../_shared/oauth-state.ts";

const IG_APP_ID = Deno.env.get("META_INSTAGRAM_APP_ID") ?? Deno.env.get("META_IG_APP_ID")!;
const IG_APP_SECRET = Deno.env.get("META_INSTAGRAM_APP_SECRET") ?? Deno.env.get("META_IG_APP_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OAUTH_STATE_SECRET = Deno.env.get("OAUTH_STATE_SECRET") ?? "";
const IG_GRAPH = "https://graph.instagram.com";
const IG_API = "https://api.instagram.com";
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/meta-instagram-oauth-callback`;
const APP_RETURN_URL = "https://leadsbooster.com.br/configuracoes/canais";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  if (errorParam) return htmlRedirect(`${APP_RETURN_URL}?meta_ig=error&reason=${encodeURIComponent(errorParam)}`);
  if (!code || !stateRaw) return htmlRedirect(`${APP_RETURN_URL}?meta_ig=error&reason=missing_code_or_state`);

  const verifiedState = await verifyOAuthState(stateRaw, OAUTH_STATE_SECRET);
  const userId = verifiedState?.u ?? null;
  if (!userId) return htmlRedirect(`${APP_RETURN_URL}?meta_ig=error&reason=invalid_or_expired_state`);

  try {
    // 1) code → token curto (+ user_id do Instagram)
    const short = await exchangeCode(code);
    if (!short.ok) {
      console.error("[meta-ig-cb] code exchange failed", short.safeErrors);
      return htmlRedirect(`${APP_RETURN_URL}?meta_ig=error&reason=token_exchange`);
    }

    // 2) token curto → token longo (~60 dias)
    const long = await exchangeLongLived(short.accessToken);
    const igToken = long.ok ? long.accessToken : short.accessToken;
    const expiresInSec = long.ok ? long.expiresIn : 3600;

    // 3) perfil (username)
    const me = await fetchMe(igToken, short.userId);

    // 4) assina webhook (comments + messages) na própria conta
    const sub = await subscribeWebhook(igToken);

    // Scopes REAIS concedidos pelo usuário (não a lista solicitada).
    // A Meta retorna em `permissions` no /oauth/access_token — pode vir como
    // array de strings ou string separada por vírgula. Fallback: lista solicitada
    // no oauth-start (inclui instagram_business_content_publish).
    const REQUESTED_SCOPES = "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish";
    const grantedPermissions = normalizePermissions(short.permissions);
    const scopesString = grantedPermissions.length > 0 ? grantedPermissions.join(",") : REQUESTED_SCOPES;

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { error: upsertErr } = await sb.from("meta_instagram_accounts").upsert({
      user_id: userId,
      ig_user_id: String(me.igUserId ?? short.userId ?? ""),
      username: me.username ?? null,
      access_token: igToken,
      // "long_lived"/"short_lived_fallback" batem com o meta-instagram-token-refresh,
      // que já renova via graph.instagram.com/refresh_access_token (ig_refresh_token).
      token_type: long.ok ? "long_lived" : "short_lived_fallback",
      expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
      scopes: scopesString,
      refreshed_at: new Date().toISOString(),
      metadata: {
        import_source: "oauth_instagram_login",
        flow: "instagram_login",
        long_lived_ok: long.ok,
        webhook_subscribed: sub.ok,
        webhook_details: sub,
        granted_permissions: grantedPermissions,
      },
    }, { onConflict: "user_id" });

    if (upsertErr) {
      console.error("[meta-ig-cb] upsert error", upsertErr.message);
      return htmlRedirect(`${APP_RETURN_URL}?meta_ig=error&reason=db`);
    }

    console.log("[meta-ig-cb] connected", { userId, igUserId: me.igUserId ?? short.userId, username: me.username, longLived: long.ok, webhook: sub.ok });
    return htmlRedirect(`${APP_RETURN_URL}?meta_ig=ok&username=${encodeURIComponent(me.username ?? "")}`);
  } catch (e) {
    console.error("[meta-ig-cb] fatal", e);
    return htmlRedirect(`${APP_RETURN_URL}?meta_ig=error&reason=exception`);
  }
});

// code → { access_token (curto), user_id, permissions (scopes concedidos) } via POST form-encoded
async function exchangeCode(code: string): Promise<{ ok: true; accessToken: string; userId: string; permissions: unknown } | { ok: false; safeErrors: unknown[] }> {
  const form = new URLSearchParams({
    client_id: IG_APP_ID,
    client_secret: IG_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
    code,
  });
  const res = await fetch(`${IG_API}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const j = await res.json().catch(() => ({}));
  if (res.ok && j?.access_token) {
    return {
      ok: true,
      accessToken: String(j.access_token),
      userId: String(j.user_id ?? ""),
      permissions: j.permissions ?? null,
    };
  }
  return { ok: false, safeErrors: [{ step: "ig_oauth_access_token", status: res.status, response: sanitize(j) }] };
}

// Normaliza `permissions` retornado pela Meta (array de strings, string CSV, ou objeto {data:[{permission}]}) → string[]
function normalizePermissions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((x) => (typeof x === "string" ? x : typeof (x as any)?.permission === "string" ? (x as any).permission : ""))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (typeof raw === "object" && Array.isArray((raw as any).data)) {
    return normalizePermissions((raw as any).data);
  }
  return [];
}

// token curto → token longo (ig_exchange_token, ~60 dias)
async function exchangeLongLived(shortToken: string): Promise<{ ok: true; accessToken: string; expiresIn: number } | { ok: false; safeErrors: unknown[] }> {
  const qs = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: IG_APP_SECRET, access_token: shortToken });
  const res = await fetch(`${IG_GRAPH}/access_token?${qs}`);
  const j = await res.json().catch(() => ({}));
  if (res.ok && j?.access_token) return { ok: true, accessToken: String(j.access_token), expiresIn: Number(j.expires_in ?? 5183944) };
  return { ok: false, safeErrors: [{ step: "ig_exchange_token", status: res.status, response: sanitize(j) }] };
}

async function fetchMe(token: string, fallbackId: string): Promise<{ igUserId: string; username: string | null }> {
  try {
    const res = await fetch(`${IG_GRAPH}/v21.0/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`);
    const j = await res.json().catch(() => ({}));
    if (res.ok) return { igUserId: String(j.user_id ?? fallbackId), username: j.username ?? null };
  } catch (_) { /* ignore */ }
  return { igUserId: fallbackId, username: null };
}

async function subscribeWebhook(token: string): Promise<{ ok: boolean; status?: number; response?: unknown }> {
  try {
    const res = await fetch(`${IG_GRAPH}/v21.0/me/subscribed_apps?subscribed_fields=comments,messages&access_token=${encodeURIComponent(token)}`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok && j?.success !== false, status: res.status, response: sanitize(j) };
  } catch (e) {
    return { ok: false, response: String((e as Error)?.message ?? e) };
  }
}

function htmlRedirect(to: string) {
  return new Response(null, { status: 302, headers: { ...corsHeaders, Location: to, "Cache-Control": "no-store" } });
}
function sanitize(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sanitize);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (/access_token|client_secret|authorization|password|cookie/i.test(k)) out[k] = "[redacted]";
    else if (val && typeof val === "object") out[k] = sanitize(val);
    else out[k] = val;
  }
  return out;
}
