// unipile-instagram-scrape — Scraping Instagram via Unipile (substitui Apify).
//
// Body: { mode: "profile"|"followers"|"following", target: string, limit?: number }
// - mode=profile: retorna dados de 1 perfil (bio, seguidores, verificado, business, external_url)
// - mode=followers: seguidores do @target (paginado até atingir limit)
// - mode=following: quem @target segue (paginado até atingir limit)
//
// Sem cap de limite — o usuário decide. Rate-limit do Instagram (~100/dia por conta
// conectada) é responsabilidade dele; retornamos erro claro se 429/rate.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Regex BR celular: opcional +55, DDD (2 díg), 9 opcional, 8 díg. Cobre bio livre.
const PHONE_RE = /(?:\+?55[\s-]*)?\(?([1-9]{2})\)?[\s-]*(9?\d{4})[\s-]*(\d{4})/g;

function extractPhoneFromBio(bio: string | null | undefined): string | null {
  if (!bio) return null;
  PHONE_RE.lastIndex = 0;
  const m = PHONE_RE.exec(bio);
  if (!m) return null;
  const ddd = m[1];
  const p1 = m[2].length === 4 ? "9" + m[2] : m[2];
  const p2 = m[3];
  return `55${ddd}${p1}${p2}`;
}

function extractEmailFromBio(bio: string | null | undefined): string | null {
  if (!bio) return null;
  const m = bio.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0].toLowerCase() : null;
}

