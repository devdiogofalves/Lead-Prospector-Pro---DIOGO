import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { license_key, device_id, device_info } = await req.json();
    if (!license_key || !device_id) {
      return new Response(JSON.stringify({ valid: false, error: "license_key e device_id obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lic, error } = await supabase
      .from("extension_licenses")
      .select("*")
      .eq("license_key", license_key)
      .maybeSingle();

    if (error || !lic) {
      return new Response(JSON.stringify({ valid: false, error: "Chave não encontrada" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!lic.active) {
      return new Response(JSON.stringify({ valid: false, error: "Chave revogada" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Device lock: se ainda não tem device, registra; se já tem, deve bater
    if (lic.device_id && lic.device_id !== device_id) {
      return new Response(JSON.stringify({ valid: false, error: "Chave já vinculada a outro dispositivo" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updates: any = {
      last_used_at: new Date().toISOString(),
      usage_count: (lic.usage_count ?? 0) + 1,
    };
    if (!lic.device_id) {
      updates.device_id = device_id;
      updates.device_info = device_info ?? null;
      updates.activated_at = new Date().toISOString();
    }
    await supabase.from("extension_licenses").update(updates).eq("id", lic.id);

    return new Response(JSON.stringify({
      valid: true,
      user_id: lic.user_id,
      license_id: lic.id,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ valid: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});