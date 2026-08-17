// Webhook público chamado pela Evolution API quando uma mensagem chega.
// URL: /functions/v1/webhook-qualification/{user_id}
// Persiste a mensagem em qualification_messages e atualiza/cria a conversa.
// O qualification-worker (pg_cron) processa o buffer e responde.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);

    // SEGURANÇA (obrigatório): exige ?token=<WEBHOOK_QUALIFICATION_SECRET> na URL.
    // Sem isso, qualquer um na internet que descubra um user_id pode injetar mensagens
    // no tenant. O secret já está configurado no projeto.
    const expectedToken = Deno.env.get("WEBHOOK_QUALIFICATION_SECRET") ?? "";
    if (!expectedToken) {
      console.error("webhook-qualification: WEBHOOK_QUALIFICATION_SECRET não configurado — rejeitando por segurança");
      return json({ error: "server_misconfigured" }, 503);
    }
    const providedToken = url.searchParams.get("token") ?? "";
    if (providedToken !== expectedToken) {
      console.warn("webhook-qualification: token inválido — rejeitando");
      return json({ error: "unauthorized" }, 401);
    }

    const parts = url.pathname.split("/").filter(Boolean);
    // Aceita /webhook-qualification/{user_id} e /webhook-qualification/{user_id}/{instance_id}
    const fnIdx = parts.indexOf("webhook-qualification");
    const userId = fnIdx >= 0 ? parts[fnIdx + 1] : parts[parts.length - 1];
    const instanceIdFromPath = fnIdx >= 0 && parts[fnIdx + 2] ? parts[fnIdx + 2] : null;
    if (!userId || userId === "webhook-qualification") {
      return json({ error: "user_id missing in path" }, 400);
    }

    const body = await req.json().catch(() => ({}));
    // Aceita formato Mandrack/WuzAPI e Evolution.
    const payload = body?.body && typeof body.body === "object" ? body.body : body;
    const eventPayload = payload?.event && typeof payload.event === "object"
      ? payload.event
      : payload?.Event && typeof payload.Event === "object"
        ? payload.Event
        : payload;
    const eventName = String(payload?.type ?? payload?.Type ?? eventPayload?.type ?? eventPayload?.Type ?? "");
    const data = eventPayload?.data ?? eventPayload?.Data ?? eventPayload;

    // P0 item 3: ACK/ReadReceipt inline. Se for evento de entrega, atualiza
    // dispatch_queue e retorna cedo — não é uma Message inbound.
    {
      const ackType = String(data?.Type ?? data?.type ?? data?.status ?? "").toLowerCase();
      const ackNum = data?.Ack ?? data?.ack ?? data?.ACK;
      const evLower = eventName.toLowerCase();
      let kind: "delivered" | "read" | null = null;
      if (ackType.includes("read") || evLower.includes("read")) kind = "read";
      else if (typeof ackNum === "number") kind = ackNum >= 4 ? "read" : ackNum >= 3 ? "delivered" : null;
      else if (ackType.includes("deliver")) kind = "delivered";
      if (kind) {
        const ids = new Set<string>();
        const push = (v: any) => {
          if (Array.isArray(v)) v.forEach(push);
          else if (typeof v === "string" && v) ids.add(v);
          else if (v && typeof v === "object") {
            for (const k of ["ID", "Id", "id"]) if (v[k]) ids.add(String(v[k]));
          }
        };
        push(data?.MessageIDs); push(data?.messageIds); push(data?.message_ids);
        push(data?.Info?.ID); push(data?.info?.id); push(data?.id); push(data?.ID);
        if (ids.size > 0) {
          const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
          const now = new Date().toISOString();
          const patch = kind === "read"
            ? { read_at: now, delivered_at: now, provider_status: "read" }
            : { delivered_at: now, provider_status: "delivered" };
          await admin.from("dispatch_queue").update(patch)
            .eq("user_id", userId).in("provider_message_id", [...ids]);
          return json({ ok: true, ack: kind, matched: ids.size });
        }
        return json({ ok: true, ack: kind, matched: 0 });
      }
    }

    const info = data?.Info ?? data?.info ?? data?.messageInfo ?? data?.MessageInfo ?? {};
    const rawMsg = data?.Message ?? data?.message ?? data?.RawMessage?.message ?? data?.rawMessage?.message ?? {};
    const fromMe = asBool(
      data?.fromMe ?? data?.FromMe ?? data?.key?.fromMe ?? data?.key?.FromMe ??
      info?.IsFromMe ?? info?.isFromMe ?? info?.fromMe ?? payload?.fromMe ?? payload?.FromMe,
    );
    if (fromMe) return json({ ok: true, ignored: "fromMe" });

    const jidCandidates = [
      info?.Chat, info?.chat, data?.remoteJid, data?.RemoteJid, data?.key?.remoteJid,
      data?.jid, data?.JID, payload?.jid, payload?.JID,
      info?.Sender, info?.sender, info?.SenderAlt, info?.senderAlt, info?.RecipientAlt, info?.recipientAlt,
      data?.SenderAlt, data?.senderAlt, data?.RecipientAlt, data?.recipientAlt,
      findDeep(data, ["senderalt", "recipientalt", "remotejid", "jid", "chat", "sender", "participant", "phone", "number", "numero", "telefone"]),
    ];
    const explicitGroup = asBool(info?.IsGroup ?? info?.isGroup ?? data?.IsGroup ?? data?.isGroup ?? payload?.IsGroup ?? payload?.isGroup);
    // Bloqueamos APENAS grupos, listas de transmissão, status e canais.
    // `@lid` (Linked Identifier) é aceito — é um JID 1:1 anônimo do rollout multi-device do WhatsApp.
    const anyNonOneToOne = jidCandidates.some((value) => {
      if (typeof value !== "string") return false;
      const lower = value.toLowerCase();
      return lower.includes("@g.us") || lower.includes("@broadcast") || lower.includes("@newsletter") || lower.includes("status@");
    });
    if (explicitGroup || anyNonOneToOne) {
      const blockedJid = firstString(jidCandidates) || "unknown";
      console.log("webhook-qualification: ignorando origem não-1:1", blockedJid, { explicitGroup });
      return json({ ok: true, ignored: "non_1to1", jid: blockedJid });
    }

    const rawJid = bestContactJid(jidCandidates);
    // Ignora origens que NÃO são conversas 1:1 reais com leads:
    // - @g.us         → grupos do WhatsApp
    // - @broadcast    → listas de transmissão / status
    // - @newsletter   → canais
    // `@lid` é aceito — Mandrack roteia respostas pra LID normalmente.
    const isLid = !!rawJid && rawJid.toLowerCase().includes("@lid");
    if (rawJid) {
      const lower = rawJid.toLowerCase();
      if (lower.includes("@g.us") || lower.includes("@broadcast") || lower.includes("@newsletter") || lower.includes("status@")) {
        console.log("webhook-qualification: ignorando origem não-1:1", rawJid);
        return json({ ok: true, ignored: "non_1to1", jid: rawJid });
      }
      // IDs de grupo às vezes vêm sem domínio — sempre começam com 120363... e têm 18+ dígitos.
      // Mas LIDs também podem ter 14+ dígitos, então só bloqueia se NÃO for @lid.
      if (!isLid) {
        const digitsOnly = rawJid.split("@")[0].replace(/\D/g, "");
        if (digitsOnly.startsWith("120363") || digitsOnly.length >= 16) {
          console.log("webhook-qualification: ignorando id de grupo", rawJid);
          return json({ ok: true, ignored: "group_id", jid: rawJid });
        }
      }
    }
    // Pra `@lid`: usamos o JID inteiro (com @lid) como identificador na coluna telefone,
    // já que não temos o número real. Mandrack aceita receber/enviar pra esse JID.
    let telefone: string;
    if (isLid) {
      telefone = rawJid!; // mantém formato "12345@lid"
    } else {
      telefone = normalizePhone(rawJid);
      if (!telefone || telefone.length < 10 || telefone.length > 13) {
        console.error("webhook-qualification telefone vazio:", JSON.stringify(sanitizeForLog(body)).slice(0, 2500));
        return json({ error: "telefone invalido", raw: rawJid }, 400);
      }
    }

    const pushName = firstString([
      data?.pushName, data?.PushName, data?.notifyName, data?.NotifyName,
      info?.PushName, info?.pushName, payload?.pushName, payload?.PushName,
      findDeep(data, ["pushname", "notifyname", "verifiedname"]),
    ]) || null;
    const text: string | null = firstString([
      data?.text, data?.Text, typeof data?.body === "string" ? data.body : null, data?.Body,
      payload?.text, payload?.Text, typeof payload?.body === "string" ? payload.body : null,
      rawMsg.conversation, rawMsg.extendedTextMessage?.text, rawMsg.imageMessage?.caption,
      rawMsg.videoMessage?.caption, rawMsg.documentMessage?.caption,
      findDeep(data, ["conversation", "text", "caption"]),
    ]) || null;
    const audioBase64: string | null = firstString([data?.base64, data?.Base64, rawMsg.audioMessage?.base64, rawMsg.base64]) || null;
    const audioUrl: string | null = firstString([data?.mediaUrl, data?.MediaUrl, data?.audioUrl, data?.AudioUrl, rawMsg.audioMessage?.url]) || null;

    // Sem texto E sem áudio → mensagem de mídia (imagem/sticker/figurinha) que não dá pra qualificar.
    // NÃO criar conversa nem chamar MAVI — evita "Desculpe, mas não posso ajudar com isso" em loop.
    if (!text && !audioBase64 && !audioUrl) {
      console.log("webhook-qualification: ignorando mensagem sem texto nem áudio");
      return json({ ok: true, ignored: "no_content" });
    }

    // messageId para poder reagir à mensagem do lead
    const messageId: string | null = firstString([
      data?.id, data?.ID, data?.messageId, data?.MessageId, data?.msgId,
      data?.key?.id, data?.key?.ID,
      info?.Id, info?.id, info?.MessageId,
      findDeep(data, ["id", "messageid", "msgid", "wamid"]),
    ]) || null;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Upsert conversation (vincula ao chip que recebeu, se informado)
    const convPayload: any = {
      user_id: userId,
      telefone,
      nome: pushName,
      last_inbound_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    };
    if (instanceIdFromPath) convPayload.whatsapp_instance_id = instanceIdFromPath;
    const { data: conv, error: convErr } = await admin
      .from("qualification_conversations")
      .upsert(convPayload, { onConflict: "user_id,telefone" })
      .select("id").single();
    if (convErr) throw convErr;

    // Transcreve áudio se vier
    let finalText = text;
    if (!finalText && (audioBase64 || audioUrl)) {
      finalText = await transcribeAudio(audioBase64, audioUrl);
    }

    // Dedupe primário: por message_id (índice único parcial garante atomicidade).
    // Fallback secundário: por conteúdo nos últimos 15s (caso webhook venha sem id).
    if (messageId) {
      const { data: existing } = await admin
        .from("qualification_messages")
        .select("id")
        .eq("user_id", userId)
        .eq("message_id", messageId)
        .maybeSingle();
      if (existing) return json({ ok: true, ignored: "duplicate_msgid" });
    } else {
      const dedupeSince = new Date(Date.now() - 15_000).toISOString();
      const { data: duplicate } = await admin
        .from("qualification_messages")
        .select("id")
        .eq("user_id", userId)
        .eq("telefone", telefone)
        .eq("role", "user")
        .eq("content", finalText)
        .gte("created_at", dedupeSince)
        .maybeSingle();
      if (duplicate) return json({ ok: true, ignored: "duplicate_content" });
    }

    const { error: insertErr } = await admin.from("qualification_messages").insert({
      user_id: userId,
      conversation_id: conv!.id,
      telefone,
      role: "user",
      content: finalText,
      audio_url: audioUrl,
      transcribed: !!(audioBase64 || audioUrl),
      processed: false,
      message_id: messageId,
      evolution_response: redactBase64(body),
    });
    // 23505 = unique violation no índice (user_id, message_id) → outra réplica do webhook ganhou
    if (insertErr && (insertErr as any).code === "23505") {
      return json({ ok: true, ignored: "race_msgid" });
    }
    if (insertErr) throw insertErr;

    // Auto-promoção do card do CRM: lead respondeu → sai de "novo_lead"/
    // "prospectado" (estado passivo) para "qualificando" (em conversa ativa).
    // Só promove; nunca rebaixa estágios já avançados.
    try {
      const EARLY = ["novo_lead", "prospectado", "primeiro_contato"];
      await admin.from("pipeline_cards")
        .update({ estagio: "qualificando", updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("telefone", telefone)
        .in("estagio", EARLY);
    } catch (e) {
      console.warn("[webhook-qualification] pipeline auto-promote failed:", (e as Error).message);
    }

    return json({ ok: true });
  } catch (e: any) {
    console.error("webhook-qualification error:", e.message);
    return json({ error: e.message }, 500);
  }
});

