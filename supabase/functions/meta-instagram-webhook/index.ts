// redeploy 2026-07-17 humanização IG DM/comment — gpt-4o + anti-jargão + retry + tenant prompt
// Meta Instagram Webhook — GET verification + realtime processing for comments, DMs and Story replies.
// Public endpoint: Meta calls this without app JWT. We validate by verify token for GET and keep POST idempotent.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateAIContent } from "../_shared/ai-json.ts";
import { buildEngageContext, decideEngagement, applyEscalation } from "../_shared/social-brain.ts";

const VERIFY_TOKEN = Deno.env.get("META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN") ?? Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("META_INSTAGRAM_APP_SECRET") ?? Deno.env.get("META_IG_APP_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.instagram.com/v21.0";

// Valida X-Hub-Signature-256 usando App Secret. Sem isso, payload forjado
// com um ig_user_id conhecido dispararia reply/DM com token real do tenant.
async function verifyMetaSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!APP_SECRET) return false;
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expectedHex = signatureHeader.slice("sha256=".length).toLowerCase();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
  const gotHex = [...sigBuf].map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-time compare
  if (gotHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < gotHex.length; i++) diff |= gotHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return diff === 0;
}

type MetaAccount = {
  user_id: string;
  ig_user_id: string;
  username: string | null;
  access_token: string;
  token_type: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown> | null;
};

type NormalizedEvent = {
  eventType: "comment" | "message" | "story_reply" | "unknown" | "skipped";
  skipReason?: string;
  igUserId: string;
  eventId: string;
  actorId: string;
  actorName: string;
  actorHandle: string;
  text: string;
  commentId?: string;
  mediaId?: string;
  senderId?: string;
  recipientId?: string;
  storyId?: string;
  raw: unknown;
};

const TONE_GUIDE: Record<string, string> = {
  casual: "Tom humano, direto e leve, com no máximo 1 emoji.",
  professional: "Tom profissional, claro, objetivo, sem emojis.",
  consultive: "Tom consultivo SPIN: uma pergunta curta por mensagem, sem pitch agressivo.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode === "subscribe" && token && token === VERIFY_TOKEN) {
      console.log("[meta-ig-webhook] verification OK");
      return new Response(challenge, { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
    }
    console.warn("[meta-ig-webhook] verification FAILED", { mode, tokenMatch: token === VERIFY_TOKEN });
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  let eventRowId: string | null = null;
  let payload: any = {};

  try {
    const raw = await req.text();
    // SEGURANÇA: valida assinatura Meta antes de processar
    const sigHeader = req.headers.get("x-hub-signature-256") ?? req.headers.get("X-Hub-Signature-256");
    const sigOk = await verifyMetaSignature(raw, sigHeader);
    if (!sigOk) {
      console.warn("[meta-ig-webhook] invalid signature — rejecting");
      return new Response("invalid signature", { status: 401, headers: corsHeaders });
    }
    payload = raw ? JSON.parse(raw) : {};
    const normalizedEvents = normalizeEvents(payload);

    for (const normalized of normalizedEvents) {
      const { data: audit, error: auditErr } = await admin
        .from("meta_webhook_events")
        .insert({
          object: payload.object ?? null,
          event_type: normalized.eventType,
          ig_user_id: normalized.igUserId || null,
          payload: normalized.raw ?? payload,
        })
        .select("id")
        .maybeSingle();
      if (auditErr) console.error("[meta-ig-webhook] audit insert error", auditErr.message);
      eventRowId = audit?.id ?? null;

      if (normalized.eventType === "unknown") {
        await markAudit(admin, eventRowId, { processed: true, processing_error: "unsupported_event_shape" });
        continue;
      }
      if (normalized.eventType === "skipped") {
        await markAudit(admin, eventRowId, { processed: true, processing_error: normalized.skipReason ?? "skipped" });
        continue;
      }

      const result = await processEvent(admin, normalized);
      await markAudit(admin, eventRowId, {
        processed: true,
        user_id: result.userId,
        interaction_id: result.interactionId,
        processing_error: result.error,
      });
    }

    return textOk();
  } catch (e) {
    const message = String((e as Error)?.message ?? e).slice(0, 500);
    console.error("[meta-ig-webhook] processing error", message);
    await markAudit(admin, eventRowId, { processed: true, processing_error: message });
    // Meta must receive 200 or it retries aggressively; we audit the failure instead of returning 500.
    return textOk();
  }
});

