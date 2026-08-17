import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Extract first valid Brazilian mobile WhatsApp from text.
// Accepts patterns like (11) 91234-5678, 11912345678, +55 11 91234-5678
function extractBrWhatsapp(text: string): string | null {
  if (!text) return null;
  const cleaned = text.replace(/[^\d+()\s\-.]/g, " ");
  // Match candidates with optional country code, DDD, and 9-digit mobile
  const regex = /(?:\+?55[\s\-.]?)?\(?(\d{2})\)?[\s\-.]?9[\s\-.]?(\d{4})[\s\-.]?(\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(cleaned)) !== null) {
    const ddd = m[1];
    const part1 = m[2];
    const part2 = m[3];
    // Validate DDD (11-99) — basic sanity check
    const dddNum = parseInt(ddd, 10);
    if (dddNum < 11 || dddNum > 99) continue;
    return `55${ddd}9${part1}${part2}`;
  }
  return null;
}

function extractEmail(text: string): string | null {
  if (!text) return null;
  const m = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

async function googleSearchApify(query: string, apiKey: string): Promise<any[]> {
  console.log(`Apify Google Search: "${query}"`);

  const runResponse = await fetch(
    `https://api.apify.com/v2/acts/apify~google-search-scraper/runs?token=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queries: query,
        maxPagesPerQuery: 1,
        resultsPerPage: 10,
        languageCode: "pt-BR",
        countryCode: "br",
      }),
    }
  );

  if (!runResponse.ok) {
    console.error(`Apify run error: ${runResponse.status}`);
    return [];
  }

  const runData = await runResponse.json();
  const runId = runData.data?.id;
  if (!runId) return [];

  let status = "RUNNING";
  let attempts = 0;
  while ((status === "RUNNING" || status === "READY") && attempts < 18) {
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
    return [];
  }

  const datasetRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}`
  );
  return await datasetRes.json();
}

function flattenSearchText(items: any[]): string {
  const parts: string[] = [];
  for (const item of items) {
    const organic = item.organicResults || [];
    for (const r of organic) {
      parts.push(r.title || "");
      parts.push(r.description || "");
      parts.push(r.url || "");
    }
  }
  return parts.join(" \n ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: apifyKeyRow } = await supabase
      .from("user_api_keys")
      .select("api_key")
      .eq("user_id", userId)
      .eq("provider", "apify")
      .maybeSingle();
    const apiKey = apifyKeyRow?.api_key || Deno.env.get("APIFY_API_KEY");
    if (!apiKey) throw new Error("Chave Apify não configurada. Cadastre em Configurações → APIs (provider: Apify).");

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body?.limit) || 5, 10);
    const onlyWithoutPhone = body?.onlyWithoutPhone !== false; // default true
    const ids: string[] | undefined = Array.isArray(body?.ids) ? body.ids : undefined;

    // Pick targets
    let query = supabase
      .from("linkedin_contacts")
      .select("id, nome, empresa, telefone, email")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (ids && ids.length > 0) {
      query = supabase
        .from("linkedin_contacts")
        .select("id, nome, empresa, telefone, email")
        .eq("user_id", userId)
        .in("id", ids);
    } else if (onlyWithoutPhone) {
      query = query.is("telefone", null);
    }

    const { data: contacts, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    const targets = contacts || [];

    // Run enrichment in the background to avoid 150s edge timeout.
    const work = async () => {
      let processed = 0;
      let foundPhone = 0;
      let foundEmail = 0;
      for (const c of targets) {
      processed++;
      const nome = (c.nome || "").trim();
      const empresa = (c.empresa || "").trim();
      if (!nome) continue;

      const queries: string[] = [];
      if (empresa) {
        queries.push(`"${nome}" "${empresa}" whatsapp OR contato OR telefone`);
        queries.push(`"${nome}" "${empresa}" email OR "fale conosco"`);
        queries.push(`"${nome}" "${empresa}" celular OR "(11)" OR "+55"`);
        // Fallback: company-level contact (often the best we'll get for C-level)
        queries.push(`"${empresa}" whatsapp OR "fale conosco" contato site:.br`);
      } else {
        queries.push(`"${nome}" whatsapp OR contato`);
        queries.push(`"${nome}" email contato`);
      }

      let phone: string | null = c.telefone || null;
      let email: string | null = c.email || null;

      for (const q of queries) {
        if (phone && email) break;
        try {
          const items = await googleSearchApify(q, apiKey);
          const text = flattenSearchText(items);
          if (!phone) phone = extractBrWhatsapp(text);
          if (!email) email = extractEmail(text);
        } catch (e) {
          console.error("search err", e);
        }
      }

      const update: Record<string, any> = {};
      if (phone && phone !== c.telefone) {
        update.telefone = phone;
        foundPhone++;
      }
      if (email && email !== c.email) {
        update.email = email;
        foundEmail++;
      }

      if (Object.keys(update).length > 0) {
        await supabase.from("linkedin_contacts").update(update).eq("id", c.id);
      }
    }
      console.log(`Enrichment done: processed=${processed} phones=${foundPhone} emails=${foundEmail}`);
    };

    // @ts-ignore - EdgeRuntime is available at runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(work());
    } else {
      work();
    }

    return new Response(
      JSON.stringify({
        success: true,
        queued: targets.length,
        message: "Enriquecimento iniciado em segundo plano. Os contatos serão atualizados em alguns minutos.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("linkedin-contact-enrich error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});