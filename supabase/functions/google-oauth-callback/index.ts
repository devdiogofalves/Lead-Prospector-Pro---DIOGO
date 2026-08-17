import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const html = (msg: string, ok = true) => new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Google Calendar</title><style>body{font-family:system-ui;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.box{text-align:center;padding:32px;border:1px solid #222;border-radius:12px;max-width:420px}.ok{color:#4ade80}.err{color:#f87171}</style></head><body><div class="box"><h2 class="${ok?'ok':'err'}">${ok?'✓ Conectado':'✗ Erro'}</h2><p>${msg}</p><p style="opacity:.6;font-size:13px">Você pode fechar esta aba.</p><script>setTimeout(()=>{try{window.close()}catch(e){}},2500)</script></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

  if (error) return html(`Google retornou: ${error}`, false);
  if (!code || !stateRaw) return html("Faltam parâmetros do OAuth", false);

  try {
    // SEGURANÇA: valida HMAC do state — impede que um atacante forje um state
    // com user_id da vítima e vincule tokens Google dele à conta da vítima.
    const state = await verifyState(stateRaw);
    if (!state) return html("State inválido ou adulterado", false);
    const userId = state.user_id;
    if (!userId) return html("State inválido", false);

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
    const redirectUri = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/google-oauth-callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: "authorization_code",
      }),
    });
    const tok = await tokenRes.json();
    if (!tokenRes.ok) return html(`Token error: ${JSON.stringify(tok)}`, false);

    // Obter email
    let email = "";
    try {
      const ui = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      }).then(r => r.json());
      email = ui.email ?? "";
    } catch {}

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const expiresAt = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();
    const { error: dbErr } = await supabase.from("google_calendar_tokens").upsert({
      user_id: userId,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: expiresAt,
      scope: tok.scope,
      email,
    }, { onConflict: "user_id" });

    if (dbErr) return html(`DB error: ${dbErr.message}`, false);
    return html(`Conta ${email || ""} conectada com sucesso ao Google Calendar.`);
  } catch (e: any) {
    return html(e.message, false);
  }
});

async function verifyState(stateRaw: string): Promise<{ user_id: string; returnTo?: string; iat?: number } | null> {
  try {
    const [b64, sigB64] = stateRaw.split(".");
    if (!b64 || !sigB64) return null;
    const secret = Deno.env.get("OAUTH_STATE_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const norm = (s: string) => s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4);
    const sigBytes = Uint8Array.from(atob(norm(sigB64)), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(b64));
    if (!ok) return null;
    const payload = JSON.parse(atob(norm(b64)));
    // 15 min TTL para o state
    if (payload.iat && Date.now() - payload.iat > 15 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}