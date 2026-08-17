// reseller-create-client — revendedores WhiteLabel criam sub-contas para seus clientes.
// Acesso restrito: usuários com client_subscriptions.reseller_enabled = true.
//
// O cliente criado fica vinculado ao reseller via reseller_id.
// O reseller pode ver e gerenciar seus clientes no painel /reseller.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sub-clientes criados por resellers recebem limites do plano "agency" por padrão
// (o reseller paga pelo capacity total, não por sub-cliente)
const RESELLER_CLIENT_DEFAULTS = {
  plan: "agency",
  chips_limit: null,
  dispatches_daily_limit: null,
  linkedin_enabled: true,
  instagram_enabled: true,
  email_dispatch_enabled: false,
  reseller_enabled: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const token = authHeader.replace("Bearer ", "");
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const caller = { id: claimsData.claims.sub as string, email: claimsData.claims.email as string };

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Verifica se o caller tem plano whitelabel com reseller_enabled
  const { data: callerSub } = await admin
    .from("client_subscriptions")
    .select("reseller_enabled, plan, status")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (!callerSub?.reseller_enabled || callerSub.status !== "active") {
    return json({ error: "Plano WhiteLabel com reseller ativo necessário." }, 403);
  }

  const body = await req.json();
  const { action = "create" } = body;

  // ── LISTAR clientes do reseller ─────────────────────────────────────────
  if (action === "list") {
    const { data: subs } = await admin
      .from("client_subscriptions")
      .select("user_id, plan, status, created_at, notes")
      .eq("reseller_id", caller.id);

    if (!subs?.length) return json({ clients: [] });

    const userIds = subs.map((s: any) => s.user_id);
    const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const filteredUsers = (users ?? []).filter((u: any) => userIds.includes(u.id));

    const { data: brandings } = await admin.from("company_branding")
      .select("user_id, company_name").in("user_id", userIds);
    const brandMap = new Map((brandings ?? []).map((b: any) => [b.user_id, b.company_name]));
    const subMap   = new Map(subs.map((s: any) => [s.user_id, s]));

    const clients = filteredUsers.map((u: any) => ({
      id:           u.id,
      email:        u.email,
      company_name: brandMap.get(u.id) ?? u.user_metadata?.full_name ?? u.email,
      plan:         subMap.get(u.id)?.plan ?? "agency",
      status:       subMap.get(u.id)?.status ?? "active",
      created_at:   u.created_at,
      last_sign_in: u.last_sign_in_at,
    }));

    return json({ clients });
  }

  // ── CRIAR cliente ────────────────────────────────────────────────────────
  if (action === "create") {
    const { email, company_name, agent_name } = body;
    if (!email) return json({ error: "email obrigatório" }, 400);

    // Convida via Supabase (envia e-mail automático de definição de senha)
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: company_name ?? "",
        plan: "agency",
        reseller_id: caller.id,
        account_active: true,
      },
      redirectTo: "https://leadsbooster.com.br",
    });

    if (inviteErr) {
      if (inviteErr.message.includes("already been registered")) {
        return json({ error: "Este e-mail já possui uma conta." }, 409);
      }
      return json({ error: inviteErr.message }, 500);
    }

    const newUserId = invited.user!.id;

    // Cria sub-conta vinculada ao reseller
    await admin.from("client_subscriptions").upsert({
      user_id:    newUserId,
      reseller_id: caller.id,
      ...RESELLER_CLIENT_DEFAULTS,
      status: "active",
    }, { onConflict: "user_id" });

    // Branding inicial com dados fornecidos pelo reseller
    await admin.from("company_branding").upsert({
      user_id:      newUserId,
      company_name: company_name ?? "Minha Empresa",
      agent_name:   agent_name   ?? "IA assistente",
    }, { onConflict: "user_id" });

    return json({ ok: true, user_id: newUserId, email });
  }

  // ── PAUSAR/RETOMAR cliente do reseller ────────────────────────────────────
  if (action === "pause" || action === "resume") {
    const { client_id } = body;
    if (!client_id) return json({ error: "client_id obrigatório" }, 400);

    // Garante que esse cliente pertence ao reseller
    const { data: sub } = await admin.from("client_subscriptions")
      .select("reseller_id").eq("user_id", client_id).maybeSingle();
    if (sub?.reseller_id !== caller.id) return json({ error: "cliente não encontrado" }, 404);

    const paused = action === "pause";
    await admin.from("dispatch_settings").upsert({ user_id: client_id, paused }, { onConflict: "user_id" });
    await admin.from("client_subscriptions").upsert(
      { user_id: client_id, status: paused ? "paused" : "active" },
      { onConflict: "user_id" },
    );
    return json({ ok: true, action, client_id });
  }

  return json({ error: `ação desconhecida: ${action}` }, 400);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
