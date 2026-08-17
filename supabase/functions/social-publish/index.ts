// social-publish — publica um social_posts no LinkedIn ou Instagram via Unipile.
// Body: { post_id: string }
// Pode ser chamado pela UI (publicar agora) ou pelo worker (agendado).
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

type Channel = "linkedin" | "instagram";
const TYPES: Record<Channel, string[]> = { linkedin: ["LINKEDIN"], instagram: ["INSTAGRAM"] };

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()))];
}

function savedAccountIds(extra: Record<string, any>, channel: Channel): string[] {
  const directKey = `account_id_${channel}`;
  const values: unknown[] = [extra[directKey]];
  // Legacy fallback: `account_id` (sem sufixo) só valia para LinkedIn e só deve ser
  // considerado quando NÃO existe o campo novo `account_id_linkedin`. Caso contrário
  // duplica a conta e o publish bloqueia com "escolha a conta no card".
  if (channel === "linkedin" && !extra[directKey]) values.push(extra.account_id);
  const byChannel = extra.accounts_by_channel?.[channel] ?? extra.account_ids_by_channel?.[channel];
  if (Array.isArray(byChannel)) values.push(...byChannel);
  const arrayKey = extra[`account_ids_${channel}`];
  if (Array.isArray(arrayKey)) values.push(...arrayKey);
  return uniqueStrings(values);
}

function accountBlob(a: any) {
  return [a?.type, a?.provider, a?.source, a?.object, ...(Array.isArray(a?.sources) ? a.sources.map((s: any) => s?.type ?? s?.provider ?? s?.source ?? s?.status) : [])]
    .filter(Boolean)
    .map((x: any) => String(x).toUpperCase())
    .join("|");
}

function isChannelAccount(account: any, channel: Channel) {
  const blob = accountBlob(account);
  return TYPES[channel].some((t) => blob.includes(t));
}

async function accountUsedByOtherPanel(admin: any, userId: string, channel: Channel, accountId: string) {
  const keys = channel === "linkedin" ? ["account_id", "account_id_linkedin"] : [`account_id_${channel}`];
  for (const key of keys) {
    const { data } = await admin
      .from("user_api_keys")
      .select("user_id")
      .eq("provider", "unipile")
      .neq("user_id", userId)
      .contains("extra", { [key]: accountId })
      .limit(1);
    if ((data ?? []).length > 0) return true;
  }
  return false;
}

async function validateOwnedAccount(admin: any, userId: string, channel: Channel, dsn: string, apiKey: string, accountId: string) {
  if (await accountUsedByOtherPanel(admin, userId, channel, accountId)) {
    return { error: `A conta ${channel} (${accountId}) também está vinculada a outro painel. Por segurança, bloqueei a publicação para não postar na conta errada. Reconecte seu Instagram em Canais e selecione a conta correta.` };
  }

  try {
    const vr = await fetch(`${dsn}/api/v1/accounts/${accountId}`, { headers: { "X-API-KEY": apiKey, accept: "application/json" } });
    const txt = await vr.text();
    if (!vr.ok) return { error: `A conta ${channel} escolhida (${accountId}) não está mais conectada. Reconecte em Canais e tente de novo.` };
    let account: any = {};
    try { account = JSON.parse(txt || "{}"); } catch { /* ignore */ }
    if (account && Object.keys(account).length > 0 && !isChannelAccount(account, channel)) {
      return { error: `A conta escolhida não parece ser uma conta ${channel}. Selecione/reconecte a conta correta em Canais.` };
    }
    return { accountId };
  } catch {
    return { error: `Não consegui validar a conta ${channel} (${accountId}) no Unipile.` };
  }
}

