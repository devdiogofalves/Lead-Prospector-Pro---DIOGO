// Meta Instagram — Token Refresh Worker
// Runs daily via pg_cron. Long-lived Instagram tokens are refreshed before expiry.
// Page Tokens are revalidated + webhook subscription is renewed, because they do not
// expire by date but can be revoked by Meta/account changes.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const IG_APP_SECRET = Deno.env.get("META_INSTAGRAM_APP_SECRET") ?? Deno.env.get("META_IG_APP_SECRET")!;
const REFRESH_WINDOW_DAYS = 7; // refresh anything expiring in <= 7d
const GRAPH = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestUrl = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const force = body?.force === true || requestUrl.searchParams.get("force") === "true";
  const includeShortLived = body?.include_short_lived === true || requestUrl.searchParams.get("include_short_lived") === "true";
  const auth = req.headers.get("Authorization") ?? "";
  let scopedUserId: string | null = null;

  if (auth.startsWith("Bearer ")) {
    const authClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await authClient.auth.getClaims(auth.replace("Bearer ", ""));
    scopedUserId = (claims?.claims?.sub as string | undefined) ?? null;
  }

  // SEGURANÇA: se não veio user autenticado, só cron autorizado pode rodar (varre todas as contas).
  // Antes: POST anônimo enumerava todas as contas IG conectadas.
  if (!scopedUserId) {
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const providedCron = req.headers.get("x-cron-secret") ?? "";
    const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cronOk = (cronSecret && providedCron === cronSecret) || (serviceRole && bearerToken === serviceRole);
    if (!cronOk) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const cutoff = new Date(Date.now() + REFRESH_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();

  let query = sb
    .from("meta_instagram_accounts")
    .select("user_id, ig_user_id, access_token, token_type, expires_at, metadata")
    .order("expires_at", { ascending: true, nullsFirst: true })
    .limit(25);

  if (scopedUserId) query = query.eq("user_id", scopedUserId);

  const { data: allRows, error } = await query;

  if (error) {
    return json({ ok: false, error: error.message }, 500);
  }

  const nowMs = Date.now();
  const rows = (allRows ?? []).filter((row) => {
    // Page tokens não expiram por data, mas precisam ser revalidados diariamente.
    if (row.token_type === "page_token") return true;
    const expiresAtMs = row.expires_at ? new Date(row.expires_at).getTime() : Infinity;
    if (row.token_type === "long_lived") {
      return force || (row.expires_at && row.expires_at <= cutoff);
    }
    if (row.token_type === "short_lived_fallback") {
      // Force/include must surface a real failure for expired short tokens instead of
      // returning checked=0 and making the UI look successful.
      return force || includeShortLived || expiresAtMs > nowMs;
    }
    return false;
  });

  const results: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    try {
      if (row.token_type === "page_token") {
        const validation = await validatePageToken(row.access_token, row.ig_user_id);
        await sb
          .from("meta_instagram_accounts")
          .update({
            refreshed_at: new Date().toISOString(),
            metadata: {
              ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
              last_refresh_ok: validation.ok,
              last_refresh_at: new Date().toISOString(),
              last_refresh_method: "page_token_revalidation",
              last_refresh_errors: validation.ok ? null : validation.safeErrors,
              webhook_resubscribe: validation.subscription ?? null,
            },
          })
          .eq("user_id", row.user_id);
        results.push({ ig_user_id: row.ig_user_id, ok: validation.ok, token_type: "page_token", method: "page_token_revalidation", errors: validation.ok ? null : validation.safeErrors });
        continue;
      }

      const refresh = row.token_type === "long_lived"
        ? await refreshLongLivedToken(row.access_token)
        : await upgradeShortLivedToken(row.access_token);

      if (!refresh.ok) {
        console.error("[meta-ig-refresh] fail", { ig_user_id: row.ig_user_id, token_type: row.token_type, errors: refresh.safeErrors });
        await sb
          .from("meta_instagram_accounts")
          .update({
            metadata: {
              ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
              last_refresh_ok: false,
              last_refresh_at: new Date().toISOString(),
              last_refresh_errors: refresh.safeErrors,
            },
          })
          .eq("user_id", row.user_id);
        results.push({ ig_user_id: row.ig_user_id, ok: false, token_type: row.token_type, errors: refresh.safeErrors });
        continue;
      }
      const newExpiresAt = new Date(Date.now() + Number(refresh.expiresIn ?? 60 * 24 * 3600) * 1000).toISOString();
      const { error: upErr } = await sb
        .from("meta_instagram_accounts")
        .update({
          access_token: refresh.accessToken,
          token_type: "long_lived",
          expires_at: newExpiresAt,
          refreshed_at: new Date().toISOString(),
          metadata: {
            ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
            last_refresh_ok: true,
            last_refresh_at: new Date().toISOString(),
            last_refresh_method: refresh.method,
            last_refresh_errors: null,
          },
        })
        .eq("user_id", row.user_id);
      if (upErr) throw upErr;
      results.push({ ig_user_id: row.ig_user_id, ok: true, token_type: "long_lived", method: refresh.method, new_expires_at: newExpiresAt });
    } catch (e) {
      results.push({ ig_user_id: row.ig_user_id, ok: false, error: String((e as Error).message) });
    }
  }

  const allOk = results.every((r) => r.ok !== false);
  return json({ ok: allOk, scoped_user: !!scopedUserId, checked: rows.length, results });
});

