// Meta Instagram — Insights (puxa métricas reais por post + perfil)
// Usa o token salvo em meta_instagram_accounts (page_token ou long_lived).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const GRAPH = "https://graph.instagram.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);
    const authClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await authClient.auth.getClaims(auth.replace("Bearer ", ""));
    const userId = (claims?.claims?.sub as string | undefined) ?? null;
    if (!userId) return json({ ok: false, error: "unauthorized" }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: acc } = await sb
      .from("meta_instagram_accounts")
      .select("ig_user_id, access_token, token_type, username")
      .eq("user_id", userId)
      .maybeSingle();
    if (!acc) return json({ ok: false, error: "no_meta_account", hint: "Conecte o Instagram via Meta primeiro" }, 400);

    const token = acc.access_token;
    const igId = acc.ig_user_id;

    // Perfil
    const profRes = await fetch(`${GRAPH}/me?fields=username,followers_count,follows_count,media_count,profile_picture_url,biography&access_token=${encodeURIComponent(token)}`);
    const profile = await profRes.json().catch(() => ({}));

    // Insights de perfil (28d)
    const profInsightsRes = await fetch(`${GRAPH}/me/insights?metric=reach,profile_views,accounts_engaged&period=days_28&metric_type=total_value&access_token=${encodeURIComponent(token)}`);
    const profInsights = await profInsightsRes.json().catch(() => ({}));

    // Últimas mídias + insights por post
    const mediaRes = await fetch(`${GRAPH}/me/media?fields=id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count&limit=12&access_token=${encodeURIComponent(token)}`);
    const mediaJson = await mediaRes.json().catch(() => ({}));
    const media: Array<Record<string, unknown>> = mediaJson?.data ?? [];

    const enriched = [] as Array<Record<string, unknown>>;
    for (const m of media.slice(0, 12)) {
      const id = m.id as string;
      const type = String(m.media_type ?? "IMAGE");
      // métricas dependem do tipo
      const metricList = type === "VIDEO" || type === "REELS"
        ? "reach,saved,shares,total_interactions,views"
        : "reach,saved,shares,total_interactions";
      try {
        const ir = await fetch(`${GRAPH}/${id}/insights?metric=${metricList}&access_token=${encodeURIComponent(token)}`);
        const ij = await ir.json().catch(() => ({}));
        const metrics: Record<string, number> = {};
        for (const item of (ij?.data ?? []) as Array<{ name: string; values?: Array<{ value: number }> }>) {
          metrics[item.name] = Number(item.values?.[0]?.value ?? 0);
        }
        enriched.push({ ...m, insights: metrics });
      } catch (_) {
        enriched.push({ ...m, insights: null });
      }
    }

    const insightsPayload = {
      fetched_at: new Date().toISOString(),
      profile: {
        username: profile?.username ?? acc.username,
        followers: Number(profile?.followers_count ?? 0),
        following: Number(profile?.follows_count ?? 0),
        media_count: Number(profile?.media_count ?? 0),
      },
      profile_insights_28d: profInsights?.data ?? null,
      posts: enriched,
    };

    await sb
      .from("social_brand_profile")
      .update({ insights: insightsPayload, insights_updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    return json({ ok: true, insights: insightsPayload });
  } catch (e) {
    console.error("[meta-ig-insights] fatal", e);
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
