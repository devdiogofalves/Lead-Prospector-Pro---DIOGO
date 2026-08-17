import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveApifyKey } from "../_shared/apify-key.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SearchResult {
  username: string;
  fullName: string | null;
  bio: string | null;
  followers: number | null;
  following: number | null;
  posts: number | null;
  profileUrl: string;
  isPrivate: boolean;
  externalUrl?: string | null;
  isVerified?: boolean;
  isBusiness?: boolean;
  category?: string | null;
  profilePicUrl?: string | null;
  source: "official_scraper" | "profile_url_finder" | "serpapi";
}

// SerpAPI Instagram Profile (direct lookup by @username)
async function searchWithSerpapi(
  serpapiKey: string,
  username: string,
): Promise<SearchResult | null> {
  const handle = username.replace(/^@/, "").trim();
  if (!handle) return null;
  console.log(`[SerpAPI] Fetching profile: @${handle}`);

  const url = `https://serpapi.com/search.json?engine=instagram_profile&instagram_username=${encodeURIComponent(handle)}&api_key=${serpapiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    console.error(`[SerpAPI] ${res.status}: ${txt}`);
    throw new Error(`SerpAPI ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(`SerpAPI: ${data.error}`);

  const p = data.profile_results || data.instagram_profile || data;
  const u = (p.username as string) || handle;
  return {
    username: u,
    fullName: (p.full_name as string) || (p.name as string) || null,
    bio: (p.biography as string) || (p.bio as string) || null,
    followers: (p.followers as number) ?? (p.followers_count as number) ?? null,
    following: (p.following as number) ?? (p.following_count as number) ?? null,
    posts: (p.posts as number) ?? (p.posts_count as number) ?? null,
    profileUrl: `https://instagram.com/${u}`,
    isPrivate: !!(p.is_private ?? p.private),
    externalUrl: (p.external_url as string) || (p.website as string) || null,
    isVerified: !!(p.is_verified ?? p.verified),
    isBusiness: !!(p.is_business_account ?? p.is_business),
    category: (p.category as string) || (p.business_category as string) || null,
    profilePicUrl: (p.profile_pic_url_hd as string) || (p.profile_pic_url as string) || null,
    source: "serpapi" as const,
  };
}

// Strategy 1: Official Apify Instagram Scraper (search by query text)
async function searchWithOfficialScraper(
  apifyToken: string,
  searchQuery: string,
  maxResults: number
): Promise<SearchResult[]> {
  console.log(`[Official Scraper] Searching: "${searchQuery}"`);

  const actorInput = {
    search: searchQuery,
    resultsType: "users",
    resultsLimit: maxResults,
  };

  const runResponse = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${apifyToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(actorInput),
    }
  );

  if (!runResponse.ok) {
    const error = await runResponse.text();
    console.error("[Official Scraper] Failed to start:", error);
    throw new Error(`Failed to start official scraper: ${runResponse.status}`);
  }

  const runData = await runResponse.json();
  const runId = runData.data.id;
  console.log(`[Official Scraper] Run started: ${runId}`);

  // Poll for completion (max 3 minutes)
  const maxWait = 180000;
  const startTime = Date.now();
  let status = "RUNNING";

  while ((status === "RUNNING" || status === "READY") && Date.now() - startTime < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const statusResponse = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`
    );
    const statusData = await statusResponse.json();
    status = statusData.data.status;
    console.log(`[Official Scraper] Status: ${status}`);

    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Official scraper run ${status}`);
    }
  }

  if (status !== "SUCCEEDED") {
    throw new Error("Official scraper timed out");
  }

  const datasetResponse = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apifyToken}`
  );
  const profiles = await datasetResponse.json();
  console.log(`[Official Scraper] Got ${profiles.length} results`);

  return profiles.map((p: Record<string, unknown>) => ({
    username: (p.username as string) || "",
    fullName: (p.fullName as string) || (p.full_name as string) || null,
    bio: (p.biography as string) || (p.bio as string) || null,
    followers: (p.followersCount as number) || (p.followers_count as number) || null,
    following: (p.followingCount as number) || (p.following_count as number) || null,
    posts: (p.postsCount as number) || (p.posts_count as number) || null,
    profileUrl: `https://instagram.com/${(p.username as string) || ""}`,
    isPrivate: (p.isPrivate as boolean) || (p.private as boolean) || false,
    source: "official_scraper" as const,
  }));
}

