// social-weekly-planner — gera 6 posts da semana (2 feed + 2 reels + 2 stories) on-brand.
// Body: { week_start?: "YYYY-MM-DD" } — default = próxima segunda
// Stories → auto_approve=true, status=scheduled. Feed/Reels → status=draft.
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

type Slot = { format: "feed" | "reels" | "stories"; day_offset: number; hour: number };
const SCHEDULE: Slot[] = [
  { format: "stories", day_offset: 0, hour: 10 },
  { format: "feed",    day_offset: 1, hour: 11 },
  { format: "reels",   day_offset: 2, hour: 18 },
  { format: "stories", day_offset: 3, hour: 10 },
  { format: "feed",    day_offset: 4, hour: 11 },
  { format: "reels",   day_offset: 5, hour: 19 },
];

function nextMonday(d: Date) {
  const r = new Date(d);
  const diff = (1 + 7 - r.getUTCDay()) % 7 || 7;
  r.setUTCDate(r.getUTCDate() + diff);
  r.setUTCHours(0, 0, 0, 0);
  return r;
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
    const weekStart = body?.week_start ? new Date(body.week_start) : nextMonday(new Date());
    const weekStartIso = weekStart.toISOString().slice(0, 10);

    // 1) Contexto do negócio
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
    const brandSamples: string[] = Array.isArray(brandProfile?.sample_post_urls) ? (brandProfile.sample_post_urls as string[]).slice(0, 3) : [];
    const brandRefs = [brandProfile?.logo_url as string | undefined, ...brandSamples].filter(Boolean) as string[];
    const palette = brandProfile?.color_palette as Record<string, string> | undefined;
    const paletteStr = palette ? Object.entries(palette).filter(([_, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ") : "";
    const brandDirective = brandProfile ? `
BRAND KIT OBRIGATÓRIO extraído do Instagram @${brandProfile.instagram_handle}:
- Paleta: ${paletteStr}
- Tipografia: ${brandProfile.font_style ?? ""}
- Mood: ${brandProfile.visual_mood ?? ""}
- Estilo fotográfico: ${brandProfile.photography_style ?? ""}
- Layout recorrente: ${brandProfile.layout_pattern ?? ""}
- Tom de voz: ${brandProfile.voice_tone ?? ""}
- CTA pattern: ${brandProfile.cta_style ?? ""}
Os prompts visuais precisam reproduzir esse padrão, sem inventar estética aleatória.
` : "";
    const productDirective = product ? `
PRODUTO/OFERTA EM FOCO: ${product.name}
Descrição: ${product.description ?? ""}
Features: ${JSON.stringify(product.features ?? []).slice(0, 700)}
Dores: ${JSON.stringify(product.pains ?? []).slice(0, 500)}
Documentação: ${(Array.isArray(product.docs) ? product.docs : []).map((d: Record<string, unknown>) => String(d.extracted_text ?? d.text ?? "").slice(0, 1000)).join("\n").slice(0, 3000)}
` : "";

    // 2) Cria plano
    const { data: plan, error: planErr } = await admin.from("social_content_plans").upsert({
      user_id: userId, week_start: weekStartIso, status: "generating",
    }, { onConflict: "user_id,week_start" }).select().single();
    if (planErr) return resp({ error: planErr.message }, 500);

    // 3) Pede à IA os 6 temas
    const sys = `Você é gestor de conteúdo sênior e diretor de arte on-brand. Gere EXATAMENTE 6 temas para a semana da empresa "${company}", no formato JSON estrito:
{"posts":[{"format":"feed|reels|stories","theme":"tema curto","hook":"1ª linha que para o scroll","caption":"texto completo","hashtags":"#a #b #c","image_prompt":"prompt visual em inglês para gerar a imagem on-brand"}]}
Ordem fixa: stories, feed, reels, stories, feed, reels. Cada post deve atacar uma dor diferente do ICP. Stories são curtos (1 frase + pergunta). Feed: caption 80-150 palavras. Reels: roteiro de 10s com fala completa + CTA.
${brandDirective}${productDirective}
Regras do image_prompt: escrever em INGLÊS; incluir paleta, composição, iluminação, assunto, ação e mood do BRAND KIT; não pedir texto legível, watermark ou logo fake.`;
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
    let posts: Array<{ format: string; theme: string; hook?: string; caption: string; hashtags?: string; image_prompt: string }> = [];
    try {
      posts = (JSON.parse(aiContent || "{}"))?.posts ?? [];
    } catch {/* ignore */}
    if (posts.length === 0) {
      await admin.from("social_content_plans").update({ status: "failed", last_error: "IA não retornou posts" }).eq("id", plan.id);
      return resp({ error: "IA não retornou posts" }, 502);
    }

    // 4) Cria as 6 linhas em social_posts (sem gerar imagem agora — usuário gera por demanda no card)
    const rows = SCHEDULE.map((slot, i) => {
      const p = posts[i] ?? posts[posts.length - 1];
      const when = new Date(weekStart);
      when.setUTCDate(when.getUTCDate() + slot.day_offset);
      when.setUTCHours(slot.hour - 3, 0, 0, 0); // BRT
      const isStory = slot.format === "stories";
      const refAsset = slot.format === "reels" ? ugcAvatar : slot.format === "feed" ? (feedTpl ?? mood) : (carouselTpl ?? mood);
      return {
        user_id: userId,
        plan_id: plan.id,
        channel: "instagram",
        media_type: slot.format === "reels" ? "video" : "image",
        post_format: slot.format,
        caption: p.caption ?? "",
        hashtags: p.hashtags ?? "",
        ai_prompt: p.image_prompt ?? p.theme,
        scheduled_at: when.toISOString(),
        status: isStory ? "scheduled" : "draft",
        auto_approve: isStory,
        reference_asset_ids: refAsset ? [refAsset.id] : [],
        media_urls: [],
      };
    });

    const { error: insErr } = await admin.from("social_posts").insert(rows);
    if (insErr) {
      await admin.from("social_content_plans").update({ status: "failed", last_error: insErr.message }).eq("id", plan.id);
      return resp({ error: insErr.message }, 500);
    }

    await admin.from("social_content_plans").update({
      status: "ready",
      theme_summary: { posts: posts.map((p) => ({ format: p.format, theme: p.theme })) },
    }).eq("id", plan.id);

    return resp({ success: true, plan_id: plan.id, posts_count: rows.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return resp({ error: msg.slice(0, 400) }, 500);
  }
});
