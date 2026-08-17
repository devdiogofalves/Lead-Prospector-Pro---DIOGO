// unipile-inbox-sync — sincroniza conversas recentes da Unipile para o Inbox Unificado.
// Canais: Instagram, Telegram, LinkedIn, Messenger e E-mail.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const resp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Channel = "instagram" | "telegram" | "linkedin" | "messenger" | "email";

const CHAT_CHANNELS: Channel[] = ["instagram", "telegram", "linkedin", "messenger"];
const ALL_CHANNELS: Channel[] = [...CHAT_CHANNELS, "email"];

const ACCOUNT_KEYS: Record<Channel, string[]> = {
  instagram: ["account_id_instagram"],
  telegram: ["account_id_telegram"],
  linkedin: ["account_id_linkedin", "account_id"],
  messenger: ["account_id_messenger", "account_id_facebook"],
  email: ["account_id_email", "account_id_google", "account_id_outlook", "account_id_imap"],
};

function normalizeDsn(raw: string | undefined): string {
  let dsn = (raw || "https://api.unipile.com:443").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(dsn)) dsn = `https://${dsn}`;
  return dsn;
}

function asArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  return payload?.items ?? payload?.data ?? payload?.messages ?? payload?.emails ?? [];
}

function textOf(obj: any): string {
  const candidates = [
    obj?.text, obj?.content, obj?.body, obj?.plain_text, obj?.message,
    obj?.message?.text, obj?.message?.content, obj?.message?.body,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return stripHtml(c).slice(0, 4000);
  }
  return "";
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeIdentity(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const clean = String(value).replace(/^@+/, "").trim().toLowerCase();
  return clean || null;
}

function identityValues(values: unknown[]): string[] {
  return [...new Set(values.map(normalizeIdentity).filter((v): v is string => Boolean(v)))];
}

function isOutbound(m: any, accountId?: string): boolean {
  const dir = String(m?.direction ?? m?.message?.direction ?? "").toLowerCase();
  if (m?.is_sender === true || m?.message?.is_sender === true || dir === "outbound" || dir === "sent") return true;
  if (!accountId) return false;
  const sender = m?.sender ?? m?.from ?? m?.message?.sender ?? m?.message?.from ?? {};
  const senderValues = identityValues([
    sender?.attendee_provider_id,
    sender?.provider_id,
    sender?.id,
    sender?.username,
    sender?.public_identifier,
    sender?.attendee_specifics?.public_identifier,
  ]);
  return senderValues.includes(normalizeIdentity(accountId) ?? "");
}

function isChatGroup(chat: any): boolean {
  const attendees = Array.isArray(chat?.attendees) ? chat.attendees : [];
  const rawType = chat?.type ?? chat?.chat_type ?? chat?.kind;
  const type = String(rawType ?? "").toLowerCase();
  return chat?.is_group === true || attendees.length > 2 || rawType === 2 || rawType === 3 ||
    /group|channel|supergroup|broadcast/.test(type) || Number(chat?.attendees_count ?? 0) > 2;
}

function isTelegramOneToOne(chat: any): boolean {
  const attendees = Array.isArray(chat?.attendees) ? chat.attendees : [];
  // Para Telegram, a Unipile pode listar canais públicos como "chat" comum.
  // Só sincronizamos histórico quando a resposta da API traz participantes reais
  // suficientes para confirmar que é DM 1:1. Webhook continua cobrindo DMs novas.
  if (!attendees.length) return false;
  const realAttendees = attendees.filter((a: any) => !a?.is_self && !a?.is_current_user);
  return attendees.length <= 2 && realAttendees.length >= 1;
}

function pickLeadFromChat(chat: any, message?: any) {
  const attendees = Array.isArray(chat?.attendees) ? chat.attendees : [];
  const sender = message?.sender ?? message?.from ?? message?.message?.sender ?? message?.message?.from ?? {};
  const lead = attendees.find((a: any) => !a?.is_self && !a?.is_current_user) ?? attendees[0] ?? sender ?? {};
  const name =
    sender?.name ?? sender?.display_name ?? sender?.attendee_name ??
    lead?.name ?? lead?.display_name ?? lead?.attendee_name ??
    chat?.name ?? chat?.subject ?? null;
  const providerId =
    sender?.provider_id ?? sender?.attendee_provider_id ?? sender?.id ??
    lead?.provider_id ?? lead?.attendee_provider_id ?? lead?.id ?? null;
  const profileUrl =
    sender?.profile_url ?? sender?.attendee_profile_url ?? lead?.profile_url ?? lead?.attendee_profile_url ?? null;
  const email = sender?.email ?? lead?.email ?? sender?.identifier ?? lead?.identifier ?? null;
  return {
    name: name ? String(name) : null,
    providerId: providerId ? String(providerId) : null,
    profileUrl: profileUrl ? String(profileUrl) : null,
    email: email ? String(email) : null,
  };
}

function pickEmailSender(email: any) {
  const from = Array.isArray(email?.from) ? email.from[0] : email?.from ?? email?.sender ?? {};
  const identifier = from?.identifier ?? from?.email ?? from?.address ?? email?.from_email ?? email?.sender_email ?? null;
  const name = from?.display_name ?? from?.name ?? email?.from_name ?? identifier ?? null;
  return {
    email: identifier ? String(identifier).toLowerCase() : null,
    name: name ? String(name) : null,
  };
}

function createdAtOf(obj: any): string {
  return obj?.created_at ?? obj?.date ?? obj?.timestamp ?? obj?.received_at ?? new Date().toISOString();
}

async function fetchJson(url: string, apiKey: string): Promise<{ ok: boolean; status: number; body: any; text: string }> {
  const r = await fetch(url, { headers: { "X-API-KEY": apiKey, accept: "application/json" } });
  const text = await r.text();
  let body: any = {};
  try { body = JSON.parse(text); } catch { body = {}; }
  return { ok: r.ok, status: r.status, body, text };
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
    const requested = String(body?.channel ?? "all").toLowerCase();
    const channels = requested === "all"
      ? ALL_CHANNELS
      : ALL_CHANNELS.includes(requested as Channel)
        ? [requested as Channel]
        : [];
    if (!channels.length) return resp({ error: "channel inválido" }, 400);

    const limit = Math.min(Math.max(Number(body?.limit ?? 30), 1), 100);
    const { data: row } = await admin.from("user_api_keys")
      .select("api_key, extra")
      .eq("user_id", userId)
      .eq("provider", "unipile")
      .maybeSingle();

    const apiKey = (row?.api_key ?? "").trim();
    const extra = (row?.extra ?? {}) as Record<string, any>;
    const dsn = normalizeDsn(extra.dsn);
    if (!apiKey) return resp({ success: false, error: "Unipile não está ativo para este usuário." }, 400);

    const results: Record<string, any> = {};
    for (const channel of channels) {
      const accountId = ACCOUNT_KEYS[channel].map((k) => extra[k]).find(Boolean);
      if (!accountId) {
        results[channel] = { skipped: "account_not_connected" };
        continue;
      }
      results[channel] = channel === "email"
        ? await syncEmails(admin, { userId, apiKey, dsn, accountId, limit })
        : await syncChats(admin, { userId, apiKey, dsn, accountId, channel, limit });
    }

    return resp({ success: true, results });
  } catch (e: any) {
    console.error("[unipile-inbox-sync] error", e?.message ?? e);
    return resp({ success: false, error: String(e?.message ?? e).slice(0, 500) }, 500);
  }
});

