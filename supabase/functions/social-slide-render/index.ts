// social-slide-render — renderiza 1 slide de carrossel via Satori + resvg-wasm
// Texto REAL (não desenhado por modelo de imagem) com fonte, paleta e logo da marca
// Body: { slide: {index,total,layout,kicker?,headline,body?,cta?}, brand: {primary,secondary,accent,font_family?,logo_url?,company_name?}, bg_image_url? }
// Retorna: { success, b64_png } (PNG 1080x1080)
import satori from "npm:satori@0.10.13";
import { Resvg, initWasm } from "npm:@resvg/resvg-wasm@2.6.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// --- Cache estático entre invocações (warm container) ---
let WASM_READY = false;
let FONT_BOLD: ArrayBuffer | null = null;
let FONT_REGULAR: ArrayBuffer | null = null;

async function fetchGoogleFont(family: string, weight: number, subset = "latin-ext"): Promise<ArrayBuffer> {
  // text=... força incluir glifos PT-BR (acentos)
  const sample = "AÁÀÂÃÄEÉÈÊËIÍÎÏOÓÒÔÕÖUÚÙÛÜCÇNÑaáàâãäeéèêëiíîïoóòôõöuúùûücçnñ0123456789!?.,'\":;-_()/&%@#";
  const cssRes = await fetch(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(sample)}&subset=${subset}`,
    { headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36" } },
  );
  const css = await cssRes.text();
  const m = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.(?:ttf|otf|woff2?))\)/);
  if (!m) {
    // fallback sem subset
    const r2 = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`,
      { headers: { "User-Agent": "Mozilla/5.0" } });
    const css2 = await r2.text();
    const m2 = css2.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/);
    if (!m2) throw new Error(`No font for ${family} ${weight}`);
    return await (await fetch(m2[1])).arrayBuffer();
  }
  return await (await fetch(m[1])).arrayBuffer();
}

async function ensureRuntime() {
  if (!WASM_READY) {
    const wasmRes = await fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm");
    const wasm = await wasmRes.arrayBuffer();
    await initWasm(wasm);
    WASM_READY = true;
  }
  // Inter suporta latin-ext (cobre acentos PT)
  if (!FONT_BOLD) FONT_BOLD = await fetchGoogleFont("Inter", 900);
  if (!FONT_REGULAR) FONT_REGULAR = await fetchGoogleFont("Inter", 500);
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") ?? "image/png";
    const buf = new Uint8Array(await r.arrayBuffer());
    // base64 encode em chunks pra não estourar pilha
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    return `data:${ct};base64,${btoa(bin)}`;
  } catch { return null; }
}


type Slide = {
  index: number;
  total: number;
  layout?: "cover" | "content" | "cta";
  kicker?: string;
  headline: string;
  body?: string;
  cta?: string;
};
type Brand = {
  primary: string;
  secondary: string;
  accent: string;
  company_name?: string;
  logo_url?: string;
};

// Helper pra criar elemento Satori sem JSX
const el = (type: string, props: Record<string, unknown> = {}, ...children: unknown[]) => ({
  type,
  props: { ...props, children: children.length === 1 ? children[0] : children.length === 0 ? undefined : children },
});

