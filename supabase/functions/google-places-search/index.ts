import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PlaceResult {
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  primaryTypeDisplayName?: { text: string };
  googleMapsUri?: string;
}

function cleanPhoneNumber(phone: string | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned || cleaned.length < 4) return null;
  let result = cleaned;
  if (result.startsWith("+")) {
    result = result.replace("+", "");
  }
  if (!result.startsWith("55")) {
    result = "55" + result;
  }
  // Aceita celular (13 dígitos: 55+DDD+9+8) OU fixo (12 dígitos: 55+DDD+8).
  // Indústria/B2B grande porte normalmente só tem PABX fixo no Maps.
  if (result.length !== 12 && result.length !== 13) return null;
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: pegar user_id do JWT OU do query param quando service role (Fase L)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Fase L: aceita service role (auto-prospect cron) com user_id no query param.
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
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const token = authHeader.replace("Bearer ", "");
      const { data: claims } = await userClient.auth.getClaims(token);
      userId = claims?.claims?.sub;
      if (!userId) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { searchQuery, location, maxResults = 20, webhookUrl } = await req.json();

    if (!searchQuery) {
      return new Response(
        JSON.stringify({ success: false, error: "searchQuery é obrigatório" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Prefer user's own key from user_api_keys, fallback to global env
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: keyRow } = await adminClient
      .from("user_api_keys")
      .select("api_key")
      .eq("user_id", userId)
      .eq("provider", "google_places")
      .maybeSingle();
    const userKey = typeof keyRow?.api_key === "string" ? keyRow.api_key.trim() : "";
    const envKey = (Deno.env.get("GOOGLE_PLACES_API_KEY") || "").trim();
    const apiKey = userKey || envKey;
    console.log(`Using Google Places key source: ${userKey ? "user_api_keys" : "env"}`);
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "API Key do Google Places não configurada. Salve em Configurações → APIs." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    console.log(`Starting Google Places search: "${searchQuery}" in "${location || 'Brasil'}"`);

    const textQuery = location ? `${searchQuery} em ${location}` : `${searchQuery} no Brasil`;

    const searchResponse = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.googleMapsUri",
        },
        body: JSON.stringify({
          textQuery,
          languageCode: "pt-BR",
          maxResultCount: Math.min(maxResults, 20),
        }),
      }
    );

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error("Google Places API error:", errorText);
      let userMessage = `Erro na API do Google: ${searchResponse.status}`;
      if (searchResponse.status === 403) {
        userMessage = userKey
          ? "Sua chave Google Places retornou 403. Verifique no Google Cloud Console se a 'Places API (New)' está habilitada e se a chave não tem restrições bloqueando este uso."
          : "Chave Google Places global sem permissão (403). Salve sua própria chave em Configurações → APIs com a 'Places API (New)' habilitada.";
      }
      return new Response(
        JSON.stringify({ success: false, error: userMessage }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const searchData = await searchResponse.json();
    const places: PlaceResult[] = searchData.places || [];
    console.log(`Found ${places.length} places from Google API`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let savedCount = 0;
    const errors: string[] = [];
    const savedLeads: Record<string, unknown>[] = [];

    for (const place of places) {
      const phone = cleanPhoneNumber(place.nationalPhoneNumber || place.internationalPhoneNumber);
      
      if (!phone) {
        console.log(`Skipping "${place.displayName?.text}" - no phone number`);
        continue;
      }

      const leadData = {
        user_id: userId,
        nome_empresa: place.displayName?.text || "Sem nome",
        telefone: phone,
        endereco: place.formattedAddress || null,
        site: place.websiteUri || place.googleMapsUri || null,
        rating: place.rating || null,
        reviews: place.userRatingCount || 0,
        especialidades: place.primaryTypeDisplayName?.text || searchQuery,
        disparo: "Não",
      };

      const { error } = await supabase
        .from("leads")
        .upsert(leadData, { onConflict: "telefone,user_id" });

      if (error) {
        console.error(`Error saving lead "${place.displayName?.text}":`, error.message);
        errors.push(`${place.displayName?.text}: ${error.message}`);
      } else {
        savedCount++;
        savedLeads.push(leadData);
        console.log(`Saved: ${place.displayName?.text} - ${phone}`);
      }
    }

    // Forward to webhook if provided - map to Google Sheets columns
    if (webhookUrl && savedLeads.length > 0) {
      try {
        const sheetsPayload = savedLeads.map((lead) => ({
          nome_empresa: lead.nome_empresa || "",
          telefone: lead.telefone || "",
          endereco: lead.endereco || "",
          website: lead.site || "",
          rating: lead.rating || "",
          reviews: lead.reviews || "",
          especialidades: lead.especialidades || "",
          mensagem: "",
          disparo: "Não",
          follow1: "",
          follow2: "",
          follow3: "",
          respondeu: "",
          datamsg: "",
        }));
        const webhookResponse = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: sheetsPayload }),
        });
        console.log(`Webhook response: ${webhookResponse.status}`);
      } catch (webhookError) {
        console.error("Error forwarding to webhook:", webhookError);
      }
    }

    console.log(`Search completed: ${savedCount} saved of ${places.length} found`);

    // O briefing do tenant aprende com cada busca manual: registra nicho/região.
    try {
      const { data: brief } = await supabase
        .from("mavi_briefing")
        .select("id, segmentos_alvo, learned_patterns")
        .eq("user_id", userId)
        .maybeSingle();

      const niche = String(searchQuery).trim().toLowerCase();
      const region = String(location || "").trim();
      const prevSeg: string[] = Array.isArray(brief?.segmentos_alvo) ? brief!.segmentos_alvo : [];
      const segmentos_alvo = Array.from(new Set([niche, ...prevSeg].filter(Boolean))).slice(0, 30);

      const lp: Record<string, unknown> = (brief?.learned_patterns as any) ?? {};
      const prevSearches: any[] = Array.isArray((lp as any).manual_searches) ? (lp as any).manual_searches : [];
      const newEntry = {
        source: "google_maps",
        query: searchQuery,
        location: region || null,
        found: places.length,
        saved: savedCount,
        at: new Date().toISOString(),
      };
      const manual_searches = [newEntry, ...prevSearches].slice(0, 50);

      const regionCounts: Record<string, number> = (lp as any).top_regioes_maps ?? {};
      if (region) regionCounts[region] = (regionCounts[region] ?? 0) + 1;
      const nicheCounts: Record<string, number> = (lp as any).top_nichos_maps ?? {};
      if (niche) nicheCounts[niche] = (nicheCounts[niche] ?? 0) + 1;

      const learned_patterns = {
        ...lp,
        manual_searches,
        top_regioes_maps: regionCounts,
        top_nichos_maps: nicheCounts,
        last_manual_search_at: newEntry.at,
      };

      if (brief?.id) {
        await supabase.from("mavi_briefing").update({
          segmentos_alvo,
          learned_patterns,
          last_learned_at: new Date().toISOString(),
        }).eq("id", brief.id);
      } else {
        await supabase.from("mavi_briefing").insert({
          user_id: userId,
          segmentos_alvo,
          learned_patterns,
          last_learned_at: new Date().toISOString(),
        });
      }
      console.log(`Briefing do tenant atualizado: nicho="${niche}" região="${region}"`);
    } catch (learnErr) {
      console.warn("Falha ao registrar aprendizado no briefing:", learnErr instanceof Error ? learnErr.message : learnErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: places.length,
        saved: savedCount,
        leads: savedLeads,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Edge function error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
