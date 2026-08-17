// social-auto-prompt — gera prompt visual + caption a partir do briefing/negócio/branding do usuário.
// Body: { channel?: "linkedin"|"instagram", media_type?: "image"|"carousel"|"video", aspect_ratio?: string, theme_hint?: string }
// Retorna: { success, image_prompt, caption, hashtags, reference_image_urls, aspect_ratio }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    const channel = String(body?.channel ?? "instagram");
    const mediaType = String(body?.media_type ?? "image");
    const themeHint = String(body?.theme_hint ?? "").trim();
    const ctaText = String(body?.cta_text ?? "").trim();
    const systemOverride = String(body?.system_override ?? "").trim();
    const visualStyle = String(body?.visual_style ?? "realista");
    const productId = body?.product_id ? String(body.product_id) : null;
    const aspect = body?.aspect_ratio ?? (mediaType === "video" ? "9:16" : "1:1");

    const STYLE_HINTS: Record<string, string> = {
      realista: "photorealistic editorial photography, natural lighting, 35mm lens, shallow depth of field, true-to-life skin tones and textures",
      ugc: "amateur smartphone selfie aesthetic, front camera POV, slightly imperfect framing, real ambient light, authentic user-generated content vibe, no studio polish",
      futurista: "futuristic sci-fi aesthetic, neon accents, holographic UI elements, glass and chrome materials, volumetric lighting, cyberpunk-inspired but clean and premium",
      vibe: "trendy aesthetic mood, soft gradients, dreamy pastel or sunset palette, film grain, blurry bokeh, gen-Z vibe board energy",
      minimalista: "minimalist composition, lots of negative space, single subject, muted neutral palette, soft diffused lighting, swiss design influence",
      cinematografico: "cinematic still frame, anamorphic lens, dramatic key light, teal-and-orange grading, depth and atmosphere, movie production quality",
      editorial: "high-fashion editorial photography, magazine cover quality, bold composition, studio lighting with rim light, premium brand feel",
      ilustracao: "modern flat illustration, vector style, bold geometric shapes, limited color palette, editorial illustration like NYT or Stripe blog",
    };
    const styleDirective = STYLE_HINTS[visualStyle] ?? STYLE_HINTS.realista;

    const [{ data: profile }, { data: briefing }, { data: branding }, { data: assets }, { data: brandProfile }, productRes] = await Promise.all([
      admin.from("prospecting_profiles").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("mavi_briefing").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("company_branding").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("social_brand_assets").select("*").eq("user_id", userId),
      admin.from("social_brand_profile").select("*").eq("user_id", userId).maybeSingle(),
      productId
        ? admin.from("social_products").select("*").eq("user_id", userId).eq("id", productId).maybeSingle()
        : admin.from("social_products").select("*").eq("user_id", userId).eq("is_default", true).eq("active", true).maybeSingle(),
    ]);
    const product = (productRes as { data?: Record<string, unknown> | null })?.data ?? null;

    const company = branding?.company_name ?? "nossa empresa";
    const primaryColor = (brandProfile?.color_palette as Record<string, string> | undefined)?.primary ?? branding?.primary_color ?? "";
    const oferta = product?.description ?? (briefing as Record<string, unknown> | null)?.value_props ?? profile?.business_description ?? "";
    const icp = product?.target_audience ?? (briefing as Record<string, unknown> | null)?.icp ?? profile?.target_audience ?? "";
    const dores = product?.pains ?? (briefing as Record<string, unknown> | null)?.pain_points ?? "";
    const segmento = brandProfile?.niche ?? profile?.segment ?? profile?.niche ?? "";

    const hasBusinessData = String(oferta).trim() || String(icp).trim() || String(dores).trim();
    if (!hasBusinessData) {
      return resp({
        success: false,
        needs_briefing: true,
        error: "Preencha pelo menos Oferta ou ICP no Assistente (Negócio/Knowledge Pack) — ou cadastre um Produto na aba Produtos.",
      });
    }

    const findAsset = (kind: string) =>
      (assets ?? []).find((a: { kind: string; is_default: boolean }) => a.kind === kind && a.is_default) ??
      (assets ?? []).find((a: { kind: string }) => a.kind === kind);
    const refKind = mediaType === "video" ? "ugc_avatar" : mediaType === "carousel" ? "carousel_template" : "feed_template";
    const refAsset = findAsset(refKind) ?? findAsset("mood");
    // Referências visuais: prioriza brand kit do IG (logo + posts) + avatar UGC + asset manual
    const brandSamples: string[] = Array.isArray(brandProfile?.sample_post_urls) ? (brandProfile!.sample_post_urls as string[]).slice(0, 3) : [];
    const brandAvatars: string[] = Array.isArray(brandProfile?.avatar_urls) ? (brandProfile!.avatar_urls as string[]) : [];
    const refUrls = [
      ...(brandProfile?.logo_url ? [brandProfile.logo_url as string] : []),
      ...brandSamples,
      ...(refAsset?.public_url ? [refAsset.public_url] : []),
      ...(mediaType === "video" ? brandAvatars.slice(0, 1) : []),
    ].filter(Boolean);

    // Diretivas de brand kit injetadas no system prompt
    const palette = brandProfile?.color_palette as Record<string, string> | undefined;
    const paletteStr = palette ? Object.entries(palette).filter(([_, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ") : "";
    const brandDirective = brandProfile ? `
BRAND KIT OBRIGATÓRIO (extraído de @${brandProfile.instagram_handle}, mantenha consistência ABSOLUTA com posts anteriores):
- Paleta: ${paletteStr || "(usar do brand)"}
- Tipografia: ${brandProfile.font_style ?? ""}
- Mood: ${brandProfile.visual_mood ?? ""}
- Estilo fotográfico: ${brandProfile.photography_style ?? ""}
- Layout recorrente: ${brandProfile.layout_pattern ?? ""}
- Tom de voz: ${brandProfile.voice_tone ?? ""}
- CTA pattern: ${brandProfile.cta_style ?? ""}
${brandProfile.logo_url ? `- Logo da marca deve aparecer no canto (ver imagem de referência)` : ""}
` : "";

    const productDirective = product ? `
PRODUTO EM FOCO: "${product.name}"
- Descrição: ${product.description ?? ""}
- Público: ${product.target_audience ?? ""}
- Features: ${JSON.stringify(product.features ?? []).slice(0, 600)}
- Dores que resolve: ${JSON.stringify(product.pains ?? []).slice(0, 400)}
- Link/CTA: ${product.link ?? "link na bio"}
- Documentação extraída (use como fonte de verdade, NÃO invente features):
${(Array.isArray(product.docs) ? product.docs : []).map((d: Record<string, unknown>) => `## ${d.filename ?? d.name ?? "doc"}\n${String(d.extracted_text ?? d.text ?? "").slice(0, 1500)}`).join("\n\n").slice(0, 5000)}
` : "";

    const isVideo = mediaType === "video";
    const ctaDirective = ctaText || "link na bio";
    const videoPromptSpec = `Prompt em INGLÊS para gerar VIDEO ${aspect}, ~10 segundos, com FALA NATIVA EM PORTUGUÊS BRASILEIRO (modelo Gemini Omni Video gera áudio/voz). Estrutura OBRIGATÓRIA:
SCENE: 1-2 frases descrevendo cenário, sujeito, ação concreta, câmera/lente, iluminação, paleta${primaryColor ? ` ancorada em ${primaryColor}` : ""}, mood. Estilo: ${styleDirective}.
DIALOGUE (spoken in Brazilian Portuguese, single on-camera speaker, casual tone, ~25-32 words total to fit 10s — completar o raciocínio inteiro sem cortar): escreva textualmente o que o personagem fala — hook curto (1 frase) + problema/insight concreto do ICP (1-2 frases) + CTA falado mencionando EXPLICITAMENTE "${ctaDirective}". Use o tema "${themeHint || "(escolha uma dor concreta do ICP)"}" como espinha. NUNCA termine no meio de uma frase.
AUDIO: ambient subtle, no background music overpowering voice, clear lip-sync, voice should sound natural and conversational.
NEGATIVE: no on-screen text, no captions, no watermark, no logo, no typography overlays.
Máx 200 palavras totais.`;
    const imagePromptSpec = `Prompt em INGLÊS para gerar ${mediaType} ${aspect} com QUALIDADE EDITORIAL DE REVISTA. Estrutura obrigatória em UMA FRASE densa:
[SUBJECT concreto + ação] em [AMBIENTE específico], shot on [câmera/lente ex: Hasselblad H6D 100mm], [ILUMINAÇÃO ex: soft window light left, gentle rim right], [COMPOSIÇÃO ex: rule of thirds, subject off-center, negative space top-right for text overlay], [PALETTE${primaryColor ? ` anchored on ${primaryColor}` : ""} — max 3 colors], [MOOD/emotion], ${styleDirective}, 8k, hyper-detailed, professional color grading, magazine-cover quality.
${refUrls.length > 0 ? "MATCH the reference images' visual language EXACTLY: same color grading, same lighting quality, same aesthetic." : ""}
NEGATIVE (never): distorted faces, extra fingers, warped hands, plastic skin, blurry, low-res, oversaturated, generic stock-photo, watermark, signature, text overlays, typography, logos overlaid on subject, cluttered background.
Máx 100 palavras.`;

    const defaultSys = `Você é diretor de arte + copywriter sênior on-brand para "${company}" no ${channel}. Sua copy é HUMANA, com respiro, sem cara de IA, sem clichê motivacional, sem palavras tipo "desbloqueie/transforme/eleve/jornada".
${brandDirective}${productDirective}
Responda EXCLUSIVAMENTE este JSON (use \\n para quebra de linha dentro da caption):
{
  "image_prompt": "${isVideo ? videoPromptSpec : imagePromptSpec}",
  "caption": "Legenda pt-BR estruturada em blocos separados por \\n\\n (DUAS quebras entre cada bloco para criar respiro visual real no Instagram). Estrutura fixa: (1) HOOK isolado em UMA frase curta, máx 10 palavras, sem emoji no começo. (2) 2-3 linhas curtas pintando um problema concreto e específico do ICP (cenário real, não abstração). (3) 2-3 linhas com a virada/insight contraintuitivo da oferta (sem vender hard, mostrar como pensar diferente). (4) CTA direto e específico na última linha mencionando EXATAMENTE: '${ctaDirective}'. Total 90-140 palavras. Português brasileiro coloquial. Zero hashtag aqui dentro. No máximo 2 emojis no texto inteiro.${brandProfile?.voice_tone ? ` Tom de voz OBRIGATÓRIO: ${brandProfile.voice_tone}.` : ""}",
  "hashtags": "Exatamente 12 hashtags separadas por espaço, todas minúsculas. Mix obrigatório: 3 amplas do macro-segmento + 5 de nicho específico do ICP + 3 de dor/solução + 1 contextual (geo/cultural) se fizer sentido. Nada de #follow4follow #like4like #explorepage."
}`;
    const sys = systemOverride ? `${systemOverride}\n${brandDirective}${productDirective}\nFormato de resposta OBRIGATÓRIO: JSON com chaves image_prompt, caption, hashtags. CTA da caption deve mencionar exatamente: "${ctaDirective}". Use \\n\\n entre blocos da caption.` : defaultSys;

    const userMsg = `Negócio:
- Segmento: ${segmento || "(não informado)"}
- Oferta/Value props: ${typeof oferta === "string" ? oferta : JSON.stringify(oferta).slice(0,600)}
- ICP: ${typeof icp === "string" ? icp : JSON.stringify(icp).slice(0,500)}
- Dores reais desse ICP: ${typeof dores === "string" ? dores : JSON.stringify(dores).slice(0,500)}

${themeHint ? `Tema pedido pelo usuário: "${themeHint}" — use como espinha dorsal, não invente outro.` : "Escolha UMA dor específica e ataque com um insight contraintuitivo."}

Formato: ${mediaType} ${aspect}.
PROIBIDO: "no mundo dos negócios", "imagine isso", "você já parou pra pensar", "a chave do sucesso", "potencialize", "alavanque". Fale como gente fala no WhatsApp.`;

    // Resolve chaves do usuário (OpenAI/Gemini) via RPC → aiChat faz failover:
    // OpenAI (chave do usuário) → Gemini (chave do usuário) → Lovable AI Gateway (último recurso).
    let openaiKey = "";
    let geminiKey = "";
    try {
      const [{ data: oa }, { data: gm }] = await Promise.all([
        admin.rpc("get_ai_key_for_user", { _user_id: userId, _provider: "openai" }),
        admin.rpc("get_ai_key_for_user", { _user_id: userId, _provider: "gemini" }),
      ]);
      openaiKey = (oa as string | null) ?? "";
      geminiKey = (gm as string | null) ?? "";
    } catch (_e) { /* segue com Lovable como último recurso */ }

    let out: { image_prompt?: string; caption?: string; hashtags?: string } = {};
    let providerUsed = "";
    try {
      const { aiChat } = await import("../_shared/ai-chat.ts");
      const chat = await aiChat({
        openaiKey, geminiKey,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userMsg },
        ],
        temperature: 0.95,
        response_format: { type: "json_object" },
      });
      providerUsed = chat.provider;
      const parsed = JSON.parse(chat.text || "{}");
      out = typeof parsed === "string" ? JSON.parse(parsed) : parsed;
      console.log(`[social-auto-prompt] provider usado: ${chat.provider} (tentativas: ${chat.attempts.length})`);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (/402|payment|credits|insufficient_quota|quota_exceeded|billing/i.test(msg)) {
        return resp({
          success: false,
          error: "PAYMENT_REQUIRED",
          message: "Todas as chaves IA falharam por créditos. Configure OpenAI ou Gemini em Configurações → APIs, ou adicione créditos.",
          needs_credits: true,
        });
      }
      if (/429|rate/i.test(msg)) {
        return resp({
          success: false,
          error: "RATE_LIMITED",
          message: "Muitas requisições à IA. Aguarde alguns segundos e tente novamente.",
        });
      }
      return resp({ success: false, error: msg.slice(0, 400) });
    }

    if (!out.image_prompt) return resp({ success: false, error: "IA não retornou prompt" }, 502);

    // Suffix de marca FORÇADO no prompt final — sobrevive ao prompt-enhance da Kie.ai
    const brandSuffix = brandProfile ? ` --- BRAND LOCK (do not deviate): palette ${paletteStr || "(see refs)"}; mood ${brandProfile.visual_mood ?? ""}; photography style ${brandProfile.photography_style ?? ""}; layout ${brandProfile.layout_pattern ?? ""}. Match the reference images' look-and-feel EXACTLY: same color grading, same lighting, same composition, same energy. Post for @${brandProfile.instagram_handle} — visual consistency is mandatory.` : "";
    const finalPrompt = `${out.image_prompt}${brandSuffix}`.slice(0, 1800);

    return resp({
      success: true,
      image_prompt: finalPrompt,
      caption: out.caption ?? "",
      hashtags: out.hashtags ?? "",
      reference_image_urls: refUrls,
      reference_asset_id: refAsset?.id ?? null,
      aspect_ratio: aspect,
      provider_used: providerUsed,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return resp({ error: msg.slice(0, 400) }, 500);
  }
});
