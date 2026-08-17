// unipile-message-webhook — recebe mensagens inbound de TODOS os canais Unipile
// (Email, Instagram, Telegram, Messenger, LinkedIn) e:
//   1) Pausa cadência LinkedIn quando lead responde DM (comportamento legado)
//   2) Cria conversa em qualification_conversations + mensagem em qualification_messages
//      para que o qualification-worker responda automaticamente via IA no MESMO canal.
//
// CONFIGURAÇÃO NO UNIPILE:
//   URL: https://<project>.supabase.co/functions/v1/unipile-message-webhook?token=<UNIPILE_WEBHOOK_SECRET>
//   Eventos: message_received, mail_received (todos os accounts).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function allowInsecureWebhooks() {
  return Deno.env.get("ALLOW_INSECURE_WEBHOOKS") === "true";
}

function extractAccountId(p: any): string | null {
  return p?.account_id ?? p?.account?.id ?? p?.data?.account_id ?? p?.message?.account_id ?? null;
}

function eventName(p: any): string {
  return String(p?.event ?? p?.type ?? p?.kind ?? "").toLowerCase();
}

function normalizeIdentity(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const clean = String(value).replace(/^@+/, "").trim().toLowerCase();
  return clean || null;
}

function identityValues(values: unknown[]): string[] {
  return [...new Set(values.map(normalizeIdentity).filter((v): v is string => Boolean(v)))];
}

function isSelfSender(p: any): boolean {
  const sender = p?.sender ?? p?.from ?? p?.message?.from ?? p?.message?.sender ?? {};
  const account = p?.account_info ?? p?.account ?? p?.message?.account_info ?? {};
  const senderValues = identityValues([
    sender?.attendee_provider_id,
    sender?.provider_id,
    sender?.id,
    sender?.attendee_name,
    sender?.name,
    sender?.username,
    sender?.public_identifier,
    sender?.attendee_specifics?.public_identifier,
    sender?.attendee_profile_url,
    sender?.profile_url,
  ]);
  const accountValues = identityValues([
    p?.account_id,
    p?.message?.account_id,
    account?.id,
    account?.user_id,
    account?.username,
    account?.name,
    account?.public_identifier,
  ]);
  if (!senderValues.length || !accountValues.length) return false;
  return senderValues.some((value) => accountValues.includes(value) || accountValues.some((self) => value.includes(self) || self.includes(value)));
}

function isInbound(p: any): boolean {
  // PRIORIDADE: se Unipile sinaliza explicitamente que NÓS somos o sender, é outbound.
  if (p?.is_sender === true || p?.message?.is_sender === true) return false;
  if (p?.is_sender === 1 || p?.message?.is_sender === 1) return false;
  if (p?.direction === "outbound" || p?.direction === "sent") return false;
  if (isSelfSender(p)) return false;

  const evt = eventName(p);
  if (/received|inbound|new_message|message\.new|mail\.received|mail_received/.test(evt)) return true;
  if (p?.direction === "inbound") return true;
  if (p?.is_sender === false || p?.message?.is_sender === false) return true;
  return false;
}

function isMessageEvent(p: any): boolean {
  const evt = eventName(p);
  if (!evt) return true;
  const ALLOWED = [
    "message_received", "message.received", "messaging.message_received",
    "mail.received", "mail_received", "new_message", "message.new",
  ];
  return ALLOWED.includes(evt);
}

// Detecta canal pelo payload. Unipile envia account_type (LINKEDIN, INSTAGRAM, TELEGRAM, MESSENGER, GOOGLE_OAUTH, OUTLOOK, IMAP, etc).
function detectChannel(p: any): string {
  const acct = String(
    p?.account_type ?? p?.account?.type ?? p?.provider ?? p?.source ?? p?.account?.provider ?? ""
  ).toUpperCase();
  const evt = eventName(p);
  if (/mail|email/.test(evt)) return "email";
  if (acct.includes("GOOGLE") || acct.includes("OUTLOOK") || acct.includes("IMAP") || acct.includes("MAIL")) return "email";
  if (acct.includes("LINKEDIN")) return "linkedin";
  if (acct.includes("INSTAGRAM")) return "instagram";
  if (acct.includes("TELEGRAM")) return "telegram";
  if (acct.includes("MESSENGER") || acct.includes("FACEBOOK")) return "messenger";
  return "unknown";
}

