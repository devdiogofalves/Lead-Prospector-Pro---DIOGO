// social-monthly-plan — gera plano mensal completo (default: 20 stories + 10 feed + 5 reels)
// on-brand a partir do Brand Kit + produto. Distribui ao longo do mês.
// Body: { month?: "YYYY-MM", stories?: number, feed?: number, reels?: number, auto_approve_stories?: boolean }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateAIContent } from "../_shared/ai-json.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function monthRange(monthStr?: string) {
  const now = new Date();
  let year: number, month: number;
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split("-").map(Number);
    year = y; month = m - 1;
  } else {
    // próximo mês a partir de hoje
    year = now.getUTCFullYear();
    month = now.getUTCMonth() + 1;
    if (month > 11) { month = 0; year++; }
  }
  const start = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { start, daysInMonth, year, month };
}

// distribui N itens em D dias o mais uniformemente possível, retornando dia (1..D) por item
function distribute(n: number, days: number): number[] {
  if (n <= 0) return [];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.floor((i * days) / n) + 1);
  }
  return out;
}

type Format = "stories" | "feed" | "reels";

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
    const storiesN = Math.max(0, Math.min(40, Number(body?.stories ?? 20)));
    const feedN    = Math.max(0, Math.min(30, Number(body?.feed ?? 10)));
    const reelsN   = Math.max(0, Math.min(15, Number(body?.reels ?? 5)));
    const autoApproveStories = body?.auto_approve_stories !== false;
    const { start, daysInMonth } = monthRange(body?.month);
    const weekStartIso = start.toISOString().slice(0, 10);

    // Contexto
    const [{ data: profile }, { data: briefing }, { data: branding }, { data: assets }, { data: brandProfile }, { data: product }] = await Promise.all([
      admin.from("prospecting_profiles").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("mavi_briefing").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("company_branding").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("social_brand_assets").select("*").eq("user_id", userId),
      admin.from("social_brand_profile").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("social_products").select("*").eq("user_id", userId).eq("is_default", true).eq("active", true).maybeSingle(),
    ]);

    const company = branding?.company_name ?? "nossa empresa";
    const oferta = product?.description ?? (briefing as Record<string, unknown> | null)?.value_props ?? profile?.business_description ?? "";
    const icp = product?.target_audience ?? (briefing as Record<string, unknown> | null)?.icp ?? profile?.target_audience ?? "";
    const dores = product?.pains ?? (briefing as Record<string, unknown> | null)?.pain_points ?? "";

    const findAsset = (kind: string) =>
      (assets ?? []).find((a: { kind: string; is_default: boolean }) => a.kind === kind && a.is_default) ??
      (assets ?? []).find((a: { kind: string }) => a.kind === kind);
    const ugcAvatar = findAsset("ugc_avatar");
    const feedTpl = findAsset("feed_template");
    const carouselTpl = findAsset("carousel_template");
    const mood = findAsset("mood");

    const palette = brandProfile?.color_palette as Record<string, string> | undefined;
    const paletteStr = palette ? Object.entries(palette).filter(([_, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ") : "";
    const brandDirective = brandProfile ? `
BRAND KIT (Instagram @${brandProfile.instagram_handle}):
- Paleta: ${paletteStr}
- Tipografia: ${brandProfile.font_style ?? ""}
- Mood: ${brandProfile.visual_mood ?? ""}
- Fotografia: ${brandProfile.photography_style ?? ""}
- Layout: ${brandProfile.layout_pattern ?? ""}
- Tom de voz: ${brandProfile.voice_tone ?? ""}
- CTA: ${brandProfile.cta_style ?? ""}
` : "";
    const productDirective = product ? `
PRODUTO EM FOCO: ${product.name}
Descrição: ${product.description ?? ""}
Features: ${JSON.stringify(product.features ?? []).slice(0, 700)}
Dores resolvidas: ${JSON.stringify(product.pains ?? []).slice(0, 500)}
` : "";

    // cria plano (reusa social_content_plans usando 1º dia do mês como week_start)
    const { data: plan, error: planErr } = await admin.from("social_content_plans").upsert({
      user_id: userId, week_start: weekStartIso, status: "generating",
    }, { onConflict: "user_id,week_start" }).select().single();
    if (planErr) return resp({ error: planErr.message }, 500);

    const total = storiesN + feedN + reelsN;
    const sys = `Você é diretor de conteúdo on-brand. Gere EXATAMENTE ${total} posts para o mês inteiro da empresa "${company}", no formato JSON estrito:
{"posts":[{"format":"stories|feed|reels","theme":"tema curto","hook":"1ª linha que para o scroll","caption":"texto completo","hashtags":"#a #b #c","image_prompt":"prompt visual em INGLÊS, on-brand, sem texto legível na imagem"}]}

ORDEM E QUANTIDADE OBRIGATÓRIA:
- ${storiesN} primeiros = format "stories" (frase curta + 1 pergunta/enquete/CTA)
- ${feedN} seguintes = format "feed" (caption 80-150 palavras, hook forte, CTA pro link na bio)
- ${reelsN} últimos = format "reels" (roteiro 10s falado: cena, narração completa, CTA final)

CADA POST deve atacar uma DOR diferente ou apresentar um pilar (bastidores, dashboard, enquete, dor x solução, prova social, tutorial, FAQ, oferta, antes/depois, print real, etc.). NÃO repita tema.

${brandDirective}${productDirective}

Regras image_prompt: inglês, inclua paleta, composição, iluminação, sujeito/cena e mood do BRAND KIT. Proibido pedir texto legível, watermark ou logo fake.`;
    const userMsg = `Oferta: ${typeof oferta === "string" ? oferta : JSON.stringify(oferta).slice(0,500)}
ICP: ${typeof icp === "string" ? icp : JSON.stringify(icp).slice(0,300)}
Dores: ${typeof dores === "string" ? dores : JSON.stringify(dores).slice(0,300)}`;

    let aiContent = "";
    try {
      aiContent = await generateAIContent(admin, userId, { system: sys, user: userMsg, json: true });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).slice(0, 500);
      await admin.from("social_content_plans").update({ status: "failed", last_error: msg }).eq("id", plan.id);
      return resp({ error: `AI: ${msg}` }, 502);
    }
    let posts: Array<{ format: string; theme?: string; hook?: string; caption: string; hashtags?: string; image_prompt: string }> = [];
    try {
      posts = (JSON.parse(aiContent || "{}"))?.posts ?? [];
    } catch {/* ignore */}
    if (posts.length === 0) {
      await admin.from("social_content_plans").update({ status: "failed", last_error: "IA não retornou posts" }).eq("id", plan.id);
      return resp({ error: "IA não retornou posts" }, 502);
    }

    // separa por formato (respeita ordem solicitada)
    const byFormat: Record<Format, typeof posts> = { stories: [], feed: [], reels: [] };
    for (const p of posts) {
      const f = (p.format === "stories" || p.format === "feed" || p.format === "reels") ? p.format : "stories";
      byFormat[f].push(p);
    }
    // se IA não respeitou contagens, completa repetindo último
    function ensure(arr: typeof posts, n: number) {
      while (arr.length < n && arr.length > 0) arr.push(arr[arr.length - 1]);
      return arr.slice(0, n);
    }
    byFormat.stories = ensure(byFormat.stories, storiesN);
    byFormat.feed = ensure(byFormat.feed, feedN);
    byFormat.reels = ensure(byFormat.reels, reelsN);

    // distribuição em dias
    const storiesDays = distribute(storiesN, daysInMonth);
    const feedDays = distribute(feedN, daysInMonth);
    const reelsDays = distribute(reelsN, daysInMonth);
    const hourByFormat: Record<Format, number> = { stories: 10, feed: 11, reels: 19 };

    const rows: Array<Record<string, unknown>> = [];
    function push(format: Format, p: typeof posts[number], day: number) {
      const when = new Date(start);
      when.setUTCDate(day);
      when.setUTCHours(hourByFormat[format] - 3, 0, 0, 0); // BRT
      const refAsset = format === "reels" ? ugcAvatar : format === "feed" ? (feedTpl ?? mood) : (carouselTpl ?? mood);
      const isStory = format === "stories";
      rows.push({
        user_id: userId,
        plan_id: plan.id,
        channel: "instagram",
        media_type: format === "reels" ? "video" : "image",
        post_format: format,
        caption: p.caption ?? "",
        hashtags: p.hashtags ?? "",
        ai_prompt: p.image_prompt ?? p.theme ?? "",
        scheduled_at: when.toISOString(),
        status: isStory && autoApproveStories ? "scheduled" : "draft",
        auto_approve: isStory && autoApproveStories,
        reference_asset_ids: refAsset ? [refAsset.id] : [],
        media_urls: [],
      });
    }
    byFormat.stories.forEach((p, i) => push("stories", p, storiesDays[i] ?? ((i % daysInMonth) + 1)));
    byFormat.feed.forEach((p, i) => push("feed", p, feedDays[i] ?? ((i % daysInMonth) + 1)));
    byFormat.reels.forEach((p, i) => push("reels", p, reelsDays[i] ?? ((i % daysInMonth) + 1)));

    const { error: insErr } = await admin.from("social_posts").insert(rows);
    if (insErr) {
      await admin.from("social_content_plans").update({ status: "failed", last_error: insErr.message }).eq("id", plan.id);
      return resp({ error: insErr.message }, 500);
    }

    await admin.from("social_content_plans").update({
      status: "ready",
      theme_summary: { month: weekStartIso.slice(0,7), counts: { stories: storiesN, feed: feedN, reels: reelsN }, posts: posts.map((p) => ({ format: p.format, theme: p.theme })) },
    }).eq("id", plan.id);

    return resp({ success: true, plan_id: plan.id, posts_count: rows.length, month: weekStartIso.slice(0,7) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return resp({ error: msg.slice(0, 400) }, 500);
  }
});