async function syncChats(admin: any, ctx: { userId: string; apiKey: string; dsn: string; accountId: string; channel: Channel; limit: number }) {
  const list = await fetchJson(`${ctx.dsn}/api/v1/chats?account_id=${encodeURIComponent(ctx.accountId)}&limit=${ctx.limit}`, ctx.apiKey);
  if (!list.ok) return { error: `Unipile chats ${list.status}: ${list.text.slice(0, 240)}` };
  const chats = asArray(list.body);
  let conversations = 0;
  let messages = 0;
  let skippedGroups = 0;

  for (const chat of chats) {
    if (!chat?.id) continue;
    if (isChatGroup(chat) || (ctx.channel === "telegram" && !isTelegramOneToOne(chat))) {
      skippedGroups++;
      continue;
    }

    const msgList = await fetchJson(`${ctx.dsn}/api/v1/chats/${encodeURIComponent(chat.id)}/messages?limit=20`, ctx.apiKey);
    const rawMessages = msgList.ok ? asArray(msgList.body) : [chat?.last_message, chat?.message].filter(Boolean);
    const inbound = rawMessages.filter((m: any) => m && !isOutbound(m, ctx.accountId) && textOf(m) && !(ctx.channel === "telegram" && m?.is_forwarded === true));
    if (!inbound.length) continue;

    const latest = inbound[inbound.length - 1];
    const lead = pickLeadFromChat(chat, latest);
    const conversationId = await upsertConversation(admin, {
      userId: ctx.userId,
      channel: ctx.channel,
      accountId: ctx.accountId,
      conversationKey: String(chat.id),
      name: lead.name,
      replyTo: lead.email,
      subject: chat?.subject ?? chat?.name ?? null,
      providerId: lead.providerId,
      lastAt: createdAtOf(latest),
    });
    conversations++;

    for (const msg of inbound) {
      const inserted = await insertMessageIfNew(admin, {
        userId: ctx.userId,
        conversationId,
        channel: ctx.channel,
        messageId: msg?.id ?? msg?.message_id ?? null,
        content: textOf(msg),
        payload: msg,
        createdAt: createdAtOf(msg),
      });
      if (inserted) messages++;
    }
  }

  return { conversations, messages, skipped_groups: skippedGroups };
}