async function transcribeAudio(base64: string | null, url: string | null): Promise<string | null> {
  const apiKey = Deno.env.get("GOOGLE_API_KEY");
  if (!apiKey) return null;
  try {
    let audioPart: any;
    if (base64) {
      audioPart = { type: "input_audio", input_audio: { data: base64, format: "ogg" } };
    } else if (url) {
      audioPart = { type: "input_audio", input_audio: { url } };
    } else return null;
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: "Transcreva o áudio em português brasileiro. Retorne APENAS o texto transcrito, sem comentários." },
          { role: "user", content: [audioPart, { type: "text", text: "Transcreva." }] },
        ],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes", "sim"].includes(value.toLowerCase());
  if (typeof value === "number") return value === 1;
  return false;
}

function firstString(values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function bestContactJid(values: unknown[]): string {
  const strings = values.flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : []);
  return strings.find((value) => value.includes("@s.whatsapp.net"))
    ?? strings.find((value) => !value.includes("@lid"))
    ?? strings[0]
    ?? "";
}

function normalizePhone(value: string): string {
  // Mandrack/WuzAPI pode enviar device/sender suffix antes do domínio:
  // 5521991369748:20@s.whatsapp.net. O ":20" não faz parte do número.
  const beforeAt = value.split("@")[0].split(":")[0];
  return beforeAt.replace(/\D/g, "");
}

