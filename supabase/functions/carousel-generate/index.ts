// Generates carousel script and optional background images.
// Text uses tenant/admin OpenAI/Gemini via generateAIContent.
// Backgrounds use tenant/admin OpenAI Images via generateOpenAIImages.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateAIContent } from "../_shared/ai-json.ts";
import { generateOpenAIImages, getResolvedMediaKeys } from "../_shared/ai-media.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const SUPA = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(SUPA, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return json({ error: "Unauthenticated" }, 401);
    const admin = createClient(SUPA, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const theme = String(body.theme ?? "").trim();
    if (!theme) return json({ error: "theme obrigatorio" }, 400);
    const slidesCount: number = [5, 7, 10].includes(body.slides_count) ? body.slides_count : 7;
    const template = String(body.template ?? "minimalista");
    const fonts = body.fonts ?? { heading: "Playfair Display", body: "Inter" };
    const genBg = body.generate_backgrounds !== false;

    // Regen mode: { regenerate: { kind: "text"|"background"|"both", index, current, total } }
    const regen = body.regenerate as
      | { kind: "text" | "background" | "both"; index: number; current: any; total: number }
      | undefined;


    const { data: brand } = await admin
      .from("social_brand_profile")
      .select("display_name,niche,voice_tone,color_palette,visual_mood,cta_style,bio")
      .eq("user_id", userId).maybeSingle();
    const cp: any = brand?.color_palette;
    const colors: string[] = Array.isArray(cp)
      ? cp
      : (cp && typeof cp === "object" ? Object.values(cp).filter((v: any) => typeof v === "string") as string[] : ["#0F172A", "#3B82F6", "#F8FAFC"]);

    const sys = `Voce e copywriter especialista em carrosseis Instagram que viralizam. Estruture como: SLIDE 1 = hook impossivel de ignorar; SLIDES 2..N-1 = desenvolvimento com uma ideia por slide; SLIDE N = CTA claro.
Regras: heading = frase curta com ate 7 palavras. body = 1-2 linhas com ate 22 palavras. Sem emojis nos headings. Portugues BR natural. Zero cliches como "desbloqueie" ou "transforme". Responda SOMENTE JSON valido.`;

    const usr = `Marca: ${brand?.display_name ?? "cliente"}
Nicho: ${brand?.niche ?? "n/d"}
Tom de voz: ${brand?.voice_tone ?? "profissional"}
Estilo visual: ${brand?.visual_mood ?? template}
Paleta: ${colors.join(", ")}
CTA style: ${brand?.cta_style ?? "convite direto"}

Tema do carrossel: ${theme}
Slides: ${slidesCount}

Retorne JSON:
{
  "caption": "legenda completa para o post com 150-300 caracteres e hashtags no fim",
  "slides": [
    {
      "heading": string,
      "body": string,
      "image_prompt": "prompt em ingles para gerar fundo abstrato coerente com marca, SEM texto, SEM letras, foto/grafico limpo com espaco negativo para overlay de texto"
    }
  ]
}`;

    // === Regen mode: only 1 slide ===
    if (regen && regen.current) {
      const wantText = regen.kind === "text" || regen.kind === "both";
      const wantBg = regen.kind === "background" || regen.kind === "both";
      const out: any = { ...regen.current };

      if (wantText) {
        const regenSys = `Voce e copywriter especialista em carrosseis Instagram. Reescreva APENAS 1 slide (posicao ${regen.index + 1} de ${regen.total}) mantendo coerencia com o tema. Regras: heading ate 7 palavras, body 1-2 linhas ate 22 palavras, sem emojis, PT-BR natural. Responda SOMENTE JSON: {"heading":"","body":"","image_prompt":"prompt em ingles para fundo, SEM TEXTO"}.`;
        const regenUsr = `Tema: ${theme}\nPosicao: ${regen.index + 1}/${regen.total}\nMarca: ${brand?.display_name ?? "cliente"} | Nicho: ${brand?.niche ?? "n/d"} | Tom: ${brand?.voice_tone ?? "profissional"}\nSlide atual (para variar, nao repetir):\nheading: ${regen.current.heading ?? ""}\nbody: ${regen.current.body ?? ""}`;
        try {
          const rawS = await generateAIContent(admin, userId, {
            system: regenSys, user: regenUsr, json: true, maxTokens: 400, temperature: 0.85,
          });
          const p = JSON.parse(rawS || "{}");
          if (p.heading) out.heading = p.heading;
          if (p.body) out.body = p.body;
          if (p.image_prompt) out.image_prompt = p.image_prompt;
        } catch (e: any) {
          return json({ error: `Falha ao regerar texto: ${e?.message ?? e}` }, 500);
        }
      }

      if (wantBg) {
        const keys = await getResolvedMediaKeys(admin, userId);
        if (!keys.openaiKey) return json({ error: "Configure OpenAI em Configuracoes > APIs para regerar fundo." }, 400);
        const prompt = `${out.image_prompt ?? out.heading ?? theme}. Style: ${template}, brand palette ${colors.join(", ")}. NO TEXT, NO LETTERS, NO WATERMARKS. Leave clean negative space for text overlay. Portrait 1080x1350, premium social media creative background.`;
        try {
          const generated = await generateOpenAIImages({
            admin, userId, apiKey: keys.openaiKey, prompt, count: 1, aspectRatio: "4:5",
          });
          out.background_url = generated.urls[0];
          out.background_engine = "openai-images";
          out.background_error = undefined;
        } catch (e: any) {
          return json({ error: `Falha ao regerar fundo: ${e?.message ?? e}` }, 500);
        }
      }

      return json({ ok: true, slide: out });
    }

    const raw = await generateAIContent(admin, userId, {
      system: sys,
      user: usr,
      json: true,
      maxTokens: 2200,
      temperature: 0.75,
    });
    const parsed = JSON.parse(raw || "{}");
    const slides: any[] = Array.isArray(parsed.slides) ? parsed.slides.slice(0, slidesCount) : [];


    if (genBg && slides.length > 0) {
      const keys = await getResolvedMediaKeys(admin, userId);
      if (keys.openaiKey) {
        const CONCURRENCY = 2;
        let idx = 0;
        const workers = Array.from({ length: CONCURRENCY }, async () => {
          while (idx < slides.length) {
            const i = idx++;
            const prompt = `${slides[i].image_prompt}. Style: ${template}, brand palette ${colors.join(", ")}. NO TEXT, NO LETTERS, NO WATERMARKS. Leave clean negative space for text overlay. Portrait 1080x1350, premium social media creative background.`;
            try {
              const generated = await generateOpenAIImages({
                admin,
                userId,
                apiKey: keys.openaiKey!,
                prompt,
                count: 1,
                aspectRatio: "4:5",
              });
              slides[i].background_url = generated.urls[0];
              slides[i].background_engine = "openai-images";
            } catch (e: any) {
              slides[i].background_error = String(e?.message ?? e).slice(0, 160);
            }
          }
        });
        await Promise.all(workers);
      } else {
        slides.forEach((slide) => {
          slide.background_error = "Configure OpenAI em Configuracoes > APIs para gerar fundos.";
        });
      }
    }

    return json({
      ok: true,
      caption: parsed.caption ?? "",
      slides,
      brand: { colors, fonts, template },
    });
  } catch (e: any) {
    console.error("[carousel-generate]", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
