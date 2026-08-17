// resolve-references-activities — resolve atividades das referências do tenant.
//
// Pega `clientes_referencia` do mavi_briefing (Apodi, Polimix, Marisol etc),
// resolve o CNPJ de cada um via cnpj-search-by-name (Apify Google Search),
// consulta CNPJ.ws para obter a `atividade_principal` (descrição textual do
// CNAE) e popula `clientes_referencia_atividades` no briefing.
//
// Cacheado: rodar uma vez é suficiente. Operador pode forçar refresh via
// botão (body { force: true }) que reprocessa tudo.
//
// CUSTO: 1 Apify Google Search Scraper run + 1 consulta CNPJ.ws por cliente.
// Cap em 10 referências por execução pra evitar estouro de créditos.
//
// Auth: JWT do operador (acionado via UI em /mavi-aprendizado).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;

    // 1. Carrega briefing
    const { data: briefing } = await admin.from("mavi_briefing")
      .select("clientes_referencia, clientes_referencia_atividades, clientes_referencia_atividades_at")
      .eq("user_id", userId).maybeSingle();

    const refs = (briefing?.clientes_referencia ?? []) as string[];
    if (!refs.length) {
      return json({
        ok: true,
        cached: true,
        atividades: [],
        last_resolved_at: null,
        message: "Sem clientes de referência cadastrados ainda.",
      });
    }

    // Se já tem cache E não forçou refresh, retorna o que tem
    if (!force && (briefing?.clientes_referencia_atividades?.length ?? 0) > 0) {
      return json({
        ok: true,
        cached: true,
        atividades: briefing!.clientes_referencia_atividades,
        last_resolved_at: briefing!.clientes_referencia_atividades_at,
        message: "Já existe cache. Use force=true pra reprocessar.",
      });
    }

    // 2. Top 10 referências pra resolver
    const topRefs = refs.slice(0, 10);
    const results: any[] = [];
    const atividadesUnicas = new Set<string>();

    for (const ref of topRefs) {
      try {
        // a) Resolve CNPJ via cnpj-search-by-name (forwarding JWT pra rate limit do user)
        const searchResp = await fetch(`${SUPABASE_URL}/functions/v1/cnpj-search-by-name`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ companyName: ref, location: "Brasil" }),
        });
        const searchJson = await searchResp.json().catch(() => ({}));
        // Após fix P1: cnpj-search-by-name aceita { companyName, location } e retorna { success, mode:"direct", cnpj }.
        // Defensivo: aceita só quando success=true E veio um CNPJ válido (14 dígitos).
        const cnpj: string | null = (searchJson?.success === true && typeof searchJson?.cnpj === "string" && searchJson.cnpj.replace(/\D/g, "").length === 14)
          ? searchJson.cnpj.replace(/\D/g, "")
          : null;

        if (!cnpj) {
          results.push({ ref, skipped: "no_cnpj_found", details: searchJson });
          continue;
        }

        // b) Consulta atividade_principal via cnpj-lookup
        const lookupResp = await fetch(`${SUPABASE_URL}/functions/v1/cnpj-lookup`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cnpj }),
        });
        const lookupJson = await lookupResp.json().catch(() => ({}));
        const atividade: string | undefined = lookupJson?.data?.atividade_principal;

        if (atividade && atividade.trim()) {
          const norm = atividade.trim();
          atividadesUnicas.add(norm);
          results.push({ ref, cnpj, atividade: norm });
        } else {
          results.push({ ref, cnpj, skipped: "no_atividade" });
        }
      } catch (e: any) {
        results.push({ ref, error: e.message });
      }
    }

    const atividadesArray = Array.from(atividadesUnicas);

    // 3. Salva no briefing
    await admin.from("mavi_briefing").update({
      clientes_referencia_atividades: atividadesArray,
      clientes_referencia_atividades_at: new Date().toISOString(),
    }).eq("user_id", userId);

    return json({
      ok: true,
      cached: false,
      processed: results.length,
      resolved: results.filter((r) => r.atividade).length,
      atividades_unicas: atividadesArray,
      details: results,
    });
  } catch (e: any) {
    console.error("[resolve-references-activities] error:", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
