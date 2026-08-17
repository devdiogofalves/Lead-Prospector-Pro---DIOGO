// social-reels-script — gera roteiro de Reels pronto, segundo-a-segundo, com gancho, falas e B-roll.
// Body: { duration?: 5|15|30|60, style?: "hook_viral"|"tutorial"|"storytelling"|"depoimento"|"polemico", theme?: string, cta?: string, base_caption?: string }
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

const STYLE_DIR: Record<string, string> = {
  hook_viral: "Gancho viral nos primeiros 1.5s (curiosidade, contradição ou afirmação polêmica). Ritmo acelerado, cortes secos.",
  tutorial: "Formato passo-a-passo claro. Hook = promessa de resultado. Cada cena entrega 1 passo. Encerramento com recap.",
  storytelling: "Arco narrativo: situação inicial → conflito → virada → desfecho. Tom humano, pausado, emocional.",
  depoimento: "Tom de prova social. Resultado concreto na 1ª frase, depois contexto. Linguagem natural, sem script engessado.",
  polemico: "Posição forte e contraintuitiva no hook. Defesa em 2-3 argumentos. Não atacar pessoas — atacar a ideia.",
};

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

    const body = (await req.json().catch(() => ({}))) as {
      duration?: number; style?: string; theme?: string; cta?: string; base_caption?: string;
    };
    const duration = [5, 15, 30, 60].includes(Number(body.duration)) ? Number(body.duration) : 15;
    const style = STYLE_DIR[body.style ?? "hook_viral"] ? (body.style as string) : "hook_viral";
    const theme = (body.theme ?? "").trim();
    const cta = (body.cta ?? "Link na bio").trim();
    const baseCaption = (body.base_caption ?? "").trim();

    const [{ data: branding }, { data: briefing }, { data: brand }] = await Promise.all([
      admin.from("company_branding").select("company_name,agent_name").eq("user_id", userId).maybeSingle(),
      admin.from("mavi_briefing").select("value_props,icp,pain_points").eq("user_id", userId).maybeSingle(),
      admin.from("social_brand_profile").select("tone_of_voice,visual_dna,palette").eq("user_id", userId).maybeSingle(),
    ]);

    const company = branding?.company_name ?? "nossa empresa";
    const tone = brand?.tone_of_voice ? `Tom da marca: ${JSON.stringify(brand.tone_of_voice).slice(0,300)}` : "";
    const offer = briefing?.value_props ? `Oferta: ${JSON.stringify(briefing.value_props).slice(0,300)}` : "";
    const pain = briefing?.pain_points ? `Dores ICP: ${JSON.stringify(briefing.pain_points).slice(0,300)}` : "";

    // Quantidade de cenas pela duração
    const scenes = duration <= 5 ? 2 : duration <= 15 ? 4 : duration <= 30 ? 6 : 10;

    const sys = `Você é roteirista sênior de Reels Instagram para "${company}".
Gere um roteiro PRONTO para gravar, em português BR, segundo-a-segundo.
Estilo: ${STYLE_DIR[style]}
Duração total: ${duration} segundos.
Quantidade de cenas: ${scenes}.
${tone}
${offer}
${pain}

REGRAS NÃO-NEGOCIÁVEIS:
- Gancho nos primeiros 1.5s (frase de impacto, sem "oi pessoal", sem auto-apresentação chata).
- Cada cena tem: timestamp, FALA exata pra dizer na câmera (curta, ritmo de fala natural), AÇÃO/B-ROLL (o que mostrar) e TEXTO ON-SCREEN opcional (legenda destacada).
- Sem promessa exagerada, sem clickbait barato, sem clichê motivacional.
- CTA final natural: "${cta}".
- Áudio sugerido: descreva tipo (trending pop / silêncio dramático / batida acelerada).

Devolva JSON ESTRITO:
{
  "hook": "frase do hook em até 8 palavras",
  "scenes": [
    {"t": "0-2s", "fala": "...", "acao": "...", "texto_tela": "..."}
  ],
  "cta_final": "frase final",
  "audio_sugerido": "...",
  "hashtags": "#a #b #c",
  "duracao_total_s": ${duration},
  "dicas_gravacao": ["...","..."]
}`;

    const userMsg = `Tema: ${theme || "(usar dor do ICP mais forte)"}
${baseCaption ? `Legenda base já escrita: """${baseCaption.slice(0,500)}"""` : ""}`;

    let aiContent = "";
    try {
      aiContent = await generateAIContent(admin, userId, { system: sys, user: userMsg, json: true });
    } catch (e) {
      return resp({ error: `AI: ${String((e as Error)?.message ?? e).slice(0,300)}` }, 502);
    }
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(aiContent || "{}");
    } catch {
      return resp({ error: "Falha ao parsear roteiro" }, 502);
    }
    if (!Array.isArray(parsed.scenes)) return resp({ error: "IA não retornou cenas" }, 502);
    return resp({ success: true, script: parsed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return resp({ error: msg.slice(0, 400) }, 500);
  }
});
