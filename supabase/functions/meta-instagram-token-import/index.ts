// redeploy 2026-07-13 scopes-review-only
// Meta Instagram — Manual Token Import (v2: suporte FB + IG)
// Detecta automaticamente se o token é:
//  - Facebook User Token (do fluxo Facebook Login) → troca por long-lived (60d),
//    busca Page Token (NUNCA EXPIRA) via /me/accounts e salva como token_type='page_token'
//  - Instagram User Token (Instagram Login direto) → refresha via ig_refresh_token (60d)
//    e salva como token_type='long_lived'
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const FB_APP_ID = Deno.env.get("META_IG_APP_ID")!;
const FB_APP_SECRET = Deno.env.get("META_IG_APP_SECRET")!;

const GRAPH = "https://graph.facebook.com/v21.0";
const IGGRAPH = "https://graph.instagram.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

    const authClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: claims, error: claimsErr } = await authClient.auth.getClaims(auth.replace("Bearer ", ""));
    const userId = (claims?.claims?.sub as string | undefined) ?? null;
    if (claimsErr || !userId) return json({ ok: false, error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const rawToken = String(body?.access_token ?? body?.token ?? "").trim();
    if (!rawToken || rawToken.length < 20) return json({ ok: false, error: "missing_access_token" }, 400);

    // 1) Tenta fluxo Facebook (Page Token vitalício — preferido)
    const fb = await tryFacebookFlow(rawToken);
    if (fb.ok) {
      const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { error: upsertErr } = await sb
        .from("meta_instagram_accounts")
        .upsert(
          {
            user_id: userId,
            ig_user_id: fb.igUserId,
            username: fb.username,
            access_token: fb.pageToken,
            token_type: "page_token",
            expires_at: new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString(), // ~10y placeholder
            scopes: "manual_import,instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments",
            refreshed_at: new Date().toISOString(),
            metadata: {
              import_source: "manual_token_fb",
              imported_at: new Date().toISOString(),
              flow: "facebook_page_token",
              fb_page_id: fb.pageId,
              fb_page_name: fb.pageName,
              user_long_lived: fb.userLongLived,
              last_refresh_ok: true,
              last_refresh_at: new Date().toISOString(),
              last_refresh_method: "fb_page_token_lifetime",
              last_refresh_errors: null,
            },
          },
          { onConflict: "user_id" },
        );
      if (upsertErr) return json({ ok: false, error: "db", details: upsertErr.message }, 500);

      // Auto-subscribe webhook
      const sub = await subscribeWebhook(fb.igUserId, fb.pageToken);
      return json({
        ok: true,
        flow: "facebook_page_token",
        ig_user_id: fb.igUserId,
        username: fb.username,
        page_id: fb.pageId,
        token_type: "page_token",
        expires_in_text: "nunca expira (Page Token)",
        webhook_subscribed: sub.ok,
        webhook_details: sub,
      });
    }

    // 2) Fallback: fluxo Instagram Login
    const ig = await tryInstagramFlow(rawToken);
    if (ig.ok) {
      const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
      const newExpiresAt = new Date(Date.now() + Number(ig.expiresIn ?? 60 * 24 * 3600) * 1000).toISOString();
      const { error: upsertErr } = await sb
        .from("meta_instagram_accounts")
        .upsert(
          {
            user_id: userId,
            ig_user_id: ig.id,
            username: ig.username,
            access_token: ig.accessToken,
            token_type: "long_lived",
            expires_at: newExpiresAt,
            scopes: "manual_import,instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments",
            refreshed_at: new Date().toISOString(),
            metadata: {
              import_source: "manual_token_ig",
              imported_at: new Date().toISOString(),
              flow: "instagram_long_lived",
              last_refresh_ok: true,
              last_refresh_at: new Date().toISOString(),
              last_refresh_method: ig.method,
              last_refresh_errors: null,
            },
          },
          { onConflict: "user_id" },
        );
      if (upsertErr) return json({ ok: false, error: "db", details: upsertErr.message }, 500);
      return json({
        ok: true,
        flow: "instagram_long_lived",
        ig_user_id: ig.id,
        username: ig.username,
        token_type: "long_lived",
        expires_at: newExpiresAt,
        method: ig.method,
      });
    }

    return json({
      ok: false,
      error: "token_not_recognized",
      hint: "Token não foi reconhecido nem como Facebook User Token nem como Instagram User Token. Confira se copiou completo e se o app é o mesmo configurado em META_IG_APP_ID.",
      fb_errors: fb.safeErrors,
      ig_errors: ig.safeErrors,
    }, 400);
  } catch (e) {
    console.error("[meta-ig-token-import] fatal", e);
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});

