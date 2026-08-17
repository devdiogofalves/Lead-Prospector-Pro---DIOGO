// meta-resolve-media-from-url
// Resolve um permalink público do Instagram (post, reel ou story) para o media_id
// correspondente da conta Meta vinculada ao usuário autenticado.
//
// Body: { url: string }
// Resp: { ok, kind: 'post'|'reel'|'story', media_id, permalink, caption?, media_type?, timestamp? }
//
// Inspirado no workflow n8n "Configurador de Automação por Post/Story": detecta o
// tipo pelo padrão da URL e cruza com /me/media ou /me/stories da conta do user.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const GRAPH = "https://graph.instagram.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return j({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return j({ ok: false, error: "unauthorized" }, 401);
    const authClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: claims, error: cErr } = await authClient.auth.getClaims(auth.replace("Bearer ", ""));
    const userId = (claims?.claims?.sub as string | undefined) ?? null;
    if (cErr || !userId) return j({ ok: false, error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const url = String(body?.url ?? "").trim();
    if (!url) return j({ ok: false, error: "missing_url" }, 400);

    const parsed = parseInstagramUrl(url);
    if (!parsed) return j({ ok: false, error: "invalid_url", hint: "Cole um link de post (/p/), reel (/reel/) ou story (/stories/usuario/ID)." }, 400);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: acc, error: accErr } = await sb
      .from("meta_instagram_accounts")
      .select("ig_user_id, access_token, username")
      .eq("user_id", userId)
      .maybeSingle();
    if (accErr || !acc?.ig_user_id || !acc?.access_token) {
      return j({ ok: false, error: "no_meta_account", hint: "Conecte sua conta Meta/Instagram em Configurações → Canais." }, 400);
    }

    const igUserId = acc.ig_user_id as string;
    const token = acc.access_token as string;

    if (parsed.kind === "story") {
      const r = await fetch(`${GRAPH}/me/stories?fields=id,permalink,media_type,timestamp&access_token=${encodeURIComponent(token)}`);
      const jr = await r.json().catch(() => ({}));
      if (!r.ok) return j({ ok: false, error: "graph_error", details: jr }, 502);
      const items: any[] = jr?.data ?? [];
      const match = items.find((it) => normalize(it.permalink) === normalize(url));
      if (!match) return j({ ok: false, error: "story_not_found", hint: "Stories somem após 24h. Confirme se ainda está ativo na sua conta." }, 404);
      return j({ ok: true, kind: "story", media_id: match.id, permalink: match.permalink, media_type: match.media_type, timestamp: match.timestamp });
    }

    // post ou reel: usa /me/media e bate por shortcode
    const r = await fetch(`${GRAPH}/me/media?fields=id,permalink,caption,media_type,timestamp&limit=100&access_token=${encodeURIComponent(token)}`);
    const jr = await r.json().catch(() => ({}));
    if (!r.ok) return j({ ok: false, error: "graph_error", details: jr }, 502);
    const items: any[] = jr?.data ?? [];
    const match = items.find((it) => {
      const sc = extractShortcode(it.permalink);
      return sc && sc === parsed.shortcode;
    });
    if (!match) return j({ ok: false, error: "media_not_found", hint: "Esse post não está entre os últimos 100 da conta conectada, ou pertence a outra conta." }, 404);
    return j({ ok: true, kind: parsed.kind, media_id: match.id, permalink: match.permalink, caption: match.caption, media_type: match.media_type, timestamp: match.timestamp });
  } catch (e) {
    return j({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});

function parseInstagramUrl(raw: string): { kind: "post" | "reel" | "story"; shortcode?: string } | null {
  try {
    const u = new URL(raw);
    if (!/instagram\.com$/i.test(u.hostname.replace(/^www\./, ""))) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "stories") return { kind: "story" };
    const pIdx = parts.findIndex((p) => p === "p" || p === "reel" || p === "reels");
    if (pIdx >= 0 && parts[pIdx + 1]) {
      return { kind: parts[pIdx] === "p" ? "post" : "reel", shortcode: parts[pIdx + 1] };
    }
    return null;
  } catch {
    return null;
  }
}

function extractShortcode(permalink?: string): string | null {
  if (!permalink) return null;
  const m = permalink.match(/\/(p|reel|reels)\/([^/?#]+)/);
  return m ? m[2] : null;
}

function normalize(u?: string): string {
  if (!u) return "";
  return u.replace(/\/+$/, "").split("?")[0];
}

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
