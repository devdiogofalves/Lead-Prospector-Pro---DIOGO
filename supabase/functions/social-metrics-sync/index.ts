// social-metrics-sync v2 (2026-07-15): agora BACKFILLA posts reais do IG (Meta Graph) e LinkedIn (Unipile)
// além de atualizar likes/comments. Isso corrige o "só aparece 9 posts" quando o cliente tem histórico
// muito maior nas redes do que o publicado via LeadsBooster.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const GRAPH = "https://graph.instagram.com/v21.0";

const MAX_IG_PAGES = 10;   // 10 x 50 = até 500 mídias
const MAX_LI_PAGES = 5;    // até 5 páginas de posts

function pickNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapIgMediaType(t: string | undefined): string {
  const s = String(t ?? "").toUpperCase();
  if (s === "VIDEO") return "video";
  if (s === "REELS" || s === "REEL") return "reel";
  if (s === "CAROUSEL_ALBUM" || s === "CAROUSEL") return "carousel";
  return "image";
}

async function syncInstagram(admin: any, userId: string) {
  const { data: acc } = await admin
    .from("meta_instagram_accounts")
    .select("ig_user_id, access_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (!acc?.access_token || !acc?.ig_user_id) return { skipped: "no_meta_account" };

  // Pagina mídias do IG
  const allMedia: any[] = [];
  let nextUrl: string | null = `${GRAPH}/me/media?fields=id,caption,permalink,media_type,media_url,thumbnail_url,like_count,comments_count,timestamp&limit=50&access_token=${encodeURIComponent(acc.access_token)}`;
  for (let i = 0; i < MAX_IG_PAGES && nextUrl; i++) {
    try {
      const r = await fetch(nextUrl);
      const j: any = await r.json().catch(() => ({}));
      const rows: any[] = j?.data ?? [];
      allMedia.push(...rows);
      nextUrl = j?.paging?.next ?? null;
    } catch {
      break;
    }
  }

  if (allMedia.length === 0) return { updated: 0, inserted: 0, fetched: 0 };

  // Mapa dos existentes por unipile_post_id (usamos o media.id como chave estável)
  const ids = allMedia.map((m) => String(m.id));
  const { data: existing = [] } = await admin
    .from("social_posts")
    .select("id, unipile_post_id, post_url")
    .eq("user_id", userId)
    .eq("channel", "instagram")
    .in("unipile_post_id", ids);
  const byMediaId = new Map<string, any>();
  for (const e of existing ?? []) if (e.unipile_post_id) byMediaId.set(String(e.unipile_post_id), e);

  // Também busca por post_url (posts antigos publicados via app podem ter só permalink)
  const permalinks = allMedia.map((m) => m.permalink).filter(Boolean);
  const { data: existingByUrl = [] } = permalinks.length
    ? await admin
        .from("social_posts")
        .select("id, post_url, unipile_post_id")
        .eq("user_id", userId)
        .eq("channel", "instagram")
        .in("post_url", permalinks)
    : { data: [] as any[] };
  const byUrl = new Map<string, any>();
  for (const e of existingByUrl ?? []) if (e.post_url) byUrl.set(e.post_url, e);

  let updated = 0;
  let inserted = 0;
  const now = new Date().toISOString();

  for (const m of allMedia) {
    const mediaId = String(m.id);
    const permalink = m.permalink ?? null;
    const existingRow = byMediaId.get(mediaId) ?? (permalink ? byUrl.get(permalink) : null);
    const likes = pickNum(m.like_count);
    const comments = pickNum(m.comments_count);
    const media_type = mapIgMediaType(m.media_type);
    const media_urls = m.media_url ? [m.media_url] : (m.thumbnail_url ? [m.thumbnail_url] : []);
    const published_at = m.timestamp ?? null;
    const caption = m.caption ?? null;

    if (existingRow) {
      await admin
        .from("social_posts")
        .update({
          likes,
          comments_count: comments,
          metrics_synced_at: now,
          unipile_post_id: mediaId,
          post_url: permalink ?? existingRow.post_url,
          published_at: published_at ?? undefined,
          caption: caption ?? undefined,
          media_type,
          media_urls: media_urls.length ? media_urls : undefined,
        })
        .eq("id", existingRow.id);
      updated++;
    } else {
      const { error } = await admin.from("social_posts").insert({
        user_id: userId,
        channel: "instagram",
        status: "published",
        media_type,
        media_urls,
        caption,
        published_at,
        post_url: permalink,
        unipile_post_id: mediaId,
        likes,
        comments_count: comments,
        metrics_synced_at: now,
      });
      if (!error) inserted++;
    }
  }
  return { updated, inserted, fetched: allMedia.length };
}

async function syncLinkedIn(admin: any, userId: string) {
  const { data: keys } = await admin
    .from("user_api_keys")
    .select("api_key, extra")
    .eq("user_id", userId)
    .eq("provider", "unipile")
    .maybeSingle();
  const apiKey: string | undefined = keys?.api_key;
  if (!apiKey) return { skipped: "no_unipile_key" };
  const extra = (keys?.extra ?? {}) as Record<string, any>;
  const dsn = (extra.dsn ?? "https://api.unipile.com:443").replace(/\/+$/, "");
  const accountId: string | undefined = extra.account_id_linkedin;
  if (!accountId) return { skipped: "no_linkedin_account" };

  // Lista posts do usuário logado (pagina com cursor)
  const posts: any[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < MAX_LI_PAGES; i++) {
    const url = `${dsn}/api/v1/users/me/posts?account_id=${encodeURIComponent(accountId)}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    let r: Response;
    try {
      r = await fetch(url, { headers: { "X-API-KEY": apiKey, accept: "application/json" } });
    } catch {
      break;
    }
    if (!r.ok) break;
    const j: any = await r.json().catch(() => ({}));
    const items: any[] = j?.items ?? j?.data ?? [];
    if (items.length === 0) break;
    posts.push(...items);
    cursor = j?.cursor ?? j?.next_cursor ?? null;
    if (!cursor) break;
  }

  if (posts.length === 0) {
    // Fallback: só atualiza métricas dos posts já cadastrados
    const { data: existing = [] } = await admin
      .from("social_posts")
      .select("id, unipile_post_id")
      .eq("user_id", userId)
      .eq("channel", "linkedin")
      .eq("status", "published")
      .not("unipile_post_id", "is", null)
      .order("published_at", { ascending: false })
      .limit(50);
    let up = 0;
    const now = new Date().toISOString();
    for (const p of existing ?? []) {
      if (!p.unipile_post_id) continue;
      try {
        const r = await fetch(`${dsn}/api/v1/posts/${p.unipile_post_id}?account_id=${accountId}`, {
          headers: { "X-API-KEY": apiKey, accept: "application/json" },
        });
        if (!r.ok) continue;
        const j: any = await r.json().catch(() => ({}));
        const likes = pickNum(j?.reaction_counter ?? j?.reactions_count ?? j?.reactions ?? j?.likes ?? 0);
        const comments = pickNum(j?.comment_counter ?? j?.comments_count ?? j?.comments ?? 0);
        await admin.from("social_posts").update({ likes, comments_count: comments, metrics_synced_at: now }).eq("id", p.id);
        up++;
      } catch { /* ignore */ }
    }
    return { updated: up, inserted: 0, fetched: 0, note: "no_list_endpoint" };
  }

  const ids = posts.map((p) => String(p.id ?? p.post_id ?? p.social_id ?? "")).filter(Boolean);
  const { data: existing = [] } = await admin
    .from("social_posts")
    .select("id, unipile_post_id")
    .eq("user_id", userId)
    .eq("channel", "linkedin")
    .in("unipile_post_id", ids);
  const byId = new Map<string, any>();
  for (const e of existing ?? []) if (e.unipile_post_id) byId.set(String(e.unipile_post_id), e);

  let updated = 0;
  let inserted = 0;
  const now = new Date().toISOString();

  for (const p of posts) {
    const pid = String(p.id ?? p.post_id ?? p.social_id ?? "");
    if (!pid) continue;
    const likes = pickNum(p?.reaction_counter ?? p?.reactions_count ?? p?.reactions ?? p?.likes ?? 0);
    const comments = pickNum(p?.comment_counter ?? p?.comments_count ?? p?.comments ?? 0);
    const published_at = p?.date ?? p?.published_at ?? p?.created_at ?? null;
    const caption = p?.text ?? p?.body ?? p?.commentary ?? null;
    const post_url = p?.share_url ?? p?.permalink ?? p?.url ?? null;
    const has_media = Array.isArray(p?.media) && p.media.length > 0;
    const media_type = has_media ? (String(p.media?.[0]?.type ?? "").toLowerCase().includes("video") ? "video" : "image") : "text";
    const media_urls = has_media ? p.media.map((m: any) => m?.url).filter(Boolean) : [];

    const existingRow = byId.get(pid);
    if (existingRow) {
      await admin
        .from("social_posts")
        .update({
          likes,
          comments_count: comments,
          metrics_synced_at: now,
          published_at: published_at ?? undefined,
          caption: caption ?? undefined,
          post_url: post_url ?? undefined,
        })
        .eq("id", existingRow.id);
      updated++;
    } else {
      const { error } = await admin.from("social_posts").insert({
        user_id: userId,
        channel: "linkedin",
        status: "published",
        media_type,
        media_urls,
        caption,
        published_at,
        post_url,
        unipile_post_id: pid,
        unipile_account_id: accountId,
        likes,
        comments_count: comments,
        metrics_synced_at: now,
      });
      if (!error) inserted++;
    }
  }
  return { updated, inserted, fetched: posts.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "not_authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(SUPABASE_URL, SERVICE);
    const [ig, li] = await Promise.all([
      syncInstagram(admin, user.id).catch((e) => ({ error: String(e?.message ?? e) })),
      syncLinkedIn(admin, user.id).catch((e) => ({ error: String(e?.message ?? e) })),
    ]);
    return new Response(JSON.stringify({ success: true, instagram: ig, linkedin: li }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
