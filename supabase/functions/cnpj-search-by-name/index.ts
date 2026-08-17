import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveApifyKey } from "../_shared/apify-key.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractCNPJFromText(text: string): string | null {
  // Match CNPJ patterns: XX.XXX.XXX/XXXX-XX or 14 consecutive digits
  const formatted = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  if (formatted) {
    return formatted[0].replace(/\D/g, "");
  }
  const raw = text.match(/\b\d{14}\b/);
  if (raw) return raw[0];
  return null;
}

async function searchCNPJViaApify(
  companyName: string,
  location: string,
  apiKey: string
): Promise<string | null> {
  const query = `"${companyName}" CNPJ ${location}`;
  console.log(`Apify Google Search: "${query}"`);

  // Start the Google Search Scraper actor
  const runResponse = await fetch(
    `https://api.apify.com/v2/acts/apify~google-search-scraper/runs?token=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queries: query,
        maxPagesPerQuery: 1,
        resultsPerPage: 5,
        languageCode: "pt-BR",
        countryCode: "br",
      }),
    }
  );

  if (!runResponse.ok) {
    console.error(`Apify run error: ${runResponse.status}`);
    return null;
  }

  const runData = await runResponse.json();
  const runId = runData.data?.id;
  if (!runId) return null;

  // Poll for completion (max ~35s to stay under 150s edge timeout)
  let status = "RUNNING";
  let attempts = 0;
  while (status === "RUNNING" && attempts < 7) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`
    );
    const statusData = await statusRes.json();
    status = statusData.data?.status || "FAILED";
    attempts++;
  }

  if (status !== "SUCCEEDED") {
    console.log(`Apify run ${runId} ended with status: ${status}`);
    return null;
  }

  // Get results
  const datasetRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}`
  );
  const items = await datasetRes.json();

  // Search through organic results for CNPJ
  let scanned = 0;
  for (const item of items) {
    const organicResults = item.organicResults || [];
    scanned += organicResults.length;
    for (const result of organicResults) {
      const textsToSearch = [
        result.title || "",
        result.description || "",
        result.url || "",
      ].join(" ");
      const cnpj = extractCNPJFromText(textsToSearch);
      if (cnpj) {
        console.log(`Found CNPJ ${cnpj} in Google result: "${result.title}"`);
        return cnpj;
      }
    }
  }

  // Diagnóstico: quando o actor não retorna nada extraível, loga um sample
  // do shape cru pra detectar mudanças de contrato do actor apify~google-search-scraper.
  try {
    const sample = Array.isArray(items) ? items.slice(0, 1) : items;
    console.log(`[cnpj-search-by-name] no CNPJ extracted for "${companyName}" — scanned=${scanned} items_len=${Array.isArray(items) ? items.length : "n/a"} sample=${JSON.stringify(sample).slice(0, 1500)}`);
  } catch { /* ignore */ }

  return null;
}

// Extract UF (state) from Google Maps address
function extractUF(endereco: string): string {
  if (!endereco) return "";
  const ufMap: Record<string, string> = {
    "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM",
    "bahia": "BA", "ceara": "CE", "distrito federal": "DF", "espirito santo": "ES",
    "goias": "GO", "maranhao": "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
    "minas gerais": "MG", "para": "PA", "paraiba": "PB", "parana": "PR",
    "pernambuco": "PE", "piaui": "PI", "rio de janeiro": "RJ",
    "rio grande do norte": "RN", "rio grande do sul": "RS", "rondonia": "RO",
    "roraima": "RR", "santa catarina": "SC", "sao paulo": "SP",
    "sergipe": "SE", "tocantins": "TO",
  };
  const abbrevMatch = endereco.match(/\b([A-Z]{2})\b/g);
  const validUFs = Object.values(ufMap);
  if (abbrevMatch) {
    const found = abbrevMatch.filter((m) => validUFs.includes(m));
    if (found.length > 0) return found[0];
  }
  const normalized = endereco.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [name, uf] of Object.entries(ufMap)) {
    if (normalized.includes(name)) return uf;
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // === MULTI-TENANT AUTH ===
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Bypass service role (chamado pelo auto-prospect cron) com user_id no query param.
    // Mesmo padrão da Fase L em outras edges.
    const _SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const _isServiceRole = authHeader === `Bearer ${_SERVICE_ROLE}`;
    let userId: string | undefined;
    if (_isServiceRole) {
      const _url = new URL(req.url);
      userId = _url.searchParams.get("user_id") ?? undefined;
      if (!userId) {
        return new Response(JSON.stringify({ success: false, error: "user_id query param obrigatório com service role" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const _userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const _token = authHeader.replace("Bearer ", "");
      const { data: _claimsData } = await _userClient.auth.getClaims(_token);
      userId = (_claimsData?.claims?.sub) as string | undefined;
      if (!userId) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    // === END MULTI-TENANT AUTH ===
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    // Chave Apify: helper resolve chave própria → toggle admin_shared_apis → env
    // (fallback nos 2 nomes). Antes ignorava o toggle admin.
    const apiKey = (await resolveApifyKey(supabase, userId))
      || Deno.env.get("APIFY_API_TOKEN")
      || Deno.env.get("APIFY_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Chave Apify não configurada. Cadastre em Configurações → APIs (provider: Apify)." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Modo DIRECT (Fase H-2): body { companyName, location? } → busca CNPJ de uma empresa
    // específica via Apify Google Search SEM mexer em leads do banco. Retorna { success, cnpj }.
    // Sem isso, a função operava só em leads onde cnpj IS NULL, ignorando o nome passado.
    const body = await req.json().catch(() => ({}));
    const directName: string | undefined = body?.companyName;
    if (directName && typeof directName === "string" && directName.trim()) {
      const directLocation: string = (typeof body?.location === "string" && body.location.trim()) || "Brasil";
      try {
        const cnpj = await searchCNPJViaApify(directName.trim(), directLocation, apiKey);
        return new Response(
          JSON.stringify({
            success: !!cnpj,
            mode: "direct",
            companyName: directName,
            cnpj: cnpj ?? null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e: any) {
        return new Response(
          JSON.stringify({ success: false, mode: "direct", error: e?.message ?? String(e) }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Modo BATCH (legado): processa leads do user onde cnpj IS NULL.

    // Get leads without CNPJ
    const { data: leads, error: fetchError } = await supabase
      .from("leads")
      .select("id, nome_empresa, endereco, telefone")
      .eq("user_id", userId)
      .is("cnpj", null)
      .eq("cnpj_validado", false)
      .order("created_at", { ascending: false })
      .limit(10);

    if (fetchError) throw fetchError;

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ success: true, found: 0, total: 0, message: "Nenhum lead sem CNPJ." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Searching CNPJ for ${leads.length} leads via Apify Google Search`);

    let found = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        const uf = extractUF(lead.endereco || "");
        const locationHint = uf || "Brasil";

        const cnpj = await searchCNPJViaApify(lead.nome_empresa, locationHint, apiKey);

        if (!cnpj || cnpj.length !== 14) {
          console.log(`No CNPJ found for "${lead.nome_empresa}"`);
          continue;
        }

        const { error: updateError } = await supabase
          .from("leads")
          .update({ cnpj })
          .eq("id", lead.id);

        if (updateError) {
          errors.push(`${lead.nome_empresa}: erro ao salvar CNPJ`);
          continue;
        }

        found++;
        console.log(`✓ Found CNPJ ${cnpj} for "${lead.nome_empresa}"`);
      } catch (err) {
        console.error(`Error for "${lead.nome_empresa}":`, err);
        errors.push(`${lead.nome_empresa}: ${err.message}`);
      }
    }

    console.log(`CNPJ search complete: ${found} found of ${leads.length} searched`);

    return new Response(
      JSON.stringify({
        success: true,
        total: leads.length,
        found,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("CNPJ search error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
