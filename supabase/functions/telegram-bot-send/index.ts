// telegram-bot-send — Envia mensagem do Telegram via Bot API (com inline_keyboard).
//
// Body:
//   {
//     action: "send" | "save_token" | "get_status" | "list_updates",
//     bot_token?: string,             // ao save_token, salva em user_api_keys (provider=telegram_bot)
//     chat_id?: string | number,      // destinatário (precisa ter falado com o bot ao menos 1x)
//     text?: string,                  // texto da mensagem
//     buttons?: Array<Array<{ text: string; url?: string; callback_data?: string }>>,
//     parse_mode?: "Markdown" | "HTML",
//     disable_web_page_preview?: boolean,
//   }

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

async function getToken(admin: any, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("user_api_keys")
    .select("api_key")
    .eq("user_id", userId)
    .eq("provider", "telegram_bot")
    .maybeSingle();
  return (data?.api_key ?? "").trim() || null;
}

async function tgCall(token: string, method: string, body: any) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j?.ok !== false, status: r.status, json: j };
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
    const action = String(body?.action ?? "send");

    if (action === "save_token") {
      const token = String(body?.bot_token ?? "").trim();
      if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) return resp({ error: "Token inválido (formato esperado 123456:AAAA...)." }, 400);
      // Valida com getMe
      const me = await tgCall(token, "getMe", {});
      if (!me.ok) return resp({ error: `Token rejeitado pelo Telegram: ${JSON.stringify(me.json).slice(0, 200)}` }, 400);
      await admin.from("user_api_keys").upsert(
        { user_id: userId, provider: "telegram_bot", api_key: token, extra: { username: me.json?.result?.username, bot_id: me.json?.result?.id } },
        { onConflict: "user_id,provider" },
      );
      return resp({ success: true, bot: me.json?.result });
    }

    if (action === "get_status") {
      const token = await getToken(admin, userId);
      if (!token) return resp({ success: true, connected: false });
      const me = await tgCall(token, "getMe", {});
      return resp({ success: true, connected: me.ok, bot: me.json?.result ?? null });
    }

    if (action === "list_updates") {
      const token = await getToken(admin, userId);
      if (!token) return resp({ error: "Bot não conectado." }, 400);
      const r = await tgCall(token, "getUpdates", { limit: 100, allowed_updates: ["message"] });
      if (!r.ok) return resp({ error: `Telegram: ${JSON.stringify(r.json).slice(0, 200)}` }, 502);
      const seen = new Map<string, any>();
      for (const upd of (r.json?.result ?? [])) {
        const chat = upd?.message?.chat;
        if (chat?.id) {
          seen.set(String(chat.id), {
            chat_id: chat.id,
            type: chat.type,
            title: chat.title ?? chat.username ?? `${chat.first_name ?? ""} ${chat.last_name ?? ""}`.trim(),
            username: chat.username ?? null,
          });
        }
      }
      return resp({ success: true, chats: [...seen.values()] });
    }

    // action === "send"
    const token = await getToken(admin, userId);
    if (!token) return resp({ error: "Bot não conectado. Salve o token primeiro." }, 400);
    const chat_id = body?.chat_id;
    const text = String(body?.text ?? "").trim();
    if (!chat_id || !text) return resp({ error: "chat_id e text obrigatórios" }, 400);

    const buttons: any[][] = Array.isArray(body?.buttons) ? body.buttons : [];
    const inline_keyboard = buttons
      .map((row) => (Array.isArray(row) ? row : [])
        .map((b) => {
          const t = String(b?.text ?? "").trim();
          if (!t) return null;
          if (b?.url) return { text: t, url: String(b.url) };
          if (b?.callback_data) return { text: t, callback_data: String(b.callback_data).slice(0, 64) };
          return null;
        })
        .filter(Boolean))
      .filter((row) => row.length > 0);

    const payload: any = {
      chat_id,
      text,
      disable_web_page_preview: body?.disable_web_page_preview ?? false,
    };
    if (body?.parse_mode) payload.parse_mode = body.parse_mode;
    if (inline_keyboard.length > 0) payload.reply_markup = { inline_keyboard };

    const r = await tgCall(token, "sendMessage", payload);
    if (!r.ok) {
      const desc = r.json?.description ?? JSON.stringify(r.json).slice(0, 240);
      return resp({ success: false, error: `Telegram ${r.status}: ${desc}` }, 502);
    }
    return resp({ success: true, message_id: r.json?.result?.message_id ?? null, raw: r.json?.result });
  } catch (e: any) {
    return resp({ error: String(e?.message ?? e).slice(0, 400) }, 500);
  }
});
