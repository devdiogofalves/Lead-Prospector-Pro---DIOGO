// unipile-send — Hub multicanal via Unipile (e-mail, Instagram, Telegram, Messenger, LinkedIn).
//
// Body:
//   {
//     channel: "email" | "linkedin" | "instagram" | "telegram" | "messenger",
//     // E-mail
//     to?: string,            // destinatário (email)
//     subject?: string,
//     html?: string,
//     text?: string,
//     from_name?: string,
//     reply_to?: string,
//     // Mensageria
//     chat_id?: string,       // se já existe conversa, prefira chat_id
//     attendees_ids?: string[],
//     account_id?: string,    // override do account_id (auto-detecta se omitido)
//   }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function upstreamFailure(label: string, status: number, bodyText: string, channel?: Channel) {
  const body = bodyText.slice(0, 400);
  const lower = bodyText.toLowerCase();
  const disconnected =
    status === 401 ||
    status === 403 ||
    lower.includes("disconnected_account") ||
    lower.includes("invalid account") ||
    lower.includes("account disconnected");

  console.warn(`[unipile-send] ${label} failed`, { status, channel, body });

  return resp({
    success: false,
    provider: "unipile",
    channel,
    needs_connection: disconnected || undefined,
    error: disconnected && channel
      ? `Sua conta ${CHANNEL_LABEL[channel]} no Unipile está desconectada ou sem permissão. Reconecte para continuar.`
      : `${label} ${status}: ${body}`,
    recipient_unreachable: /user_unreachable|recipient unreachable|does not allow incoming/i.test(bodyText) || undefined,
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Channel = "email" | "linkedin" | "instagram" | "telegram" | "messenger";

// Mapa de canal Unipile → tipo de conta esperado em /accounts
const ACCOUNT_TYPE_BY_CHANNEL: Record<Channel, string[]> = {
  email: ["GOOGLE", "OUTLOOK", "IMAP", "MAIL"],
  linkedin: ["LINKEDIN"],
  instagram: ["INSTAGRAM"],
  telegram: ["TELEGRAM"],
  messenger: ["MESSENGER", "FACEBOOK"],
};

const CHANNEL_LABEL: Record<Channel, string> = {
  email: "e-mail",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  telegram: "Telegram",
  messenger: "Messenger",
};

const CHANNEL_CONNECT_HINT: Record<Channel, string> = {
  email: "Conecte uma conta Gmail, Outlook ou IMAP no Unipile usando a mesma API Key.",
  linkedin: "Conecte uma conta LinkedIn no Unipile usando a mesma API Key.",
  instagram: "Conecte uma conta Instagram no Unipile usando a mesma API Key.",
  telegram: "Conecte uma conta Telegram no Unipile usando a mesma API Key.",
  messenger: "Conecte uma conta Messenger/Facebook no Unipile usando a mesma API Key.",
};

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()))];
}

function asArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  return payload?.items ?? payload?.data ?? payload?.chats ?? [];
}

function normalizedLookupValues(values: unknown[]): string[] {
  return uniqueStrings(values)
    .map((value) => value.replace(/^@+/, "").trim().toLowerCase())
    .filter(Boolean);
}

function chatAttendeeValues(chat: any): string[] {
  const attendees = Array.isArray(chat?.attendees) ? chat.attendees
    : Array.isArray(chat?.participants) ? chat.participants
      : [];
  const values: unknown[] = [
    chat?.provider_id,
    chat?.attendee_provider_id,
    chat?.attendee_public_identifier,
    chat?.public_identifier,
    chat?.username,
    chat?.name,
  ];
  for (const attendee of attendees) {
    values.push(
      attendee?.provider_id,
      attendee?.attendee_provider_id,
      attendee?.id,
      attendee?.public_identifier,
      attendee?.attendee_public_identifier,
      attendee?.username,
      attendee?.handle,
      attendee?.identifier,
      attendee?.name,
      attendee?.display_name,
      attendee?.attendee_name,
      attendee?.attendee_specifics?.public_identifier,
      attendee?.attendee_specifics?.username,
      attendee?.attendee_specifics?.provider_id,
    );
  }
  return normalizedLookupValues(values);
}