// Valida número via Mandrack (opcional — só quando o usuário liga o toggle).
async function validateWhatsApp(phone: string, userId: string, admin: any): Promise<boolean> {
  const MAND_URL = (Deno.env.get("MANDRACK_URL") ?? "https://api.mandrackstudio.ia.br").trim().replace(/\/$/, "");
  try {
    const { data: integ } = await admin
      .from("user_integrations")
      .select("mandrack_instance_id, mandrack_instance_token")
      .eq("user_id", userId)
      .maybeSingle();
    const instanceId = integ?.mandrack_instance_id;
    const instanceToken = integ?.mandrack_instance_token;
    if (!instanceId || !instanceToken) return false;
    let formatted = phone.replace(/\D/g, "");
    if (!formatted.startsWith("55")) formatted = "55" + formatted;
    const r = await fetch(`${MAND_URL}/instance/${instanceId}/check-number`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${instanceToken}` },
      body: JSON.stringify({ number: formatted }),
    });
    if (!r.ok) return false;
    const data = await r.json().catch(() => ({}));
    return Boolean(data?.exists ?? data?.isWhatsapp ?? data?.valid);
  } catch {
    return false;
  }
}

async function resolveUnipileIG(admin: any, userId: string) {
  const { data: row } = await admin
    .from("user_api_keys")
    .select("api_key, extra")
    .eq("user_id", userId)
    .eq("provider", "unipile")
    .maybeSingle();
  const apiKey = (row?.api_key ?? "").trim();
  const extra = (row?.extra ?? {}) as Record<string, any>;
  const dsn = (extra.dsn ?? "https://api.unipile.com:443").replace(/\/+$/, "");
  if (!apiKey) return { error: "Configure a API Key do Unipile em Configurações → APIs." };
  const accountId = extra.account_id_instagram ?? extra.accounts_by_channel?.instagram?.[0];
  if (!accountId) {
    return {
      error: "Nenhuma conta Instagram vinculada no Unipile. Conecte em Configurações → Canais.",
      needs_connection: true,
    };
  }
  return { apiKey, dsn, accountId: String(accountId) };


}

function mapUnipileUser(u: any) {
  const username = String(u?.username ?? u?.handle ?? u?.provider_username ?? "").replace(/^@+/, "");
  const bio = u?.biography ?? u?.bio ?? null;
  return {
    provider_id: String(u?.provider_id ?? u?.id ?? u?.attendee_provider_id ?? "") || null,
    username,
    nome: u?.full_name ?? u?.name ?? null,
    bio,
    seguidores: Number(u?.followers_count ?? u?.followers ?? 0) || 0,
    seguindo: Number(u?.following_count ?? u?.following ?? 0) || 0,
    posts: Number(u?.posts_count ?? u?.media_count ?? u?.posts ?? 0) || 0,
    is_verified: !!(u?.is_verified ?? u?.verified),
    is_business: !!(u?.is_business ?? u?.is_business_account),
    profile_pic_url: u?.profile_pic_url ?? u?.picture_url ?? null,
    external_url: u?.external_url ?? u?.website ?? null,
  };
}

async function fetchProfile(dsn: string, apiKey: string, accountId: string, identifier: string) {
  const clean = identifier.replace(/^@+/, "");
  const r = await fetch(
    `${dsn}/api/v1/users/${encodeURIComponent(clean)}?account_id=${encodeURIComponent(accountId)}`,
    { headers: { "X-API-KEY": apiKey, accept: "application/json" } },
  );
  const t = await r.text();
  if (!r.ok) throw new Error(`Unipile ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
}

async function fetchRelations(
  dsn: string,
  apiKey: string,
  accountId: string,
  userProviderId: string,
  kind: "followers" | "following",
  limit: number,
) {
  const collected: any[] = [];
  let cursor: string | null = null;
  const pageSize = 25; // Instagram cap per Unipile docs
  while (collected.length < limit) {
    const params = new URLSearchParams({
      account_id: accountId,
      user_id: userProviderId,
      limit: String(Math.min(pageSize, limit - collected.length)),
    });
    if (cursor) params.set("cursor", cursor);
    const url = `${dsn}/api/v1/users/${kind}?${params}`;
    const r = await fetch(url, { headers: { "X-API-KEY": apiKey, accept: "application/json" } });
    const t = await r.text();
    if (r.status === 429) throw new Error("Instagram travou por excesso de requisições. Aguarde ~1h e tente com um limite menor.");
    if (r.status === 401 && t.includes("disconnected_account")) {
      throw new Error("Sua conta Instagram no Unipile desconectou. Reconecte em Configurações → Canais.");
    }
    if (!r.ok) throw new Error(`Unipile ${kind} ${r.status}: ${t.slice(0, 300)}`);
    let j: any = {};
    try { j = JSON.parse(t); } catch { break; }
    const items = j?.items ?? j?.data ?? j?.users ?? [];
    if (!Array.isArray(items) || items.length === 0) break;
    collected.push(...items);
    cursor = j?.cursor ?? j?.next_cursor ?? j?.paging?.cursor ?? null;
    if (!cursor) break;
  }
  return collected.slice(0, limit);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resp({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return resp({ error: "Missing Authorization" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return resp({ error: "Unauthenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode ?? "").toLowerCase();
    const target = String(body?.target ?? body?.targetAccount ?? "").trim();
    const limit = Math.max(1, Number(body?.limit ?? body?.maxResults ?? 50));
    const shouldValidate = Boolean(body?.validateWhatsapp ?? body?.validateWhatsApp ?? false);

    if (!["profile", "followers", "following"].includes(mode)) {
      return resp({ error: "mode inválido (profile|followers|following)" }, 400);
    }
    if (!target) return resp({ error: "target obrigatório" }, 400);

    const cfg = await resolveUnipileIG(admin, userId);
    if ("error" in cfg) return resp({ success: false, ...cfg }, 400);
    const { apiKey, dsn, accountId } = cfg;

    // Sempre resolve perfil primeiro (precisamos do provider_id para followers/following)
    let targetProfile: any;
    try {
      targetProfile = await fetchProfile(dsn, apiKey, accountId, target);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("401") && msg.includes("disconnected_account")) {
        return resp({ success: false, needs_connection: true, error: "Instagram desconectado no Unipile. Reconecte." }, 200);
      }
      return resp({ success: false, error: `Perfil não encontrado: ${msg.slice(0, 220)}` }, 400);
    }

    // Orçamento total ~120s (limite do worker é 150s). Ao estourar, para de
    // enriquecer/validar e salva o que já tem, retornando parcial.
    const started = Date.now();
    const BUDGET_MS = 120_000;
    const timeLeft = () => BUDGET_MS - (Date.now() - started);

    let saved = 0;
    let withPhone = 0;
    let validated = 0;
    let found = 0;
    let partial = false;

    async function persist(p: any) {
      if (!p?.username) return;
      const phone = extractPhoneFromBio(p.bio);
      const email = extractEmailFromBio(p.bio);
      if (phone) withPhone++;
      let isValid = false;
      if (phone && shouldValidate && timeLeft() > 5000) {
        isValid = await validateWhatsApp(phone, userId, admin);
        if (isValid) validated++;
      }
      const record: Record<string, any> = {
        user_id: userId,
        username: p.username,
        nome: p.nome,
        bio: p.bio,
        seguidores: p.seguidores,
        seguindo: p.seguindo,
        posts: p.posts,
        email,
        whatsapp: phone,
        whatsapp_validado: isValid,
        profile_url: `https://instagram.com/${p.username}`,
        provider_id: p.provider_id,
        is_verified: p.is_verified,
        is_business: p.is_business,
        profile_pic_url: p.profile_pic_url,
        site: p.external_url,
        extraction_source: mode,
        extraction_target: target.replace(/^@+/, ""),
        updated_at: new Date().toISOString(),
      };
      const cleaned: Record<string, any> = {};
      for (const [k, v] of Object.entries(record)) if (v !== undefined) cleaned[k] = v;
      const { error } = await admin
        .from("instagram_contacts")
        .upsert(cleaned, { onConflict: "user_id,username" });
      if (!error) saved++;
      else console.error("upsert instagram_contacts:", error.message, "for", p.username);
    }

    if (mode === "profile") {
      found = 1;
      await persist(mapUnipileUser(targetProfile));
      return resp({
        success: true, mode, target, limit, found, saved, withPhone, validated,
        validatedWhatsapp: shouldValidate, partial: false, elapsedMs: Date.now() - started,
      });
    }

    const pid = targetProfile?.provider_id ?? targetProfile?.id;
    if (!pid) return resp({ success: false, error: "Perfil-alvo sem provider_id retornado pelo Unipile." }, 400);

    // Background job — evita 504. Cliente pode acompanhar via realtime em instagram_contacts.
    const enrich = body?.enrich === true; // default false pra ser rápido
    const job = (async () => {
      try {
        const items = await fetchRelations(dsn, apiKey, accountId, String(pid), mode as any, limit);
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          let mapped: any;
          if (enrich && timeLeft() > 5000) {
            const key = it?.provider_id ?? it?.id ?? it?.username;
            try {
              const full = await fetchProfile(dsn, apiKey, accountId, String(key));
              mapped = mapUnipileUser({ ...it, ...full });
            } catch { mapped = mapUnipileUser(it); }
            await new Promise((r) => setTimeout(r, 150));
          } else {
            mapped = mapUnipileUser(it);
          }
          await persist(mapped);
        }
        console.log(`[unipile-ig] background done: ${mode} ${target} saved=${saved}/${items.length}`);
      } catch (e: any) {
        console.error(`[unipile-ig] background error:`, String(e?.message ?? e));
      }
    })();

    // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(job);

    return resp({
      success: true, background: true, mode, target, limit,
      message: "Extração rodando em background. Os leads aparecerão na tabela conforme forem salvos.",
    });
  } catch (e: any) {
    return resp({ success: false, error: String(e?.message ?? e).slice(0, 400) }, 500);
  }
});

