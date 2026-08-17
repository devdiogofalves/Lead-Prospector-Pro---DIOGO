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

    console.log(`Starting ${source} job listing scrape: "${searchQuery}" in "${location || 'Brasil'}"`);

    let actorId: string;
    let actorInput: Record<string, unknown>;

    if (source === "catho") {
      // Using easyapi/catho-jobs-scraper actor for detailed job extraction
      actorId = "easyapi~catho-jobs-scraper";
      actorInput = {
        keyword: searchQuery,
        location: location || "",
        maxItems: Math.min(maxResults, 50),
      };
    } else {
      // Using easyapi/infojobs-job-scraper for Infojobs (paid actor)
      // This actor requires searchUrls format
      actorId = "easyapi~infojobs-job-scraper";
      const searchUrl = `https://www.infojobs.net/ofertas-trabajo/${location ? encodeURIComponent(location.toLowerCase().replace(/\s+/g, '-')) : 'espana'}?keyword=${encodeURIComponent(searchQuery)}&page=1&sortBy=RELEVANCE`;
      actorInput = {
        searchUrls: [searchUrl],
        maxItems: Math.min(maxResults, 50),
      };
    }

    console.log(`Using actor: ${actorId}`);
    console.log("Actor input:", JSON.stringify(actorInput));

    // Start the Apify actor run
    const runResponse = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_API_KEY}`,
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

    console.log(`Got ${results.length} results from Apify`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Process and save job listings
    let savedCount = 0;
    const errors: string[] = [];

    // Helper to extract multiple emails from text
    const extractEmails = (text: string): string | null => {
      if (!text) return null;
      const emailMatches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi);
      if (!emailMatches) return null;
      // Filter out common non-contact emails
      const filtered = emailMatches.filter(e => 
        !e.includes('noreply') && 
        !e.includes('no-reply') && 
        !e.includes('example.com')
      );
      return filtered.length > 0 ? filtered[0] : null;
    };

    // Helper to extract phone from text - Brazilian and Spanish formats
    const extractPhone = (text: string): string | null => {
      if (!text) return null;
      // Brazilian phones: +55, (XX) XXXXX-XXXX, XX XXXXX-XXXX
      const brMatch = text.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}/);
      if (brMatch) return brMatch[0].replace(/\D/g, "");
      // Spanish phones: +34, 6XX XXX XXX, 9XX XXX XXX
      const esMatch = text.match(/(?:\+?34\s?)?[679]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}/);
      if (esMatch) return esMatch[0].replace(/\D/g, "");
      return null;
    };

    // Helper to extract website from text
    const extractWebsite = (text: string): string | null => {
      if (!text) return null;
      const urlMatch = text.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})(?:\/[^\s]*)?/gi);
      if (!urlMatch) return null;
      // Filter out job board URLs
      const filtered = urlMatch.filter(u => 
        !u.includes('catho.com') && 
        !u.includes('infojobs') && 
        !u.includes('linkedin') &&
        !u.includes('facebook') &&
        !u.includes('instagram') &&
        !u.includes('twitter')
      );
      return filtered.length > 0 ? filtered[0] : null;
    };

    // Helper to extract company sector/industry
    const extractSector = (text: string): string | null => {
      if (!text) return null;
      const sectors = [
        'tecnologia', 'varejo', 'retail', 'automotivo', 'saúde', 'financeiro',
        'educação', 'alimentício', 'logística', 'construção', 'imobiliário',
        'telecomunicações', 'energia', 'industrial', 'farmacêutico', 'consultoria'
      ];
      const lowerText = text.toLowerCase();
      for (const sector of sectors) {
        if (lowerText.includes(sector)) return sector;
      }
      return null;
    };

    for (const item of results) {
      // Map fields based on source
      let listingData;

      if (source === "catho") {
        // Catho actor response structure - data is nested in job_customized_data
        const jobData = item.job_customized_data || item;
        const titulo = jobData.titulo || item.title || item.jobTitle || "";
        const anunciante = jobData.anunciante || {};
        const contratante = jobData.contratante || {};
        const empresa = anunciante.confidencial ? null : (anunciante.nome || contratante.nome || item.company || null);
        const descricao = jobData.descricao || item.description || "";
        const fullText = `${titulo} ${empresa || ""} ${descricao}`;
        
        // Get location from vagas array
        const vagaInfo = jobData.vagas?.[0] || {};
        const localizacao = vagaInfo.cidade ? `${vagaInfo.cidade}, ${vagaInfo.uf}` : (item.location || location || null);
        
        // Get salary
        const salario = jobData.faixaSalarial || (jobData.salario > 0 ? `R$ ${jobData.salario}` : null);
        
        // Build job URL from job_id
        const jobId = item.job_id || jobData.id;
        const jobUrl = jobId ? `https://www.catho.com.br/vagas/${jobId}` : null;

        // Extract company website from description or anunciante data
        const siteEmpresa = anunciante.site || extractWebsite(fullText);
        const setor = anunciante.segmento || extractSector(fullText);

        listingData = {
          titulo_vaga: titulo.slice(0, 255),
          empresa: empresa,
          email: extractEmails(fullText),
          telefone: extractPhone(fullText),
          localizacao: localizacao,
          salario: salario,
          descricao: descricao.slice(0, 500) || null,
          requisitos: jobData.habilidades?.join(", ") || null,
          fonte: source,
          url_vaga: jobUrl,
          site_empresa: siteEmpresa,
          setor: setor,
          disparo: "Não",
        };
      } else {
        // Infojobs actor response structure - data is nested in offer object
        const offer = item.offer || item;
        const titulo = offer.title || item.title || "";
        const empresa = offer.companyName || item.company || null;
        const descricao = offer.description || item.description || "";
        const fullText = `${titulo} ${empresa || ""} ${descricao}`;
        
        // Extract location from city
        const localizacao = offer.city || item.location || location || null;
        
        // Build full URL
        const jobLink = offer.link || item.url;
        const jobUrl = jobLink ? (jobLink.startsWith('http') ? jobLink : `https:${jobLink}`) : null;

        // Extract company website from description
        const siteEmpresa = offer.companyWebsite || extractWebsite(fullText);
        const setor = offer.industry || extractSector(fullText);

        listingData = {
          titulo_vaga: titulo.slice(0, 255),
          empresa: empresa,
          email: extractEmails(fullText),
          telefone: extractPhone(fullText),
          localizacao: localizacao,
          salario: offer.salary || item.salary || null,
          descricao: descricao.slice(0, 500) || null,
          requisitos: offer.contractType ? `${offer.contractType} | ${offer.workday || ''} | ${offer.teleworking || ''}`.trim() : null,
          fonte: source,
          url_vaga: jobUrl,
          site_empresa: siteEmpresa,
          setor: setor,
          disparo: "Não",
        };
      }

      // Skip if no title
      if (!listingData.titulo_vaga || listingData.titulo_vaga.length < 3) {
        console.log("Skipping item without valid title");
        continue;
      }

      console.log(`Processing: ${listingData.titulo_vaga} at ${listingData.empresa || 'N/A'}, email: ${listingData.email || 'N/A'}, phone: ${listingData.telefone || 'N/A'}`);

      const { error } = await supabase
        .from("job_listings")
        .upsert({ ...listingData, user_id: userId }, { 
          onConflict: "url_vaga,user_id",
          ignoreDuplicates: true 
        });

      if (error) {
        console.error("Error saving listing:", error);
        errors.push(`${listingData.titulo_vaga}: ${error.message}`);
      } else {
        savedCount++;
        console.log(`Saved listing: ${listingData.titulo_vaga}`);
      }

      if (savedCount >= maxResults) break;
    }

    console.log(`Saved ${savedCount} job listings to database`);

    return new Response(
      JSON.stringify({
        success: true,
        total: results.length,
        saved: savedCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in joblisting-scrape:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