async function processEvent(admin: any, event: NormalizedEvent): Promise<{ userId: string | null; interactionId: string | null; error: string | null }> {
  const account = await resolveAccount(admin, event);
  if (!account) return { userId: null, interactionId: null, error: "no_meta_account_for_event" };

  const tokenHealth = isTokenUsable(account);
  if (!tokenHealth.ok) {
    await rememberTokenFailure(admin, account, tokenHealth.reason);
    return { userId: account.user_id, interactionId: null, error: tokenHealth.reason };
  }

  const interactionType = event.eventType === "comment" ? "comment" : event.eventType === "story_reply" ? "story_reply" : "dm";
  const eventId = event.eventId || `${event.eventType}_${event.actorId}_${Date.now()}`;

  const { data: existing } = await admin
    .from("social_post_interactions")
    .select("id")
    .eq("unipile_event_id", eventId)
    .maybeSingle();
  if (existing?.id) return { userId: account.user_id, interactionId: existing.id, error: null };

  const { post } = await resolvePost(admin, account.user_id, event);

  // Profile lookup: DM/story events don't come with actor name/handle. Fetch via graph.instagram.com.
  if (event.actorId && (!event.actorName || !event.actorHandle)) {
    const prof = await fetchActorProfile(event.actorId, account.access_token);
    if (prof.username && !event.actorHandle) event.actorHandle = prof.username;
    if (prof.name && !event.actorName) event.actorName = prof.name;
  }

  const { data: interaction, error: insertErr } = await admin
    .from("social_post_interactions")
    .insert({
      user_id: account.user_id,
      post_id: post?.id ?? null,
      channel: "instagram",
      type: interactionType,
      actor_handle: event.actorHandle || null,
      actor_name: event.actorName || null,
      actor_provider_id: event.actorId || null,
      content: event.text || null,
      unipile_event_id: eventId,
    })
    .select("id")
    .maybeSingle();
  if (insertErr) return { userId: account.user_id, interactionId: null, error: `interaction_insert: ${insertErr.message}` };

  const interactionId = interaction?.id ?? null;
  const rules = await loadRules(admin, account.user_id, interactionType, post?.id ?? null, event.mediaId ?? null, event.text);
  const rule = rules[0] ?? null;
  // LEGACY (Fase 2, passo 1): ramo mantido só para posts antigos que já foram publicados
  // com auto_dm_* preenchido em social_posts. NÃO criar novos registros com esses campos —
  // a UI (Conteudo.tsx / AutomateCommentsModal / AutoEngajamentoTab) grava tudo em
  // social_auto_engage_rules. Remover quando não houver mais posts legados ativos.
  const legacyShouldDM = post && (
    (interactionType === "comment" && post.auto_dm_enabled) ||
    (interactionType === "dm" && post.auto_dm_enabled) ||
    (interactionType === "story_reply" && post.auto_dm_enabled)
  );

  if (!rule && !legacyShouldDM) {
    await updateInteraction(admin, interactionId, { error: "no_rule_matched" });
    return { userId: account.user_id, interactionId, error: "no_rule_matched" };
  }

  const displayName = event.actorName || event.actorHandle || "amigo(a)";
  const fillVars = (s: string) => String(s ?? "").replaceAll("{name}", displayName).replaceAll("{handle}", event.actorHandle || displayName);
  let publicReplyText = "";
  let dmText = "";
  let aiError: string | null = null;

  let spinStage: string | null = null;
  let qualified = false;

  if (rule) {
    const baseDm = fillVars(rule.dm_template || "");
    if (rule.mode === "global" && rule.use_ai) {
      const ctx = await buildEngageContext(admin, account.user_id, {
        post,
        actorProviderId: event.actorId,
        leadText: event.text,
        defaultLink: rule.default_link ?? rule.cta_link ?? "",
        moveToDm: rule.move_to_dm_on_interest !== false,
      });
      console.log("[meta-ig-webhook] ctx", {
        products: ctx.products.length,
        knowledge_hits: ctx.knowledgeBlock ? (ctx.knowledgeBlock.match(/\n\[\d+\]/g) ?? []).length : 0,
        owner_contact: !!ctx.ownerContact,
        history: ctx.history.length,
        post_product: !!ctx.postProduct,
      });
      const decision = await decideEngagement({
        ctx,
        eventType: interactionType,
        text: event.text,
        tone: rule.ai_tone ?? "consultive",
        baseDm,
        name: displayName,
      });
      publicReplyText = decision.public_reply ?? "";
      dmText = decision.dm_text ?? "";
      spinStage = decision.spin_stage;
      qualified = decision.qualified;
      if (decision.error) aiError = decision.error;
      console.log("[meta-ig-webhook] decision", { spin: spinStage, qualified, has_dm: !!dmText, recommend: decision.recommend_product?.name ?? null });

      // Fallback: garante que resposta pública ao comentário sempre saia
      // quando reply_public está ativo — a IA às vezes devolve public_reply null.
      if (interactionType === "comment" && rule.reply_public && !publicReplyText) {
        publicReplyText = fillVars(rule.public_reply_template || "") || `Te chamei no direct, ${displayName}!`;
      }

      // ESCALAÇÃO no código (shared): no máx UM bloco de link/contato por DM.
      if (dmText) dmText = applyEscalation(dmText, decision, ctx);

    } else {
      const rewritten = rule.use_ai
        ? await aiRewrite(baseDm || fallbackDm(displayName, interactionType), `Instagram ${interactionType}: "${event.text}"`, rule.ai_tone ?? "consultive", admin, account.user_id)
        : { text: baseDm || fallbackDm(displayName, interactionType), error: null };
      dmText = rewritten.text;
      if (rewritten.error) aiError = rewritten.error;
      if (rule.cta_link) dmText = `${dmText}\n\n👉 ${rule.cta_label || "Confere aqui"}: ${rule.cta_link}`;
      publicReplyText = rule.reply_public && interactionType === "comment" ? fillVars(rule.public_reply_template || "") : "";
    }
  } else if (post) {
    dmText = post.auto_dm_message || fallbackDm(displayName, interactionType);
    if (post.auto_dm_link) dmText = `${dmText}\n\n👉 ${post.auto_dm_cta_label || "Acessar"}: ${post.auto_dm_link}`;
    publicReplyText = interactionType === "comment" ? (post.auto_comment_reply || "") : "";
  }

  let dmOk = false;
  let dmErr: string | null = null;
  let publicOk = false;
  let publicErr: string | null = null;
  let suppressedReason: string | null = null;

  if (interactionType === "comment" && publicReplyText && event.commentId) {
    const rr = await replyToComment(event.commentId, publicReplyText, account.access_token);
    publicOk = rr.ok;
    publicErr = rr.error;
  }

  const shouldSendDM = rule ? rule.send_dm : !!legacyShouldDM;
  if (shouldSendDM && dmText && event.actorId) {
    // P0 anti-spam: cooldown 45min por ator (só para disparo INICIAL a partir de comentário/story_reply).
    // Respostas inbound (interactionType === 'dm') não sofrem corte de tempo — só dedup de conteúdo idêntico.
    const cd = await checkDmCooldown(admin, account.user_id, event.actorId, dmText, interactionType === "dm");
    if (cd.suppress) {
      suppressedReason = cd.reason;
      console.warn("[meta-ig-webhook] DM suppressed", { actor: event.actorId, reason: cd.reason });
    } else {
      const rr = event.commentId
        ? await privateReplyToComment(account.ig_user_id, event.commentId, dmText, account.access_token)
        : await sendMessage(account.ig_user_id, event.actorId, dmText, account.access_token);
      dmOk = rr.ok;
      dmErr = rr.error;
    }
  }

  const errorParts = [publicErr, dmErr, aiError ? `ai:${aiError}` : null, suppressedReason ? `suppressed:${suppressedReason}` : null].filter(Boolean);
  await updateInteraction(admin, interactionId, {
    replied: publicOk,
    reply_content: publicReplyText || null,
    dm_sent: dmOk,
    dm_content: dmText || null,
    error: errorParts.join(" | ") || null,
    spin_stage: spinStage ?? null,
    qualified: !!qualified,
  });


  if (rule?.id) {
    const cur = (await admin.from("social_auto_engage_rules").select("hits_count").eq("id", rule.id).maybeSingle()).data?.hits_count ?? 0;
    await admin.from("social_auto_engage_rules").update({ hits_count: cur + 1, last_hit_at: new Date().toISOString() }).eq("id", rule.id);
  }

  if (dmOk && (rule?.capture_lead ?? true)) {
    await captureLead(admin, account.user_id, event, interactionId);
    if (post?.id) {
      await admin.from("social_posts").update({ dms_sent: (post.dms_sent ?? 0) + 1, leads_created: (post.leads_created ?? 0) + 1 }).eq("id", post.id);
    }
  }

  return { userId: account.user_id, interactionId, error: errorParts.join(" | ") || null };
}