function extractSender(p: any): { provider_id?: string; profile_url?: string; name?: string; email?: string; public_id?: string } {
  // Unipile inbound: o LEAD é o primeiro attendee (o outro lado da conversa).
  // O campo top-level `sender` representa quem enviou ESTA mensagem (pode ser nós em is_sender=true).
  const attendees: any[] = Array.isArray(p?.attendees) ? p.attendees
    : Array.isArray(p?.message?.attendees) ? p.message.attendees : [];
  const att = attendees[0] ?? {};
  const s = p?.sender ?? p?.from ?? p?.message?.from ?? p?.message?.sender ?? {};
  const pick = (k: string) => att[k] ?? s[k];

  const name =
    pick("attendee_name") ?? pick("name") ?? pick("full_name") ?? pick("display_name") ?? undefined;
  const provider_id =
    pick("attendee_provider_id") ?? pick("provider_id") ?? pick("id") ?? undefined;
  const profile_url =
    pick("attendee_profile_url") ?? pick("profile_url") ?? pick("public_profile_url") ?? pick("url") ?? undefined;
  const public_id =
    pick("attendee_public_identifier") ?? pick("public_identifier") ?? pick("public_id") ??
    att?.attendee_specifics?.public_identifier ?? s?.attendee_specifics?.public_identifier ?? undefined;
  const email =
    pick("email") ?? pick("identifier") ?? pick("address") ?? undefined;

  return { provider_id: provider_id ? String(provider_id) : undefined, profile_url, name, email, public_id };
}


function extractChatId(p: any): string | null {
  return p?.chat_id ?? p?.message?.chat_id ?? p?.thread_id ?? p?.message?.thread_id ?? null;
}

function extractMessageText(p: any): string {
  // NUNCA cair em subject/chat name como fallback — gera lixo na IA.
  const candidates = [
    p?.message?.text, p?.message?.content, p?.message?.body,
    typeof p?.message === "string" ? p.message : null,
    p?.text, p?.body, p?.content,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c;
  }
  return "";
}

function extractSubject(p: any): string | null {
  return p?.subject ?? p?.message?.subject ?? p?.thread?.subject ?? null;
}

function extractMessageId(p: any): string | null {
  return p?.message_id ?? p?.message?.id ?? p?.id ?? null;
}