// Strategy 2: Profile URL Finder (search by firstName + lastName + company)
async function searchWithProfileFinder(
  apifyToken: string,
  firstName: string,
  lastName: string,
  company?: string,
  location?: string
): Promise<SearchResult[]> {
  console.log(`[Profile Finder] Searching: ${firstName} ${lastName} @ ${company || "N/A"}`);

  const actorInput: Record<string, string> = { firstName, lastName };
  if (company) actorInput.company = company;
  if (location) actorInput.location = location;

  const runResponse = await fetch(
    `https://api.apify.com/v2/acts/unlimitedleadtestinbox~instagram-profile-url-finder/runs?token=${apifyToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(actorInput),
    }
  );

  if (!runResponse.ok) {
    const error = await runResponse.text();
    console.error("[Profile Finder] Failed to start:", error);
    throw new Error(`Failed to start profile finder: ${runResponse.status}`);
  }

  const runData = await runResponse.json();
  const runId = runData.data.id;
  console.log(`[Profile Finder] Run started: ${runId}`);

  // Poll for completion (max 2 minutes)
  const maxWait = 120000;
  const startTime = Date.now();
  let status = "RUNNING";

  while ((status === "RUNNING" || status === "READY") && Date.now() - startTime < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const statusResponse = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`
    );
    const statusData = await statusResponse.json();
    status = statusData.data.status;
    console.log(`[Profile Finder] Status: ${status}`);

    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Profile finder run ${status}`);
    }
  }

  if (status !== "SUCCEEDED") {
    throw new Error("Profile finder timed out");
  }

  const datasetResponse = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apifyToken}`
  );
  const results = await datasetResponse.json();
  console.log(`[Profile Finder] Got ${results.length} results`);

  return results
    .filter((r: Record<string, unknown>) => r.instagramProfileUrl)
    .map((r: Record<string, unknown>) => {
      const profileData = (r.profileData as Record<string, unknown>) || {};
      return {
        username: (profileData.username as string) || "",
        fullName: (profileData.name as string) || (r.personName as string) || null,
        bio: (profileData.bio as string) || null,
        followers: (profileData.followers as number) || null,
        following: (profileData.following as number) || null,
        posts: (profileData.posts as number) || null,
        profileUrl: (r.instagramProfileUrl as string) || "",
        isPrivate: (profileData.isPrivate as boolean) || false,
        source: "profile_url_finder" as const,
      };
    });
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
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json();
    const {
      // Strategy selection: "official" | "profile_finder" | "both" | "serpapi_direct" | "serpapi_hydrate"
      strategy = "official",
      searchQuery,
      maxResults = 5,
      firstName,
      lastName,
      company,
      location,
      username, // for serpapi_direct
      saveToDb = true,
    } = body;

    // Resolve chave Apify via helper (a RPC get_apify_key_for_user usa auth.uid()
    // e retorna NULL sob service_role, então nunca ativava chave por tenant).
    const apifyToken = (await resolveApifyKey(admin, userId))
      || Deno.env.get("APIFY_API_TOKEN")
      || Deno.env.get("APIFY_API_KEY");
    const serpapiKey = Deno.env.get("SERPAPI_KEY");

    const needsApify = ["official", "profile_finder", "both", "serpapi_hydrate"].includes(strategy);
    const needsSerpapi = ["serpapi_direct", "serpapi_hydrate"].includes(strategy);

    if (needsApify && !apifyToken) {
      return new Response(
        JSON.stringify({ success: false, error: "APIFY_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (needsSerpapi && !serpapiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "SERPAPI_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    let results: SearchResult[] = [];
    const errors: string[] = [];

    // Strategy: SerpAPI direct (single @username lookup)
    if (strategy === "serpapi_direct") {
      if (!username) {
        return new Response(
          JSON.stringify({ success: false, error: "username obrigatório para serpapi_direct" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const r = await searchWithSerpapi(serpapiKey!, username);
        if (r) results.push(r);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`SerpAPI: ${msg}`);
      }
    }

    // Strategy: Official Scraper (search by text query)
    if (strategy === "official" || strategy === "both") {
      const query = searchQuery || `${firstName || ""} ${lastName || ""} ${company || ""}`.trim();
      if (query) {
        try {
          const officialResults = await searchWithOfficialScraper(apifyToken!, query, maxResults);
          results.push(...officialResults);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error("[Official] Error:", msg);
          errors.push(`Official: ${msg}`);
        }
      }
    }

    // Strategy: Profile URL Finder (search by name + company)
    if (strategy === "profile_finder" || strategy === "both" || strategy === "serpapi_hydrate") {
      if (firstName || lastName) {
        try {
          const finderResults = await searchWithProfileFinder(
            apifyToken!,
            firstName || "",
            lastName || "",
            company,
            location
          );
          results.push(...finderResults);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error("[Profile Finder] Error:", msg);
          errors.push(`Profile Finder: ${msg}`);
        }
      }
    }

    // Hydrate via SerpAPI: substitui cada candidato Apify pelo perfil real do SerpAPI
    if (strategy === "serpapi_hydrate" && results.length > 0) {
      const hydrated: SearchResult[] = [];
      for (const r of results) {
        if (!r.username) continue;
        try {
          const full = await searchWithSerpapi(serpapiKey!, r.username);
          hydrated.push(full ?? r);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          errors.push(`SerpAPI(${r.username}): ${msg}`);
          hydrated.push(r);
        }
      }
      results = hydrated;
    }


    // Deduplicate by username
    const uniqueResults = Array.from(
      new Map(results.filter(r => r.username).map((r) => [r.username, r])).values()
    );

    // Save to database
    let savedCount = 0;
    if (saveToDb && uniqueResults.length > 0) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      for (const result of uniqueResults) {
        const contactData = { user_id: userId,
          username: result.username,
          nome: result.fullName,
          bio: result.bio,
          seguidores: result.followers || 0,
          seguindo: result.following || 0,
          posts: result.posts || 0,
          profile_url: result.profileUrl,
        };

        const { error } = await supabase
          .from("instagram_contacts")
          .upsert(contactData, { onConflict: "user_id,username" });

        if (error) {
          console.error(`Error saving ${result.username}:`, error);
        } else {
          savedCount++;
        }
      }
    }

    console.log(`Search complete: ${uniqueResults.length} found, ${savedCount} saved, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        results: uniqueResults,
        total: uniqueResults.length,
        saved: savedCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in instagram-profile-search:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