async function findExistingChat(dsn: string, apiKey: string, accountId: string, identifiers: string[]) {
  const wanted = normalizedLookupValues(identifiers);
  if (wanted.length === 0) return null;
  try {
    const url = `${dsn}/api/v1/chats?account_id=${encodeURIComponent(accountId)}&limit=100`;
    const r = await fetch(url, { headers: { "X-API-KEY": apiKey, accept: "application/json" } });
    const t = await r.text();
    if (!r.ok) {
      console.warn("[unipile-send] existing chat lookup failed", { status: r.status, body: t.slice(0, 220) });
      return null;
    }
    let payload: any = {};
    try { payload = JSON.parse(t); } catch { return null; }
    const chats = asArray(payload);
    for (const chat of chats) {
      const chatId = chat?.id ?? chat?.chat_id;
      if (!chatId) continue;
      const values = chatAttendeeValues(chat);
      if (wanted.some((value) => values.includes(value))) {
        console.log("[unipile-send] using existing chat", { channel_account: accountId, chat_id: String(chatId), matched: wanted.filter((value) => values.includes(value)) });
        return String(chatId);
      }
    }
  } catch (e: any) {
    console.warn("[unipile-send] existing chat lookup skipped:", e?.message ?? e);
  }
  return null;
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
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function recordOutboundInbox(admin: any, args: {
  userId: string;
  channel: Channel;
  accountId: string;
  body: any;
  result: any;
  content: string;
}) {
  if (args.body?.record_inbox === false) return;
  try {
    const nowIso = new Date().toISOString();
    const to = String(args.body?.to ?? "").trim().toLowerCase();
    const attendee = Array.isArray(args.body?.attendees_ids) ? String(args.body.attendees_ids[0] ?? "").trim().replace(/^@+/, "") : "";
    const conversationKey = args.channel === "email"
      ? `email:${args.result?.thread_id ?? args.result?.raw?.thread_id ?? to}`
      : String(args.result?.chat_id ?? args.body?.chat_id ?? `${args.channel}:${attendee}`);
    if (!conversationKey) return;

    const name = String(args.body?.recipient_name ?? args.body?.nome ?? args.body?.name ?? attendee ?? to ?? "Contato").trim();
    const replyTo = args.channel === "email" ? to : (attendee || null);
    const { data: existing } = await admin.from("qualification_conversations")
      .select("id")
      .eq("user_id", args.userId)
      .eq("unipile_chat_id", conversationKey)
      .maybeSingle();

    const patch = {
      channel: args.channel,
      unipile_account_id: args.accountId,
      unipile_reply_to: replyTo,
      unipile_subject: args.channel === "email" ? String(args.body?.subject ?? "") : null,
      nome: name || replyTo || "Contato",
      nome_contato: name || null,
      status: "active",
      last_message_at: nowIso,
    };

    let conversationId = existing?.id ?? null;
    if (conversationId) {
      await admin.from("qualification_conversations").update(patch).eq("id", conversationId);
    } else {
      const { data: created, error } = await admin.from("qualification_conversations").insert({
        user_id: args.userId,
        telefone: null,
        unipile_chat_id: conversationKey,
        ...patch,
      }).select("id").single();
      if (error) throw error;
      conversationId = created.id;
    }

    const messageId = args.result?.message_id ?? null;
    if (messageId) {
      const { data: existsMsg } = await admin.from("qualification_messages")
        .select("id")
        .eq("user_id", args.userId)
        .eq("message_id", messageId)
        .limit(1)
        .maybeSingle();
      if (existsMsg?.id) return;
    }

    await admin.from("qualification_messages").insert({
      user_id: args.userId,
      conversation_id: conversationId,
      telefone: null,
      channel: args.channel,
      role: "assistant",
      content: args.content,
      processed: true,
      message_id: messageId,
      evolution_response: args.result,
    });
  } catch (e: any) {
    console.warn("[unipile-send] inbox record skipped:", e?.message ?? e);
  }
}

function savedAccountIds(extra: Record<string, any>, channel: Channel): string[] {
  const values: unknown[] = [];
  if (channel === "linkedin") values.push(extra.account_id, extra.account_id_linkedin);
  else if (channel === "email") values.push(extra.account_id_email, extra.account_id_google, extra.account_id_outlook, extra.account_id_imap);
  else values.push(extra[`account_id_${channel}`]);
  const byChannel = extra.accounts_by_channel?.[channel] ?? extra.account_ids_by_channel?.[channel];
  if (Array.isArray(byChannel)) values.push(...byChannel);
  const arrayKey = extra[`account_ids_${channel}`];
  if (Array.isArray(arrayKey)) values.push(...arrayKey);
  return uniqueStrings(values);
}

async function accountUsedByOtherPanel(admin: any, userId: string, channel: Channel, accountId: string) {
  const keys = channel === "linkedin"
    ? ["account_id", "account_id_linkedin"]
    : channel === "email"
      ? ["account_id_email", "account_id_google", "account_id_outlook", "account_id_imap"]
      : [`account_id_${channel}`];
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

async function validateSavedAccount(admin: any, userId: string, channel: Channel, accountId: string) {
  if (await accountUsedByOtherPanel(admin, userId, channel, accountId)) {
    return { error: `A conta ${CHANNEL_LABEL[channel]} (${accountId}) também está vinculada a outro painel. Bloqueei para não misturar contas. Reconecte seu canal em Canais.` };
  }
  return null;
}

async function resolveUnipileCfg(admin: any, userId: string, channel: Channel) {
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

  // Só usa contas vinculadas ao próprio painel. Não auto-descobre a primeira conta do slot compartilhado.
  const ownedIds = savedAccountIds(extra, channel);
  if (ownedIds.length === 1) {
    const invalid = await validateSavedAccount(admin, userId, channel, ownedIds[0]);
    if (invalid) return invalid;
    return { apiKey, dsn, accountId: ownedIds[0], ownedIds };
  }
  if (ownedIds.length > 1) {
    return { error: `Você tem mais de uma conta ${CHANNEL_LABEL[channel]} no seu painel. Escolha uma conta de origem antes de enviar.` };
  }

  try {
    const types = ACCOUNT_TYPE_BY_CHANNEL[channel];
    return {
      needs_connection: true,
      channel,
      provider: types[0],
      found_accounts: "não listei contas globais para evitar mistura entre clientes",
      error: `Nenhuma conta ${CHANNEL_LABEL[channel]} vinculada ao seu painel. ${CHANNEL_CONNECT_HINT[channel]}`,
    };
  } catch (e: any) {
    return { error: `Erro listando contas Unipile: ${String(e?.message ?? e).slice(0, 220)}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resp({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return resp({ error: "Missing Authorization" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));

    // Modo interno: chamada server-to-server (worker, cron) com SERVICE_ROLE +
    // header x-internal-secret + internal_user_id no body. Bypassa auth.getUser.
    const internalSecret = req.headers.get("x-internal-secret") ?? "";
    let userId: string | null = null;
    if (internalSecret && internalSecret === SERVICE_ROLE && body?.internal_user_id) {
      userId = String(body.internal_user_id);
    } else {
      const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: auth } } });
      const { data: u } = await userClient.auth.getUser();
      userId = u?.user?.id ?? null;
    }
    if (!userId) return resp({ error: "Unauthenticated" }, 401);

    const channel = (body?.channel ?? "").toString() as Channel;
    if (!["email", "linkedin", "instagram", "telegram", "messenger"].includes(channel)) {
      return resp({ error: "channel inválido" }, 400);
    }


    const cfg = await resolveUnipileCfg(admin, userId, channel);
    if ("error" in cfg) {
      const status = (cfg as any).needs_connection ? 200 : 400;
      return resp({ success: false, ...cfg }, status);
    }
    const { apiKey, dsn } = cfg;
    const requestedAccountId = body.account_id ? String(body.account_id) : "";
    if (requestedAccountId && requestedAccountId !== cfg.accountId) {
      return resp({ success: false, error: `A conta de origem informada não pertence ao seu painel para ${CHANNEL_LABEL[channel]}. Bloqueei para não misturar contas.` }, 400);
    }
    const accountId: string = cfg.accountId;

    // ────────────── E-MAIL ──────────────
    if (channel === "email") {
      const to = String(body.to ?? "").trim().toLowerCase();
      const subject = String(body.subject ?? "").trim();
      const html = body.html ? String(body.html) : undefined;
      const text = body.text ? String(body.text) : undefined;
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return resp({ error: "to inválido" }, 400);
      if (!subject) return resp({ error: "subject obrigatório" }, 400);
      if (!html && !text) return resp({ error: "html ou text obrigatório" }, 400);

      const payload: Record<string, any> = {
        account_id: accountId,
        to: [{ identifier: to }],
        subject,
        body: html ?? text,
      };
      if (body.from_name) payload.from = { display_name: body.from_name };
      if (body.reply_to) payload.reply_to = [{ identifier: body.reply_to }];

      const r = await fetch(`${dsn}/api/v1/emails`, {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const t = await r.text();
      if (!r.ok) return upstreamFailure("Unipile e-mail", r.status, t, channel);
      let j: any = {};
      try { j = JSON.parse(t); } catch { /* */ }
      const out = { success: true, message_id: j?.id ?? j?.message_id ?? null, thread_id: j?.thread_id ?? j?.conversation_id ?? null, raw: j };
      await recordOutboundInbox(admin, { userId, channel, accountId, body, result: out, content: stripHtml(html ?? text ?? "") });
      return resp(out);
    }

    // ────────────── MENSAGERIA (IG/TG/Messenger/LinkedIn) ──────────────
    const text = String(body.text ?? "").trim();
    if (!text) return resp({ error: "text obrigatório" }, 400);

    // Se já temos chat_id, envia direto na thread
    if (body.chat_id) {
      const fd = new FormData();
      fd.set("text", text);
      const r = await fetch(`${dsn}/api/v1/chats/${encodeURIComponent(body.chat_id)}/messages`, {
        method: "POST",
        headers: { "X-API-KEY": apiKey, accept: "application/json" },
        body: fd,
      });
      const t = await r.text();
      if (!r.ok) return upstreamFailure("Unipile send", r.status, t, channel);
      let j: any = {}; try { j = JSON.parse(t); } catch {}
      const out = { success: true, chat_id: body.chat_id, message_id: j?.id ?? j?.message_id ?? null, raw: j };
      await recordOutboundInbox(admin, { userId, channel, accountId, body, result: out, content: text });
      return resp(out);
    }

    // Novo chat 1:1 ou em grupo. Aceita username/handle/phone — resolve via /users
    const rawAttendees: string[] = Array.isArray(body.attendees_ids) ? body.attendees_ids : [];
    if (rawAttendees.length === 0) return resp({ error: "attendees_ids obrigatório quando não há chat_id" }, 400);

    const resolved: string[] = [];
    const lookupIdentifiers: string[] = [];
    const resolveErrors: string[] = [];
    for (const raw of rawAttendees) {
      const ident = String(raw ?? "").trim().replace(/^@+/, "");
      if (!ident) continue;
      lookupIdentifiers.push(ident);
      if (/^[0-9a-zA-Z_-]{17,}$/.test(ident) && /[a-zA-Z_-]/.test(ident)) {
        resolved.push(ident);
        continue;
      }
      try {
        const ur = await fetch(`${dsn}/api/v1/users/${encodeURIComponent(ident)}?account_id=${encodeURIComponent(accountId)}`, {
          headers: { "X-API-KEY": apiKey, accept: "application/json" },
        });
        const ut = await ur.text();
        if (ur.status === 401 && ut.includes("disconnected_account")) {
          const { data: row2 } = await admin.from("user_api_keys").select("extra").eq("user_id", userId).eq("provider", "unipile").maybeSingle();
          const extra2 = (row2?.extra ?? {}) as Record<string, any>;
          delete extra2[`account_id_${channel}`];
          await admin.from("user_api_keys").update({ extra: extra2 }).eq("user_id", userId).eq("provider", "unipile");
          return resp({
            success: false,
            needs_connection: true,
            channel,
            error: `Sua conta ${CHANNEL_LABEL[channel]} no Unipile está desconectada. Reconecte para continuar.`,
          });
        }
        if (ur.ok) {
          const uj: any = JSON.parse(ut);
          const pid = uj?.provider_id ?? uj?.id ?? uj?.attendee_provider_id;
          if (pid) {
            resolved.push(String(pid));
            lookupIdentifiers.push(String(pid));
            continue;
          }
        }
        // Fallback: para IG/TG/Messenger, /users pode retornar 404 mas o username
        // funciona como attendee direto na criação de chat. Tentamos passar raw.
        if (channel === "instagram" || channel === "telegram" || channel === "messenger") {
          resolved.push(ident);
        } else {
          resolveErrors.push(`${ident}: ${ur.status} ${ut.slice(0,120)}`);
        }
      } catch (e: any) {
        resolveErrors.push(`${ident}: ${String(e?.message ?? e).slice(0,120)}`);
      }
    }
    if (resolved.length === 0) {
      return resp({ success: false, error: `Não resolvi destinatários. ${resolveErrors.join(" | ")}` }, 400);
    }

    // Instagram/Telegram/Messenger/LinkedIn: se já existe conversa, SEMPRE responde
    // na thread existente. Criar chat novo pode retornar `user_unreachable` mesmo
    // quando o lead já falou com a conta, porque a plataforma bloqueia nova thread.
    const existingChatId = await findExistingChat(dsn, apiKey, accountId, [...lookupIdentifiers, ...resolved]);
    if (existingChatId) {
      const fdExisting = new FormData();
      fdExisting.set("text", text);
      const r = await fetch(`${dsn}/api/v1/chats/${encodeURIComponent(existingChatId)}/messages`, {
        method: "POST",
        headers: { "X-API-KEY": apiKey, accept: "application/json" },
        body: fdExisting,
      });
      const t = await r.text();
      if (!r.ok) return upstreamFailure("Unipile send existing chat", r.status, t, channel);
      let j: any = {}; try { j = JSON.parse(t); } catch {}
      const out = { success: true, chat_id: existingChatId, message_id: j?.id ?? j?.message_id ?? null, raw: j, reused_existing_chat: true };
      await recordOutboundInbox(admin, { userId, channel, accountId, body: { ...body, chat_id: existingChatId }, result: out, content: text });
      return resp(out);
    }

    const fd = new FormData();
    fd.set("account_id", accountId);
    fd.set("text", text);
    for (const a of resolved) fd.append("attendees_ids", a);
    if (body.subject) fd.set("subject", String(body.subject));

    const r = await fetch(`${dsn}/api/v1/chats`, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, accept: "application/json" },
      body: fd,
    });
    const t = await r.text();
    if (!r.ok) return upstreamFailure("Unipile new chat", r.status, t, channel);
    let j: any = {}; try { j = JSON.parse(t); } catch {}
    const out = {
      success: true,
      chat_id: j?.chat_id ?? j?.id ?? null,
      message_id: j?.message_id ?? null,
      raw: j,
    };
    await recordOutboundInbox(admin, { userId, channel, accountId, body, result: out, content: text });
    return resp(out);
  } catch (e: any) {
    return resp({ error: String(e?.message ?? e).slice(0, 400) }, 500);
  }
});