async function checkDmCooldown(admin: any, userId: string, actorId: string, dmText: string, isInboundReply: boolean): Promise<{ suppress: boolean; reason: string }> {
  const cutoff = new Date(Date.now() - 45 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("social_post_interactions")
    .select("id, dm_content, created_at")
    .eq("user_id", userId)
    .eq("actor_provider_id", actorId)
    .eq("dm_sent", true)
    .order("created_at", { ascending: false })
    .limit(5);
  const rows = data ?? [];
  if (rows.some((r: any) => r.dm_content && String(r.dm_content).trim() === dmText.trim())) {
    return { suppress: true, reason: "duplicate_content" };
  }
  if (!isInboundReply && rows.some((r: any) => r.created_at >= cutoff)) {
    return { suppress: true, reason: "cooldown_45min" };
  }
  return { suppress: false, reason: "" };
}


async function fetchActorProfile(actorId: string, token: string): Promise<{ username: string | null; name: string | null }> {
  try {
    const url = `${GRAPH}/${encodeURIComponent(actorId)}?fields=username,name&access_token=${encodeURIComponent(token)}`;
    const r = await fetch(url);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.warn("[meta-ig-webhook] fetchActorProfile fail", r.status, JSON.stringify(sanitize(body)).slice(0, 200));
      return { username: null, name: null };
    }
    return { username: body?.username ?? null, name: body?.name ?? null };
  } catch (e) {
    console.warn("[meta-ig-webhook] fetchActorProfile err", String((e as Error).message).slice(0, 200));
    return { username: null, name: null };
  }
}


