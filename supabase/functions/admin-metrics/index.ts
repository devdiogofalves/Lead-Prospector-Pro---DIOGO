// admin-metrics — painel de controle do administrador LeadsBooster.
// Acesso restrito: apenas nucleodameta@gmail.com ou user_metadata.is_admin = true.
// Retorna visão completa de todos os clientes, uso e receita estimada.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ADMIN_EMAIL = "nucleodameta@gmail.com";

// Preços MRR por plano (R$). Semestral/anual viram receita equivalente mensal.
const PLAN_MRR: Record<string, number> = {
  trial:      0,
  free:       0,
  mensal:     697,
  semestral:  497,
  anual:      397,
  whitelabel: 300,
  // legados
  starter:    197,
  pro:        397,
  agency:     697,
};
const COEX_ADDON_MRR = 480;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── Auth: verifica admin ────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (user.email !== ADMIN_EMAIL && !user.app_metadata?.is_admin) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Coleta de dados em paralelo ────────────────────────────────────────────
  const weekStart = new Date(Date.now() - 7 * 86400000);
  weekStart.setUTCHours(0, 0, 0, 0);
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [
    { data: { users: allUsers } },
    { data: subscriptions },
    { data: brandings },
    { data: dispatchWeek },
    { count: qualifiedWeek },
    { data: activeToday },
    { data: chipCounts },
  ] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("client_subscriptions").select("*"),
    admin.from("company_branding").select("user_id, company_name, agent_name"),
    admin.from("dispatch_queue").select("user_id, status").gte("created_at", weekStart.toISOString()),
    admin.from("qualification_conversations").select("id", { count: "exact", head: true }).eq("qualified", true).gte("qualified_at", weekStart.toISOString()),
    admin.from("dispatch_queue").select("user_id").eq("status", "sent").gte("sent_at", todayStart.toISOString()),
    admin.from("whatsapp_instances").select("user_id").eq("active", true),
  ]);

  // Mapas de lookup
  const subMap  = new Map((subscriptions ?? []).map((s: any) => [s.user_id, s]));
  const brandMap = new Map((brandings ?? []).map((b: any) => [b.user_id, b]));

  // Atividade por usuário esta semana
  const userStats = new Map<string, { sent: number; failed: number; pending: number }>();
  for (const row of dispatchWeek ?? []) {
    if (!userStats.has(row.user_id)) userStats.set(row.user_id, { sent: 0, failed: 0, pending: 0 });
    const s = userStats.get(row.user_id)!;
    if (row.status === "sent")    s.sent++;
    if (row.status === "failed")  s.failed++;
    if (row.status === "pending") s.pending++;
  }

  // Chips ativos por usuário
  const chipsPerUser = new Map<string, number>();
  for (const row of chipCounts ?? []) {
    chipsPerUser.set(row.user_id, (chipsPerUser.get(row.user_id) ?? 0) + 1);
  }

  // Usuários ativos hoje
  const activeTodaySet = new Set((activeToday ?? []).map((r: any) => r.user_id));

  // ── Monta lista de clientes (exclui o próprio admin) ───────────────────────
  const clients = (allUsers ?? [])
    .filter((u: any) => u.email !== ADMIN_EMAIL && !u.user_metadata?.is_admin)
    .map((u: any) => {
      const sub   = subMap.get(u.id) as any;
      const brand = brandMap.get(u.id) as any;
      const stats = userStats.get(u.id) ?? { sent: 0, failed: 0, pending: 0 };
      const plan  = sub?.plan ?? u.user_metadata?.plan ?? "trial";
      const status = sub?.status ?? (u.user_metadata?.account_active === false ? "paused" : "active");

      return {
        id:                    u.id,
        email:                 u.email ?? "",
        company_name:          brand?.company_name ?? u.user_metadata?.full_name ?? u.email ?? "",
        agent_name:            brand?.agent_name ?? "IA assistente",
        plan,
        status,
        kiwify_subscription_id: sub?.kiwify_subscription_id ?? null,
        reseller_enabled:      sub?.reseller_enabled ?? false,
        reseller_id:           sub?.reseller_id ?? null,
        chips_limit:           sub?.chips_limit ?? null,
        dispatches_daily_limit: sub?.dispatches_daily_limit ?? null,
        chips_active:          chipsPerUser.get(u.id) ?? 0,
        active_today:          activeTodaySet.has(u.id),
        dispatches_sent_week:  stats.sent,
        dispatches_failed_week: stats.failed,
        dispatches_pending:    stats.pending,
        coex_chatwoot_enabled: sub?.coex_chatwoot_enabled ?? false,
        billing_cycle:         sub?.billing_cycle ?? "monthly",
        setup_fee_paid:        Number(sub?.setup_fee_paid ?? 0),
        rebuilds_used:         sub?.rebuilds_used ?? 0,
        rebuilds_limit:        sub?.rebuilds_limit ?? 0,
        use_admin_credentials: sub?.use_admin_credentials ?? false,
        contact_phone:         sub?.contact_phone ?? null,
        mrr:                   (PLAN_MRR[plan] ?? 0) + ((sub?.coex_chatwoot_enabled) ? COEX_ADDON_MRR : 0),
        last_sign_in:          u.last_sign_in_at ?? null,
        created_at:            u.created_at ?? null,
        notes:                 sub?.notes ?? null,
      };
    });

  // ── Visão geral ────────────────────────────────────────────────────────────
  const activeClients = clients.filter((c) => c.status === "active");
  const planCounts = clients.reduce((acc: Record<string, number>, c) => {
    acc[c.plan] = (acc[c.plan] ?? 0) + 1;
    return acc;
  }, {});
  const mrr = activeClients.reduce((sum, c) => sum + c.mrr, 0);

  return json({
    overview: {
      total_clients:       clients.length,
      active_clients:      activeClients.length,
      paused_clients:      clients.filter((c) => c.status === "paused").length,
      trial_clients:       clients.filter((c) => c.plan === "trial").length,
      active_today:        activeTodaySet.size,
      dispatches_week:     (dispatchWeek ?? []).filter((r: any) => r.status === "sent").length,
      qualified_week:      qualifiedWeek ?? 0,
      mrr_estimate:        mrr,
      plan_counts:         planCounts,
    },
    clients,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