function buildSlideTree(slide: Slide, brand: Brand, bgDataUrl: string | null) {
  const layout = slide.layout ?? (slide.index === 1 ? "cover" : slide.index === slide.total ? "cta" : "content");
  const isCover = layout === "cover";
  const isCta = layout === "cta";

  const headlineLen = slide.headline.length;
  const headlineSize = isCover
    ? headlineLen < 30 ? 120 : headlineLen < 50 ? 96 : headlineLen < 80 ? 78 : 64
    : headlineLen < 40 ? 78 : headlineLen < 70 ? 62 : 52;

  const bg = brand.primary;
  const fg = "#ffffff"; // texto sempre branco sobre foto + overlay
  const accent = brand.accent;

  const isSingle = (slide.total ?? 1) <= 1;

  // Header: logo (se houver) ou kicker à esq, page number à dir (oculta no single)
  const logoDataUrl = (brand as Brand & { _logoDataUrl?: string })._logoDataUrl ?? null;
  const headerLeft = logoDataUrl
    ? el("img", { src: logoDataUrl, width: 168, height: 56, style: { display: "flex", height: 56, width: 168, objectFit: "contain" } })
    : el(
        "div",
        {
          style: {
            display: "flex",
            fontSize: 22,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: accent,
            fontWeight: 700,
          },
        },
        slide.kicker ?? (isCover ? brand.company_name ?? "" : isCta ? "CTA" : `${String(slide.index).padStart(2, "0")} / ${String(slide.total).padStart(2, "0")}`),
      );

  const header = el(
    "div",
    {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
      },
    },
    headerLeft,
    isSingle
      ? el("div", { style: { display: "flex" } })
      : el(
          "div",
          { style: { display: "flex", fontSize: 22, color: fg, opacity: 0.55, fontWeight: 500 } },
          `${slide.index}/${slide.total}`,
        ),
  );

  // Body principal
  const headlineEl = el(
    "div",
    {
      style: {
        display: "flex",
        fontSize: headlineSize,
        lineHeight: 1.02,
        letterSpacing: "-0.035em",
        color: fg,
        fontWeight: 900,
        textAlign: isCover || isCta ? "center" : "left",
        textTransform: isCover ? "uppercase" : "none",
      },
    },
    slide.headline,
  );

  const bodyEl = slide.body
    ? el(
        "div",
        {
          style: {
            display: "flex",
            fontSize: isCover ? 34 : 38,
            lineHeight: 1.3,
            color: fg,
            opacity: 0.82,
            fontWeight: 500,
            marginTop: 28,
            textAlign: isCover || isCta ? "center" : "left",
            maxWidth: 880,
          },
        },
        slide.body,
      )
    : null;

  // Accent bar abaixo da headline (não-cover)
  const accentBar = !isCover && !isCta
    ? el("div", {
        style: {
          display: "flex",
          width: 96,
          height: 6,
          backgroundColor: accent,
          marginTop: 32,
          marginBottom: 8,
        },
      })
    : null;

  const main = el(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: isCover || isCta ? "center" : "flex-start",
        justifyContent: "center",
        flex: 1,
        width: "100%",
      },
    },
    ...(accentBar ? [accentBar] : []),
    headlineEl,
    ...(bodyEl ? [bodyEl] : []),
    ...(isCta && slide.cta
      ? [
          el(
            "div",
            {
              style: {
                display: "flex",
                marginTop: 56,
                paddingTop: 22,
                paddingBottom: 22,
                paddingLeft: 44,
                paddingRight: 44,
                backgroundColor: accent,
                color: bg,
                fontSize: 32,
                fontWeight: 900,
                borderRadius: 999,
                letterSpacing: "-0.01em",
              },
            },
            slide.cta,
          ),
        ]
      : []),
  );

  // Footer: company name à esq, "deslize" à dir (se não for cta/cover)
  const footer = el(
    "div",
    {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        fontSize: 20,
        color: fg,
        opacity: 0.6,
        fontWeight: 600,
      },
    },
    el("div", { style: { display: "flex" } }, brand.company_name ?? ""),
    el(
      "div",
      { style: { display: "flex" } },
      isSingle ? "" : isCover ? "DESLIZE →" : isCta ? "" : "→",
    ),
  );

  // Wrapper com background image (foto) ou cor sólida
  const rootStyle: Record<string, unknown> = {
    width: 1080,
    height: 1080,
    display: "flex",
    flexDirection: "column",
    backgroundColor: bg,
    padding: 72,
    fontFamily: "Inter",
    position: "relative",
  };
  if (bgDataUrl) {
    rootStyle.backgroundImage = `url("${bgDataUrl}")`;
    rootStyle.backgroundSize = "cover";
    rootStyle.backgroundPosition = "center";
  }

  // Overlay escuro pra legibilidade do texto (gradiente bottom mais escuro)
  const overlay = el("div", {
    style: {
      position: "absolute",
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundImage: bgDataUrl
        ? `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.85) 100%)`
        : `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 100%)`,
      display: "flex",
    },
  });

  // Accent bar decorativa (canto superior)
  const accentBlob = el("div", {
    style: {
      position: "absolute",
      top: 0, left: 0,
      width: 8, height: "100%",
      backgroundColor: accent,
      display: "flex",
    },
  });

  // Content wrapper (acima do overlay)
  const contentWrap = el(
    "div",
    {
      style: {
        position: "relative",
        zIndex: 2,
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
      },
    },
    header,
    main,
    footer,
  );

  return el("div", { style: rootStyle }, overlay, accentBlob, contentWrap);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resp({ error: "Method not allowed" }, 405);
  try {
    const { slide, brand, width, height, bg_image_url } = await req.json();
    if (!slide?.headline || !brand?.primary) {
      return resp({ success: false, error: "Faltam campos: slide.headline / brand.primary" }, 400);
    }

    await ensureRuntime();

    const W = Number(width) || 1080;
    const H = Number(height) || 1080;

    const bgDataUrl = bg_image_url ? await fetchAsDataUrl(String(bg_image_url)) : null;
    const logoDataUrl = brand?.logo_url ? await fetchAsDataUrl(String(brand.logo_url)) : null;
    const brandWithLogo = { ...(brand as Brand), _logoDataUrl: logoDataUrl } as Brand & { _logoDataUrl: string | null };

    const tree = buildSlideTree(slide as Slide, brandWithLogo, bgDataUrl);
    (tree.props as { style: Record<string, unknown> }).style = {
      ...(tree.props as { style: Record<string, unknown> }).style,
      width: W,
      height: H,
    };
    const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
      width: W,
      height: H,
      fonts: [
        { name: "Inter", data: FONT_REGULAR!, weight: 500, style: "normal" },
        { name: "Inter", data: FONT_BOLD!, weight: 900, style: "normal" },
      ],
    });

    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: W } });
    const png = resvg.render().asPng();
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < png.length; i += chunk) bin += String.fromCharCode(...png.subarray(i, i + chunk));
    const b64 = btoa(bin);

    return resp({ success: true, b64_png: b64, width: W, height: H, has_bg: !!bgDataUrl });
  } catch (e) {
    return resp({ success: false, error: (e as Error).message?.slice(0, 500) ?? "unknown" }, 500);
  }
});