function normalizeEvents(payload: any): NormalizedEvent[] {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  const out: NormalizedEvent[] = [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    const messages = Array.isArray(entry?.messaging) ? entry.messaging : [];

    for (const change of changes) out.push(normalizeEntryEvent(entry, change, null));
    for (const messaging of messages) out.push(normalizeEntryEvent(entry, null, messaging));
  }

  return out.length ? out : [normalizeEntryEvent(null, null, null, payload)];
}

function normalizeEntryEvent(entry: any, change: any, messaging: any, fallbackPayload?: any): NormalizedEvent {
  const value = change?.value ?? {};
  const field = String(change?.field ?? "").toLowerCase();
  const igUserId = String(value?.from?.id === entry?.id ? value?.to?.id ?? entry?.id : entry?.id ?? value?.id ?? "");

  if (change && (field.includes("comment") || value?.comment_id || value?.text)) {
    const from = value?.from ?? {};
    const commentId = String(value?.comment_id ?? value?.id ?? "");
    return {
      eventType: "comment",
      igUserId,
      eventId: String(value?.id ?? commentId ?? `${entry?.id}_${Date.now()}`),
      actorId: String(from?.id ?? value?.sender_id ?? ""),
      actorName: String(from?.name ?? from?.username ?? ""),
      actorHandle: String(from?.username ?? ""),
      text: String(value?.text ?? value?.message ?? ""),
      commentId,
      mediaId: String(value?.media?.id ?? value?.media_id ?? ""),
      raw: { entry, change, value },
    };
  }

  if (messaging) {
    const message = messaging.message ?? null;
    const igUserIdMsg = String(messaging.recipient?.id ?? entry?.id ?? "");
    const actorId = String(messaging.sender?.id ?? "");
    const baseSkip = {
      igUserId: igUserIdMsg,
      eventId: String(messaging?.timestamp ?? crypto.randomUUID()),
      actorId,
      actorName: "",
      actorHandle: "",
      text: "",
      raw: { entry, messaging },
    } as const;

    if ((messaging.read || messaging.delivery) && !message) {
      return { eventType: "skipped", skipReason: messaging.read ? "skipped_read" : "skipped_delivery", ...baseSkip };
    }
    if (message?.is_echo === true) {
      return { eventType: "skipped", skipReason: "skipped_echo", ...baseSkip };
    }
    if (messaging.reaction && !message?.text) {
      return { eventType: "skipped", skipReason: "skipped_reaction", ...baseSkip };
    }
    if (!message) {
      return { eventType: "skipped", skipReason: "skipped_no_message", ...baseSkip };
    }

    const isStoryReply = !!message?.reply_to?.story || !!message?.story || String(message?.attachments?.[0]?.type ?? "").includes("story");
    return {
      eventType: isStoryReply ? "story_reply" : "message",
      igUserId: igUserIdMsg,
      eventId: String(message?.mid ?? messaging?.timestamp ?? crypto.randomUUID()),
      actorId,
      actorName: "",
      actorHandle: "",
      text: String(message?.text ?? message?.quick_reply?.payload ?? ""),
      senderId: actorId,
      recipientId: String(messaging.recipient?.id ?? ""),
      storyId: String(message?.reply_to?.story?.id ?? message?.story?.id ?? ""),
      raw: { entry, messaging },
    };
  }

  return { eventType: "unknown", igUserId: String(entry?.id ?? ""), eventId: crypto.randomUUID(), actorId: "", actorName: "", actorHandle: "", text: "", raw: fallbackPayload ?? { entry, change, messaging } };
}