async function tryFacebookFlow(token: string): Promise<
  | { ok: true; pageToken: string; pageId: string; pageName: string; igUserId: string; username: string; userLongLived: string }
  | { ok: false; safeErrors: unknown[] }
> {
  const safeErrors: unknown[] = [];
  // Passo 1: troca por long-lived (60d). Se já for long-lived/page-token a chamada ainda funciona.
  let userLongLived = token;
  try {
    const ex = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(FB_APP_ID)}&client_secret=${encodeURIComponent(FB_APP_SECRET)}&fb_exchange_token=${encodeURIComponent(token)}`);
    const j = await ex.json().catch(() => ({}));
    if (ex.ok && j?.access_token) userLongLived = String(j.access_token);
    else safeErrors.push({ step: "fb_exchange_token", status: ex.status, response: sanitize(j) });
  } catch (e) {
    safeErrors.push({ step: "fb_exchange_token", error: String((e as Error).message) });
  }

  // Passo 2: pega lista de páginas + page token + IG business account vinculado
  try {
    const pagesRes = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(userLongLived)}`);
    const pj = await pagesRes.json().catch(() => ({}));
    if (!pagesRes.ok) {
      safeErrors.push({ step: "me_accounts", status: pagesRes.status, response: sanitize(pj) });
      return { ok: false, safeErrors };
    }
    const pages: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }> = pj?.data ?? [];
    const withIg = pages.find((p) => p.instagram_business_account?.id);
    if (!withIg) {
      safeErrors.push({ step: "me_accounts", error: "no_page_with_instagram_business_account", pages_count: pages.length });
      return { ok: false, safeErrors };
    }
    const ig = withIg.instagram_business_account!;
    let username = ig.username ?? "";
    if (!username) {
      try {
        const ur = await fetch(`${GRAPH}/${ig.id}?fields=username&access_token=${encodeURIComponent(withIg.access_token)}`);
        const uj = await ur.json().catch(() => ({}));
        if (ur.ok) username = String(uj?.username ?? "");
      } catch (_) { /* ignore */ }
    }
    return {
      ok: true,
      pageToken: withIg.access_token,
      pageId: withIg.id,
      pageName: withIg.name,
      igUserId: ig.id,
      username,
      userLongLived,
    };
  } catch (e) {
    safeErrors.push({ step: "me_accounts", error: String((e as Error).message) });
    return { ok: false, safeErrors };
  }
}

async function tryInstagramFlow(token: string): Promise<
  | { ok: true; accessToken: string; id: string; username: string; expiresIn?: number; method: string }
  | { ok: false; safeErrors: unknown[] }
> {
  const safeErrors: unknown[] = [];
  // Tenta refresh direto (assume já long-lived)
  try {
    const r = await fetch(`${IGGRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
    const j = await r.json().catch(() => ({}));
    if (r.ok && j?.access_token) {
      const newToken = String(j.access_token);
      const me = await fetch(`${IGGRAPH}/me?fields=id,username&access_token=${encodeURIComponent(newToken)}`);
      const mj = await me.json().catch(() => ({}));
      if (me.ok && mj?.id) {
        return { ok: true, accessToken: newToken, id: String(mj.id), username: String(mj.username ?? ""), expiresIn: Number(j.expires_in ?? 60 * 24 * 3600), method: "ig_refresh_access_token" };
      }
      safeErrors.push({ step: "ig_me", status: me.status, response: sanitize(mj) });
    } else {
      safeErrors.push({ step: "ig_refresh_access_token", status: r.status, response: sanitize(j) });
    }
  } catch (e) {
    safeErrors.push({ step: "ig_refresh_access_token", error: String((e as Error).message) });
  }
  return { ok: false, safeErrors };
}

async function subscribeWebhook(igUserId: string, pageToken: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${GRAPH}/${igUserId}/subscribed_apps?subscribed_fields=comments,messages,mentions,live_comments&access_token=${encodeURIComponent(pageToken)}`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, response: sanitize(j) };
  } catch (e) {
    return { ok: false, error: String((e as Error).message) };
  }
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