function findDeep(input: unknown, names: string[], seen = new WeakSet<object>()): string {
  if (!input || typeof input !== "object") return "";
  if (seen.has(input as object)) return "";
  seen.add(input as object);
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (names.includes(key.toLowerCase()) && (typeof value === "string" || typeof value === "number")) {
      const str = String(value).trim();
      if (str) return str;
    }
  }
  for (const value of Object.values(input as Record<string, unknown>)) {
    const found = findDeep(value, names, seen);
    if (found) return found;
  }
  return "";
}

// Remove APENAS campos pesados (base64 de áudio) — preserva resto do payload
// pra debug. Diferente de sanitizeForLog (que trunca arrays e redacta tokens),
// esse helper é não-destrutivo: mantém estrutura completa, só substitui o valor
// de chaves cujo nome contém "base64" por marker [redacted_base64:N_chars].
function redactBase64(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map(redactBase64);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (/base64/i.test(key) && typeof value === "string") {
      out[key] = `[redacted_base64:${value.length}_chars]`;
    } else {
      out[key] = redactBase64(value);
    }
  }
  return out;
}

function sanitizeForLog(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map(sanitizeForLog).slice(0, 20);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (/base64|token|apikey|authorization/i.test(key)) out[key] = "[redacted]";
    else out[key] = sanitizeForLog(value);
  }
  return out;
}