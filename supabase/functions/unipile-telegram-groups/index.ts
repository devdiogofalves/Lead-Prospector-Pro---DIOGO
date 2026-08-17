// unipile-telegram-groups — Lista grupos/canais Telegram e seus membros via Unipile.
//
// Body:
//   { action: "list_chats" }                         → retorna grupos/canais
//   { action: "list_members", chat_id: string }      → retorna membros de um chat
//   { action: "import_members", chat_id: string, members: Array<{provider_id, name?, username?}> }
//                                                    → salva em telegram_recipients

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

async function getCfg(admin: any, userId: string) {
  const { data: row } = await admin
    .from("user_api_keys").select("api_key, extra")
    .eq("user_id", userId).eq("provider", "unipile").maybeSingle();
  const apiKey = (row?.api_key ?? "").trim();
  const extra = (row?.extra ?? {}) as Record<string, any>;
  const dsn = (extra.dsn ?? "https://api.unipile.com:443").replace(/\/+$/, "");
  if (!apiKey) return { error: "Configure a API Key do Unipile em Configurações → APIs." };
  // ISOLAMENTO MULTI-TENANT: NÃO auto-descobre conta no workspace Unipile. A API key
  // pode ser compartilhada entre vários painéis (validado ao vivo: 3-4 tenants na
  // mesma key/DSN); listar /accounts e pegar a "primeira Telegram" capturaria a conta
  // de OUTRO tenant e a gravaria neste painel (mistura de painéis). Exigimos o
  // account_id do próprio tenant, vinculado pelo fluxo de conexão (hosted link +
  // unipile-webhook, que já faz checagem cross-panel).
  const accountId = extra.account_id_telegram;
  if (!accountId) {
    return { error: "Nenhuma conta Telegram conectada a este painel. Conecte em Integrações → Canais.", needs_connection: true };
  }
  return { apiKey, dsn, accountId };
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
    const action = String(body?.action ?? "");

    const cfg = await getCfg(admin, userId);
    if ("error" in cfg) return resp({ success: false, ...cfg }, (cfg as any).needs_connection ? 200 : 400);
    const { apiKey, dsn, accountId } = cfg as any;

    if (action === "list_chats") {
      // Lista chats no Telegram desta conta. Filtra grupos/canais (type !== private/1:1).
      const cursor = body?.cursor ? `&cursor=${encodeURIComponent(body.cursor)}` : "";
      const limit = Math.min(Number(body?.limit ?? 100), 200);
      const r = await fetch(`${dsn}/api/v1/chats?account_id=${encodeURIComponent(accountId)}&limit=${limit}${cursor}`, {
        headers: { "X-API-KEY": apiKey, accept: "application/json" },
      });
      const t = await r.text();
      if (!r.ok) return resp({ success: false, error: `Unipile chats ${r.status}: ${t.slice(0, 300)}` }, 502);
      const j: any = JSON.parse(t);
      const items: any[] = j?.items ?? [];
      const groups = items
        .filter((c) => {
          // Telegram: type 1 = private/DM, 2 = group, 3 = channel/supergroup (varia)
          const tp = c?.type;
          const isGroup = c?.is_group === true || tp === 2 || tp === 3 || (c?.name && !c?.attendee_provider_id);
          return isGroup;
        })
        .map((c) => ({
          id: c?.id,
          provider_id: c?.provider_id,
          name: c?.name ?? c?.subject ?? "(sem nome)",
          type: c?.type,
          unread: c?.unread_count ?? 0,
          attendees_count: c?.attendees_count ?? null,
        }));
      return resp({ success: true, items: groups, cursor: j?.cursor ?? null });
    }

    if (action === "list_members") {
      const chatId = String(body?.chat_id ?? "");
      if (!chatId) return resp({ error: "chat_id obrigatório" }, 400);
      const all: any[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 10; i++) { // até 10 páginas (~1000 membros)
        const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=200` : `?limit=200`;
        const r = await fetch(`${dsn}/api/v1/chats/${encodeURIComponent(chatId)}/attendees${qs}`, {
          headers: { "X-API-KEY": apiKey, accept: "application/json" },
        });
        const t = await r.text();
        if (!r.ok) return resp({ success: false, error: `Unipile attendees ${r.status}: ${t.slice(0, 300)}` }, 502);
        const j: any = JSON.parse(t);
        const items: any[] = j?.items ?? [];
        for (const a of items) {
          all.push({
            provider_id: a?.provider_id ?? a?.id,
            name: a?.name ?? a?.display_name ?? null,
            username: a?.specifics?.username ?? a?.username ?? null,
            is_self: a?.is_self === true,
          });
        }
        cursor = j?.cursor;
        if (!cursor) break;
      }
      // Remove duplicados e self
      const seen = new Set<string>();
      const dedup = all.filter((m) => {
        if (m.is_self || !m.provider_id) return false;
        const k = String(m.provider_id);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return resp({ success: true, items: dedup });
    }

    if (action === "import_members") {
      const members: any[] = Array.isArray(body?.members) ? body.members : [];
      if (members.length === 0) return resp({ error: "members vazio" }, 400);
      const rows = members
        .map((m) => {
          const identifier = m?.username ? `@${String(m.username).replace(/^@/, "")}` : String(m?.provider_id ?? "");
          if (!identifier) return null;
          return {
            user_id: userId,
            identifier,
            display_name: m?.name ?? null,
            provider_chat_id: m?.provider_id ? String(m.provider_id) : null,
            status: "pending",
          };
        })
        .filter(Boolean);
      if (rows.length === 0) return resp({ error: "nenhum membro válido" }, 400);
      const { error } = await admin.from("telegram_recipients")
        .upsert(rows as any, { onConflict: "user_id,identifier" });
      if (error) return resp({ success: false, error: error.message }, 500);
      return resp({ success: true, imported: rows.length });
    }

    return resp({ error: "action inválido" }, 400);
  } catch (e: any) {
    return resp({ error: String(e?.message ?? e).slice(0, 400) }, 500);
  }
});
