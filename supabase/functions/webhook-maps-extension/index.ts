import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Validação BR mobile: 55 + DDD(2) + 9 + 8 dígitos = 13 dígitos
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (d.length === 12) d = d.slice(0, 4) + "9" + d.slice(4); // insere 9
  if (d.length !== 13) return null;
  if (!d.startsWith("55")) return null;
  if (d[4] !== "9") return null;
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const license_key: string = body.license_key;
    const device_id: string = body.device_id;
    const leads: any[] = Array.isArray(body.leads) ? body.leads : [];

    if (!license_key || !device_id) {
      return new Response(JSON.stringify({ ok: false, error: "license_key e device_id obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lic } = await supabase
      .from("extension_licenses")
      .select("*")
      .eq("license_key", license_key)
      .maybeSingle();

    if (!lic || !lic.active || (lic.device_id && lic.device_id !== device_id)) {
      return new Response(JSON.stringify({ ok: false, error: "Licença inválida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user_id = lic.user_id;
    const rows: any[] = [];
    let skipped = 0;

    for (const l of leads) {
      const tel = normalizePhone(l.telefone || l.phone || l.whatsapp);
      if (!tel) { skipped++; continue; }
      rows.push({
        user_id,
        nome_empresa: l.nome_empresa || l.name || l.title || "Sem nome",
        telefone: tel,
        endereco: l.endereco || l.address || null,
        site: l.site || l.website || null,
        rating: l.rating ?? null,
        reviews: l.reviews ?? l.reviews_count ?? null,
        especialidades: l.categoria || l.category || l.especialidades || null,
      });
    }

    let inserted = 0;
    if (rows.length) {
      const { data, error } = await supabase.from("leads").upsert(rows, {
        onConflict: "telefone,user_id",
        ignoreDuplicates: true,
      }).select("id");
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      inserted = data?.length ?? 0;
    }

    await supabase.from("extension_licenses").update({
      last_used_at: new Date().toISOString(),
      usage_count: (lic.usage_count ?? 0) + 1,
    }).eq("id", lic.id);

    return new Response(JSON.stringify({
      ok: true, received: leads.length, inserted, skipped,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});