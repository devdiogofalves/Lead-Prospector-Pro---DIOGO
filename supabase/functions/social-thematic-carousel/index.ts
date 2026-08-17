// social-thematic-carousel — gera post/carrossel temático on-brand
// Pipeline principal: contexto + referências → GPT Image-2 renderiza a peça final. Fallback: bg GPT + overlay Satori.
// Body: { topic?, product_id?, format_hint?, slide_count?, channel?, save?: boolean (default true) }
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

type Slide = { index: number; kicker?: string; headline: string; body?: string; layout?: string };
type BrandAsset = { kind: string; public_url: string | null; is_default: boolean | null };
type CarouselStructure = {
  title: string;
  hook: string;
  slides: Slide[];
  caption: string;
  hashtags: string;
};

type AR = "1:1" | "4:5" | "9:16";

const FORMAT_HINTS: Record<string, { count: number; style: string; pattern: string }> = {
  listicle: { count: 9, style: "Lista numerada. Capa anuncia 'X coisas/workflows/dicas'. Cada slide tem número grande + headline curto + 1-2 bullets. CTA no final.", pattern: "numbered_card" },
  myth_vs_truth: { count: 7, style: "Capa + 5 pares mito/verdade. Cada slide alterna 'MITO' (vermelho) e 'VERDADE' (verde). CTA no final.", pattern: "split_compare" },
  steps: { count: 7, style: "Capa + 5 passos sequenciais. Cada slide com '01', '02', '03'. CTA no final.", pattern: "numbered_step" },
  before_after: { count: 5, style: "Capa + 3 pares antes/depois mostrando transformação. CTA.", pattern: "split_compare" },
  case_study: { count: 6, style: "Capa + Contexto + Ação + Resultado + Take-away + CTA.", pattern: "big_headline" },
  hot_take: { count: 5, style: "Capa com opinião polêmica. 3 slides argumentando. CTA.", pattern: "bold_centered" },
  checklist: { count: 8, style: "Capa + 6 itens com checkbox ✓. CTA.", pattern: "checklist_card" },
  faq: { count: 9, style: "Capa + 4 pares pergunta/resposta. CTA.", pattern: "qa_card" },
  feed: { count: 1, style: "POST ÚNICO (single feed). 1 slide só, layout='cover', com hook poderoso (headline 6-10 palavras) + body curto (1 frase de reforço, máx 18 palavras). Sem CTA visual, CTA vai na legenda.", pattern: "single_cover" },
  stories: { count: 1, style: "STORY ÚNICO (vertical 9:16). 1 slide só, layout='cover', headline curtíssima (4-7 palavras, alto impacto), body de 1 linha opcional. Pensa em algo que para o scroll vertical.", pattern: "single_cover" },
};

