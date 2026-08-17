// social-caption-from-image — gera caption SPIN/rapport a partir de uma imagem.
// Body: { image_url: string, channel: "linkedin"|"instagram", intent?: string }
// Usa visão (Gemini 2.5 Flash) + briefing do usuário (prospecting_profiles + mavi_briefing + company_branding).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { aiChat } from "../_shared/ai-chat.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


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

    const { image_url, channel = "instagram", intent } = await req.json().catch(() => ({}));
    if (!image_url) return resp({ error: "image_url obrigatório" }, 400);

    const [{ data: profile }, { data: briefing }, { data: branding }] = await Promise.all([
      admin.from("prospecting_profiles").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("mavi_briefing").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("company_branding").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    const company = branding?.company_name ?? "nossa empresa";
    const agent = branding?.agent_name ?? "";
    const oferta = (briefing as Record<string, unknown> | null)?.value_props ?? profile?.business_description ?? "";
    const icp = (briefing as Record<string, unknown> | null)?.icp ?? profile?.target_audience ?? "";
    const dores = (briefing as Record<string, unknown> | null)?.pain_points ?? "";

    const sys = `Você é gestor de social media sênior. Escreva caption ${channel === "linkedin" ? "LinkedIn (tom profissional, parágrafos curtos, sem emoji excessivo)" : "Instagram (humano, escaneável, emoji estratégico, gancho forte na 1ª linha)"} para a empresa "${company}". 
Regras: 
- 1ª linha = gancho que pare o scroll
- corpo SPIN-light (problema → implicação → solução leve)
- CTA claro no fim
- ${channel === "linkedin" ? "180-250 palavras" : "80-150 palavras"}
- sem promessas exageradas, sem clickbait barato
- responda em JSON ESTRITO: {"caption":"...","hashtags":"#a #b #c","cta":"..."}`;

    const userMsg = `Oferta: ${typeof oferta === "string" ? oferta : JSON.stringify(oferta).slice(0,500)}
ICP: ${typeof icp === "string" ? icp : JSON.stringify(icp).slice(0,300)}
Dores: ${typeof dores === "string" ? dores : JSON.stringify(dores).slice(0,300)}
${intent ? `Intenção do post: ${intent}` : ""}
Analise a imagem e crie a caption alinhada ao que aparece nela.`;

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
          { role: "system", content: sys },
          { role: "user", content: [
            { type: "text", text: userMsg },
            { type: "image_url", image_url: { url: image_url } },
          ] },
        ],
        response_format: { type: "json_object" },
      });
      aiText = out.text;
    } catch (e) {
      return resp({ error: `AI: ${String((e as Error)?.message ?? e).slice(0, 300)}` }, 502);
    }
    let parsed: { caption?: string; hashtags?: string; cta?: string } = {};
    try {
      parsed = JSON.parse(aiText || "{}");
    } catch {
      return resp({ error: "Falha ao parsear resposta da IA" }, 502);
    }
    return resp({ success: true, ...parsed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return resp({ error: msg.slice(0, 400) }, 500);
  }
});