async function resolveAccount(admin: any, event: NormalizedEvent): Promise<MetaAccount | null> {
  let q = admin.from("meta_instagram_accounts").select("user_id, ig_user_id, username, access_token, token_type, expires_at, metadata");
  if (event.igUserId) q = q.eq("ig_user_id", event.igUserId);
  const { data } = await q.maybeSingle();
  if (data) return data as MetaAccount;

  const { data: rows } = await admin.from("meta_instagram_accounts").select("user_id, ig_user_id, username, access_token, token_type, expires_at, metadata").limit(20);
  return (rows ?? []).find((r: any) => String(r?.metadata?.fb_page_id ?? "") === event.igUserId) ?? null;
}

function isTokenUsable(account: MetaAccount): { ok: true } | { ok: false; reason: string } {
  if (!account.access_token) return { ok: false, reason: "missing_meta_token" };
  if (account.token_type === "page_token") return { ok: true };
  if (!account.expires_at) return { ok: false, reason: "token_missing_expiration" };
  if (new Date(account.expires_at).getTime() <= Date.now()) return { ok: false, reason: "token_expired_reconnect_required" };
  return { ok: true };
}

async function rememberTokenFailure(admin: any, account: MetaAccount, reason: string) {
  await admin.from("meta_instagram_accounts").update({
    metadata: {
      ...(account.metadata && typeof account.metadata === "object" ? account.metadata : {}),
      last_webhook_error: reason,
      last_webhook_error_at: new Date().toISOString(),
    },
  }).eq("user_id", account.user_id);
}

async function resolvePost(admin: any, userId: string, event: NormalizedEvent): Promise<{ post: any | null }> {
  if (event.mediaId) {
    const { data } = await admin.from("social_posts").select("*").eq("user_id", userId).eq("unipile_post_id", event.mediaId).maybeSingle();
    if (data) return { post: data };
  }
  return { post: null };
}

async function loadRules(admin: any, userId: string, type: string, postId: string | null, mediaId: string | null, text: string) {
  const { data } = await admin
    .from("social_auto_engage_rules")
    .select("*")
    .eq("user_id", userId)
    .eq("channel", "instagram")
    .eq("active", true)
    .order("priority", { ascending: true });
  const list = data ?? [];
  const norm = (s: string) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const textN = norm(text);
  const matchesPost = (rulePostId: string | null | undefined) => {
    if (!rulePostId) return true;
    return rulePostId === postId || rulePostId === mediaId;
  };
  const keywordHit = (rule: any) => {
    const kwRaw = String(rule.keyword ?? "");
    if (!kwRaw.trim()) return false;
    const parts = kwRaw.split(",").map((k: string) => norm(k).trim()).filter(Boolean);
    return parts.some((k: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "u").test(textN));
  };
  if (type === "comment") {
    return list.filter((r: any) => {
      if (!matchesPost(r.post_id)) return false;
      if (r.mode === "keyword") return keywordHit(r);
      if (r.mode === "global") return true;
      return false;
    });
  }
  if (type === "dm") {
    const exact = list.filter((r: any) => r.mode === "dm");
    return exact.length ? exact : list.filter((r: any) => r.mode === "global");
  }
  if (type === "story_reply") {
    const exact = list.filter((r: any) => r.mode === "story_reply");
    return exact.length ? exact : list.filter((r: any) => r.mode === "global");
  }
  return [];
}