async function resolveUnipile(admin: any, userId: string, channel: Channel, forceRefresh = false, preferAccountId?: string | null) {
  const { data: row } = await admin.from("user_api_keys").select("api_key, extra").eq("user_id", userId).eq("provider", "unipile").maybeSingle();
  const apiKey = (row?.api_key ?? "").trim();
  const extra = (row?.extra ?? {}) as Record<string, any>;
  const dsn = (extra.dsn ?? "https://api.unipile.com:443").replace(/\/+$/, "");
  if (!apiKey) return { error: "Configure a API Key do Unipile em Configurações → APIs." };
  const ownedIds = savedAccountIds(extra, channel);

  // Conta explicitamente escolhida no post → só aceita se foi vinculada por ESTE usuário.
  if (preferAccountId) {
    if (!ownedIds.includes(preferAccountId)) {
      return { error: `Essa conta ${channel} (${preferAccountId}) não pertence ao seu painel. Bloqueei para não misturar contas. Reconecte seu canal em Canais e escolha a conta correta.` };
    }
    const valid = await validateOwnedAccount(admin, userId, channel, dsn, apiKey, preferAccountId);
    if ("error" in valid) return valid;
    return { apiKey, dsn, accountId: preferAccountId };
  }

  if (ownedIds.length === 0) {
    return { error: `Nenhuma conta ${channel} está vinculada ao seu painel. Conecte em Canais antes de publicar.` };
  }
  if (ownedIds.length > 1) {
    return { error: `Você tem mais de uma conta ${channel} no seu painel. Escolha a conta no card antes de publicar.`, needs_account_choice: true, accounts: ownedIds.map((id) => ({ id, name: id })) };
  }

  const accountId = ownedIds[0];
  const valid = await validateOwnedAccount(admin, userId, channel, dsn, apiKey, accountId);
  if ("error" in valid) return valid;
  return { apiKey, dsn, accountId };
}


const IG_GRAPH = "https://graph.instagram.com/v21.0";

