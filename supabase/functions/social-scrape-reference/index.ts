// social-scrape-reference — busca uma URL (LP/produto), extrai contexto via IA e salva em social_reference_pages
// Body: { url: string, label?: string, id?: string (re-scrape) }
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

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function abs(u: string | undefined | null, base: string): string | null {
  if (!u) return null;
  try { return /^https?:\/\//i.test(u) ? u : new URL(u, base).toString(); } catch { return null; }
}

function pickAttr(tag: string, attr: string): string | null {
  return tag.match(new RegExp(`${attr}=["']([^"']+)["']`, "i"))?.[1]?.trim() ?? null;
}

function firstSrcFromSrcset(srcset: string | null, base: string): string | null {
  if (!srcset) return null;
  return abs(srcset.split(",")[0]?.trim().split(/\s+/)[0], base);
}

function extractLogoUrl(html: string, url: string, fallback: string): string {
  const jsonLdBlocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  for (const block of jsonLdBlocks) {
    const raw = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed, ...(Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [])];
      for (const node of nodes) {
        const logo = typeof node?.logo === "string" ? node.logo : node?.logo?.url;
        const resolved = abs(logo, url);
        if (resolved) return resolved;
      }
    } catch { /* ignore malformed ld+json */ }
  }

  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  const scored = imgTags.map((tag) => {
    const hay = tag.toLowerCase();
    const score =
      (hay.includes("logo") ? 10 : 0) +
      (hay.includes("brand") || hay.includes("marca") ? 5 : 0) +
      (hay.includes("header") || hay.includes("navbar") ? 2 : 0) +
      (hay.includes("svg") ? 2 : 0) +
      (hay.includes("favicon") ? -6 : 0);
    const src = abs(pickAttr(tag, "src") || pickAttr(tag, "data-src") || pickAttr(tag, "data-lazy-src"), url)
      ?? firstSrcFromSrcset(pickAttr(tag, "srcset") || pickAttr(tag, "data-srcset"), url);
    return { score, src };
  }).filter((x) => x.src && x.score > 0).sort((a, b) => b.score - a.score);

  return scored[0]?.src ?? fallback;
}

function extractMeta(html: string, url: string) {
  const m = (re: RegExp) => html.match(re)?.[1]?.trim();
  const title = m(/<title[^>]*>([^<]+)<\/title>/i) ?? "";
  const ogImage = m(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    ?? m(/<meta[^>]+name=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  const ogTitle = m(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const ogDesc = m(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    ?? m(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const siteName = m(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
  const themeColor = m(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);
  const appleIcon = m(/<link[^>]+rel=["'](?:apple-touch-icon|icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i);

  const origin = (() => { try { return new URL(url).origin; } catch { return url; } })();
  const favicon = abs(appleIcon, url) ?? `${origin}/favicon.ico`;
  const logo = extractLogoUrl(html, url, favicon);

  // Collect color hexes from inline styles + style tags (top frequencies often = brand colors)
  const styleBlob = (html.match(/<style[\s\S]*?<\/style>/gi) ?? []).join(" ") + " "
    + (html.match(/style=["'][^"']+["']/gi) ?? []).join(" ");
  const hexes = (styleBlob.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map(h => h.toLowerCase());
  const freq: Record<string, number> = {};
  for (const h of hexes) {
    if (["#000000", "#ffffff", "#fafafa", "#f5f5f5", "#eeeeee", "#cccccc", "#999999", "#333333", "#222222", "#111111"].includes(h)) continue;
    freq[h] = (freq[h] ?? 0) + 1;
  }
  const topColors = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([h]) => h);

  return {
    title: ogTitle || title,
    description: ogDesc ?? "",
    og_image_url: abs(ogImage, url),
    site_name: siteName ?? null,
    theme_color: themeColor ?? null,
    logo_url: logo,
    favicon_url: favicon,
    palette: topColors,
  };
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
    const url = String(body?.url ?? "").trim();
    const label = body?.label ? String(body.label).trim() : null;
    if (!/^https?:\/\//i.test(url)) return resp({ success: false, error: "URL inválida" }, 400);

    // Fetch HTML
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeadsBoosterBot/1.0; +https://leadsbooster.com.br)",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!pageRes.ok) return resp({ success: false, error: `HTTP ${pageRes.status} ao buscar página` }, 502);
    const html = await pageRes.text();
    const meta = extractMeta(html, url);
    const text = stripHtml(html).slice(0, 12000);

    // Extract structured info via Gemini
    const sys = `Você analisa páginas de produto/landing page e extrai contexto factual pra alimentar geração de conteúdo de Instagram.
Responda APENAS este JSON:
{
  "summary": "1 parágrafo (60-120 palavras) explicando o que é o produto/serviço, pra quem e o diferencial. Use APENAS o que está na página.",
  "features": ["feature 1 (curta, 3-7 palavras)", "feature 2", "..."] (até 8),
  "value_props": ["benefício/promessa 1 (1 frase)", "benefício 2", "..."] (até 6),
  "cta": "principal chamada da página, ex.: 'Teste grátis 7 dias', 'Fale com vendas'"
}
NUNCA invente. Se não achou na página, devolve array vazio.`;

    // IA via OpenAI/Gemini do tenant (ex-gateway Lovable descontinuado).
    let parsed: { summary?: string; features?: string[]; value_props?: string[]; cta?: string } = {};
    try {
      const aiText = await generateAIContent(admin, userId, {
        system: sys,
        user: `TÍTULO: ${meta.title}\nMETA: ${meta.description}\n\nCONTEÚDO:\n${text}`,
        json: true,
        temperature: 0.2,
      });
      parsed = JSON.parse(aiText);
    } catch { /* keep empty */ }

    const brandName = meta.site_name
      || (meta.title?.split(/[-|·–—]/)[0]?.trim() ?? null);
    const primary = meta.theme_color || meta.palette[0] || null;
    const accent = meta.palette.find(c => c !== primary) || meta.palette[1] || null;

    const row = {
      user_id: userId,
      url,
      label: label ?? meta.title?.slice(0, 80) ?? null,
      title: meta.title || null,
      summary: parsed.summary ?? meta.description ?? null,
      features: parsed.features ?? [],
      value_props: parsed.value_props ?? [],
      cta: parsed.cta ?? null,
      og_image_url: meta.og_image_url ?? null,
      raw_text: text.slice(0, 4000),
      brand_data: {
        name: brandName,
        logo_url: meta.logo_url,
        favicon_url: meta.favicon_url,
        primary,
        accent,
        palette: meta.palette,
      },
      last_scraped_at: new Date().toISOString(),
      active: true,
    };

    const { data: saved, error: upErr } = await admin
      .from("social_reference_pages")
      .upsert(row, { onConflict: "user_id,url" })
      .select("*")
      .single();
    if (upErr) return resp({ success: false, error: upErr.message }, 500);

    return resp({ success: true, page: saved });
  } catch (e) {
    return resp({ success: false, error: (e as Error).message?.slice(0, 400) ?? "unknown" }, 500);
  }
});
