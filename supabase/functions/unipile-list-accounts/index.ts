// Lista as contas conectadas no Unipile do usuário (opcionalmente filtradas por canal).
// Body: { channel?: "linkedin"|"instagram"|"telegram"|"email" }
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

const FILTERS: Record<string, string[]> = {
  linkedin: ["LINKEDIN"],
  instagram: ["INSTAGRAM"],
  telegram: ["TELEGRAM"],
  email: ["GOOGLE", "OUTLOOK", "IMAP", "MAIL"],
};

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()))];
}

function savedAccountIds(extra: Record<string, any>, channel: string): string[] {
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

async function accountUsedByOtherPanel(admin: any, userId: string, channel: string, accountId: string) {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: auth } } });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return resp({ error: "Unauthenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const channel = String(body?.channel ?? "").toLowerCase();

    const { data: row } = await admin.from("user_api_keys").select("api_key, extra").eq("user_id", userId).eq("provider", "unipile").maybeSingle();
    const apiKey = (row?.api_key ?? "").trim();
    const extra = ((row?.extra as any) ?? {}) as Record<string, any>;
    const dsn = (extra.dsn ?? "https://api.unipile.com:443").replace(/\/+$/, "");
    if (!apiKey) return resp({ error: "Configure a API Key do Unipile em Configurações → APIs." }, 400);

    // Não listar todas as contas do slot Unipile compartilhado: isso mistura perfis de clientes.
    // A UI só pode enxergar contas que foram vinculadas ao próprio painel pelo webhook de conexão.
    if (channel && FILTERS[channel]) {
      const ids = savedAccountIds(extra, channel);
      const accounts = await Promise.all(ids.map(async (id) => {
        let meta: any = {};
        try {
          const ar = await fetch(`${dsn}/api/v1/accounts/${id}`, { headers: { "X-API-KEY": apiKey, accept: "application/json" } });
          if (ar.ok) meta = await ar.json();
        } catch { /* mantém id */ }
        const conflict = await accountUsedByOtherPanel(admin, userId, channel, id);
        return {
          id,
          name: meta?.name ?? meta?.username ?? id,
          type: meta?.type ?? meta?.provider ?? channel,
          status: conflict ? "BLOQUEADA: vinculada a outro painel" : (meta?.sources?.[0]?.status ?? meta?.status ?? null),
          blocked: conflict,
        };
      }));
      return resp({ success: true, accounts });
    }

    const accounts = [];
    return resp({ success: true, accounts });
  } catch (e: any) {
    return resp({ error: String(e?.message ?? e).slice(0, 400) }, 500);
  }
});