// ─── Color derivation helpers (hex ↔ HSL, sem libs externas) ───────────────
// Usado quando o tenant não configurou accent/secondary: gera cores harmônicas
// a partir da primary, para o carrossel sair "on-brand" em vez do ciano genérico.
function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = String(hex || "").trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0, hue = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      case b: hue = (r - g) / d + 4; break;
    }
    hue *= 60;
  }
  return { h: hue, s: s * 100, l: l * 100 };
}
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
function deriveAccentFromPrimary(primary: string): string {
  const hsl = hexToHsl(primary);
  if (!hsl) return "#22d3ee";
  // Rotaciona ~30° (análoga vibrante) e garante saturação/luminosidade destacadas
  const s = Math.max(60, Math.min(90, hsl.s + 10));
  const l = hsl.l < 25 ? 60 : hsl.l > 75 ? 45 : Math.min(70, hsl.l + 15);
  return hslToHex(hsl.h + 30, s, l);
}
function deriveSecondaryFromPrimary(primary: string): string {
  const hsl = hexToHsl(primary);
  if (!hsl) return "#f5f5f4";
  // Off-white tingido com a matiz da marca (secondary de apoio, alta luminância, baixa saturação)
  return hslToHex(hsl.h, Math.min(15, hsl.s * 0.25), 96);
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
    const topic = String(body?.topic ?? "").trim();
    const formatHint = String(body?.format_hint ?? "listicle");
    const channel = String(body?.channel ?? "instagram");
    const productId = body?.product_id ? String(body.product_id) : null;
    const referencePageId = body?.reference_page_id ? String(body.reference_page_id) : null;
    const sourceUrl = body?.source_url ? String(body.source_url).trim() : null;
    const save = body?.save !== false;
    const previewOnly = body?.preview_only === true; // só estrutura, não renderiza imagens

    const fmt = FORMAT_HINTS[formatHint] ?? FORMAT_HINTS.listicle;
    const slideCount = Number(body?.slide_count ?? fmt.count);

    // Contexto
    const [{ data: brand }, { data: branding }, { data: briefing }, { data: assets }, productRes, refRes, recentPostsRes] = await Promise.all([
      admin.from("social_brand_profile").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("company_branding").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("mavi_briefing").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("social_brand_assets").select("kind,public_url,is_default").eq("user_id", userId),
      productId
        ? admin.from("social_products").select("*").eq("user_id", userId).eq("id", productId).maybeSingle()
        : admin.from("social_products").select("*").eq("user_id", userId).eq("is_default", true).eq("active", true).maybeSingle(),
      referencePageId
        ? admin.from("social_reference_pages").select("*").eq("user_id", userId).eq("id", referencePageId).maybeSingle()
        : sourceUrl
          ? admin.from("social_reference_pages").select("*").eq("user_id", userId).eq("url", sourceUrl).maybeSingle()
          : Promise.resolve({ data: null }),
      admin.from("social_posts").select("ai_prompt,slide_data,caption").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    ]);
    const refPage = (refRes as { data?: Record<string, unknown> | null })?.data ?? null;
    const recentPosts = (recentPostsRes as { data?: Array<Record<string, unknown>> | null })?.data ?? [];
    const product = (productRes as { data?: Record<string, unknown> | null })?.data ?? null;

    // OVERRIDE BRAND com a página de referência (quando existir) — usuário quer post no estilo da página, não da sua marca
    const refBrand = (refPage as { brand_data?: Record<string, unknown> | null } | null)?.brand_data ?? null;
    const refLogo = (refBrand as Record<string, unknown> | null)?.logo_url as string | undefined;
    const refName = (refBrand as Record<string, unknown> | null)?.name as string | undefined;
    const refPrimary = (refBrand as Record<string, unknown> | null)?.primary as string | undefined;
    const refAccent = (refBrand as Record<string, unknown> | null)?.accent as string | undefined;
    const refPalette = Array.isArray((refBrand as Record<string, unknown> | null)?.palette)
      ? ((refBrand as Record<string, unknown>).palette as string[]).filter(Boolean)
      : [];

    const company = (refName && refName.trim()) || branding?.company_name || "nossa empresa";
    const palette = (brand?.color_palette ?? {}) as Record<string, string>;
    const primary = refPrimary || refPalette[0] || palette.primary || branding?.primary_color || "#0a0a0a";
    // Fallbacks derivados da primary para que a peça saia on-brand mesmo sem paleta completa configurada.
    const secondary = refPalette[2] || palette.secondary || deriveSecondaryFromPrimary(primary);
    const accent = refAccent || refPalette.find((c) => c !== primary) || palette.accent || deriveAccentFromPrimary(primary);
    const activeLogoUrl = refLogo || branding?.logo_url || null;
    const fontStyle = String(brand?.font_style ?? "modern bold sans-serif (like Inter or Helvetica)");
    const voice = String(brand?.voice_tone ?? "consultivo, direto, sem clichês");
    const niche = String(brand?.niche ?? "");
    const mood = String(brand?.visual_mood ?? "clean editorial");
    const assetRows = ((assets ?? []) as BrandAsset[]).filter((a) => a.public_url);
    const defaultAssets = ["carousel_template", "feed_template", "mood", "ugc_avatar"].flatMap((kind) => {
      const sameKind = assetRows.filter((a) => a.kind === kind);
      const preferred = sameKind.find((a) => a.is_default) ?? sameKind[0];
      return preferred?.public_url ? [preferred.public_url] : [];
    });
    const sampleUrls = Array.isArray(brand?.sample_post_urls) ? (brand.sample_post_urls as string[]) : [];
    const refOgImage = (refPage as { og_image_url?: string | null } | null)?.og_image_url ?? null;
    // Kie.ai gpt-image-2 só aceita JPG/PNG/WEBP. SVG, GIF, BMP, AVIF e URLs sem extensão clara causam "File type not supported".
    const isSupportedImageUrl = (u: string): boolean => {
      try {
        const path = new URL(u).pathname.toLowerCase();
        return /\.(jpe?g|png|webp)(\?|$)/.test(path) || /\.(jpe?g|png|webp)$/.test(path);
      } catch { return false; }
    };
    const referenceUrls = [
      ...(refLogo ? [refLogo] : []),
      ...(refOgImage ? [refOgImage] : []),
      ...defaultAssets,
      ...sampleUrls,
    ]
      .filter((u, i, arr) => u && arr.indexOf(u) === i)
      .filter(isSupportedImageUrl)
      .slice(0, 6);

    // Helper: checa "vazio" de forma robusta (null/undefined/string vazia/array vazio/objeto vazio)
    const isEmpty = (v: unknown): boolean => {
      if (v === null || v === undefined) return true;
      if (typeof v === "string") return v.trim() === "";
      if (Array.isArray(v)) return v.filter((x) => !isEmpty(x)).length === 0;
      if (typeof v === "object") return Object.keys(v as Record<string, unknown>).length === 0;
      return false;
    };
    const asText = (v: unknown): string => {
      if (isEmpty(v)) return "";
      if (Array.isArray(v)) return v.filter((x) => !isEmpty(x)).map((x) => typeof x === "string" ? x : JSON.stringify(x)).join(" • ");
      if (typeof v === "string") return v;
      return JSON.stringify(v);
    };

    const briefingRow = (briefing as Record<string, unknown> | null) ?? null;
    const productRow = (product as Record<string, unknown> | null) ?? null;
    const oferta = asText(productRow?.description) || asText(briefingRow?.value_props);
    const icp = asText(productRow?.target_audience) || asText(briefingRow?.icp_descricao);
    const productLink = (refPage as { url?: string } | null)?.url ?? (productRow?.link as string | undefined) ?? "link na bio";

    // Contexto factual da página de referência (LP/produto)
    const refContext = refPage
      ? `\n\n==== PÁGINA DE REFERÊNCIA (FONTE DA VERDADE) ====\nURL: ${(refPage as Record<string, unknown>).url}\nTítulo: ${(refPage as Record<string, unknown>).title ?? ""}\nResumo: ${(refPage as Record<string, unknown>).summary ?? ""}\nFeatures reais: ${JSON.stringify((refPage as Record<string, unknown>).features ?? []).slice(0, 600)}\nBenefícios reais: ${JSON.stringify((refPage as Record<string, unknown>).value_props ?? []).slice(0, 600)}\nCTA da página: ${(refPage as Record<string, unknown>).cta ?? ""}\nUSE essas informações como base factual. NÃO invente features que não estejam aqui.\n`
      : "";

    // Anti-repetição: temas/headlines dos últimos posts
    const recentSummary = recentPosts.length
      ? `\n\n==== JÁ POSTADO RECENTEMENTE (NÃO REPITA) ====\n${recentPosts.map((p, i) => {
          const sd = (p.slide_data ?? {}) as { title?: string; slides?: Array<{ headline?: string }> };
          return `${i + 1}. ${sd.title ?? p.ai_prompt ?? "(sem título)"}`;
        }).join("\n")}\n`
      : "";

    if (isEmpty(oferta) && isEmpty(icp) && isEmpty(topic) && !refPage) {
      return resp({
        success: false,
        error: "Contexto insuficiente para gerar o carrossel.",
        details: "Informe um tema, cole uma URL de referência, cadastre um produto em Produtos, ou preencha o Briefing (ICP + Value Props) em Treinar IA.",
      }, 400);
    }

    // 1) Estrutura via Gemini
    const structSys = `Você é diretor de conteúdo sênior especialista em carrosséis de Instagram que viralizam (referência: instagem.ai, alex hormozi, dan koe).
Empresa: "${company}". Nicho: ${niche}. Tom de voz: ${voice}.
${product ? `Produto em foco: ${(product as Record<string, unknown>).name}\nDescrição: ${oferta}\nICP: ${icp}\nCTA/Link: ${productLink}` : ""}
${refContext}${recentSummary}

Gere um carrossel ${formatHint.toUpperCase()} com EXATAMENTE ${slideCount} slides.
Formato: ${fmt.style}

Responda EXCLUSIVAMENTE este JSON:
{
  "title": "Título do carrossel (5-8 palavras, hook forte)",
  "hook": "1 frase de gancho que vai na capa",
  "slides": [
    {"index": 1, "kicker": "label curto opcional", "headline": "texto principal do slide (máx 8 palavras na CAPA, máx 12 nos demais)", "body": "1-2 linhas de detalhe (máx 20 palavras), opcional na capa", "layout": "cover|content|cta"}
  ],
  "caption": "Legenda do post (90-140 palavras) estruturada em blocos separados por \\n\\n. Hook isolado, 2-3 linhas de contexto, virada/insight, CTA mencionando '${productLink}'. Português coloquial, zero emoji clichê.",
  "hashtags": "exatamente 12 hashtags minúsculas separadas por espaço"
}

Regras:
- 1º slide: layout="cover" — frase forte que para o scroll.
- Último slide: layout="cta" — convite claro pro link/bio
- Slides do meio: layout="content"
- Headlines CURTAS e ESPECÍFICAS. Sem clichê motivacional. Sem "desbloqueie/transforme/eleve".
- Se há PÁGINA DE REFERÊNCIA, ancore-se nas features/benefícios REAIS dela.
- NÃO repita ângulos já postados (vide lista acima).
- Se o tema do usuário menciona algo concreto, use EXATAMENTE esse tema.`;

    const structUser = topic
      ? `Tema pedido: "${topic}". Construa o carrossel em cima disso${refPage ? " usando a página de referência como fonte factual" : ""}.`
      : refPage
        ? `Escolha o ângulo MAIS forte (educativo, prova social, antes/depois, ou objeção destruída) usando as features/benefícios da página de referência. Evite temas já postados.`
        : `Escolha um tema relevante para "${niche || "o negócio"}" que ataque uma dor real do ICP "${icp || "(definir)"}". Evite temas já postados.`;

    let structure: CarouselStructure;
    try {
      const aiContent = await generateAIContent(admin, userId, {
        system: structSys,
        user: structUser,
        json: true,
        temperature: 0.9,
      });
      const parsed = JSON.parse(aiContent || "{}");
      structure = typeof parsed === "string" ? JSON.parse(parsed) : parsed;
    } catch (e) {
      return resp({ success: false, error: `Estrutura: ${String((e as Error)?.message ?? e).slice(0, 300)}` }, 502);
    }
    if (!structure?.slides?.length) return resp({ success: false, error: "IA retornou estrutura vazia" }, 502);

    if (previewOnly) {
      return resp({ success: true, structure, brand: { primary, secondary, accent, font_style: fontStyle, mood } });
    }

    // 2) Pipeline por slide (em paralelo):
    //    Principal: GPT Image-2 renderiza a arte final com layout/copy/logo no mesmo prompt (igual fluxo manual no ChatGPT).
    //    Fallback: background GPT + overlay Satori, para nunca devolver vazio.
    const totalSlides = structure.slides.length;
    const renderUrl = `${SUPABASE_URL}/functions/v1/social-slide-render`;

    // ── Aspect ratio unificado entre BG (Kie) e render (Satori)
    // stories/reels → 9:16 (1080x1920); carousel (carrossel multi-slide) → 4:5 (1080x1350); feed (post único) → 1:1 (1080x1080)
    const aspect: AR =
      (formatHint === "stories" || channel === "stories" || channel === "reels") ? "9:16"
      : formatHint === "feed" ? "1:1"
      : "4:5"; // carousel default
    const renderW = 1080;
    const renderH = aspect === "9:16" ? 1920 : aspect === "4:5" ? 1350 : 1080;
    const aspectStr = `${aspect} (${renderW}x${renderH})`;
    const bgAspect: AR = aspect; // mesmo aspect para evitar crop/distorção

    const formatLabel = aspect === "9:16" ? "STORY vertical 1080x1920" : aspect === "4:5" ? "CARROSSEL 1080x1350" : "FEED quadrado 1080x1080";
    const refPageUrl = (refPage as { url?: string } | null)?.url ?? null;
    const factualBullets = refPage
      ? [
          `URL/produto de referência: ${refPageUrl}`,
          `Marca correta desta peça: ${company}`,
          `Resumo factual: ${(refPage as Record<string, unknown>).summary ?? ""}`,
          `Features reais: ${JSON.stringify((refPage as Record<string, unknown>).features ?? []).slice(0, 900)}`,
          `Benefícios reais: ${JSON.stringify((refPage as Record<string, unknown>).value_props ?? []).slice(0, 900)}`,
          `CTA real: ${(refPage as Record<string, unknown>).cta ?? productLink}`,
        ].join("\n")
      : [
          `Marca: ${company}`,
          `Oferta/produto: ${String(oferta).slice(0, 900)}`,
          `ICP: ${String(icp).slice(0, 600)}`,
        ].join("\n");

    const baseVisualBrief = `
BRAND VISUAL DNA:
- Paleta: primary ${primary}, accent ${accent}, secondary ${secondary}
- Mood/estética: ${mood}
- Estilo fotográfico: ${brand?.photography_style ?? "cinematic, dramatic lighting, shallow depth of field"}
- Tom visual: ${brand?.visual_mood ?? mood}
- Nicho: ${niche || company}
- Tipografia/layout que será aplicado por cima: ${fontStyle}; ${brand?.layout_pattern ?? "headline forte com hierarquia editorial"}
- Elementos recorrentes: ${JSON.stringify((brand?.raw_analysis as Record<string, unknown> | undefined)?.recurring_elements ?? []).slice(0, 300)}
${brand?.layout_pattern ? `- Padrão visual recorrente: ${brand.layout_pattern}` : ""}
Aspect ratio: ${aspectStr} — RESPEITAR estritamente o enquadramento ${aspect}.
PROIBIDO: texto legível, watermark, logo fake, números, letras grandes, UI/mockups com texto. Foque em CENA, SUJEITO e ATMOSFERA. O texto real será sobreposto depois por HTML.
ESTILO: foto/editorial premium com profundidade, iluminação dramática, alto contraste e espaço negativo para copy. Não faça fundo chapado/gradiente simples.
`.trim();

    const finalArtBrief = `
Você é um diretor de arte sênior criando uma peça final de Instagram no nível de anúncio premium feito manualmente no ChatGPT.

FORMATO: ${formatLabel}. Aspect ratio ${aspect}. A imagem final precisa sair pronta para postar.

BRAND LOCK — NÃO MISTURE MARCAS:
- Use SOMENTE a marca "${company}" nesta peça.
- Se a referência for de outra marca/produto, ela SOBRESCREVE o Brand Kit principal do usuário.
- NÃO escreva marcas antigas ou de outro tenant, exceto se a marca correta acima for exatamente essa.
- Use o logo real apenas se ele estiver nas imagens de referência. Se não conseguir ler o logo com segurança, use texto limpo com o nome "${company}" em vez de inventar logo.

CONTEXTO FACTUAL:
${factualBullets}

DIREÇÃO VISUAL:
- Paleta obrigatória: fundo/base ${primary}; destaque ${accent}; apoio ${secondary}; palette extra ${refPalette.join(", ") || "sem extras"}.
- Mood/estética: ${mood}; fotografia/layout: ${brand?.photography_style ?? "premium commercial, high contrast, sharp composition"}.
- Use as imagens anexadas como referência FORTE de logo, cores, composição, profundidade, contraste, ícones, produto/tela e clima visual.
- Crie uma peça comercial completa: background, hierarquia tipográfica, caixas/badges, ícones simples, CTA/rodapé quando couber.
- Tipografia impactante, condensada/bold, com sombra/glow/volume quando fizer sentido. Nada de texto sem graça chapado.
- Texto em português BR legível, sem caracteres errados, sem palavras aleatórias.
- Não copie posts existentes; adapte o branding e o produto.
`.trim();




    async function tryGenerateBgOnce(prompt: string, refs: string[]): Promise<{ url?: string; error?: string }> {
      try {
        const safeRefs = refs.filter(isSupportedImageUrl).slice(0, 6);
        let createRes: Response;
        let createJson: any;
        // Até 3 tentativas se Kie retornar 429 (rate limit), com backoff
        for (let attempt = 0; attempt < 3; attempt++) {
          createRes = await fetch(`${SUPABASE_URL}/functions/v1/kie-ai-generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: auth },
            body: JSON.stringify({
              type: "image",
              model: "gpt-image-2",
              prompt,
              aspect_ratio: bgAspect,
              count: 1,
              reference_image_urls: safeRefs,
            }),
          });
          createJson = await createRes.json().catch(() => ({}));
          const errStr = String(createJson?.error ?? "");
          const is429 = errStr.includes("429") || /rate limit/i.test(errStr) || /frequency is too high/i.test(errStr);
          if (!is429) break;
          // backoff: 8s, 20s
          await new Promise((r) => setTimeout(r, attempt === 0 ? 8000 : 20000));
        }
        if (!createRes!.ok || createJson?.success === false) {
          return { error: `kie ${createRes!.status}: ${createJson?.error ?? "create_failed"}` };
        }
        if (createJson?.async === false && Array.isArray(createJson?.urls) && createJson.urls.length) {
          return { url: createJson.urls[0] as string };
        }
        const taskId = createJson?.task_id as string | undefined;
        if (!taskId) return { error: "sem task_id" };

        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const pr = await fetch(`${SUPABASE_URL}/functions/v1/kie-ai-generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: auth },
            body: JSON.stringify({ type: "poll", task_id: taskId, kind: "image", engine: "gpt-image-2" }),
          });
          const pj = await pr.json().catch(() => ({}));
          if (Array.isArray(pj?.urls) && pj.urls.length) return { url: pj.urls[0] as string };
          if (pj?.success === false || (pj?.error && String(pj.status).toLowerCase().includes("fail"))) {
            return { error: `poll fail: ${pj?.error ?? pj?.status}` };
          }
        }
        return { error: "timeout 90s" };
      } catch (e) {
        return { error: (e as Error).message };
      }
    }

    async function generateBg(slide: Slide): Promise<string | null> {
      const sceneHint = slide.layout === "cover"
        ? `Capa do carrossel sobre: "${slide.headline}". Cena conceitual forte com um sujeito/elemento visual central que representa o tema.`
        : slide.layout === "cta"
        ? `Slide final/CTA. Cena energética, sensação de transformação/conquista relacionada a "${structure.title}".`
        : `Slide ${slide.index} de ${totalSlides}. Cena conceitual diferente das anteriores, ilustrando: "${slide.headline}". ${slide.body ?? ""}`;

      const fullPrompt = `${baseVisualBrief}\n\nCENA DESTE SLIDE:\n${sceneHint}\n\nUse as imagens anexadas somente como REFERÊNCIA DE BRANDING (paleta, contraste, enquadramento, mood e presença humana/produto quando existir). Não copie texto, não copie posts existentes. Gerar somente a IMAGEM de fundo (sem texto, sem letras). Composição cinematográfica, espaço negativo para overlay de texto na parte central/inferior. Aspect ratio ${bgAspect}.`;

      // Tentativa 1: prompt completo + refs do brand kit
      const first = await tryGenerateBgOnce(fullPrompt, referenceUrls);
      if (first.url) return first.url;
      errors.push(`slide ${slide.index} bg tent.1: ${first.error}`);

      // Tentativa 2 (fallback): prompt simplificado, sem refs (refs pesadas costumam fazer o gpt-image-2 falhar moderação/timeout)
      const simplePrompt = `Fotografia editorial premium, ${mood || "cinematic"}, paleta ${primary}/${accent}, sujeito central representando "${slide.headline}". Iluminação dramática, profundidade, espaço negativo para texto na parte central/inferior. Sem texto, sem letras, sem logos. Aspect ratio ${bgAspect}.`;
      const second = await tryGenerateBgOnce(simplePrompt, []);
      if (second.url) return second.url;
      errors.push(`slide ${slide.index} bg tent.2 (fallback): ${second.error}`);

      // Tentativa 3 (último recurso): renderiza sem bg fotográfico — slide-render usa gradiente da paleta
      return null;
    }

    async function uploadRemoteImage(url: string, slideIndex: number): Promise<string> {
      const r = await fetch(url);
      if (!r.ok) return url;
      const bytes = new Uint8Array(await r.arrayBuffer());
      const path = `${userId}/carousels/${Date.now()}_${slideIndex}_gpt.png`;
      const { error: upErr } = await admin.storage.from("branding-logos").upload(path, bytes, { contentType: r.headers.get("content-type") ?? "image/png", upsert: true });
      if (upErr) return url;
      const { data: pub } = admin.storage.from("branding-logos").getPublicUrl(path);
      return pub.publicUrl;
    }

    async function generateFinalArt(slide: Slide): Promise<string | null> {
      const layout = slide.layout ?? (slide.index === 1 ? "cover" : slide.index === totalSlides ? "cta" : "content");
      const textBlocks = [
        slide.kicker ? `KICKER curto: ${slide.kicker}` : null,
        `HEADLINE PRINCIPAL EXATA: ${slide.headline}`,
        slide.body ? `SUBTÍTULO/CORPO EXATO: ${slide.body}` : null,
        layout === "cta" ? `CTA visual curto: ${String(productLink).slice(0, 55)}` : null,
        totalSlides > 1 ? `Indicador discreto do slide: ${slide.index}/${totalSlides}` : null,
      ].filter(Boolean).join("\n");

      const prompt = `${finalArtBrief}

SLIDE ${slide.index}/${totalSlides} — layout ${layout.toUpperCase()}:
${textBlocks}

Brief criativo específico:
${layout === "cover"
  ? `Capa forte sobre "${structure.title}". Precisa parar o scroll e parecer anúncio premium de produto digital/SaaS. Se houver referência de dashboard/produto, inclua um mockup/tela estilizada sem inventar textos pequenos.`
  : layout === "cta"
    ? `Fechamento com sensação de decisão/ação. Use CTA claro e visual de conversão, sem poluir.`
    : `Slide educativo com hierarquia clara. Use 1 ideia dominante, ícones/linhas/boxes e composição premium.`}

REGRAS DE SAÍDA:
- Renderize a arte final inteira, não só fundo.
- Use exatamente a marca, cores e contexto acima.
- Texto principal precisa estar grande, legível e bem composto.
- NÃO gere watermark, NÃO assine como IA, NÃO use lorem ipsum, NÃO invente logos de marketplace se não estiverem no contexto.
- Aspect ratio final ${aspect}; composição segura para Instagram.`;

      const first = await tryGenerateBgOnce(prompt, referenceUrls);
      if (first.url) return await uploadRemoteImage(first.url, slide.index);
      errors.push(`slide ${slide.index} arte final gpt: ${first.error}`);

      const secondPrompt = `${finalArtBrief}\n\nCrie uma arte final ${formatLabel} para a marca "${company}" com o texto: "${slide.headline}"${slide.body ? ` e subtítulo "${slide.body}"` : ""}. Use paleta ${primary}/${accent}, visual premium, texto grande e legível em português. Aspect ratio ${aspect}.`;
      const second = await tryGenerateBgOnce(secondPrompt, referenceUrls.slice(0, 3));
      if (second.url) return await uploadRemoteImage(second.url, slide.index);
      errors.push(`slide ${slide.index} arte final fallback: ${second.error}`);

      return null;
    }



    async function renderSlide(slide: Slide, bgUrl: string | null): Promise<string | null> {
      const layout = slide.layout ?? (slide.index === 1 ? "cover" : slide.index === totalSlides ? "cta" : "content");
      try {
        const renderRes = await fetch(renderUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
          body: JSON.stringify({
            slide: {
              index: slide.index, total: totalSlides, layout,
              kicker: slide.kicker, headline: slide.headline, body: slide.body,
              cta: layout === "cta" ? String(productLink).slice(0, 40) : undefined,
            },
            brand: { primary, secondary, accent, company_name: company, logo_url: activeLogoUrl },
            width: renderW, height: renderH,
            bg_image_url: bgUrl,
          }),
        });
        const renderText = await renderRes.text();
        if (!renderRes.ok) { errors.push(`slide ${slide.index} render: ${renderRes.status} ${renderText.slice(0, 200)}`); return null; }
        const renderJson = JSON.parse(renderText);
        const b64 = renderJson?.b64_png;
        if (!b64) { errors.push(`slide ${slide.index}: sem b64_png`); return null; }
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const path = `${userId}/carousels/${Date.now()}_${slide.index}.png`;
        const { error: upErr } = await admin.storage.from("branding-logos").upload(path, bytes, { contentType: "image/png", upsert: true });
        if (upErr) { errors.push(`slide ${slide.index} upload: ${upErr.message}`); return null; }
        const { data: pub } = admin.storage.from("branding-logos").getPublicUrl(path);
        return pub.publicUrl;
      } catch (e) {
        errors.push(`slide ${slide.index}: ${(e as Error).message}`);
        return null;
      }
    }

    const slideUrls: string[] = [];
    const errors: string[] = [];

    // Processa slides com concorrência limitada (2) e stagger 4s para evitar 429 do Kie.ai
    const CONCURRENCY = 2;
    const STAGGER_MS = 4000;
    const results: (string | null)[] = new Array(structure.slides.length).fill(null);
    for (let i = 0; i < structure.slides.length; i += CONCURRENCY) {
      const batch = structure.slides.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async (slide, j) => {
        if (j > 0) await new Promise((r) => setTimeout(r, j * 1500));
        const finalArt = await generateFinalArt(slide);
        if (finalArt) return finalArt;
        const bg = await generateBg(slide);
        return await renderSlide(slide, bg);
      }));
      batchResults.forEach((u, k) => { results[i + k] = u; });
      if (i + CONCURRENCY < structure.slides.length) {
        await new Promise((r) => setTimeout(r, STAGGER_MS));
      }
    }
    for (const u of results) if (u) slideUrls.push(u);


    if (slideUrls.length === 0) {
      return resp({ success: false, error: "Nenhum slide foi renderizado", details: errors }, 502);
    }

    // 3) Salvar como social_post draft
    let postId: string | null = null;
    if (save) {
      const mediaType = formatHint === "stories" ? "image" : formatHint === "feed" ? "image" : "carousel";
      const postFormat = formatHint === "stories" ? "stories" : formatHint === "feed" ? "feed" : formatHint;
      const { data: post, error: postErr } = await admin.from("social_posts").insert({
        user_id: userId,
        channel,
        media_type: mediaType,
        post_format: postFormat,
        template_slug: formatHint,
        slide_data: structure as unknown as Record<string, unknown>,
        media_urls: slideUrls,
        caption: structure.caption ?? "",
        hashtags: structure.hashtags ?? "",
        ai_prompt: `Tema: ${topic || structure.title}`,
        status: "draft",
      }).select("id").single();
      if (postErr) return resp({ success: false, error: postErr.message, slideUrls, structure }, 500);
      postId = post.id;
    }

    return resp({
      success: true,
      post_id: postId,
      slides: slideUrls,
      structure,
      errors: errors.length ? errors : undefined,
    });
  } catch (e) {
    return resp({ success: false, error: (e as Error).message?.slice(0, 400) ?? "unknown" }, 500);
  }
});
