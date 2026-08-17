import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveApifyKey } from "../_shared/apify-key.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const _userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const _token = authHeader.replace("Bearer ", "");
    const { data: _claimsData } = await _userClient.auth.getClaims(_token);
    const userId = (_claimsData?.claims?.sub) as string | undefined;
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // === END MULTI-TENANT AUTH ===
    const _admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // Chave Apify do painel (própria → toggle admin → admin); global só como último recurso.
    const APIFY_API_KEY = (await resolveApifyKey(_admin, userId)) || Deno.env.get("APIFY_API_KEY");
    if (!APIFY_API_KEY) {
      console.error("APIFY key not configured for user");
      return new Response(
        JSON.stringify({ success: false, error: "Apify não configurado neste painel. Cadastre a chave em Configurações → APIs ou peça ao admin para compartilhar." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { searchQuery, location, source, maxResults = 20 } = await req.json();

    if (!searchQuery) {
      return new Response(
        JSON.stringify({ success: false, error: "Termo de busca é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!source || !["catho", "infojobs"].includes(source)) {
      return new Response(
        JSON.stringify({ success: false, error: "Fonte inválida. Use 'catho' ou 'infojobs'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting ${source} scrape: "${searchQuery}" in "${location || 'Brasil'}"`);

    // Configure actor based on source
    // Using Google Search to find company profiles on job boards
    const searchUrl = source === "catho" 
      ? `site:catho.com.br/vagas-emprego ${searchQuery} ${location || "Brasil"}`
      : `site:infojobs.com.br/vagas-de ${searchQuery} ${location || "Brasil"}`;

    const actorInput = {
      queries: searchUrl,
      maxPagesPerQuery: Math.ceil(maxResults / 10),
      resultsPerPage: 10,
      mobileResults: false,
      languageCode: "pt-BR",
      countryCode: "br",
    };

    console.log("Actor input:", JSON.stringify(actorInput));

    // Start the Apify actor run - using Google Search Results Scraper
    const runResponse = await fetch(
      `https://api.apify.com/v2/acts/apify~google-search-scraper/runs?token=${APIFY_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(actorInput),
      }
    );

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error("Apify run start error:", errorText);
      
      if (runResponse.status === 402) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Créditos Apify insuficientes. Por favor, adicione créditos na sua conta Apify.",
            details: "A conta Apify não possui saldo suficiente para executar esta busca."
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 402 }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: `Erro ao iniciar Apify: ${runResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const runData = await runResponse.json();
    const runId = runData.data.id;
    console.log(`Apify run started with ID: ${runId}`);

    // Poll for results (max 3 minutes)
    let results = null;
    const maxAttempts = 36;
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const statusResponse = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_KEY}`
      );
      const statusData = await statusResponse.json();
      
      console.log(`Run status: ${statusData.data.status}`);

      if (statusData.data.status === "SUCCEEDED") {
        const datasetId = statusData.data.defaultDatasetId;
        const resultsResponse = await fetch(
          `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_KEY}`
        );
        results = await resultsResponse.json();
        break;
      } else if (statusData.data.status === "FAILED" || statusData.data.status === "ABORTED") {
        console.error("Apify run failed:", statusData.data.status);
        return new Response(
          JSON.stringify({ success: false, error: "A busca falhou no Apify" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      attempts++;
    }

    if (!results) {
      return new Response(
        JSON.stringify({ success: false, error: "Timeout aguardando resultados do Apify" }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Got ${results.length} search results from Apify`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Process and save companies
    let savedCount = 0;
    const errors: string[] = [];
    const processedUrls = new Set<string>();

    for (const searchResult of results) {
      // Extract organic results
      const organicResults = searchResult.organicResults || [];
      
      for (const item of organicResults) {
        const url = item.url || item.link;
        
        // Skip if already processed
        if (!url || processedUrls.has(url)) continue;
        processedUrls.add(url);

        // Extract company name from title
        const title = item.title || "";
        const description = item.description || item.snippet || "";
        
        // Try to extract company name
        let nomeEmpresa = "";
        
        if (source === "catho") {
          // Catho format: "Vagas de Emprego em [Empresa] | Catho"
          const match = title.match(/Vagas?\s+(?:de\s+)?(?:Emprego\s+)?(?:em|na|no)\s+(.+?)(?:\s*[\|\-]|$)/i);
          if (match) {
            nomeEmpresa = match[1].trim();
          } else {
            nomeEmpresa = title.replace(/\s*[\|\-]\s*Catho.*$/i, "").trim();
          }
        } else {
          // Infojobs format: "[Cargo] - [Empresa] | InfoJobs"
          const match = title.match(/[\-–]\s*(.+?)(?:\s*[\|\-]|$)/i);
          if (match) {
            nomeEmpresa = match[1].trim();
          } else {
            nomeEmpresa = title.replace(/\s*[\|\-]\s*InfoJobs.*$/i, "").trim();
          }
        }

        // Skip if no company name
        if (!nomeEmpresa || nomeEmpresa.length < 2) continue;

        // Extract location from description
        let localizacao = null;
        const locMatch = description.match(/(?:em|local(?:ização)?:?)\s*([A-Za-zÀ-ÿ\s]+(?:,\s*[A-Z]{2})?)/i);
        if (locMatch) {
          localizacao = locMatch[1].trim();
        }

        const companyData = { user_id: userId,
          nome_empresa: nomeEmpresa.slice(0, 255),
          segmento: searchQuery,
          localizacao: localizacao || location || null,
          descricao: description.slice(0, 500) || null,
          fonte: source,
          url_perfil: url,
          disparo: "Não",
        };

        const { error } = await supabase
          .from("job_board_companies")
          .upsert(companyData, { 
            onConflict: "url_perfil,user_id",
            ignoreDuplicates: true 
          });

        if (error) {
          console.error("Error saving company:", error);
          errors.push(`${companyData.nome_empresa}: ${error.message}`);
        } else {
          savedCount++;
          console.log(`Saved company: ${companyData.nome_empresa}`);
        }

        // Limit to maxResults
        if (savedCount >= maxResults) break;
      }

      if (savedCount >= maxResults) break;
    }

    console.log(`Saved ${savedCount} companies to database`);

    return new Response(
      JSON.stringify({
        success: true,
        total: processedUrls.size,
        saved: savedCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in jobboard-scrape:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
