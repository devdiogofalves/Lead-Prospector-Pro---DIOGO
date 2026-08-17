// maps-seed-by-references — sementeira por referências do tenant
//
// Sementeira: pega `segmentos_alvo` do mavi_briefing (Knowledge pack template
// por tenant: construção civil, cimenteiras, têxtil, agro, etc) e cruza com
// `maps_regions` do automation_settings para popular leads via Google Places.
//
// É a "porta de entrada" do funil — em vez do operador digitar nichos
// manualmente, o sistema usa o briefing do tenant pra expandir automaticamente.
//
// Auth: JWT do usuário (necessário porque google-places-search valida claims).
// Body: { regions?: string[], max_per_combination?: number }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const maxPerCombination = Math.min(Number(body?.max_per_combination ?? 5), 20);

    // 1. Carrega briefing do tenant: segmentos-alvo + atividades resolvidas
    const { data: briefing } = await admin.from("mavi_briefing")
      .select("segmentos_alvo, clientes_referencia, clientes_referencia_atividades")
      .eq("user_id", userId).maybeSingle();

    const segmentos = (briefing?.segmentos_alvo ?? []) as string[];
    const atividadesResolvidas = (briefing?.clientes_referencia_atividades ?? []) as string[];

    // Fallback: se briefing vazio, usa maps_niches do automation_settings (form da página)
    let nichesFallback: string[] = [];
    if (!segmentos.length && !atividadesResolvidas.length) {
      const { data: s } = await admin.from("automation_settings")
        .select("maps_niches")
        .eq("user_id", userId).maybeSingle();
      nichesFallback = ((s?.maps_niches ?? []) as string[]).filter(Boolean);
      if (!nichesFallback.length) {
        return json({
          ok: true,
          inserted: 0,
          message: "Nenhum nicho configurado. Preencha 'Nichos' no Painel de Automação para iniciar buscas.",
        });
      }
    }

    // 2. Regiões: vem do body (override) ou de automation_settings.maps_regions
    let regions: string[] = Array.isArray(body?.regions) ? body.regions : [];
    if (!regions.length) {
      const { data: settings } = await admin.from("automation_settings")
        .select("maps_regions")
        .eq("user_id", userId).maybeSingle();
      regions = (settings?.maps_regions ?? []) as string[];
    }
    if (!regions.length) regions = ["Brasil"];

    // 3. Combina queries: PREFERE atividades resolvidas via CNAE (Fase H-2 — mais precisas),
    // depois segmentos genéricos (Fase H — fallback). Total cap em 5 queries × 3 regiões = 15.
    const queries: string[] = [];
    // Top 3 atividades CNAE (mais precisas)
    queries.push(...atividadesResolvidas.slice(0, 3));
    // Mais 2 segmentos pra cobrir buracos do CNAE
    for (const s of segmentos) {
      if (queries.length >= 5) break;
      if (!queries.includes(s)) queries.push(s);
    }
    // Fallback final: nichos do formulário
    for (const n of nichesFallback) {
      if (queries.length >= 5) break;
      if (!queries.includes(n)) queries.push(n);
    }
    const topQueries = queries.slice(0, 5);
    const topRegions = regions.slice(0, 3);

    const results: any[] = [];
    let totalSaved = 0;

    for (const query of topQueries) {
      const isAtividade = atividadesResolvidas.includes(query);
      for (const region of topRegions) {
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/google-places-search`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              searchQuery: query,
              location: region,
              maxResults: maxPerCombination,
            }),
          });
          const j = await r.json().catch(() => ({}));
          const saved = Number(j?.saved ?? j?.count ?? 0);
          totalSaved += saved;
          results.push({
            query,
            tipo: isAtividade ? "cnae_resolvido" : "segmento_generico",
            region,
            saved,
            status: j?.success ? "ok" : "error",
            error: j?.error ?? null,
          });
        } catch (e: any) {
          results.push({ query, tipo: isAtividade ? "cnae_resolvido" : "segmento_generico", region, saved: 0, status: "error", error: e?.message });
        }
      }
    }

    return json({
      ok: true,
      total_saved: totalSaved,
      atividades_cnae_usadas: atividadesResolvidas.length,
      segmentos_genericos_usados: queries.length - Math.min(atividadesResolvidas.length, 3),
      combinations: results.length,
      queries_usadas: topQueries,
      regioes_usadas: topRegions,
      clientes_referencia_count: (briefing?.clientes_referencia ?? []).length,
      details: results,
    });
  } catch (e: any) {
    console.error("[maps-seed-by-references] error:", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
