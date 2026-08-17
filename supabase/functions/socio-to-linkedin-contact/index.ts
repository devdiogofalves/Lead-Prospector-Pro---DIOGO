// socio-to-linkedin-contact — sócio para contato LinkedIn no pipeline do tenant
//
// Recebe um empresa_id (de empresas_enriquecidas) e:
//  1. Extrai sócio prioritário (Admin > Diretor > Sócio cotista) do QSA
//  2. Busca o LinkedIn dele via linkedin-dm action="search" (Unipile)
//  3. Filtra resultados por match de nome + empresa
//  4. Insere em linkedin_contacts (dedup por linkedin_url)
//  5. Opcional: inicia cadência D+0 → +7 → +14 → +21
//
// Chamado por:
//  - auto-prospect (quando settings.auto_socio_linkedin=true)
//  - Manualmente via POST {empresa_id, start_cadence?} pra teste
//
// Auth: aceita service role (do auto-prospect) ou JWT do usuário.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mesma lógica do auto-prospect — duplicada (padrão self-contained do projeto).
function firstSocio(socios: string | null | undefined): { nome: string; cargo: string | null } | null {
  if (!socios) return null;
  const items = socios.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  if (!items.length) return null;
  const cargoRank = { admin: 3, diretor: 2, socio: 1 };
  const parseItem = (raw: string) => {
    const lower = raw.toLowerCase();
    let cargo: string | null = null;
    let rank = 0;
    if (/(^|\W)admin/.test(lower)) { cargo = "Administrador"; rank = cargoRank.admin; }
    else if (/diretor/.test(lower)) { cargo = "Diretor"; rank = cargoRank.diretor; }
    else if (/s[oó]cio/.test(lower)) { cargo = "Sócio"; rank = cargoRank.socio; }
    const nome = raw.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s*[-–—]\s*(administrador|diretor|s[oó]cio).*$/i, "").trim();
    return { nome, cargo, rank };
  };
  const parsed = items.map(parseItem);
  parsed.sort((a, b) => b.rank - a.rank);
  return parsed[0]?.nome ? { nome: parsed[0].nome, cargo: parsed[0].cargo } : null;
}