async function aiRewrite(baseText: string, ctx: string, tone: string, admin: any, userId: string): Promise<{ text: string; error: string | null }> {
  if (!baseText) return { text: baseText, error: null };
  try {
    const content = await generateAIContent(admin, userId, {
      system: `Reescreva em PT-BR. ${TONE_GUIDE[tone] ?? TONE_GUIDE.consultive} Retorne só o texto.`,
      user: `Contexto: ${ctx}\nMensagem: ${baseText}`,
      maxTokens: 180,
    });
    const text = String(content ?? "").trim() || baseText;
    return { text, error: null };
  } catch (e) {
    const reason = String((e as Error)?.message ?? e).slice(0, 200);
    console.error("[meta-ig-webhook] aiRewrite fallback", reason);
    return { text: baseText, error: `rewrite_fallback:${reason}` };
  }
}


async function replyToComment(commentId: string, text: string, token: string) {
  return graphPost(`${GRAPH}/${encodeURIComponent(commentId)}/replies`, { message: text, access_token: token });
}

async function privateReplyToComment(_igUserId: string, commentId: string, text: string, token: string) {
  return graphPost(`${GRAPH}/me/messages`, { recipient: JSON.stringify({ comment_id: commentId }), message: JSON.stringify({ text }), access_token: token });
}

async function sendMessage(_igUserId: string, recipientId: string, text: string, token: string) {
  return graphPost(`${GRAPH}/me/messages`, { recipient: JSON.stringify({ id: recipientId }), message: JSON.stringify({ text }), access_token: token });
}

async function graphPost(url: string, params: Record<string, string>) {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
    const body = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true, error: null };
    return { ok: false, error: `${r.status}: ${JSON.stringify(sanitize(body)).slice(0, 300)}` };
  } catch (e) {
    return { ok: false, error: String((e as Error).message).slice(0, 300) };
  }
}

async function captureLead(admin: any, userId: string, event: NormalizedEvent, interactionId: string | null) {
  const username = event.actorHandle || event.actorId;
  const row = { user_id: userId, username, nome: event.actorName || null, provider_id: event.actorId || null, profile_url: event.actorHandle ? `https://instagram.com/${event.actorHandle}` : null, extraction_source: `meta_${event.eventType}`, extraction_target: "instagram_auto_engage" };
  const { data: existing } = event.actorId
    ? await admin.from("instagram_contacts").select("id").eq("user_id", userId).eq("provider_id", event.actorId).maybeSingle()
    : await admin.from("instagram_contacts").select("id").eq("user_id", userId).eq("username", username).maybeSingle();
  const lead = existing?.id
    ? existing
    : (await admin.from("instagram_contacts").insert(row).select("id").maybeSingle()).data;
  if (lead?.id && interactionId) {
    await admin.from("social_post_interactions").update({ lead_created: true, lead_table: "instagram_contacts", lead_id: lead.id }).eq("id", interactionId);
  }
}

async function updateInteraction(admin: any, id: string | null, patch: Record<string, unknown>) {
  if (!id) return;
  await admin.from("social_post_interactions").update(patch).eq("id", id);
}

async function markAudit(admin: any, id: string | null, patch: Record<string, unknown>) {
  if (!id) return;
  await admin.from("meta_webhook_events").update({ ...patch, processed_at: new Date().toISOString() }).eq("id", id);
}

function fallbackDm(name: string, type: string) {
  if (type === "story_reply") return `Oi, ${name}! Vi sua resposta no story. Quer que eu te mande os detalhes por aqui?`;
  return `Oi, ${name}! Vi sua mensagem. Quer que eu te mande os detalhes por aqui?`;
}

function textOk() {
  return new Response("EVENT_RECEIVED", { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
}

function sanitize(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sanitize);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (/access_token|client_secret|authorization|password|cookie/i.test(k)) out[k] = "[redacted]";
    else if (val && typeof val === "object") out[k] = sanitize(val);
    else out[k] = val;
  }
  return out;
}