// Detecta grupo/canal — não respondemos automaticamente.
function isGroupOrChannel(p: any): boolean {
  const attendees = p?.attendees ?? p?.message?.attendees ?? [];
  if (Array.isArray(attendees) && attendees.length > 2) return true;
  const chatType = String(p?.chat_type ?? p?.chat?.type ?? p?.message?.chat_type ?? "").toLowerCase();
  if (/group|channel|supergroup|broadcast/.test(chatType)) return true;
  if (p?.is_group === true || p?.chat?.is_group === true) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Use POST", { status: 405, headers: corsHeaders });

  const requiredSecret = Deno.env.get("UNIPILE_WEBHOOK_SECRET") ?? "";
  if (!requiredSecret && !allowInsecureWebhooks()) {
    return json({ ok: false, error: "webhook secret not configured" }, 500);
  }
  if (requiredSecret) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? req.headers.get("X-Webhook-Token");
    if (token !== requiredSecret) return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  console.log("[unipile-msg-webhook] payload:", JSON.stringify(payload).slice(0, 800));

  if (!isMessageEvent(payload)) return logSkip("non_message_event", payload);
  if (!isInbound(payload)) return logSkip("outbound", payload);
  if (isGroupOrChannel(payload)) return logSkip("group_or_channel", payload);

  const accountId = extractAccountId(payload);
  if (!accountId) return logSkip("no_account_id", payload);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve user_id via user_api_keys.extra (qualquer account_id_*)
  const userId = await resolveUserByAccountId(admin, accountId);
  if (!userId) return logSkip("account_not_mapped", payload, { account_id: accountId });

  const channel = detectChannel(payload);
  const sender = extractSender(payload);
  const msgText = extractMessageText(payload).slice(0, 4000);
  const chatId = extractChatId(payload);
  const subject = extractSubject(payload);
  const messageId = extractMessageId(payload);

  // ── 1) Pause cadência LinkedIn (comportamento legado) ───────────────────
  let linkedinPaused = false;
  if (channel === "linkedin" && (sender.profile_url || sender.provider_id) && msgText.trim().length >= 2) {
    linkedinPaused = await pauseLinkedInCadence(admin, userId, sender, msgText);
  }

  // ── 2) Intake multicanal pro qualification-worker ────────────────────────
  // Critério: precisamos de chat_id (IG/TG/Messenger/LinkedIn) OU email do remetente.
  const senderKey = chatId ?? sender.email ?? sender.provider_id ?? null;
  if (!senderKey || channel === "unknown" || msgText.trim().length < 2) {
    return logSkip("no_qualification_intake", payload, { linkedin_paused: linkedinPaused, channel, msg_len: msgText.trim().length, has_sender_key: Boolean(senderKey) });
  }

  // Para email, usamos o endereço como "chat key" (não há thread persistente em Unipile email).
  const conversationKey = chatId ?? `${channel}:${sender.email ?? sender.provider_id}`;

  // Idempotência: se já temos esta mensagem (message_id), pula
  if (messageId) {
    const { data: existing } = await admin.from("qualification_messages")
      .select("id").eq("user_id", userId).eq("message_id", messageId).limit(1).maybeSingle();
    if (existing?.id) {
      return json({ ok: true, linkedin_paused: linkedinPaused, skipped: "duplicate_message_id" });
    }
  }

  // Encontra ou cria conversation (key: user_id + unipile_chat_id)
  const { data: existingConv } = await admin.from("qualification_conversations")
    .select("id, channel, status")
    .eq("user_id", userId)
    .eq("unipile_chat_id", conversationKey)
    .maybeSingle();

  let conversationId = existingConv?.id;
  if (!conversationId) {
    const { data: newConv, error: convErr } = await admin.from("qualification_conversations")
      .insert({
        user_id: userId,
        channel,
        unipile_chat_id: conversationKey,
        unipile_account_id: accountId,
        unipile_reply_to: channel === "email" ? sender.email ?? null : null,
        unipile_subject: subject ?? null,
        unipile_provider_id: sender.provider_id ?? null,
        nome: sender.name ?? sender.email ?? null,
        nome_contato: sender.name ?? null,
        telefone: null,
        status: "active",
        last_inbound_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      })
      .select("id").single();
    if (convErr) {
      // Race: outra request criou ao mesmo tempo — busca de novo
      if ((convErr as any)?.code === "23505") {
        const { data: again } = await admin.from("qualification_conversations")
          .select("id").eq("user_id", userId).eq("unipile_chat_id", conversationKey).maybeSingle();
        conversationId = again?.id;
      }
      if (!conversationId) {
        console.error("[unipile-msg-webhook] insert conv error:", convErr);
        return json({ ok: false, error: convErr.message }, 500);
      }
    } else {
      conversationId = newConv!.id;
    }
  } else {
    await admin.from("qualification_conversations").update({
      last_inbound_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    }).eq("id", conversationId);
  }

  const { error: msgErr } = await admin.from("qualification_messages").insert({
    user_id: userId,
    conversation_id: conversationId,
    channel,
    role: "user",
    content: msgText,
    processed: false,
    message_id: messageId ?? null,
    evolution_response: payload,
  });
  if (msgErr) {
    console.error("[unipile-msg-webhook] insert message error:", msgErr);
    return json({ ok: false, error: msgErr.message }, 500);
  }

  console.log(`[unipile-msg-webhook] enfileirado: user=${userId} channel=${channel} conv=${conversationId}`);
  return json({
    ok: true,
    linkedin_paused: linkedinPaused,
    queued_for_qualification: true,
    conversation_id: conversationId,
    channel,
  });
});

