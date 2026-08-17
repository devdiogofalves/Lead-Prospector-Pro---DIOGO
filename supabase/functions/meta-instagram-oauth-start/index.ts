// redeploy 2026-07-13 scopes-review-only
// redeploy 2026-07-12a oauth-state signed
// redeploy 2026-07-10g instagram login
// Meta Instagram OAuth — START (Método B: Instagram API with Instagram Login)
// O cliente loga DIRETO com a conta do Instagram (instagram.com), SEM precisar de
// Página do Facebook nem conta Facebook. Um único app da plataforma; o cliente só
// autoriza. Requer que o app tenha o produto "Instagram" (Instagram login) e, para
// assinantes reais, Advanced Access aprovado em App Review.
//
// Env necessárias (do produto Instagram do app — NÃO são o FB App ID/Secret):
//   META_INSTAGRAM_APP_ID     (fallback: META_IG_APP_ID)
//   (secret usado no callback) META_INSTAGRAM_APP_SECRET (fallback: META_IG_APP_SECRET)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
import { createClient } from "npm:@supabase/supabase-js@2";
import { createOAuthState } from "../_shared/oauth-state.ts";

const IG_APP_ID = Deno.env.get("META_INSTAGRAM_APP_ID") ?? Deno.env.get("META_IG_APP_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const OAUTH_STATE_SECRET = Deno.env.get("OAUTH_STATE_SECRET") ?? "";

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/meta-instagram-oauth-callback`;

// Scopes do Instagram Login (Business). Login direto no Instagram, sem FB Page.
const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  // Publicar posts/stories/reels via Content Publishing (App Review publicado:
  // caso de uso "Gerenciar mensagens e conteúdo no Instagram"). Necessário para
  // a publicação via Meta em social-publish.
  "instagram_business_content_publish",
].join(",");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const sb = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: claims, error: claimsErr } = await sb.auth.getClaims(auth.replace("Bearer ", ""));
    if (claimsErr || !claims?.claims?.sub) return json({ error: "unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    // Signed, short-lived state prevents CSRF and cross-tenant account linking.
    const state = await createOAuthState({ u: userId, n: crypto.randomUUID(), t: Date.now() }, OAUTH_STATE_SECRET);

    // Instagram Business Login (não é o dialog do Facebook).
    const authUrl = new URL("https://www.instagram.com/oauth/authorize");
    authUrl.searchParams.set("client_id", IG_APP_ID);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("state", state);

    return json({ url: authUrl.toString(), redirect_uri: REDIRECT_URI, method: "instagram_login" });
  } catch (e) {
    console.error("[meta-ig-oauth-start] error", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
