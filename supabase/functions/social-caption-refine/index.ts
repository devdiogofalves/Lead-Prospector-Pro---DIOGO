// social-caption-refine — refina/edita uma legenda já existente conforme um tom escolhido.
// Body: { caption: string, tone: "punchier"|"shorter"|"longer"|"emotional"|"professional"|"custom", instructions?: string, channel?: "instagram"|"linkedin" }
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

const TONE_DIRECTIVES: Record<string, string> = {
  punchier: "Deixe mais punchy: gancho impactante na 1ª linha, frases curtas, ritmo, sem encher linguiça.",
  shorter: "Encurte para no máximo 60% do tamanho atual, preservando gancho, ideia central e CTA.",
  longer: "Expanda com mais profundidade: contexto, exemplo concreto e argumento adicional — sem inflar.",
  emotional: "Aumente carga emocional: conexão humana, dor real, alívio. Sem clichê e sem drama barato.",
  professional: "Deixe mais profissional/consultivo (tom LinkedIn sênior), porém ainda escaneável.",
  custom: "Siga as instruções abaixo do usuário com fidelidade, sem ignorar a essência do post.",
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

    const { caption, tone = "punchier", instructions = "", channel = "instagram" } =
      (await req.json().catch(() => ({}))) as { caption?: string; tone?: string; instructions?: string; channel?: string };

    if (!caption || !caption.trim()) return resp({ error: "caption obrigatório" }, 400);
    const directive = TONE_DIRECTIVES[tone] ?? TONE_DIRECTIVES.punchier;

    const [{ data: branding }, { data: briefing }] = await Promise.all([
      admin.from("company_branding").select("company_name,agent_name").eq("user_id", userId).maybeSingle(),
      admin.from("mavi_briefing").select("value_props,icp,pain_points").eq("user_id", userId).maybeSingle(),
    ]);
    const company = branding?.company_name ?? "nossa empresa";

    const sys = `Você é editor sênior de copy para ${channel === "linkedin" ? "LinkedIn" : "Instagram"} da empresa "${company}".
Sua tarefa: REESCREVER a legenda do usuário aplicando a direção pedida — SEM inventar fatos, SEM mudar a oferta, SEM remover CTA existente.
Regras: gancho forte na 1ª linha, linguagem natural humana, parágrafos curtos, ${channel === "linkedin" ? "tom profissional sem emoji excessivo" : "emoji estratégico (não decorativo)"}, sem promessa exagerada, sem clickbait barato.
Devolva JSON ESTRITO: {"caption":"...","hashtags":"#a #b #c (opcional, só se fizer sentido)","notes":"breve explicação do que mudou"}`;

    const briefingTxt = briefing ? `Oferta: ${JSON.stringify(briefing.value_props ?? "").slice(0,300)}\nICP: ${JSON.stringify(briefing.icp ?? "").slice(0,200)}` : "";

    const userMsg = `Direção: ${directive}
${instructions ? `Instruções extras do usuário: ${instructions}` : ""}
${briefingTxt}

LEGENDA ATUAL:
"""
${caption}
"""`;

    let aiContent = "";
    try {
      aiContent = await generateAIContent(admin, userId, { system: sys, user: userMsg, json: true });
    } catch (e) {
      return resp({ error: `AI: ${String((e as Error)?.message ?? e).slice(0,300)}` }, 502);
    }
    let parsed: { caption?: string; hashtags?: string; notes?: string } = {};
    try {
      parsed = JSON.parse(aiContent || "{}");
    } catch {
      return resp({ error: "Falha ao parsear resposta da IA" }, 502);
    }
    if (!parsed.caption) return resp({ error: "IA não retornou caption" }, 502);
    return resp({ success: true, ...parsed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return resp({ error: msg.slice(0, 400) }, 500);
  }
});
