import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Assina o state com HMAC-SHA256 usando OAUTH_STATE_SECRET.
// Formato: base64url(payload) + "." + base64url(hmac). Callback valida antes de confiar no user_id.
async function signState(payload: Record<string, unknown>): Promise<string> {
  const secret = Deno.env.get("OAUTH_STATE_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const payloadStr = JSON.stringify({ ...payload, iat: Date.now() });
  const b64 = btoa(payloadStr).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(b64)));
  const sigB64 = btoa(String.fromCharCode(...sig)).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64}.${sigB64}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const redirectUri = `${supaUrl}/functions/v1/google-oauth-callback`;

    const { returnTo } = await req.json().catch(() => ({ returnTo: "" }));
    const state = await signState({ user_id: user.id, returnTo: returnTo || "" });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email openid",
      state,
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return new Response(JSON.stringify({ url }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