// Publica no Instagram via API OFICIAL da Meta (Content Publishing) usando o
// token long-lived de meta_instagram_accounts. Estável — não depende de sessão
// de cookie do Unipile. Retorna null se o usuário não tem conta Meta (=> fallback
// Unipile); { ok:false, error } em falha; { ok:true, ... } em sucesso.
async function publishInstagramViaMeta(
  admin: any, userId: string, post: any, mediaUrls: string[], caption: string,
): Promise<{ ok: true; mediaId: string | null; permalink: string | null } | { ok: false; error: string } | null> {
  const { data: acc } = await admin
    .from("meta_instagram_accounts")
    .select("ig_user_id, access_token, token_type, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!acc?.ig_user_id || !acc?.access_token) return null;
  if (acc.expires_at && new Date(acc.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "token Meta expirado — reconecte o Instagram (Meta) em Integrações" };
  }
  const ig = String(acc.ig_user_id);
  const token = String(acc.access_token);
  const fmt = String(post.post_format ?? "").toLowerCase();
  const isStory = fmt === "stories" || fmt === "story";
  const isReel = fmt === "reels" || fmt === "reel";

  const igPost = async (path: string, params: Record<string, string>) => {
    const qs = new URLSearchParams({ ...params, access_token: token });
    const res = await fetch(`${IG_GRAPH}/${path}?${qs.toString()}`, { method: "POST" });
    const txt = await res.text();
    let js: any = {}; try { js = JSON.parse(txt); } catch { js = { raw: txt }; }
    return { ok: res.ok, status: res.status, js, txt };
  };
  const errStr = (r: any) => JSON.stringify(r.js?.error ?? r.txt).slice(0, 300);

  // Espera o container ficar pronto (vídeo/reel processa async).
  const waitReady = async (containerId: string, maxTries = 15) => {
    for (let i = 0; i < maxTries; i++) {
      const qs = new URLSearchParams({ fields: "status_code", access_token: token });
      const res = await fetch(`${IG_GRAPH}/${containerId}?${qs.toString()}`);
      const js = await res.json().catch(() => ({}));
      const code = String(js?.status_code ?? "");
      if (code === "FINISHED") return true;
      if (code === "ERROR" || code === "EXPIRED") return false;
      await new Promise((r) => setTimeout(r, 3000));
    }
    return false;
  };

  try {
    let creationId: string | null = null;

    if (isReel) {
      const video = mediaUrls.find((u) => /\.(mp4|mov)(\?|$)/i.test(u)) ?? mediaUrls[0];
      const params: Record<string, string> = { media_type: "REELS", video_url: video, caption };
      if (typeof post.cover_url === "string" && post.cover_url.trim()) params.cover_url = post.cover_url.trim();
      const c = await igPost(`${ig}/media`, params);
      if (!c.ok) return { ok: false, error: `Meta media(reel) ${c.status}: ${errStr(c)}` };
      creationId = c.js?.id ?? null;
    } else if (mediaUrls.length > 1 && !isStory) {
      const childIds: string[] = [];
      for (const url of mediaUrls.slice(0, 10)) {
        const ci = await igPost(`${ig}/media`, { is_carousel_item: "true", image_url: url });
        if (!ci.ok || !ci.js?.id) return { ok: false, error: `Meta carrossel item ${ci.status}: ${errStr(ci)}` };
        childIds.push(String(ci.js.id));
      }
      const c = await igPost(`${ig}/media`, { media_type: "CAROUSEL", children: childIds.join(","), caption });
      if (!c.ok) return { ok: false, error: `Meta carrossel ${c.status}: ${errStr(c)}` };
      creationId = c.js?.id ?? null;
    } else {
      const params: Record<string, string> = { image_url: mediaUrls[0] };
      if (isStory) params.media_type = "STORIES";
      else params.caption = caption;
      const c = await igPost(`${ig}/media`, params);
      if (!c.ok) return { ok: false, error: `Meta media ${c.status}: ${errStr(c)}` };
      creationId = c.js?.id ?? null;
    }

    if (!creationId) return { ok: false, error: "Meta não retornou creation_id" };
    if (!(await waitReady(creationId))) return { ok: false, error: "container Meta não ficou pronto (timeout no processamento)" };

    const pub = await igPost(`${ig}/media_publish`, { creation_id: creationId });
    if (!pub.ok || !pub.js?.id) return { ok: false, error: `Meta media_publish ${pub.status}: ${errStr(pub)}` };
    const mediaId = String(pub.js.id);

    let permalink: string | null = null;
    try {
      const pl = await fetch(`${IG_GRAPH}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`);
      const plj = await pl.json().catch(() => ({}));
      permalink = plj?.permalink ?? null;
    } catch { /* ignore */ }

    return { ok: true, mediaId, permalink };
  } catch (e: any) {
    return { ok: false, error: `Meta publish exception: ${String(e?.message ?? e).slice(0, 200)}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resp({ error: "Method not allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const { post_id } = body;
    if (!post_id) return resp({ error: "post_id obrigatório" }, 400);

    // Resolve user_id: via JWT do usuário OU via service role (cron passa _user_id)
    let userId: string | null = null;
    const isServiceRole = auth.includes(SERVICE_ROLE);
    if (isServiceRole && body._user_id) {
      userId = String(body._user_id);
    } else {
      const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: auth } } });
      const { data: u } = await userClient.auth.getUser();
      userId = u?.user?.id ?? null;
    }
    if (!userId) return resp({ error: "Unauthenticated" }, 401);

    const { data: post, error: pErr } = await admin.from("social_posts").select("*").eq("id", post_id).eq("user_id", userId).maybeSingle();
    if (pErr || !post) return resp({ error: "post não encontrado" }, 404);

    const channel = post.channel as Channel;

    await admin.from("social_posts").update({ status: "publishing", last_error: null }).eq("id", post_id);

    const caption = [post.caption ?? "", post.hashtags ?? ""].filter(Boolean).join("\n\n").trim();
    const mediaUrls: string[] = (Array.isArray(post.media_urls) ? post.media_urls : []).filter(
      (u: any) => typeof u === "string" && u.trim().length > 0,
    );

    // Instagram exige mídia.
    if (channel === "instagram" && mediaUrls.length === 0) {
      const msg = `Esse post de Instagram (${post.post_format ?? post.media_type ?? "post"}) está sem mídia. Adicione/gere a imagem ou vídeo antes de publicar.`;
      await admin.from("social_posts").update({ status: "failed", last_error: msg }).eq("id", post_id);
      return resp({ success: false, error: msg }, 400);
    }

    // ── Instagram: publica via Meta oficial primeiro (token long-lived estável).
    // Unipile fica só como fallback (sessão de cookie que cai). ──
    let metaError: string | null = null;
    if (channel === "instagram") {
      const m = await publishInstagramViaMeta(admin, userId, post, mediaUrls, caption);
      if (m && m.ok) {
        await admin.from("social_posts").update({
          status: "published",
          published_at: new Date().toISOString(),
          post_url: m.permalink ?? null,
          unipile_post_id: m.mediaId ?? null,
        }).eq("id", post_id);
        return resp({ success: true, provider: "meta", media_id: m.mediaId, url: m.permalink });
      }
      if (m && !m.ok) metaError = m.error;
      // m === null → sem conta Meta conectada; segue pro Unipile
    }

    const cfg = await resolveUnipile(admin, userId, channel, false, post.unipile_account_id ?? null);
    if ("error" in cfg) {
      const combined = metaError ? `Instagram via Meta falhou (${metaError}); e via Unipile: ${cfg.error}` : cfg.error;
      await admin.from("social_posts").update({ status: "failed", last_error: combined }).eq("id", post_id);
      return resp({ success: false, error: combined, ...(cfg as any).accounts ? { accounts: (cfg as any).accounts } : {} }, 400);
    }
    const { apiKey, dsn, accountId } = cfg;


    // Unipile POST /posts — multipart com text + attachments (URL ou arquivo).
    const fd = new FormData();
    fd.set("account_id", accountId);
    fd.set("text", caption);

    // Instagram: diferencia Story / Reel / Feed via post_type (Unipile).
    // Sem isso, Story vira post de feed.
    if (channel === "instagram") {
      const fmt = String(post.post_format ?? "").toLowerCase();
      if (fmt === "stories" || fmt === "story") fd.set("post_type", "story");
      else if (fmt === "reels" || fmt === "reel") fd.set("post_type", "reel");
      else fd.set("post_type", "feed");
    }

    for (const url of mediaUrls) {
      // Baixa cada mídia e anexa como blob (Unipile aceita attachments).
      try {
        const mr = await fetch(url);
        if (!mr.ok) continue;
        const blob = await mr.blob();
        const ext = url.split(".").pop()?.split("?")[0] ?? "bin";
        fd.append("attachments", new File([blob], `media_${Date.now()}.${ext}`, { type: blob.type }));
      } catch {/* skip mídia inválida */}
    }

    // Capa do Reels (thumbnail) — Unipile aceita o campo `thumbnail` para vídeos.
    if (post.post_format === "reels" && typeof post.cover_url === "string" && post.cover_url.trim()) {
      try {
        const cr = await fetch(post.cover_url);
        if (cr.ok) {
          const cb = await cr.blob();
          const cext = post.cover_url.split(".").pop()?.split("?")[0] ?? "jpg";
          fd.append("thumbnail", new File([cb], `cover_${Date.now()}.${cext}`, { type: cb.type || "image/jpeg" }));
        }
      } catch {/* capa opcional */}
    }

    let r = await fetch(`${dsn}/api/v1/posts`, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, accept: "application/json" },
      body: fd,
    });
    let t = await r.text();

    // Nunca troca automaticamente para outra conta. Se a conta sumiu, falha para evitar publicar em perfil errado.
    if (r.status === 404 && /account[_ ]?not[_ ]?found/i.test(t)) {
      const msg = `A conta ${channel} selecionada (${accountId}) não foi encontrada no Unipile. Bloqueei troca automática de conta para não postar no painel errado. Reconecte o canal em Canais e tente novamente.`;
      await admin.from("social_posts").update({ status: "failed", last_error: msg }).eq("id", post_id);
      return resp({ success: false, error: msg }, 400);
    }

    if (!r.ok) {
      const uErr = `Unipile /posts ${r.status}: ${t.slice(0, 400)}`;
      const full = metaError ? `Instagram via Meta falhou (${metaError}); Unipile: ${uErr}` : uErr;
      await admin.from("social_posts").update({ status: "failed", last_error: full }).eq("id", post_id);
      return resp({ success: false, error: full }, 502);
    }
    let j: any = {}; try { j = JSON.parse(t); } catch {}
    const postId = j?.id ?? j?.post_id ?? j?.provider_id ?? null;
    let postUrl: string | null = j?.url ?? j?.share_url ?? j?.permalink ?? null;

    // Validação pós-publicação: confirma que o post existe de verdade no provedor.
    // Unipile às vezes responde 200 com id fictício quando o account_id é inválido/obsoleto.
    if (postId) {
      await new Promise((r) => setTimeout(r, 1500));
      const vr = await fetch(`${dsn}/api/v1/posts/${postId}?account_id=${accountId}`, { headers: { "X-API-KEY": apiKey, accept: "application/json" } });
      if (vr.status === 404) {
        const msg = `Unipile aceitou o post mas o provedor (${channel}) não persistiu. Causa provável: a conta conectada (${accountId}) foi desconectada ou não é a conta de destino esperada. Reconecte a conta certa em unipile.com e tente de novo.`;
        await admin.from("social_posts").update({ status: "failed", last_error: msg }).eq("id", post_id);
        return resp({ success: false, error: msg }, 502);
      }
      if (vr.ok) {
        try {
          const vj = await vr.json();
          postUrl = postUrl ?? vj?.url ?? vj?.share_url ?? vj?.permalink ?? null;
        } catch { /* ignore */ }
      }
    }

    await admin.from("social_posts").update({
      status: "published",
      published_at: new Date().toISOString(),
      unipile_post_id: postId,
      unipile_account_id: accountId,
      post_url: postUrl,
    }).eq("id", post_id);

    return resp({ success: true, unipile_post_id: postId, url: postUrl, raw: j });
  } catch (e: any) {
    return resp({ error: String(e?.message ?? e).slice(0, 400) }, 500);
  }
});
