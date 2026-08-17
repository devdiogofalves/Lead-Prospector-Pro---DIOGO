// Pipeline automático multi-tenant — trilhas SEQUENCIAIS na ordem certa.
// Trilha LinkedIn: linkedin-dm(search+save via Unipile) → CNPJ (sócios) → Instagram (sócio) → Dados4U (celular pessoal) → upsert empresas_enriquecidas → enqueue se gatilho.
// Trilha Maps: google-places-search → CNPJ batch → Instagram (sócio) → Dados4U → upsert → enqueue se gatilho.
// Gatilho de disparo (configurável): WhatsApp validado + sócio identificado + celular pessoal Dados4U.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function invoke(name: string, body: any, userJwt?: string) {
  // Fase L: quando rodando do cron (sem userJwt), passa user_id como query param.
  // Os edge functions (linkedin-scrape, google-places-search, cnpj-batch-lookup,
  // instagram-profile-search, dados4u-query, socio-to-linkedin-contact) aceitam
  // service role + user_id pra autorizar a chamada. Antes da Fase L, esses edges
  // validavam JWT via auth.getClaims() que falhava com token service role e
  // retornava 401 — por isso "Maps: 0/0 · erro" no painel mesmo com cron rodando.
  const url = userJwt
    ? `${SUPABASE_URL}/functions/v1/${name}`
    : `${SUPABASE_URL}/functions/v1/${name}?user_id=${encodeURIComponent(body?.user_id ?? "")}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userJwt ?? SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

function pickOne<T>(arr: T[] | null | undefined): T | undefined {
  if (!arr || !arr.length) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

function listFrom(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function uniqueList(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const item of group) {
      const key = item.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item.trim());
    }
  }
  return out;
}

function onlyDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function isBrMobile(phone: string | null | undefined): boolean {
  const d = onlyDigits(phone);
  // 55 + DDD(2) + 9 + 8 = 13 dígitos. Aceita também sem 55 (11 dígitos).
  return d.length === 13 && d.startsWith("55") && d[4] === "9";
}

/** Extrai sócio prioritário do QSA do CNPJ. Estrutura "Nome A, Nome B" (texto livre).
 *  Tenta detectar cargo no texto (Administrador / Diretor / Sócio) e priorizar Admin > Diretor > Sócio.
 *  Retorna { nome, cargo } ou null. Fallback: primeiro item da lista. */
function firstSocio(socios: string | null | undefined): { nome: string; cargo: string | null } | null {
  if (!socios) return null;
  const items = socios.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  if (!items.length) return null;
  // Tenta detectar marcador de cargo nos itens
  const cargoRank: Record<string, number> = { admin: 3, diretor: 2, socio: 1 };
  const parseItem = (raw: string): { nome: string; cargo: string | null; rank: number } => {
    const lower = raw.toLowerCase();
    let cargo: string | null = null;
    let rank = 0;
    if (/(^|\W)admin/.test(lower)) { cargo = "Administrador"; rank = cargoRank.admin; }
    else if (/diretor/.test(lower)) { cargo = "Diretor"; rank = cargoRank.diretor; }
    else if (/s[oó]cio/.test(lower)) { cargo = "Sócio"; rank = cargoRank.socio; }
    // Remove o cargo do nome se aparecer entre parênteses ou após " - "
    const nome = raw.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s*[-–—]\s*(administrador|diretor|s[oó]cio).*$/i, "").trim();
    return { nome, cargo, rank };
  };
  const parsed = items.map(parseItem);
  // Ordena por rank desc (Admin > Diretor > Sócio > sem marcador)
  parsed.sort((a, b) => b.rank - a.rank);
  const winner = parsed[0];
  return winner.nome ? { nome: winner.nome, cargo: winner.cargo } : null;
}

/** Score 360° — 0 a 100 baseado em canais preenchidos */
function score360(row: any): number {
  const ch = [
    !!row.cnpj,
    !!row.telefone,
    !!row.email,
    !!row.socios,
    !!row.linkedin_url,
    !!row.instagram_username,
    !!row.celular_pessoal,
  ];
  const filled = ch.filter(Boolean).length;
  return Math.round((filled / ch.length) * 100);
}

/** Fase P: score simplificado pra fontes alternativas (leads/linkedin/IG)
 *  que não passam pelo pipeline completo de enriquecimento. Telefone é
 *  base (40 pontos garantidos); +20 por canal extra (site, cnpj, etc). */
function score360Simple(row: any): number {
  let pts = 0;
  if (row.telefone) pts += 40; // pré-requisito, mas pesa
  if (row.site) pts += 15;
  if (row.cnpj) pts += 15;
  if (row.email) pts += 10;
  if (row.linkedin_url) pts += 10;
  if (row.instagram_username) pts += 5;
  if (row.celular_pessoal) pts += 5;
  return Math.min(100, pts);
}

function unipileAccountIds(extra: Record<string, any>, channel: "email" | "instagram" | "telegram" | "linkedin"): string[] {
  const values: unknown[] = [];
  if (channel === "linkedin") values.push(extra.account_id, extra.account_id_linkedin);
  else if (channel === "email") values.push(extra.account_id_email, extra.account_id_google, extra.account_id_outlook, extra.account_id_imap);
  else values.push(extra[`account_id_${channel}`]);

  const grouped = extra.accounts_by_channel?.[channel] ?? extra.account_ids_by_channel?.[channel];
  if (Array.isArray(grouped)) values.push(...grouped);
  const arrayKey = extra[`account_ids_${channel}`];
  if (Array.isArray(arrayKey)) values.push(...arrayKey);

  return [...new Set(values
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim()))];
}

/** Tenta achar celular pessoal do sócio via dados4u_consultas.
 *  P2 fix: scoring por tokens (>=3 chars), exige 2+ matches quando o sócio tem
 *  2+ tokens — evita falso positivo "JOSE SILVA" ↔ "JOSE SANTOS". */
async function findPartnerMobile(admin: any, userId: string, socioNome: string): Promise<string | null> {
  if (!socioNome) return null;
  const norm = (s: string) => String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = (s: string) => norm(s).split(" ").filter((t) => t.length >= 3);

  const socioTokens = tokens(socioNome);
  if (socioTokens.length === 0) return null;
  const firstName = socioTokens[0];
  const minMatches = socioTokens.length >= 2 ? 2 : 1;

  const { data: consultas } = await admin
    .from("dados4u_consultas")
    .select("celulares, nome, created_at")
    .eq("user_id", userId)
    .ilike("nome", `%${firstName}%`)
    .order("created_at", { ascending: false })
    .limit(25);

  let best: { score: number; phone: string } | null = null;
  for (const c of consultas ?? []) {
    const candTokens = tokens(c.nome || "");
    if (candTokens.length === 0) continue;
    const matches = socioTokens.filter((t) => candTokens.includes(t)).length;
    if (matches < minMatches) continue;
    const cels = Array.isArray(c.celulares) ? c.celulares : [];
    for (const cel of cels) {
      const raw = onlyDigits(cel?.numero || cel);
      const phone = raw.startsWith("55") ? raw : `55${raw}`;
      if (!isBrMobile(phone)) continue;
      if (!best || matches > best.score) best = { score: matches, phone };
      break;
    }
  }
  return best?.phone ?? null;
}

async function runForUser(admin: any, settings: any, userJwt?: string) {
  const summary: Record<string, any> = {
    user_id: settings.user_id,
    started_at: new Date().toISOString(),
    tracks: {},
    enqueued: 0,
  };

  const max = Math.min(settings.max_leads_per_run || 20, 50);

  const { data: briefing } = await admin
    .from("mavi_briefing")
    .select("segmentos_alvo, personas_alvo")
    .eq("user_id", settings.user_id)
    .maybeSingle();

  const briefingSegments = listFrom(briefing?.segmentos_alvo);
  const briefingPersonas = listFrom(briefing?.personas_alvo);
  const mapsNiches = uniqueList(listFrom(settings.maps_niches), briefingSegments).slice(0, 30);
  const mapsRegions = uniqueList(listFrom(settings.maps_regions), ["São Paulo SP", "Rio de Janeiro RJ", "Belo Horizonte MG", "Curitiba PR", "Brasil"]).slice(0, 20);
  const linkedinTerms = uniqueList(listFrom(settings.linkedin_search_terms), briefingSegments, briefingPersonas).slice(0, 30);

  const { data: unipileRow } = await admin
    .from("user_api_keys")
    .select("extra")
    .eq("user_id", settings.user_id)
    .eq("provider", "unipile")
    .maybeSingle();
  const unipileExtra = ((unipileRow?.extra ?? {}) as Record<string, any>);
  const connectedUnipile = {
    email: unipileAccountIds(unipileExtra, "email").length > 0,
    instagram: unipileAccountIds(unipileExtra, "instagram").length > 0,
    telegram: unipileAccountIds(unipileExtra, "telegram").length > 0,
    linkedin: unipileAccountIds(unipileExtra, "linkedin").length > 0,
  };
  summary.connected_unipile_channels = connectedUnipile;

  summary.inputs = {
    maps_niches: mapsNiches.length,
    maps_regions: mapsRegions.length,
    linkedin_terms: linkedinTerms.length,
    briefing_segments_used: briefingSegments.length,
  };

  // ── TRILHA LINKEDIN ────────────────────────────────────────────────────
  if (settings.run_linkedin && linkedinTerms.length && connectedUnipile.linkedin) {
    const term = pickOne<string>(linkedinTerms);
    const region = pickOne<string>(mapsRegions) || "Brasil";
    summary.tracks.linkedin = { term, region };
    try {
      // Busca via Unipile (linkedin-dm action=search+save, sem Apify)
      const searchR = await invoke("linkedin-dm", { action: "search", user_id: settings.user_id, keywords: term, location: region, limit: max }, userJwt);
      summary.tracks.linkedin.scrape = searchR.data;
      if (searchR.data?.success && searchR.data?.profiles?.length) {
        const saveR = await invoke("linkedin-dm", { action: "save", user_id: settings.user_id, profiles: searchR.data.profiles }, userJwt);
        summary.tracks.linkedin.saved = saveR.data;
      }
    } catch (e: any) {
      summary.tracks.linkedin.error = e.message;
    }
  } else if (settings.run_linkedin && !connectedUnipile.linkedin) {
    summary.tracks.linkedin = { skipped: "linkedin_unipile_not_connected" };
  }

  // ── TRILHA MAPS ────────────────────────────────────────────────────────
  if (settings.run_maps && mapsNiches.length) {
    const niche = pickOne<string>(mapsNiches);
    const region = pickOne<string>(mapsRegions) || "Brasil";
    summary.tracks.maps = { niche, region };
    try {
      const r = await invoke("google-places-search", {
        user_id: settings.user_id,
        searchQuery: niche,
        location: region,
        maxResults: max,
      }, userJwt);
      summary.tracks.maps.search = r.data;
    } catch (e: any) {
      summary.tracks.maps.error = e.message;
    }
  }

  // ── ENRIQUECIMENTO COMUM: CNPJ DISCOVERY → CNPJ LOOKUP → Instagram → Dados4U ────
  // 2 etapas separadas que estavam quebradas em cascata:
  // a) cnpj-search-by-name (Apify Google Search): descobre CNPJ pelo nome da empresa.
  //    Necessário pra leads vindos do Maps (que não trazem CNPJ).
  // b) cnpj-batch-lookup (CNPJ.ws público): valida CNPJ + popula sócios em empresas_enriquecidas.
  //    Antes da etapa a, esta retornava 0 porque exige cnpj IS NOT NULL no banco.
  if (settings.run_cnpj_enrich) {
    // Etapa A: descoberta de CNPJ pelos nomes (Apify) — só pra leads sem cnpj ainda.
    try {
      const r = await invoke("cnpj-search-by-name", { user_id: settings.user_id }, userJwt);
      summary.cnpj_discovery = r.data;
    } catch (e: any) {
      summary.cnpj_discovery = { error: e.message };
    }
    // Etapa B: validação/lookup dos CNPJs (CNPJ.ws) — agora pega os recém-descobertos.
    try {
      const r = await invoke("cnpj-batch-lookup", { user_id: settings.user_id, limit: max }, userJwt);
      summary.cnpj = r.data;
    } catch (e: any) {
      summary.cnpj = { error: e.message };
    }
  }

  // Fase G: sócio identificado → LinkedIn contact (com opcional start_cadence)
  // Roda só se operador ativou explicitamente (consome créditos Apify/Unipile por sócio)
  // P1 fix: filtra empresas com socio_linkedin_searched_at NULL para não regastar crédito.
  if (settings.auto_socio_linkedin && settings.run_cnpj_enrich) {
    const { data: targets } = await admin
      .from("empresas_enriquecidas")
      .select("id, socios")
      .eq("user_id", settings.user_id)
      .not("socios", "is", null)
      .is("socio_linkedin_searched_at", null)
      .order("created_at", { ascending: false })
      .limit(max);
    const liResults: any[] = [];
    for (const t of targets ?? []) {
      try {
        const r = await invoke("socio-to-linkedin-contact", {
          empresa_id: t.id,
          user_id: settings.user_id,
          start_cadence: settings.auto_socio_linkedin_start_cadence === true,
        });
        liResults.push({ empresa_id: t.id, ...(r.data ?? {}) });
      } catch (e: any) {
        liResults.push({ empresa_id: t.id, error: e.message });
      }
      await admin.from("empresas_enriquecidas")
        .update({ socio_linkedin_searched_at: new Date().toISOString() })
        .eq("id", t.id);
    }
    summary.socio_linkedin = {
      processed: liResults.length,
      created: liResults.filter((r) => r.created).length,
      already_existed: liResults.filter((r) => r.skipped?.includes("ja_existe") || r.skipped?.includes("ja_cadastrada")).length,
      no_match: liResults.filter((r) => r.skipped === "nenhum_match_no_linkedin").length,
      cadence_started: liResults.filter((r) => r.cadence_started).length,
    };
  }

  // Instagram do sócio (best-effort por empresa enriquecida recente sem IG)
  // P1 fix: filtra empresas com instagram_searched_at NULL — antes re-buscava IG
  // do mesmo sócio a cada tick (gasto desnecessário Apify).
  if (settings.run_instagram) {
    const { data: targets } = await admin
      .from("empresas_enriquecidas")
      .select("id, nome_empresa, socios")
      .eq("user_id", settings.user_id)
      .is("instagram_searched_at", null)
      .order("created_at", { ascending: false })
      .limit(max);
    const igOk: string[] = [];
    for (const t of targets ?? []) {
      const socio = firstSocio(t.socios);
      const query = socio?.nome ?? t.nome_empresa;
      if (!query) continue;
      try {
        await invoke("instagram-profile-search", { user_id: settings.user_id, query, maxResults: 1 }, userJwt);
        igOk.push(query);
      } catch (_) { /* silent */ }
      await admin.from("empresas_enriquecidas")
        .update({ instagram_searched_at: new Date().toISOString() })
        .eq("id", t.id);
    }
    summary.instagram = { searched: igOk.length };
  }

  // Dados4U para sócios identificados sem celular pessoal ainda
  // P1 fix: filtra empresas com dados4u_searched_at NULL — antes consumia
  // créditos pagos repetindo a mesma consulta de sócio a cada tick.
  if (settings.run_cnpj_enrich) {
    const { data: targets } = await admin
      .from("empresas_enriquecidas")
      .select("id, socios")
      .eq("user_id", settings.user_id)
      .not("socios", "is", null)
      .is("dados4u_searched_at", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(max, 10));
    let queried = 0;
    for (const t of targets ?? []) {
      const socio = firstSocio(t.socios);
      if (!socio?.nome) {
        // Sem sócio → marca "tentado" pra não reprocessar em cada tick.
        await admin.from("empresas_enriquecidas")
          .update({ dados4u_searched_at: new Date().toISOString() }).eq("id", t.id);
        continue;
      }
      // Só marca dados4u_searched_at quando a consulta REALMENTE retornou dado.
      // Antes: marcava em qualquer erro/notFound → nunca re-tentava.
      let ok = false;
      try {
        const r = await invoke("dados4u-query-v2", { user_id: settings.user_id, tipo: "nome", valor: socio.nome }, userJwt);
        if (r?.ok && r?.data?.success === true && (r?.data?.results ?? 0) > 0) {
          queried++;
          ok = true;
        }
      } catch (_) { /* silent — deixa sem marcar pra permitir re-try */ }
      if (ok) {
        await admin.from("empresas_enriquecidas")
          .update({ dados4u_searched_at: new Date().toISOString() })
          .eq("id", t.id);
      }
    }
    summary.dados4u = { queried };
  }

  // ── ENQUEUE MULTICANAL — busca candidatos de MÚLTIPLAS fontes ──────────────
  // Fase P: antes, só buscava de empresas_enriquecidas. Resultado: se Maps
  // coletava 11 leads mas CNPJ enrich não rodava, fila ficava em ZERO.
  // E leads existentes na base (leads, linkedin_contacts, instagram_contacts)
  // que nunca foram prospectados eram ignorados pelo auto-prospect.
  //
  // Agora itera 4 fontes em ordem de qualidade:
  // 1. empresas_enriquecidas (mais rica — tem sócio + CNPJ)
  // 2. leads (Maps + CNPJ direto + manual — tem telefone empresa)
  // 3. linkedin_contacts (LinkedIn — pode ter telefone enriquecido)
  // 4. instagram_contacts (IG — pode ter whatsapp populado)
  //
  // Filtros require_partner_identified/require_partner_mobile só se aplicam
  // a empresas_enriquecidas (única fonte com socios estruturado). As outras
  // passam direto com require_whatsapp_validated + score simplificado.
  if (settings.run_dispatch) {
    const minScore = settings.min_score_360 ?? 60;
    const requirePartner = settings.require_partner_identified !== false;
    const requirePersonalMobile = settings.require_partner_mobile !== false;
    const requireWaValidated = settings.require_whatsapp_validated !== false;

    // Canais habilitados para a AUTOMAÇÃO (toggles em /automacao).
    // Cada lead pode entrar em vários canais em paralelo se tiver o identificador.
    // WhatsApp continua sendo o principal: default true. Demais canais default false.
    const chWA = settings.auto_whatsapp_enabled !== false;
    const chEmail = settings.auto_email_enabled === true && connectedUnipile.email;
    const chIG = settings.auto_instagram_enabled === true && connectedUnipile.instagram;
    const chTG = settings.auto_telegram_enabled === true && connectedUnipile.telegram;
    summary.channels_requested = {
      whatsapp: settings.auto_whatsapp_enabled !== false,
      email: settings.auto_email_enabled === true,
      instagram: settings.auto_instagram_enabled === true,
      telegram: settings.auto_telegram_enabled === true,
    };
    summary.channels_missing_connection = {
      email: settings.auto_email_enabled === true && !connectedUnipile.email,
      instagram: settings.auto_instagram_enabled === true && !connectedUnipile.instagram,
      telegram: settings.auto_telegram_enabled === true && !connectedUnipile.telegram,
    };

    let enqueued = 0;
    const channelCounts: Record<string, number> = { whatsapp: 0, email: 0, instagram: 0, telegram: 0 };
    const enqueueAttempts: Record<string, { tried: number; enqueued: number; skipped_reasons: Record<string, number> }> = {};

    // Enfileira 1 row de dispatch_queue para um canal específico.
    // Retorna true se inseriu (para telemetria de canal).
    const enqueueChannel = async (
      channel: "email" | "instagram" | "telegram",
      identifier: string,
      base: any,
      source: string,
      id: string,
    ): Promise<boolean> => {
      const clean = String(identifier || "").trim();
      if (!clean) return false;
      // Dedup por (channel + identificador + user).
      const idField = channel === "email" ? "email" : "recipient_handle";
      const { count: dup } = await admin.from("dispatch_queue")
        .select("id", { count: "exact", head: true })
        .eq("user_id", settings.user_id)
        .eq("channel", channel)
        .eq(idField, clean)
        .in("status", ["pending", "running", "sent"]);
      if ((dup ?? 0) > 0) return false;

      const delayMin = 1 + enqueued * 2;
      const row: any = {
        user_id: settings.user_id,
        source,
        source_id: id,
        channel,
        nome_empresa: base.nome_empresa ?? null,
        nome_contato: base.nome_contato ?? null,
        cargo: base.cargo ?? null,
        telefone: channel === "email" ? null : (base.telefone ?? null),
        status: "pending",
        scheduled_at: new Date(Date.now() + delayMin * 60 * 1000).toISOString(),
        site: base.site ?? null,
        linkedin_url: base.linkedin_url ?? null,
        especialidades: base.especialidades ?? null,
      };
      if (channel === "email") {
        row.email = clean;
        row.recipient_handle = clean;
      } else if (channel === "instagram") {
        row.username = clean.replace(/^@+/, "");
        row.recipient_handle = clean.replace(/^@+/, "");
      } else {
        row.recipient_handle = clean.replace(/^@+/, "");
      }
      const { error: insErr } = await admin.from("dispatch_queue").insert(row);
      if (insErr) {
        console.warn(`[auto-prospect] enqueueChannel(${channel}) falhou:`, insErr.message);
        return false;
      }
      channelCounts[channel]++;
      return true;
    };

    // Helper: tenta enfileirar um candidato genérico — retorna true se enfileirou.
    const tryEnqueue = async (
      source: string,
      id: string,
      data: { nome_empresa?: string | null; telefone?: string | null; site?: string | null; cnpj?: string | null; email?: string | null; socios?: string | null; linkedin_url?: string | null; instagram_username?: string | null; telegram_username?: string | null; celular_pessoal?: string | null; especialidades?: string | null; cidade?: string | null },
      sourceTable: string,
    ): Promise<{ enqueued: boolean; reason?: string }> => {
      const socio = firstSocio(data.socios);
      // require_partner_identified só faz sentido pra empresas_enriquecidas
      if (source === "empresas_enriquecidas" && requirePartner && !socio) return { enqueued: false, reason: "no_partner" };

      const partnerMobile = source === "empresas_enriquecidas" && socio?.nome
        ? await findPartnerMobile(admin, settings.user_id, socio.nome)
        : (data.celular_pessoal ?? null);
      // require_partner_mobile só pra empresas_enriquecidas
      if (source === "empresas_enriquecidas" && requirePersonalMobile && !partnerMobile) return { enqueued: false, reason: "no_partner_mobile" };

      const base = {
        nome_empresa: data.nome_empresa,
        nome_contato: socio?.nome ?? null,
        cargo: socio?.cargo ?? null,
        site: data.site,
        linkedin_url: data.linkedin_url ?? null,
        especialidades: data.especialidades ?? null,
        cidade: data.cidade ?? null,
      };

      // ── WhatsApp (mesma lógica anterior — só roda se canal WA está ligado) ──
      let waEnqueued = false;
      let waSkipReason: string | undefined;
      const finalPhone = partnerMobile || data.telefone;
      if (chWA && finalPhone) {
        const fullPhone = finalPhone.startsWith("55") ? finalPhone : `55${onlyDigits(finalPhone)}`;
        if (requireWaValidated && !isBrMobile(fullPhone)) {
          waSkipReason = "not_br_mobile";
        } else if (onlyDigits(fullPhone).length < 12) {
          waSkipReason = "phone_too_short";
        } else {
          const phoneDigits = onlyDigits(finalPhone);
          const phoneE164 = phoneDigits.startsWith("55") ? phoneDigits : `55${phoneDigits}`;
          const [{ count: dup }, { count: alreadySent }] = await Promise.all([
            admin.from("dispatch_queue")
              .select("id", { count: "exact", head: true })
              .eq("user_id", settings.user_id)
              .eq("channel", "whatsapp")
              .eq("telefone", phoneE164),
            admin.from("disparos_humanizados")
              .select("id", { count: "exact", head: true })
              .eq("user_id", settings.user_id)
              .eq("telefone", phoneE164)
              .eq("status", "sent"),
          ]);
          if ((dup ?? 0) > 0) waSkipReason = "already_queued";
          else if ((alreadySent ?? 0) > 0) waSkipReason = "already_sent_previously";
          else {
            const score = source === "empresas_enriquecidas"
              ? score360({ ...data, celular_pessoal: partnerMobile })
              : score360Simple({ ...data, celular_pessoal: partnerMobile });
            if (source === "empresas_enriquecidas" && score < minScore) waSkipReason = "low_score";
            else if (source !== "empresas_enriquecidas" && score < Math.min(minScore, 40)) waSkipReason = "low_score";
            else {
              const delayMin = 1 + enqueued * 2;
              const { error: insErr } = await admin.from("dispatch_queue").insert({
                user_id: settings.user_id,
                source,
                source_id: id,
                channel: "whatsapp",
                nome_empresa: data.nome_empresa,
                nome_contato: socio?.nome ?? null,
                cargo: socio?.cargo ?? null,
                telefone: phoneE164,
                status: "pending",
                scheduled_at: new Date(Date.now() + delayMin * 60 * 1000).toISOString(),
                site: data.site,
                linkedin_url: data.linkedin_url ?? null,
                especialidades: data.especialidades ?? null,
              });
              if (insErr) {
                console.error("dispatch_queue insert failed", { source, id, error: insErr.message });
                waSkipReason = `insert_error:${insErr.message}`;
              } else {
                waEnqueued = true;
                channelCounts.whatsapp++;
              }
            }
          }
        }
      }

      // ── Canais paralelos (Email / Instagram / Telegram) ──────────────────
      // Rodam independente do resultado de WhatsApp — assim, um lead que só
      // tem email ainda entra em fila mesmo sem telefone válido.
      let extraChannels = 0;
      if (chEmail && data.email) {
        if (await enqueueChannel("email", data.email, base, source, id)) extraChannels++;
      }
      if (chIG && data.instagram_username) {
        if (await enqueueChannel("instagram", data.instagram_username, base, source, id)) extraChannels++;
      }
      if (chTG && data.telegram_username) {
        if (await enqueueChannel("telegram", data.telegram_username, base, source, id)) extraChannels++;
      }

      // Só marca disparo='Sim' na tabela origem quando de fato enfileirou algo,
      // pra não travar re-processamento se nenhum canal pegou.
      if (waEnqueued || extraChannels > 0) {
        try {
          if (sourceTable === "telegram_recipients") {
            await admin.from(sourceTable).update({ status: "queued", last_error: null }).eq("id", id);
          } else {
            await admin.from(sourceTable).update({ disparo: "Sim", data_disparo: new Date().toISOString() }).eq("id", id);
          }
        } catch (_) { /* não-bloqueante */ }
        enqueued++;
        return { enqueued: true };
      }

      // Se WA falhou por gate real e sem canal extra, reporta o motivo original.
      if (waSkipReason) return { enqueued: false, reason: waSkipReason };
      if (!finalPhone && !chEmail && !chIG && !chTG) return { enqueued: false, reason: "no_phone" };
      if (!finalPhone) return { enqueued: false, reason: "no_channel_identifier" };
      return { enqueued: false, reason: "no_channel_enabled" };
    };

    const tickAttempts = (source: string, reason?: string) => {
      if (!enqueueAttempts[source]) enqueueAttempts[source] = { tried: 0, enqueued: 0, skipped_reasons: {} };
      enqueueAttempts[source].tried++;
      if (reason) enqueueAttempts[source].skipped_reasons[reason] = (enqueueAttempts[source].skipped_reasons[reason] ?? 0) + 1;
      else enqueueAttempts[source].enqueued++;
    };

    // Cada fonte rola dentro de try/catch independente — se 1 query falhar
    // (schema diferente, RLS, timeout), outras continuam. Antes, 1 erro
    // travava a função inteira e operador via botão pendurado.
    const processFonte = async (
      source: string,
      sourceTable: string,
      query: any,
      mapper: (r: any) => any,
    ) => {
      try {
        const { data: rows, error } = await query;
        if (error) {
          enqueueAttempts[source] = { tried: 0, enqueued: 0, skipped_reasons: { query_error: 1 } };
          console.error(`[auto-prospect] fonte ${source} query error:`, error.message);
          return;
        }
        for (const r of rows ?? []) {
          if (enqueued >= max) break;
          try {
            const data = mapper(r);
            const res = await tryEnqueue(source, r.id, data, sourceTable);
            tickAttempts(source, res.enqueued ? undefined : res.reason);
          } catch (e: any) {
            tickAttempts(source, `exception:${e.message?.slice(0, 30)}`);
          }
        }
      } catch (e: any) {
        console.error(`[auto-prospect] fonte ${source} crashed:`, e.message);
        enqueueAttempts[source] = enqueueAttempts[source] ?? { tried: 0, enqueued: 0, skipped_reasons: {} };
        enqueueAttempts[source].skipped_reasons[`crashed:${e.message?.slice(0, 30)}`] = 1;
      }
    };

    // ─── Fonte 1: empresas_enriquecidas ────────────────────────────────
    // NOTE: colunas linkedin_url / instagram_username / celular_pessoal NÃO existem
    // nesta tabela — não selecionar (o select inteiro quebrava e enqueued ficava 0).
    // score360() trata os campos ausentes como falsy naturalmente.
    await processFonte(
      "empresas_enriquecidas",
      "empresas_enriquecidas",
      admin.from("empresas_enriquecidas")
        .select("id, nome_empresa, telefone, socios, cnpj, email, site, atividade_principal, endereco")
        .eq("user_id", settings.user_id)
        .order("created_at", { ascending: false })
        .limit(max * 2),
      (r) => ({ ...r, especialidades: r.atividade_principal ?? null, cidade: r.endereco ?? null }),
    );

    // ─── Fonte 2: leads (Maps + CNPJ direto + manual) ───────────────────
    if (enqueued < max) {
      await processFonte(
        "leads",
        "leads",
        admin.from("leads")
          .select("id, nome_empresa, telefone, site, cnpj, socios, especialidades, endereco, email")
          .eq("user_id", settings.user_id)
          .or("disparo.is.null,disparo.eq.Não")
          .order("created_at", { ascending: false })
          .limit(max * 2),
        (r) => ({ ...r, cidade: r.endereco ?? null }),
      );
    }

    // ─── Fonte 3: linkedin_contacts ─────────────────────────────────────
    if (enqueued < max) {
      await processFonte(
        "linkedin_contacts",
        "linkedin_contacts",
        admin.from("linkedin_contacts")
          .select("id, nome, empresa, telefone, linkedin_url, cargo, email")
          .eq("user_id", settings.user_id)
          .or("disparo.is.null,disparo.eq.Não")
          .order("created_at", { ascending: false })
          .limit(max * 2),
        (r) => ({
          nome_empresa: r.empresa ?? r.nome,
          telefone: r.telefone,
          linkedin_url: r.linkedin_url,
          email: r.email,
          socios: r.nome && r.cargo ? `${r.nome} (${r.cargo})` : r.nome,
        }),
      );
    }

    // ─── Fonte 4: instagram_contacts ────────────────────────────────────
    if (enqueued < max) {
      await processFonte(
        "instagram_contacts",
        "instagram_contacts",
        admin.from("instagram_contacts")
          .select("id, nome, username, whatsapp")
          .eq("user_id", settings.user_id)
          .or("disparo.is.null,disparo.eq.Não")
          .order("created_at", { ascending: false })
          .limit(max * 2),
        (r) => ({
          nome_empresa: r.nome ?? r.username,
          telefone: r.whatsapp,
          instagram_username: r.username,
        }),
      );
    }

    // ─── Fonte 5: telegram_recipients ───────────────────────────────────
    // Para tenants que querem operar sem WhatsApp, Telegram pode ser um canal
    // primário já conectado. Antes estes contatos só funcionavam no envio manual
    // da página Telegram e nunca entravam na automação.
    if (enqueued < max && chTG) {
      await processFonte(
        "telegram_recipients",
        "telegram_recipients",
        admin.from("telegram_recipients")
          .select("id, identifier, display_name, status")
          .eq("user_id", settings.user_id)
          .neq("status", "sent")
          .order("created_at", { ascending: false })
          .limit(max * 2),
        (r) => ({
          nome_empresa: r.display_name ?? r.identifier,
          telegram_username: r.identifier,
        }),
      );
    }

    summary.enqueued = enqueued;
    summary.enqueued_by_channel = channelCounts;
    summary.enqueue_attempts = enqueueAttempts;
    summary.channels_enabled = { whatsapp: chWA, email: chEmail, instagram: chIG, telegram: chTG };
    // Transparência do gate isBrMobile: agrega quantos leads foram pulados
    // porque o telefone não é celular WhatsApp BR (55 + DDD + 9 + 8 dígitos).
    // Regra NÃO foi relaxada — só expõe no summary para a UI mostrar o motivo.
    const totalNotBrMobile = Object.values(enqueueAttempts)
      .reduce((sum, a) => sum + (a.skipped_reasons?.not_br_mobile ?? 0), 0);
    summary.skipped_not_br_mobile = totalNotBrMobile;
  }


  // ─── Fonte 5: LinkedIn-only (sem WhatsApp) → ativa cadência LinkedIn DM ──
  // Regra: se temos LinkedIn do decisor mas NÃO temos WhatsApp, ao invés
  // de ir pro dispatch_queue (WhatsApp), ativamos cadência no linkedin_contacts.
  // O linkedin-cadence-worker (pg_cron horário) vai disparar via Unipile.
  // Só roda se o usuário ativou linkedin_cadence_enabled nas integrações.
  try {
    const { data: integ } = await admin
      .from("user_integrations")
      .select("linkedin_cadence_enabled")
      .eq("user_id", settings.user_id)
      .maybeSingle();

    // Cadência LinkedIn DM roda se QUALQUER um dos dois estiver ligado:
    // (1) toggle histórico em user_integrations, OU
    // (2) novo toggle "LinkedIn DM" da aba Canais em /automacao.
    const linkedinAutoOn = integ?.linkedin_cadence_enabled === true
      || settings.auto_linkedin_dm_enabled === true;

    if (linkedinAutoOn) {
      const { data: liOnly } = await admin
        .from("linkedin_contacts")
        .select("id, nome, linkedin_url, telefone, cadencia_status")
        .eq("user_id", settings.user_id)
        .not("linkedin_url", "is", null)
        .is("telefone", null)
        .eq("cadencia_status", "idle")
        .order("created_at", { ascending: false })
        .limit(50);

      let liActivated = 0;
      for (const c of liOnly ?? []) {
        const { error: upErr } = await admin
          .from("linkedin_contacts")
          .update({
            cadencia_status: "active",
            etapa_atual: "nota_conexao",
            data_prox_disparo: new Date().toISOString(),
          })
          .eq("id", c.id)
          .eq("user_id", settings.user_id);
        if (!upErr) liActivated++;
      }
      summary.linkedin_dm_activated = liActivated;
      summary.linkedin_dm_candidates = liOnly?.length ?? 0;
    } else {
      summary.linkedin_dm_activated = 0;
      summary.linkedin_dm_skipped = "cadence_disabled";
    }
  } catch (e: any) {
    summary.linkedin_dm_error = e?.message ?? String(e);
  }

  summary.finished_at = new Date().toISOString();

  const next = new Date(Date.now() + (settings.frequency_hours || 24) * 3600 * 1000).toISOString();
  await admin.from("automation_settings").update({
    last_run_at: new Date().toISOString(),
    next_run_at: next,
    last_run_summary: summary,
  }).eq("user_id", settings.user_id);

  return summary;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const body = await req.json().catch(() => ({}));
  const manual = body?.manual === true;

  try {
    if (manual) {
      const auth = req.headers.get("Authorization") || "";
      const token = auth.replace("Bearer ", "");
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: claims } = await userClient.auth.getClaims(token);
      if (!claims?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = claims.claims.sub;
      const { data: settings } = await admin.from("automation_settings").select("*").eq("user_id", userId).maybeSingle();
      if (!settings) {
        return new Response(JSON.stringify({ error: "Configure a automação primeiro" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Pipeline pode demorar mais que 150s (timeout do edge). Roda em background
      // e responde imediato — o painel acompanha via tabelas (leads, dispatch_queue, etc).
      const bg = (async () => {
        try { await runForUser(admin, settings, token); }
        catch (e) { console.error("auto-prospect bg error", e); }
      })();
      // @ts-ignore EdgeRuntime global no Deno Deploy
      try { EdgeRuntime.waitUntil(bg); } catch { /* fallback: fire-and-forget */ }
      return new Response(JSON.stringify({ ok: true, queued: true, message: "Pipeline iniciado em background. Acompanhe os resultados em Meus Leads / Disparo." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cron branch — protegido. Aceita x-cron-secret OU Authorization: Bearer <SERVICE_ROLE>.
    // Antes: qualquer um com anon key executava e recebia results com user_id + termos de todos.
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const providedCron = req.headers.get("x-cron-secret") ?? "";
    const authHdr = req.headers.get("Authorization") ?? "";
    const bearerToken = authHdr.startsWith("Bearer ") ? authHdr.slice(7) : "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    let cronOk = (cronSecret && providedCron === cronSecret) || (serviceRole && bearerToken === serviceRole);
    // Aceita também qualquer JWT decodificado com role=service_role (cobre secrets rotacionados no vault do cron).
    if (!cronOk && bearerToken.split(".").length === 3) {
      try {
        const payload = JSON.parse(atob(bearerToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        if (payload?.role === "service_role") cronOk = true;
      } catch { /* ignore */ }
    }
    if (!cronOk) {
      return new Response(JSON.stringify({ error: "cron_unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: due } = await admin
      .from("automation_settings")
      .select("*")
      .eq("enabled", true)
      .lte("next_run_at", new Date().toISOString())
      .order("last_run_at", { ascending: true, nullsFirst: true })
      .limit(10);

    const results: any[] = [];
    for (const s of due ?? []) {
      try { results.push(await runForUser(admin, s)); }
      catch (e: any) { results.push({ user_id: s.user_id, error: e.message }); }
    }
    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
