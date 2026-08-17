// bio-public — endpoint público (sem JWT) que devolve dados seguros do brand kit
// para renderizar a página /bio/:handle (Linktree white-label).
// Query: ?handle=nucleodaautomacaon8n  (ou ?slug=meu-link)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const resp = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const handle = (url.searchParams.get("handle") ?? "").replace(/^@/, "").trim().toLowerCase();
    const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();
    if (!handle && !slug) return resp({ error: "handle ou slug obrigatório" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let q = admin.from("social_brand_profile").select("*");
    if (slug) q = q.ilike("bio_link_slug", slug);
    else q = q.ilike("instagram_handle", handle);

    const { data: brand } = await q.maybeSingle();
    if (!brand) return resp({ error: "Perfil não encontrado" }, 404);

    const { data: products } = await admin
      .from("social_products")
      .select("id, name, description, link, active")
      .eq("user_id", brand.user_id)
      .eq("active", true)
      .order("created_at", { ascending: false });

    return resp({
      success: true,
      brand: {
        instagram_handle: brand.instagram_handle,
        display_name: brand.display_name,
        bio: brand.bio,
        logo_url: brand.logo_url,
        links: brand.links,
        color_palette: brand.color_palette,
        voice_tone: brand.voice_tone,
        niche: brand.niche,
        verified: brand.verified,
        followers_count: brand.followers_count,
      },
      products: (products ?? []).filter((p) => p.link),
    });
  } catch (e) {
    return resp({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
