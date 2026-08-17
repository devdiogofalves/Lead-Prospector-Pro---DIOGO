// P0 item 6: valida chave de IA de verdade contra o provider antes de salvar.
// Chama endpoints leves (list models) — se retornar 200, chave é válida.
// Nunca fazemos fallback silencioso: erro real do provider volta pro front.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ALLOWED = new Set(["openai", "gemini", "elevenlabs", "apify", "unipile", "dados4u"]);

async function testKey(provider: string, apiKey: string): Promise<{ valid: boolean; error?: string; detail?: string }> {
  const key = apiKey.trim();
  if (!key) return { valid: false, error: "empty_key" };
  try {
    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(8000),
      });
      if (r.status === 401) return { valid: false, error: "invalid_key", detail: "Chave rejeitada pela OpenAI (401)." };
      if (r.status === 429) return { valid: false, error: "quota_or_rate_limit", detail: "Cota esgotada ou rate limit (429)." };
      if (!r.ok) return { valid: false, error: `http_${r.status}`, detail: (await r.text()).slice(0, 200) };
      return { valid: true };
    }
    if (provider === "gemini") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (r.status === 400 || r.status === 403) return { valid: false, error: "invalid_key", detail: "Chave rejeitada pelo Google Gemini." };
      if (r.status === 429) return { valid: false, error: "quota_or_rate_limit", detail: "Cota esgotada (429)." };
      if (!r.ok) return { valid: false, error: `http_${r.status}`, detail: (await r.text()).slice(0, 200) };
      return { valid: true };
    }
    if (provider === "elevenlabs") {
      const r = await fetch("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": key },
        signal: AbortSignal.timeout(8000),
      });
      if (r.status === 401) return { valid: false, error: "invalid_key", detail: "Chave rejeitada pelo ElevenLabs (401)." };
      if (!r.ok) return { valid: false, error: `http_${r.status}`, detail: (await r.text()).slice(0, 200) };
      return { valid: true };
    }
    if (provider === "apify") {
      const r = await fetch(`https://api.apify.com/v2/users/me?token=${encodeURIComponent(key)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (r.status === 401) return { valid: false, error: "invalid_key", detail: "Token rejeitado pelo Apify." };
      if (!r.ok) return { valid: false, error: `http_${r.status}`, detail: (await r.text()).slice(0, 200) };
      return { valid: true };
    }
    if (provider === "unipile") {
      // Unipile precisa do DSN; sem ele não dá pra validar. Só valida formato.
      if (key.length < 20) return { valid: false, error: "invalid_format", detail: "Chave Unipile parece curta demais." };
      return { valid: true, detail: "Formato aceito (Unipile só valida em uso real)." };
    }
    if (provider === "dados4u") {
      if (key.length < 10) return { valid: false, error: "invalid_format" };
      return { valid: true, detail: "Formato aceito." };
    }
    return { valid: false, error: "provider_not_supported" };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (/timeout/i.test(msg)) return { valid: false, error: "timeout", detail: "Provider não respondeu em 8s." };
    return { valid: false, error: "network_error", detail: msg.slice(0, 200) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const provider = String(body?.provider ?? "").toLowerCase().trim();
    const apiKey = String(body?.api_key ?? "");
    if (!ALLOWED.has(provider)) {
      return new Response(JSON.stringify({ valid: false, error: "unknown_provider" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const result = await testKey(provider, apiKey);
    return new Response(JSON.stringify({ ...result, provider, tested_at: new Date().toISOString() }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ valid: false, error: "server_error", detail: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