// Match flexível: nome do sócio aparece (primeiro+último) no nome do perfil
function matchSocio(profileNome: string, socioNome: string): number {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const p = norm(profileNome);
  const s = norm(socioNome);
  const partsS = s.split(/\s+/).filter((x) => x.length > 2);
  if (!partsS.length) return 0;
  let hits = 0;
  for (const part of partsS) if (p.includes(part)) hits++;
  return hits / partsS.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json();
    const empresaId = body?.empresa_id;
    const startCadence = body?.start_cadence === true;
    if (!empresaId) return json({ error: "empresa_id obrigatório" }, 400);

    // Auth: service role bypass OR user JWT
    const isServiceRole = authHeader === `Bearer ${SERVICE_ROLE}`;
    let userId: string;
    if (isServiceRole) {
      userId = body?.user_id;
      if (!userId) return json({ error: "user_id obrigatório quando service role" }, 400);
    } else {
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      userId = userData.user.id;
    }

    // 1. Lê empresa enriquecida
    const { data: empresa } = await admin.from("empresas_enriquecidas")
      .select("id, nome_empresa, socios, cnpj")
      .eq("id", empresaId).eq("user_id", userId).maybeSingle();
    if (!empresa) return json({ error: "empresa não encontrada" }, 404);

    const socio = firstSocio(empresa.socios);
    if (!socio?.nome) return json({ ok: false, skipped: "sem_socio_no_qsa", empresa_id: empresaId });

    // 2. Dedup: se já existe linkedin_contact com nome próximo deste sócio pra este user, skip
    const { data: existingByName } = await admin.from("linkedin_contacts")
      .select("id, linkedin_url, cadencia_status")
      .eq("user_id", userId)
      .ilike("nome", `%${socio.nome.split(" ")[0]}%`)
      .limit(5);
    const alreadyMatched = (existingByName ?? []).find(
      (c: any) => matchSocio(c.nome ?? "", socio.nome) >= 0.6,
    );
    if (alreadyMatched) {
      return json({
        ok: true,
        skipped: "linkedin_contact_ja_existe",
        contact_id: alreadyMatched.id,
        linkedin_url: alreadyMatched.linkedin_url,
        cadencia_status: alreadyMatched.cadencia_status,
      });
    }

    // 3. Chama linkedin-dm action="search" via fetch interno (mesmo padrão do auto-prospect)
    const searchKeywords = `${socio.nome} ${empresa.nome_empresa ?? ""}`.trim();
    const searchResp = await fetch(`${SUPABASE_URL}/functions/v1/linkedin-dm`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "search",
        user_id: userId,
        keywords: searchKeywords,
        limit: 5,
      }),
    });
    const searchBody = await searchResp.json().catch(() => ({}));
    if (!searchBody?.success) {
      return json({
        ok: false,
        error: searchBody?.error ?? "linkedin-dm search falhou",
        details: searchBody,
      });
    }

    const profiles = Array.isArray(searchBody.profiles) ? searchBody.profiles : [];
    // 4. Ranqueia: nome match >= 0.5 + bonus se empresa também der match
    const ranked = profiles.map((p: any) => {
      const nomeScore = matchSocio(p.nome ?? "", socio.nome);
      const empresaMatch = p.empresa && empresa.nome_empresa
        && matchSocio(p.empresa, empresa.nome_empresa) >= 0.5;
      return { p, score: nomeScore + (empresaMatch ? 0.3 : 0) };
    }).filter((r: any) => r.score >= 0.5)
      .sort((a: any, b: any) => b.score - a.score);

    if (!ranked.length) {
      return json({
        ok: false,
        skipped: "nenhum_match_no_linkedin",
        searched: searchKeywords,
        raw_count: searchBody.raw_count,
      });
    }

    const best = ranked[0].p;
    // Fallback de URL: Unipile às vezes retorna perfil com member_id mas sem
    // linkedin_url (especialmente em sales_navigator). Sem URL, cadência depois
    // falha com "linkedin_url ausente". Mesmo padrão do linkedin-dm action="save".
    const resolvedUrl = best.linkedin_url
      ?? (best.member_id ? `https://www.linkedin.com/in/${best.member_id}` : null);
    if (!resolvedUrl) {
      return json({
        ok: false,
        skipped: "match_sem_linkedin_url_nem_member_id",
        match_score: ranked[0].score,
        raw_match: best,
      });
    }
    // 5. Insere em linkedin_contacts (já dedup por linkedin_url via UNIQUE)
    const { data: inserted, error: insertError } = await admin.from("linkedin_contacts")
      .insert({
        user_id: userId,
        nome: best.nome ?? socio.nome,
        cargo: best.cargo ?? socio.cargo ?? null,
        empresa: best.empresa ?? empresa.nome_empresa ?? null,
        localizacao: best.localizacao ?? null,
        sobre: best.sobre ?? null,
        linkedin_url: resolvedUrl,
        disparo: "Não",
      })
      .select("id, linkedin_url")
      .maybeSingle();

    if (insertError) {
      // Provavelmente conflito de UNIQUE em linkedin_url — busca o existente
      const { data: pre } = await admin.from("linkedin_contacts")
        .select("id, linkedin_url, cadencia_status")
        .eq("user_id", userId)
        .eq("linkedin_url", resolvedUrl)
        .maybeSingle();
      if (pre) {
        return json({
          ok: true,
          skipped: "linkedin_url_ja_cadastrada",
          contact_id: pre.id,
          linkedin_url: pre.linkedin_url,
          cadencia_status: pre.cadencia_status,
        });
      }
      return json({ ok: false, error: insertError.message });
    }

    // 6. Opcional: inicia cadência
    let cadenceStarted = false;
    if (startCadence && inserted?.id) {
      const cadResp = await fetch(`${SUPABASE_URL}/functions/v1/linkedin-dm`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SERVICE_ROLE}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "start_cadence",
          user_id: userId,
          contact_id: inserted.id,
        }),
      });
      const cadBody = await cadResp.json().catch(() => ({}));
      cadenceStarted = cadBody?.success === true;
    }

    return json({
      ok: true,
      created: true,
      contact_id: inserted?.id,
      linkedin_url: inserted?.linkedin_url,
      socio_nome: socio.nome,
      socio_cargo: socio.cargo,
      match_score: ranked[0].score,
      cadence_started: cadenceStarted,
    });
  } catch (e: any) {
    console.error("[socio-to-linkedin-contact] error:", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