async function syncEmails(admin: any, ctx: { userId: string; apiKey: string; dsn: string; accountId: string; limit: number }) {
  const list = await fetchJson(`${ctx.dsn}/api/v1/emails?account_id=${encodeURIComponent(ctx.accountId)}&limit=${ctx.limit}`, ctx.apiKey);
  if (!list.ok) return { error: `Unipile emails ${list.status}: ${list.text.slice(0, 240)}` };
  const emails = asArray(list.body).filter((m: any) => !isOutbound(m, ctx.accountId) && textOf(m));
  let conversations = 0;
  let messages = 0;

  for (const email of emails) {
    const sender = pickEmailSender(email);
    if (!sender.email) continue;
    const key = `email:${email?.thread_id ?? email?.conversation_id ?? sender.email}`;
    const conversationId = await upsertConversation(admin, {
      userId: ctx.userId,
      channel: "email",
      accountId: ctx.accountId,
      conversationKey: key,
      name: sender.name,
      replyTo: sender.email,
      subject: email?.subject ?? email?.thread?.subject ?? null,
      providerId: null,
      lastAt: createdAtOf(email),
    });
    conversations++;
    const inserted = await insertMessageIfNew(admin, {
      userId: ctx.userId,
      conversationId,
      channel: "email",
      messageId: email?.id ?? email?.message_id ?? null,
      content: textOf(email),
      payload: email,
      createdAt: createdAtOf(email),
    });
    if (inserted) messages++;
  }
  return { conversations, messages };
}

async function upsertConversation(admin: any, row: {
  userId: string; channel: Channel; accountId: string; conversationKey: string;
  name: string | null; replyTo: string | null; subject: string | null; providerId: string | null; lastAt: string;
}): Promise<string> {
  const { data: existing } = await admin.from("qualification_conversations")
    .select("id")
    .eq("user_id", row.userId)
    .eq("unipile_chat_id", row.conversationKey)
    .maybeSingle();

  const patch = {
    channel: row.channel,
    unipile_account_id: row.accountId,
    unipile_reply_to: row.replyTo,
    unipile_subject: row.subject,
    unipile_provider_id: row.providerId,
    nome: row.name ?? row.replyTo ?? "Contato sem nome",
    nome_contato: row.name,
    last_inbound_at: row.lastAt,
    last_message_at: row.lastAt,
  };

  if (existing?.id) {
    await admin.from("qualification_conversations").update(patch).eq("id", existing.id);
    return existing.id;
  }

  const { data: inserted, error } = await admin.from("qualification_conversations").insert({
    user_id: row.userId,
    telefone: null,
    status: "active",
    unipile_chat_id: row.conversationKey,
    ...patch,
  }).select("id").single();
  if (error) throw error;
  return inserted.id;
}

async function insertMessageIfNew(admin: any, row: {
  userId: string; conversationId: string; channel: Channel; messageId: string | null;
  content: string; payload: any; createdAt: string;
}): Promise<boolean> {
  if (row.messageId) {
    const { data: existing } = await admin.from("qualification_messages")
      .select("id")
      .eq("user_id", row.userId)
      .eq("message_id", row.messageId)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return false;
  }

  const { error } = await admin.from("qualification_messages").insert({
    user_id: row.userId,
    conversation_id: row.conversationId,
    telefone: null,
    channel: row.channel,
    role: "user",
    content: row.content,
    processed: false,
    message_id: row.messageId,
    evolution_response: row.payload,
    created_at: row.createdAt,
  });
  if (error) throw error;
  return true;
}