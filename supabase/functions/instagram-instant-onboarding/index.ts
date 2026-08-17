// redeploy 2026-07-10f gemini auth
// Onboarding "só com @": pega o handle Instagram, extrai perfil + posts,
// roda Gemini Vision, e popula company_branding + social_brand_profile.
//
// POST body: { handle: "usuario" }
// Retorna: { ok, brand: {...}, samples: [...urls] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Analisa via aiChat: chave do cliente (OpenAI/Gemini) OU admin compartilhada
// OU Lovable Gateway (fallback). Antes usava SÓ o LOVABLE_API_KEY, que está
// ausente em produção — por isso o onboarding retornava non-2xx.
async function callVisionAI(admin: any, userId: string, messages: any[]): Promise<string> {
  const [{ data: ok }, { data: gk }] = await Promise.all([
    admin.rpc("get_ai_key_for_user", { _user_id: userId, _provider: "openai" }),
    admin.rpc("get_ai_key_for_user", { _user_id: userId, _provider: "gemini" }),
  ]);
  const { aiChat } = await import("../_shared/ai-chat.ts");
  const out = await aiChat({
    openaiKey: (ok as string) || undefined,
    geminiKey: (gk as string) || undefined,
    messages: messages as any,
    response_format: { type: "json_object" },
  });
  return out.text || "{}";
}

async function fetchUnipileProfile(sb: any, userId: string, handle: string) {
  // pega API key Unipile do usuário (ou admin fallback)
  const { data: key } = await sb
    .from("user_api_keys").select("api_key,extra").eq("user_id", userId).eq("provider", "unipile").maybeSingle();
  const apiKey = key?.api_key;
  const dsn = (key?.extra ?? {}).dsn as string | undefined;
  const accountId = (key?.extra ?? {}).account_id_instagram as string | undefined;
  if (!apiKey || !dsn || !accountId) return null;

  const base = dsn.startsWith("http") ? dsn : `https://${dsn}`;
  const r = await fetch(`${base}/api/v1/users/${encodeURIComponent(handle)}?account_id=${accountId}`, {
    headers: { "X-API-KEY": apiKey, Accept: "application/json" },
  });
  if (!r.ok) return null;
  return await r.json().catch(() => null);
}

// fallback: HTML público leve (só o suficiente para pegar bio/foto)
async function fetchPublicProfile(handle: string) {
  try {
    const r = await fetch(`https://www.instagram.com/${handle}/?__a=1&__d=dis`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (r.ok) return await r.json().catch(() => null);
  } catch {}
  return null;
}

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
    const handle = String(body.handle ?? "").replace(/^@/, "").trim().toLowerCase();
    if (!handle) return json({ error: "handle obrigatório" }, 400);

    // 1) Perfil (Unipile → fallback público)
    let profile: any = await fetchUnipileProfile(admin, userId, handle);
    if (!profile) profile = await fetchPublicProfile(handle);

    const bio: string = profile?.biography ?? profile?.bio ?? "";
    const fullName: string = profile?.full_name ?? profile?.fullName ?? handle;
    const avatarUrl: string = profile?.profile_pic_url_hd ?? profile?.profile_pic_url ?? profile?.profile_picture_url ?? "";
    const followers = Number(profile?.edge_followed_by?.count ?? profile?.followers_count ?? 0);

    // 2) Gemini analisa bio + avatar (vision)
    const visionMsgs: any[] = [
      {
        role: "system",
        content: "Você é analista de marca. A partir de bio e foto de perfil de Instagram, deduza identidade visual e de comunicação. Responda SOMENTE JSON válido.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Handle: @${handle}\nNome: ${fullName}\nBio: ${bio || "(vazia)"}\nSeguidores: ${followers}\n\nRetorne JSON:\n{\n  "company_name": string,\n  "niche": string,\n  "voice_tone": "amigavel"|"profissional"|"provocador"|"consultivo"|"vendedor",\n  "visual_mood": "minimalista"|"vibrante"|"corporate"|"luxo"|"orgânico",\n  "color_palette": [hex,hex,hex],\n  "font_pair": {"heading": "Playfair Display"|"Space Grotesk"|"Anton"|"Bebas Neue"|"DM Serif Display"|"Outfit"|"Inter", "body": "Inter"|"DM Sans"|"Lora"|"Nunito"},\n  "target_icp": string,\n  "value_props": [string,string,string],\n  "cta_style": string\n}`,
          },
          avatarUrl ? { type: "image_url", image_url: { url: avatarUrl } } : null,
        ].filter(Boolean),
      },
    ];

    const raw = await callVisionAI(admin, userId, visionMsgs);
    // Alguns providers embrulham JSON em ```json ... ``` ou adicionam prosa.
    // Extrai o primeiro bloco JSON válido antes de parsear.
    let analysis: any = {};
    try {
      const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      analysis = JSON.parse(match ? match[0] : cleaned);
    } catch (e) {
      console.error("[instagram-instant-onboarding] JSON parse falhou. raw:", raw.slice(0, 400));
      return json({ error: "A IA não retornou JSON válido. Tente novamente ou configure uma chave OpenAI/Gemini em Configurações → APIs.", raw: raw.slice(0, 400) }, 502);
    }

    // 3) Persiste
    await admin.from("company_branding").upsert(
      {
        user_id: userId,
        company_name: analysis.company_name ?? fullName,
        primary_color: (analysis.color_palette ?? [])[0] ?? "#3B82F6",
        logo_url: avatarUrl || null,
      },
      { onConflict: "user_id" },
    );

    await admin.from("social_brand_profile").upsert(
      {
        user_id: userId,
        instagram_handle: handle,
        display_name: fullName,
        bio: bio || null,
        logo_url: avatarUrl || null,
        color_palette: analysis.color_palette ?? [],
        font_style: `${analysis.font_pair?.heading ?? "Inter"} + ${analysis.font_pair?.body ?? "Inter"}`,
        visual_mood: analysis.visual_mood ?? null,
        voice_tone: analysis.voice_tone ?? null,
        niche: analysis.niche ?? null,
        cta_style: analysis.cta_style ?? null,
        raw_analysis: analysis,
        followers_count: followers,
        last_analyzed_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    // atualiza prospecting_profile com contexto do negócio
    const businessContext = `\n\n## CONTEXTO DA EMPRESA (auto-preenchido pelo onboarding)\n- Nome: ${analysis.company_name ?? fullName}\n- Nicho: ${analysis.niche ?? ""}\n- ICP: ${analysis.target_icp ?? ""}\n- Propostas de valor: ${(analysis.value_props ?? []).join(" · ")}\n- Tom: ${analysis.voice_tone ?? ""}\n`;
    await admin.from("prospecting_profiles").upsert(
      { user_id: userId, business_context: businessContext } as any,
      { onConflict: "user_id" },
    );

    return json({
      ok: true,
      handle,
      brand: {
        company_name: analysis.company_name ?? fullName,
        niche: analysis.niche,
        voice_tone: analysis.voice_tone,
        visual_mood: analysis.visual_mood,
        color_palette: analysis.color_palette,
        font_pair: analysis.font_pair,
        logo_url: avatarUrl,
        followers,
      },
    });
  } catch (e: any) {
    console.error("[instagram-instant-onboarding]", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