async function refreshLongLivedToken(token: string): Promise<
  | { ok: true; accessToken: string; expiresIn?: number; method: string }
  | { ok: false; safeErrors: unknown[] }
> {
  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`,
    { method: "GET" },
  );
  const body = await res.json().catch(() => ({}));
  if (res.ok && body?.access_token) {
    return {
      ok: true,
      accessToken: String(body.access_token),
      expiresIn: Number(body.expires_in ?? 60 * 24 * 3600),
      method: "refresh_access_token",
    };
  }
  return { ok: false, safeErrors: [{ label: "refresh_access_token", status: res.status, response: sanitize(body) }] };
}

async function validatePageToken(token: string, igUserId: string): Promise<
  | { ok: true; subscription: Record<string, unknown> }
  | { ok: false; safeErrors: unknown[]; subscription?: Record<string, unknown> }
> {
  const safeErrors: unknown[] = [];
  try {
    const res = await fetch(`${GRAPH}/me?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      safeErrors.push({ label: "page_token_me", status: res.status, response: sanitize(body) });
      return { ok: false, safeErrors };
    }
  } catch (e) {
    safeErrors.push({ label: "page_token_me", error: String((e as Error).message) });
    return { ok: false, safeErrors };
  }

  const subscription = await subscribeWebhook(igUserId, token);
  if (!subscription.ok) {
    safeErrors.push({ label: "subscribed_apps", response: subscription });
    return { ok: false, safeErrors, subscription };
  }
  return { ok: true, subscription };
}

async function subscribeWebhook(igUserId: string, pageToken: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${GRAPH}/${igUserId}/subscribed_apps?subscribed_fields=comments,messages,mentions,live_comments&access_token=${encodeURIComponent(pageToken)}`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, response: sanitize(body) };
  } catch (e) {
    return { ok: false, error: String((e as Error).message) };
  }
}

async function upgradeShortLivedToken(token: string): Promise<
  | { ok: true; accessToken: string; expiresIn?: number; method: string }
  | { ok: false; safeErrors: unknown[] }
> {
  const query = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: IG_APP_SECRET,
    access_token: token,
  });
  const formBody = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: IG_APP_SECRET,
    access_token: token,
  });

  const attempts: Array<{ label: string; url: string; init?: RequestInit }> = [
    { label: "exchange_docs_get", url: `https://graph.instagram.com/access_token?${query.toString()}` },
    {
      label: "exchange_post_form",
      url: "https://graph.instagram.com/access_token",
      init: { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody },
    },
    { label: "exchange_v21_get", url: `https://graph.instagram.com/v21.0/access_token?${query.toString()}` },
  ];

  const safeErrors: unknown[] = [];
  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, { method: "GET", ...(attempt.init ?? {}) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.access_token) {
        return {
          ok: true,
          accessToken: String(body.access_token),
          expiresIn: Number(body.expires_in ?? 60 * 24 * 3600),
          method: attempt.label,
        };
      }
      // code 100 "Unsupported request" = app sem App Review aprovado ou usuário não é Tester
      const errCode = (body as any)?.error?.code;
      const errMsg = String((body as any)?.error?.message ?? "");
      if (errCode === 100 && /unsupported/i.test(errMsg)) {
        return {
          ok: false,
          safeErrors: [{
            label: "app_review_required",
            hint: "A Meta recusou a troca do token. Causa provável: (1) App Review de 'instagram_business_basic' ainda não aprovado; (2) usuário não está na lista de Testers do app; (3) META_INSTAGRAM_APP_SECRET não corresponde ao META_INSTAGRAM_APP_ID. Acesse developers.facebook.com → seu app → App Review ou Roles → Testers.",
            status: res.status,
            response: sanitize(body),
          }],
        };
      }
      safeErrors.push({ label: attempt.label, status: res.status, response: sanitize(body) });
    } catch (e) {
      safeErrors.push({ label: attempt.label, error: String((e as Error).message) });
    }
  }

  const refreshAttempt = await refreshLongLivedToken(token);
  if (refreshAttempt.ok) return { ...refreshAttempt, method: "refresh_short_compat" };
  safeErrors.push(...refreshAttempt.safeErrors);

  return { ok: false, safeErrors };
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitize(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sanitize);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (/access_token|client_secret|authorization|password|cookie|auth.*code/i.test(k)) out[k] = "[redacted]";
    else if (val && typeof val === "object") out[k] = sanitize(val);
    else out[k] = val;
  }
  return out;
}