// ─────────────────────────────────────────────────────────────────────────────

async function resolveUserByAccountId(admin: any, accountId: string): Promise<string | null> {
  // Tenta cada campo account_id_* + account_id legado
  const fields = [
    "account_id",
    "account_id_email", "account_id_linkedin", "account_id_instagram",
    "account_id_telegram", "account_id_messenger",
    "account_id_google", "account_id_outlook", "account_id_imap",
  ];
  for (const f of fields) {
    const { data } = await admin.from("user_api_keys")
      .select("user_id")
      .eq("provider", "unipile")
      .filter(`extra->>${f}`, "eq", accountId)
      .limit(1).maybeSingle();
    if (data?.user_id) return data.user_id;
  }
  return null;
}

async function pauseLinkedInCadence(
  admin: any, userId: string, sender: { provider_id?: string; profile_url?: string }, msgText: string,
): Promise<boolean> {
  let contact: any = null;
  if (sender.profile_url) {
    const { data } = await admin.from("linkedin_contacts")
      .select("id, nome, telefone, email, empresa")
      .eq("user_id", userId).eq("cadencia_status", "active")
      .eq("linkedin_url", sender.profile_url).maybeSingle();
    contact = data;
  }
  if (!contact && sender.provider_id) {
    const { data } = await admin.from("linkedin_contacts")
      .select("id, nome, telefone, email, empresa")
      .eq("user_id", userId).eq("cadencia_status", "active")
      .ilike("linkedin_url", `%${sender.provider_id}%`).limit(1).maybeSingle();
    contact = data;
  }
  if (!contact) return false;
  await admin.from("linkedin_contacts").update({
    cadencia_status: "replied",
    ultima_resposta_em: new Date().toISOString(),
    ultima_resposta_texto: msgText,
  }).eq("id", contact.id);

  const { data: existingCard } = await admin.from("pipeline_cards")
    .select("id").eq("user_id", userId)
    .eq("source_table", "linkedin_contacts").eq("source_id", contact.id).maybeSingle();
  if (!existingCard) {
    await admin.from("pipeline_cards").insert({
      user_id: userId, source_table: "linkedin_contacts", source_id: contact.id,
      nome_empresa: contact.empresa ?? null, contato: contact.nome ?? null,
      telefone: contact.telefone ?? null, email: contact.email ?? null,
      origem: "linkedin_dm", estagio: "prospectado",
      observacoes: `Respondeu LinkedIn: ${msgText.slice(0, 200)}`,
    });
  }
  return true;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function logSkip(reason: string, payload: any, extra: Record<string, unknown> = {}) {
  const accountId = extractAccountId(payload);
  const chatId = extractChatId(payload);
  const sender = payload?.sender ?? payload?.from ?? payload?.message?.sender ?? payload?.message?.from ?? {};
  console.log("[unipile-msg-webhook] skipped", JSON.stringify({
    reason,
    account_id: accountId,
    chat_id: chatId,
    event: eventName(payload),
    sender_provider_id: sender?.attendee_provider_id ?? sender?.provider_id ?? sender?.id ?? null,
    sender_name: sender?.attendee_name ?? sender?.name ?? sender?.username ?? null,
    ...extra,
  }).slice(0, 900));
  return json({ ok: true, skipped: reason, ...extra });
}
