// social-brand-from-instagram — lê @ Instagram via Apify, Gemini Vision analisa posts,
// destila brand kit (paleta, mood, tom, layout) e salva em social_brand_profile.
// Body: { handle: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { aiChat, type ChatContentPart } from "../_shared/ai-chat.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


function extFromContentType(contentType: string, fallback = "jpg") {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  return fallback;
}

async function cacheImage(admin: ReturnType<typeof createClient>, url: string, pathBase: string) {
  if (!url || !url.startsWith("http")) return "";
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeadsBoosterBrandKit/1.0)",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });
    if (!r.ok) return url;
    const contentType = r.headers.get("content-type") ?? "image/jpeg";
    const ext = extFromContentType(contentType);
    const bytes = await r.arrayBuffer();
    const path = `${pathBase}.${ext}`;
    const { error: upErr } = await admin.storage.from("social-assets").upload(path, bytes, {
      upsert: true,
      contentType,
      cacheControl: "31536000",
    });
    if (upErr) return url;
    const { data: signed } = await admin.storage.from("social-assets").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    return signed?.signedUrl ?? url;
  } catch {
    return url;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resp({ error: "Method not allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: auth } } });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return resp({ error: "Unauthenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const handleRaw = String(body?.handle ?? "").trim();
    const handle = handleRaw.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "").trim();
    if (!handle) return resp({ error: "handle obrigatório" }, 400);

    // Detecta se é o PRÓPRIO perfil (Meta conectada) — se sim, tenta Meta Graph antes de Apify.
    const { data: metaAcc } = await admin
      .from("meta_instagram_accounts")
      .select("ig_user_id, username, access_token, token_type, expires_at, scopes")
      .eq("user_id", userId)
      .maybeSingle();

    const metaUsername = String(metaAcc?.username ?? "").toLowerCase();
    const isOwnProfile = !!metaAcc?.access_token && (
      !handle || metaUsername === handle.toLowerCase()
    );

    // Variáveis alvo (mesmas do fluxo Apify downstream)
    let displayName = handle;
    let bio = "";
    let externalUrl = "";
    let profilePicUrl = "";
    let followersCount: number | null = null;
    let followingCount: number | null = null;
    let postsCountVal: number | null = null;
    let verified = false;
    let isBusiness = false;
    let posts: Record<string, unknown>[] = [];
    let collectedVia: "meta" | "apify" | null = null;

    // 1) BRANCH META — próprio perfil
    if (isOwnProfile) {
      try {
        const GRAPH = "https://graph.instagram.com/v21.0"; // mesmo host de meta-instagram-insights e social-publish
        const token = String(metaAcc!.access_token);
        const igId = String(metaAcc!.ig_user_id ?? "me") || "me";

        const profRes = await fetch(
          `${GRAPH}/${igId}?fields=username,name,biography,profile_picture_url,followers_count,follows_count,media_count,website&access_token=${encodeURIComponent(token)}`,
        );
        if (!profRes.ok) throw new Error(`meta_profile_${profRes.status}: ${(await profRes.text()).slice(0, 200)}`);
        const prof = await profRes.json() as Record<string, any>;

        const mediaRes = await fetch(
          `${GRAPH}/${igId}/media?fields=caption,media_type,media_url,thumbnail_url,like_count,comments_count,permalink&limit=12&access_token=${encodeURIComponent(token)}`,
        );
        if (!mediaRes.ok) throw new Error(`meta_media_${mediaRes.status}: ${(await mediaRes.text()).slice(0, 200)}`);
        const mediaJson = await mediaRes.json() as Record<string, any>;
        const mediaItems: Record<string, any>[] = Array.isArray(mediaJson.data) ? mediaJson.data : [];

        displayName = String(prof.name ?? prof.username ?? handle);
        bio = String(prof.biography ?? "");
        externalUrl = String(prof.website ?? "");
        profilePicUrl = String(prof.profile_picture_url ?? "");
        followersCount = Number(prof.followers_count ?? 0) || null;
        followingCount = Number(prof.follows_count ?? 0) || null;
        postsCountVal = Number(prof.media_count ?? 0) || null;
        verified = false;
        isBusiness = true;

        posts = mediaItems.slice(0, 12).map((m) => {
          const isVideo = String(m.media_type ?? "").toUpperCase() === "VIDEO";
          const img = isVideo ? (m.thumbnail_url ?? m.media_url ?? "") : (m.media_url ?? m.thumbnail_url ?? "");
          return {
            caption: m.caption ?? "",
            displayUrl: img,
            likesCount: m.like_count ?? 0,
            commentsCount: m.comments_count ?? 0,
          };
        });

        collectedVia = "meta";
        console.log(`[brand-from-ig] collected via META (@${handle}, ${posts.length} posts)`);
      } catch (e) {
        console.warn(`[brand-from-ig] META branch failed, will try Apify: ${String((e as Error)?.message ?? e)}`);
      }
    }

    // 2) BRANCH APIFY — concorrente ou fallback quando Meta falha
    if (!collectedVia) {
      const { data: keyRow } = await admin
        .from("user_api_keys").select("api_key").eq("user_id", userId).eq("provider", "apify").maybeSingle();
      const apifyToken = keyRow?.api_key || Deno.env.get("APIFY_API_KEY");
      if (!apifyToken) {
        const hint = isOwnProfile
          ? "Não consegui analisar pela Meta (reconecte seu Instagram em Configurações → Canais) nem pela Apify. Você pode preencher o Brand Kit manualmente."
          : "Configure sua chave Apify em Configurações → APIs para analisar perfis de concorrentes. Você pode preencher o Brand Kit manualmente.";
        return resp({ error: hint }, 400);
      }

      console.log(`[brand-from-ig] fetching profile @${handle} via APIFY`);
      const profileRes = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${apifyToken}&timeout=180`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usernames: [handle] }) },
      );
      if (!profileRes.ok) {
        const t = await profileRes.text().catch(() => "");
        const isQuota = /platform-feature-disabled|hard limit exceeded|monthly usage/i.test(t);
        if (isQuota) {
          return resp({
            error: "APIFY_QUOTA_EXCEEDED",
            message: "Limite mensal da sua conta Apify foi atingido. Renove o plano ou troque a chave em Configurações → APIs para importar o Brand Kit do Instagram.",
          }, 402);
        }
        return resp({ error: `Apify perfil ${profileRes.status}: ${t.slice(0, 300)}` }, 502);
      }
      const profileItems: Record<string, unknown>[] = await profileRes.json();
      const profile = profileItems?.[0] as Record<string, unknown> | undefined;
      if (!profile) return resp({ error: "Perfil não encontrado no Instagram." }, 404);

      displayName = String(profile.fullName ?? profile.full_name ?? profile.name ?? handle);
      bio = String(profile.biography ?? profile.bio ?? profile.description ?? "");
      externalUrl = String(profile.externalUrl ?? profile.external_url ?? profile.url ?? "");
      profilePicUrl = String(profile.profilePicUrlHD ?? profile.profilePicUrl ?? profile.profile_pic_url_hd ?? profile.profile_pic_url ?? "");
      followersCount = Number(profile.followersCount ?? profile.followers_count ?? (profile as any).edge_followed_by?.count ?? 0) || null;
      followingCount = Number(profile.followsCount ?? profile.following_count ?? (profile as any).edge_follow?.count ?? 0) || null;
      postsCountVal = Number(profile.postsCount ?? profile.posts_count ?? (profile as any).edge_owner_to_timeline_media?.count ?? 0) || null;
      verified = Boolean(profile.verified ?? profile.is_verified ?? false);
      isBusiness = Boolean(profile.isBusinessAccount ?? profile.is_business_account ?? false);

      posts = Array.isArray(profile.latestPosts) ? profile.latestPosts as Record<string, unknown>[] : [];
      if (posts.length < 4) {
        console.log(`[brand-from-ig] fetching extra posts for @${handle}`);
        const postsRes = await fetch(
          `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${apifyToken}&timeout=180`,
          {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ directUrls: [`https://www.instagram.com/${handle}/`], resultsLimit: 12, resultsType: "posts" }),
          },
        );
        if (postsRes.ok) {
          const extra: Record<string, unknown>[] = await postsRes.json();
          posts = extra.length > posts.length ? extra : posts;
        }
      }
      collectedVia = "apify";
    }

    posts = posts.slice(0, 12);
    const postImageUrlsRaw: string[] = posts
      .map((p) => String((p as any).displayUrl ?? (p as any).display_url ?? (p as any).imageUrl ?? (p as any).image_url ?? (p as any).thumbnailUrl ?? (p as any).thumbnail_url ?? ""))
      .filter((u) => u && u.startsWith("http"));
    const captions: string[] = posts.map((p) => String((p as any).caption ?? "").slice(0, 400)).filter(Boolean);

    // Engagement médio
    const likes = posts.map((p) => Number((p as any).likesCount ?? (p as any).likes_count ?? (p as any).edge_liked_by?.count ?? 0)).filter((n) => n > 0);
    const comments = posts.map((p) => Number((p as any).commentsCount ?? (p as any).comments_count ?? (p as any).edge_media_to_comment?.count ?? 0)).filter((n) => n >= 0);
    const avgLikes = likes.length ? Math.round(likes.reduce((a, b) => a + b, 0) / likes.length) : null;
    const avgComments = comments.length ? Math.round(comments.reduce((a, b) => a + b, 0) / comments.length) : null;
    const engagementRate = followersCount && avgLikes !== null
      ? Number((((avgLikes + (avgComments ?? 0)) / followersCount) * 100).toFixed(2))
      : null;



    // Instagram CDN expira e costuma bloquear render no browser. Cacheamos no storage do app
    // para a UI, Kie.ai e prompts terem URLs estáveis e acessíveis.
    const stamp = Date.now();
    const [cachedLogo, ...cachedPosts] = await Promise.all([
      cacheImage(admin, profilePicUrl, `brand-kits/${userId}/${handle}/logo-${stamp}`),
      ...postImageUrlsRaw.slice(0, 12).map((url, i) => cacheImage(admin, url, `brand-kits/${userId}/${handle}/post-${i + 1}-${stamp}`)),
    ]);
    const postImageUrls = cachedPosts.filter(Boolean);

    // 3) Gemini Vision — analisa logo + até 6 posts e devolve brand kit JSON
    const imagesForAi = [cachedLogo || profilePicUrl, ...postImageUrls.slice(0, 6)].filter(Boolean);
    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `Analise este perfil do Instagram @${handle} e seus posts. Identifique o PADRÃO VISUAL recorrente para que outra IA gere imagens consistentes com a marca.

Bio: "${bio}"
Site: "${externalUrl}"
Captions recentes (amostra):
${captions.slice(0, 6).map((c, i) => `${i+1}. ${c}`).join("\n")}

Responda EXCLUSIVAMENTE este JSON (sem markdown, sem comentários):
{
  "niche": "nicho principal em 3-6 palavras pt-BR",
  "color_palette": { "primary": "#hex", "secondary": "#hex", "accent": "#hex", "background": "#hex", "text": "#hex" },
  "font_style": "descrição da tipografia dominante (ex: 'condensada bold uppercase com itálicos para destaque')",
  "visual_mood": "mood em 1 frase (ex: 'dark tech com energia urbana e urgência')",
  "photography_style": "descrição do estilo fotográfico (ex: 'pessoa em foco dramático, iluminação contrastada verde-neon, ambiente industrial')",
  "layout_pattern": "padrão de composição (ex: 'título XL no topo, foto centralizada, cards/badges flutuantes com ícones, logo no canto inferior')",
  "voice_tone": "tom de voz em pt-BR em 1 frase (ex: 'direto, provocativo, vendedor consultivo, usa caps lock em palavras-chave')",
  "cta_style": "como a marca chama pra ação (ex: 'LINK NA BIO com seta verde, frases curtas imperativas')",
  "recurring_elements": ["elemento1", "elemento2", "elemento3"]
}`,
      },
      ...imagesForAi.map((url) => ({ type: "image_url", image_url: { url } })),
    ];

    const [{ data: ok }, { data: gk }] = await Promise.all([
      admin.rpc("get_ai_key_for_user", { _user_id: userId, _provider: "openai" }),
      admin.rpc("get_ai_key_for_user", { _user_id: userId, _provider: "gemini" }),
    ]);
    let aiText = "";
    try {
      const out = await aiChat({
        openaiKey: (ok as string) || undefined,
        geminiKey: (gk as string) || undefined,
        messages: [
          { role: "system", content: "Você é diretor de arte sênior. Extrai brand kits visuais com precisão técnica." },
          { role: "user", content: content as ChatContentPart[] },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      });
      aiText = out.text;
    } catch (e) {
      return resp({ error: `AI: ${String((e as Error)?.message ?? e).slice(0, 300)}` }, 502);
    }
    let analysis: Record<string, unknown> = {};
    try {
      analysis = JSON.parse(aiText || "{}");
    } catch { /* keep */ }



    // 4) Persiste — gera bio_link_slug se ainda não existir
    const links = [externalUrl].filter(Boolean).map((url) => ({ url, source: "bio" }));

    // só preenche slug se ainda não houver um (não sobrescreve customizações)
    let bioLinkSlug: string | null = null;
    try {
      const { data: existing } = await admin
        .from("social_brand_profile")
        .select("bio_link_slug")
        .eq("user_id", userId)
        .maybeSingle();
      if (!existing?.bio_link_slug) {
        const candidate = slugify(handle);
        // garante unicidade
        const { data: clash } = await admin
          .from("social_brand_profile")
          .select("user_id")
          .eq("bio_link_slug", candidate)
          .neq("user_id", userId)
          .maybeSingle();
        bioLinkSlug = clash ? `${candidate}-${userId.slice(0, 6)}` : candidate;
      }
    } catch { /* ignore */ }

    const payload: Record<string, unknown> = {
      user_id: userId,
      instagram_handle: handle,
      display_name: displayName || handle,
      logo_url: cachedLogo || profilePicUrl,
      bio,
      links,
      followers_count: followersCount,
      following_count: followingCount,
      posts_count: postsCountVal,
      verified,
      is_business: isBusiness,
      avg_likes: avgLikes,
      avg_comments: avgComments,
      engagement_rate: engagementRate,
      color_palette: analysis.color_palette ?? {},
      font_style: analysis.font_style ?? null,
      visual_mood: analysis.visual_mood ?? null,
      photography_style: analysis.photography_style ?? null,
      layout_pattern: analysis.layout_pattern ?? null,
      voice_tone: analysis.voice_tone ?? null,
      cta_style: analysis.cta_style ?? null,
      niche: analysis.niche ?? null,
      raw_analysis: analysis,
      sample_post_urls: postImageUrls.slice(0, 12),
      last_analyzed_at: new Date().toISOString(),
    };
    if (bioLinkSlug) payload.bio_link_slug = bioLinkSlug;

    const { error: upErr } = await admin
      .from("social_brand_profile")
      .upsert(payload, { onConflict: "user_id" });
    if (upErr) return resp({ error: `DB: ${upErr.message}` }, 500);

    return resp({ success: true, brand: payload });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[brand-from-ig] error", msg);
    return resp({ error: msg.slice(0, 400) }, 500);
  }
});

function slugify(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "perfil";
}
