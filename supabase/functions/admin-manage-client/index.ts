// admin-manage-client — ações de gestão de clientes pelo admin.
// Acesso restrito: apenas nucleodameta@gmail.com ou is_admin = true.
//
// Ações disponíveis (body.action):
//   create_client        — cria nova conta + envia convite por e-mail
//   edit_client          — atualiza company_branding + metadados do usuário
//   delete_client        — remove conta + todos os dados do cliente
//   toggle_admin_creds   — liga/desliga uso das APIs do admin para um cliente trial
//   send_welcome_whatsapp— envia boas-vindas WhatsApp via chip admin
//   pause                — pausa dispatch_settings + marca status = paused
//   resume               — retoma dispatch_settings + marca status = active
//   change_plan          — atualiza plano + limites
//   add_note             — adiciona anotação interna
//   reset_password       — envia e-mail de reset de senha

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ADMIN_EMAIL = "nucleodameta@gmail.com";

// Defaults aplicados ao criar/trocar plano. billing_cycle e rebuilds_limit também são gravados.
const PLAN_DEFAULTS: Record<string, {
  chips_limit: number | null;
  dispatches_daily_limit: number | null;
  linkedin_enabled: boolean;
  instagram_enabled: boolean;
  email_dispatch_enabled: boolean;
  reseller_enabled: boolean;
  billing_cycle?: string;
  rebuilds_limit?: number;
  setup_fee_paid?: number;
}> = {
  // Trial / Free
  trial:      { chips_limit: 1,    dispatches_daily_limit: 20,   linkedin_enabled: false, instagram_enabled: false, email_dispatch_enabled: false, reseller_enabled: false, billing_cycle: "monthly" },
  free:       { chips_limit: null, dispatches_daily_limit: null, linkedin_enabled: true,  instagram_enabled: true,  email_dispatch_enabled: true,  reseller_enabled: false, billing_cycle: "monthly" },
  // Planos comerciais — todos com tudo liberado; diferença é só billing cycle e preço
  mensal:     { chips_limit: null, dispatches_daily_limit: null, linkedin_enabled: true,  instagram_enabled: true,  email_dispatch_enabled: true,  reseller_enabled: false, billing_cycle: "monthly" },
  semestral:  { chips_limit: null, dispatches_daily_limit: null, linkedin_enabled: true,  instagram_enabled: true,  email_dispatch_enabled: true,  reseller_enabled: false, billing_cycle: "semestral" },
  anual:      { chips_limit: null, dispatches_daily_limit: null, linkedin_enabled: true,  instagram_enabled: true,  email_dispatch_enabled: true,  reseller_enabled: false, billing_cycle: "annual" },
  // WhiteLabel — revenda com 3 rebuilds inclusos no setup R$5.500
  whitelabel: { chips_limit: null, dispatches_daily_limit: null, linkedin_enabled: true,  instagram_enabled: true,  email_dispatch_enabled: true,  reseller_enabled: true,  billing_cycle: "monthly", rebuilds_limit: 3, setup_fee_paid: 5500 },
  // Legados — mantidos para contas antigas
  starter:    { chips_limit: 1,    dispatches_daily_limit: 50,   linkedin_enabled: false, instagram_enabled: false, email_dispatch_enabled: false, reseller_enabled: false, billing_cycle: "monthly" },
  pro:        { chips_limit: 3,    dispatches_daily_limit: 200,  linkedin_enabled: true,  instagram_enabled: true,  email_dispatch_enabled: false, reseller_enabled: false, billing_cycle: "monthly" },
  agency:     { chips_limit: null, dispatches_daily_limit: null, linkedin_enabled: true,  instagram_enabled: true,  email_dispatch_enabled: true,  reseller_enabled: false, billing_cycle: "monthly" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

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

  // Resolve admin user_id dinamicamente via user_roles (evita hardcode quebrado)
  let ADMIN_USER_ID = user.id;
  {
    const { data: adminRow } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();
    if (adminRow?.user_id) ADMIN_USER_ID = adminRow.user_id;
  }

  const body = await req.json();
  const { action, client_id, plan, notes, email, company_name, agent_name, password, enable, phone, message, contact_phone, coex_enabled } = body;

  // create_client não precisa de client_id
  if (action !== "create_client" && !client_id) {
    return json({ error: "client_id obrigatório" }, 400);
  }

  switch (action) {
    case "create_client": {
      if (!email) return json({ error: "email obrigatório" }, 400);
      const selectedPlan = plan ?? "trial";
      if (!PLAN_DEFAULTS[selectedPlan]) return json({ error: "plano inválido" }, 400);

      const userMeta = {
        full_name: company_name ?? "",
        plan: selectedPlan,
        account_active: true,
        created_by_admin: true,
      };

      let newUserId: string;

      if (password && password.trim().length >= 6) {
        // Cria com senha definida pelo admin — acesso imediato, sem e-mail de convite
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password: password.trim(),
          email_confirm: true,
          user_metadata: userMeta,
        });
        if (createErr) {
          if (createErr.message.includes("already been registered") || createErr.message.includes("already exists")) {
            return json({ error: "Este e-mail já possui uma conta." }, 409);
          }
          return json({ error: createErr.message }, 500);
        }
        newUserId = created.user!.id;
      } else {
        // Sem senha → envia convite por e-mail (cliente define a própria senha)
        const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
          data: userMeta,
          redirectTo: "https://leadsbooster.com.br",
        });
        if (inviteErr) {
          if (inviteErr.message.includes("already been registered")) {
            return json({ error: "Este e-mail já possui uma conta." }, 409);
          }
          return json({ error: inviteErr.message }, 500);
        }
        newUserId = invited.user!.id;
      }

      const limits = PLAN_DEFAULTS[selectedPlan];

      await admin.from("client_subscriptions").upsert({
        user_id: newUserId,
        plan:    selectedPlan,
        status:  "active",
        ...limits,
      }, { onConflict: "user_id" });

      await admin.from("company_branding").upsert({
        user_id:      newUserId,
        company_name: company_name ?? "Minha Empresa",
        agent_name:   agent_name   ?? "IA assistente",
      }, { onConflict: "user_id" });

      const method = (password && password.trim().length >= 6) ? "direct" : "invite";
      console.log(`[admin-manage-client] cliente criado: ${email} plano=${selectedPlan} method=${method}`);
      return json({ ok: true, action: "created", user_id: newUserId, email, plan: selectedPlan, method });
    }
    case "pause": {
      await admin.from("dispatch_settings").upsert(
        { user_id: client_id, paused: true },
        { onConflict: "user_id" },
      );
      await admin.from("client_subscriptions").upsert(
        { user_id: client_id, status: "paused" },
        { onConflict: "user_id" },
      );
      await admin.auth.admin.updateUserById(client_id, {
        user_metadata: { account_active: false, paused_at: new Date().toISOString() },
      });
      return json({ ok: true, action: "paused", client_id });
    }

    case "resume": {
      await admin.from("dispatch_settings").upsert(
        { user_id: client_id, paused: false },
        { onConflict: "user_id" },
      );
      await admin.from("client_subscriptions").upsert(
        { user_id: client_id, status: "active" },
        { onConflict: "user_id" },
      );
      await admin.auth.admin.updateUserById(client_id, {
        user_metadata: { account_active: true },
      });
      return json({ ok: true, action: "resumed", client_id });
    }

    case "change_plan": {
      if (!plan || !PLAN_DEFAULTS[plan]) return json({ error: "plano inválido" }, 400);
      const limits = PLAN_DEFAULTS[plan];
      await admin.from("client_subscriptions").upsert(
        { user_id: client_id, plan, status: "active", ...limits },
        { onConflict: "user_id" },
      );
      await admin.auth.admin.updateUserById(client_id, {
        user_metadata: { plan, account_active: true },
      });
      return json({ ok: true, action: "plan_changed", client_id, plan, limits });
    }

    case "add_note": {
      if (!notes) return json({ error: "notes obrigatório" }, 400);
      await admin.from("client_subscriptions").upsert(
        { user_id: client_id, notes },
        { onConflict: "user_id" },
      );
      return json({ ok: true, action: "note_added", client_id });
    }

    case "toggle_admin_creds": {
      // Liga/desliga o uso das APIs do admin para um cliente trial.
      // Quando ligado: copia as chaves do admin para o cliente (is_admin_shared=true).
      // Quando desligado: remove as chaves copiadas.
      const enabling = enable === true;

      if (enabling) {
        // Busca as chaves do admin
        const { data: adminKeys } = await admin.from("user_api_keys")
          .select("provider, api_key, extra")
          .eq("user_id", ADMIN_USER_ID);

        if (adminKeys && adminKeys.length > 0) {
          // Remove chaves admin-shared anteriores do cliente
          await admin.from("user_api_keys").delete()
            .eq("user_id", client_id).eq("is_admin_shared", true);

          // Copia as chaves do admin para o cliente
          const rows = adminKeys.map((k: any) => {
            let extra = k.extra;
            // Sanitiza Unipile: cliente herda apenas o DSN, nunca contas/perfis já conectados do admin.
            if (k.provider === "unipile" && extra && typeof extra === "object") {
              extra = extra.dsn ? { dsn: extra.dsn } : null;
            }
            return {
              user_id: client_id,
              provider: k.provider,
              api_key: k.api_key,
              extra,
              is_admin_shared: true,
            };
          });
          await admin.from("user_api_keys").insert(rows);
        }
      } else {
        // Remove todas as chaves admin-shared deste cliente
        await admin.from("user_api_keys").delete()
          .eq("user_id", client_id).eq("is_admin_shared", true);
      }

      await admin.from("client_subscriptions").upsert(
        { user_id: client_id, use_admin_credentials: enabling },
        { onConflict: "user_id" },
      );

      // Salva contact_phone se fornecido
      if (contact_phone !== undefined) {
        await admin.from("client_subscriptions").upsert(
          { user_id: client_id, contact_phone },
          { onConflict: "user_id" },
        );
      }

      console.log(`[admin-manage-client] credenciais admin ${enabling ? "ATIVADAS" : "DESATIVADAS"} para ${client_id}`);
      return json({ ok: true, action: "toggle_admin_creds", client_id, enabled: enabling });
    }

    case "send_welcome_whatsapp": {
      // Envia mensagem de boas-vindas via chip WhatsApp do admin (testecleo).
      if (!phone) return json({ error: "phone obrigatório" }, 400);
      if (!message) return json({ error: "message obrigatório" }, 400);

      // Busca o chip ativo do admin
      const { data: chipRow } = await admin.from("whatsapp_instances")
        .select("instance_name, mandrack_instance_token")
        .eq("user_id", ADMIN_USER_ID)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      if (!chipRow?.mandrack_instance_token) {
        return json({ error: "Nenhum chip WhatsApp ativo na conta admin. Conecte um chip em /whatsapp." }, 400);
      }

      const MANDRACK_URL = Deno.env.get("MANDRACK_URL") ?? "";
      if (!MANDRACK_URL) return json({ error: "MANDRACK_URL não configurado" }, 500);

      // Normaliza o número (remove não-dígitos, garante prefixo 55)
      const digits = phone.replace(/\D/g, "");
      const normalized = digits.startsWith("55") ? digits : `55${digits}`;

      const resp = await fetch(`${MANDRACK_URL.replace(/\/$/, "")}/chat/send/text`, {
        method: "POST",
        headers: { token: chipRow.mandrack_instance_token, "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized, body: message, delay: false }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => resp.statusText);
        return json({ error: `Mandrack: ${errText}` }, 500);
      }

      // Salva o contact_phone no cliente se ainda não estiver registrado
      if (client_id) {
        await admin.from("client_subscriptions").upsert(
          { user_id: client_id, contact_phone: normalized },
          { onConflict: "user_id" },
        );
      }

      console.log(`[admin-manage-client] boas-vindas WhatsApp enviado para ${normalized} via ${chipRow.instance_name}`);
      return json({ ok: true, action: "whatsapp_sent", phone: normalized });
    }

    case "edit_client": {
      // Atualiza nome da empresa e/ou do agente no company_branding
      const patch: Record<string, string> = {};
      if (typeof company_name === "string" && company_name.trim()) patch.company_name = company_name.trim();
      if (typeof agent_name   === "string" && agent_name.trim())   patch.agent_name   = agent_name.trim();

      if (Object.keys(patch).length > 0) {
        await admin.from("company_branding").upsert(
          { user_id: client_id, ...patch },
          { onConflict: "user_id" },
        );
        // Sincroniza full_name nos metadados do usuário se empresa mudou
        if (patch.company_name) {
          await admin.auth.admin.updateUserById(client_id, {
            user_metadata: { full_name: patch.company_name },
          });
        }
      }
      console.log(`[admin-manage-client] cliente editado: ${client_id} patch=${JSON.stringify(patch)}`);
      return json({ ok: true, action: "edited", client_id });
    }

    case "delete_client": {
      // Remove dados associados (caso FK não tenha CASCADE em todas as tabelas)
      await admin.from("company_branding").delete().eq("user_id", client_id);
      await admin.from("client_subscriptions").delete().eq("user_id", client_id);
      await admin.from("dispatch_settings").delete().eq("user_id", client_id);
      await admin.from("whatsapp_instances").delete().eq("user_id", client_id);

      // Remove o usuário do auth (cascateia o restante via FK)
      const { error: delErr } = await admin.auth.admin.deleteUser(client_id);
      if (delErr) return json({ error: delErr.message }, 500);

      console.log(`[admin-manage-client] cliente deletado: ${client_id}`);
      return json({ ok: true, action: "deleted", client_id });
    }

    case "reset_password": {
      // Envia e-mail de reset de senha para o cliente
      const { data: userData } = await admin.auth.admin.getUserById(client_id);
      if (!userData?.user?.email) return json({ error: "usuário não encontrado" }, 404);
      await userClient.auth.resetPasswordForEmail(userData.user.email, {
        redirectTo: "https://leadsbooster.com.br/reset-password",
      });
      return json({ ok: true, action: "reset_password_sent", email: userData.user.email });
    }

    case "change_email": {
      // Troca o e-mail de login do cliente
      if (!email) return json({ error: "email obrigatório" }, 400);
      const { data: updated, error: updErr } = await admin.auth.admin.updateUserById(client_id, {
        email,
        email_confirm: true,
      });
      if (updErr) {
        if (updErr.message.includes("already") || updErr.message.includes("exists")) {
          return json({ error: "Este e-mail já está em uso por outra conta." }, 409);
        }
        return json({ error: updErr.message }, 500);
      }
      console.log(`[admin-manage-client] e-mail alterado: ${client_id} → ${email}`);
      return json({ ok: true, action: "email_changed", client_id, email: updated.user?.email });
    }

    case "impersonate": {
      // Gera um magic link de 1 uso que loga o admin como o cliente
      const { data: userData } = await admin.auth.admin.getUserById(client_id);
      if (!userData?.user?.email) return json({ error: "usuário não encontrado" }, 404);
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: userData.user.email,
        options: { redirectTo: "https://leadsbooster.com.br/dashboard" },
      });
      if (linkErr) return json({ error: linkErr.message }, 500);
      console.log(`[admin-manage-client] impersonation gerada para ${userData.user.email}`);
      return json({ ok: true, action: "impersonate", action_link: linkData.properties?.action_link, email: userData.user.email });
    }

    case "toggle_admin": {
      // Promove ou rebaixa um cliente a admin (is_admin no user_metadata)
      const promoting = enable === true;
      const { data: userData } = await admin.auth.admin.getUserById(client_id);
      if (!userData?.user) return json({ error: "usuário não encontrado" }, 404);
      const newMeta = { ...(userData.user.user_metadata ?? {}), is_admin: promoting };
      // app_metadata é a fonte de verdade da autorização admin (NÃO gravável pelo usuário).
      // user_metadata é mantido em sincronia só para as guardas cosméticas do frontend.
      const newAppMeta = { ...(userData.user.app_metadata ?? {}), is_admin: promoting };
      await admin.auth.admin.updateUserById(client_id, { app_metadata: newAppMeta, user_metadata: newMeta });
      console.log(`[admin-manage-client] is_admin=${promoting} aplicado em ${userData.user.email}`);
      return json({ ok: true, action: "toggle_admin", client_id, is_admin: promoting });
    }

    case "toggle_coex": {
      // Liga/desliga o add-on Coex+ChatWoot (+R$480/mês, até 2000 disparos sem ban)
      const enabling = enable === true;
      await admin.from("client_subscriptions").upsert(
        { user_id: client_id, coex_chatwoot_enabled: enabling },
        { onConflict: "user_id" },
      );
      console.log(`[admin-manage-client] Coex+ChatWoot ${enabling ? "ATIVADO" : "DESATIVADO"} para ${client_id}`);
      return json({ ok: true, action: "toggle_coex", client_id, enabled: enabling });
    }


    // ──────────────────────────────────────────────────────────────────────
    // NOVO: gestão granular de APIs compartilhadas e contas Unipile
    // ──────────────────────────────────────────────────────────────────────

    case "list_shared_apis": {
      // Retorna toggles por provider + qual chave o admin tem disponível para compartilhar
      const [{ data: shared }, { data: adminKeys }] = await Promise.all([
        admin.from("admin_shared_apis").select("provider, enabled, unipile_account_id").eq("client_id", client_id),
        admin.from("user_api_keys").select("provider").eq("user_id", ADMIN_USER_ID),
      ]);
      const adminProviders = (adminKeys ?? []).map((k: any) => k.provider);
      return json({ ok: true, shared: shared ?? [], admin_providers: adminProviders });
    }

    case "set_shared_api": {
      // body: { provider, enabled, unipile_account_id? }
      const provider = body.provider as string;
      const enabling = body.enabled === true;
      const unipileAccountId = body.unipile_account_id ?? null;
      if (!provider) return json({ error: "provider obrigatório" }, 400);

      // Providers de IA resolvidos via RPC get_ai_key_for_user: o toggle é APENAS
      // declarativo em admin_shared_apis. NÃO copia nem apaga user_api_keys, então
      // a chave própria do cliente é preservada (a slot é única por user+provider).
      const RPC_RESOLVED = ["openai", "gemini", "kie_ai"];
      if (RPC_RESOLVED.includes(provider)) {
        if (enabling) {
          const { data: k } = await admin.from("user_api_keys")
            .select("api_key").eq("user_id", ADMIN_USER_ID).eq("provider", provider).maybeSingle();
          if (!k?.api_key) return json({ error: `Você (admin) ainda não cadastrou a chave de ${provider}` }, 400);
        }
        await admin.from("admin_shared_apis").upsert(
          { client_id, provider, enabled: enabling, unipile_account_id: null },
          { onConflict: "client_id,provider" },
        );
        console.log(`[admin-manage-client] shared_api(declarativo) ${provider}=${enabling} cliente=${client_id}`);
        return json({ ok: true, action: "set_shared_api", client_id, provider, enabled: enabling });
      }

      if (enabling) {
        let api_key: string | null = null;
        let extra: any = null;

        if (provider === "unipile") {
          if (!unipileAccountId) return json({ error: "unipile_account_id obrigatório para Unipile" }, 400);
          const { data: slot } = await admin.from("admin_unipile_accounts")
            .select("api_key, dsn, active").eq("id", unipileAccountId).maybeSingle();
          if (!slot || !slot.active) return json({ error: "Conta Unipile não encontrada ou inativa" }, 400);
          api_key = slot.api_key;
          extra = { dsn: slot.dsn }; // sanitizado — nunca account_id_*
        } else {
          const { data: k } = await admin.from("user_api_keys")
            .select("api_key, extra").eq("user_id", ADMIN_USER_ID).eq("provider", provider).maybeSingle();
          if (!k) return json({ error: `Você (admin) ainda não cadastrou a chave de ${provider}` }, 400);
          api_key = k.api_key;
          extra = k.extra;
        }

        await admin.from("user_api_keys").upsert(
          { user_id: client_id, provider, api_key, extra },
          { onConflict: "user_id,provider" },
        );

        await admin.from("admin_shared_apis").upsert(
          { client_id, provider, enabled: true, unipile_account_id: unipileAccountId },
          { onConflict: "client_id,provider" },
        );
      } else {
        // Desativar: remove a chave do cliente e marca enabled=false
        await admin.from("user_api_keys").delete().eq("user_id", client_id).eq("provider", provider);
        await admin.from("admin_shared_apis").upsert(
          { client_id, provider, enabled: false, unipile_account_id: null },
          { onConflict: "client_id,provider" },
        );
      }

      console.log(`[admin-manage-client] shared_api ${provider}=${enabling} cliente=${client_id}`);
      return json({ ok: true, action: "set_shared_api", client_id, provider, enabled: enabling });
    }

    case "list_unipile_accounts": {
      const { data: accounts } = await admin.from("admin_unipile_accounts")
        .select("id, slot_number, label, api_key, dsn, max_profiles, active, created_at, updated_at")
        .order("slot_number", { ascending: true });

      // Contagem de clientes vinculados (toggles em admin_shared_apis)
      const { data: links } = await admin.from("admin_shared_apis")
        .select("unipile_account_id, client_id").eq("provider", "unipile").eq("enabled", true);
      const clientUsage = new Map<string, number>();
      for (const l of links ?? []) {
        if (!l.unipile_account_id) continue;
        clientUsage.set(l.unipile_account_id, (clientUsage.get(l.unipile_account_id) ?? 0) + 1);
      }

      // Contagem REAL de PERFIS (pessoas) no slot Unipile.
      // Unipile retorna 1 item por CANAL conectado — vários canais podem pertencer ao mesmo perfil.
      // Agrupamos por nome (case-insensitive) pra refletir o que a Unipile cobra: 10 perfis por conta,
      // cada perfil podendo conectar até 4 canais (LinkedIn/Gmail/IG/TG).
      const enriched = await Promise.all((accounts ?? []).map(async (a: any) => {
        let profiles_connected: number | null = null;
        let channels_connected: number | null = null;
        const profiles_by_provider: Record<string, number> = {};
        if (a.active && a.api_key && a.dsn) {
          try {
            const r = await fetch(`${a.dsn}/api/v1/accounts`, {
              headers: { "X-API-KEY": a.api_key, Accept: "application/json" },
            });
            if (r.ok) {
              const data = await r.json().catch(() => null) as any;
              const items: any[] = data?.items ?? data?.accounts ?? data ?? [];
              if (Array.isArray(items)) {
                channels_connected = items.length;
                const profilesSet = new Set<string>();
                for (const it of items) {
                  const p = String(it?.type ?? it?.provider ?? "OTHER").toUpperCase();
                  profiles_by_provider[p] = (profiles_by_provider[p] ?? 0) + 1;
                  const key = String(it?.name ?? it?.user_id ?? it?.id ?? "").trim().toLowerCase();
                  if (key) profilesSet.add(key);
                }
                profiles_connected = profilesSet.size;
              }
            }
          } catch (_) { /* mantém null = desconhecido */ }
        }
        const { api_key, dsn, ...rest } = a;
        return {
          ...rest,
          clients_linked: clientUsage.get(a.id) ?? 0,
          profiles_connected,
          channels_connected,
          profiles_by_provider,
        };
      }));
      return json({ ok: true, accounts: enriched });
    }

    case "create_unipile_account": {
      const { label, api_key, dsn, max_profiles } = body;
      if (!api_key || !dsn) return json({ error: "api_key e dsn obrigatórios" }, 400);
      const { data: maxSlot } = await admin.from("admin_unipile_accounts")
        .select("slot_number").order("slot_number", { ascending: false }).limit(1).maybeSingle();
      const nextSlot = (maxSlot?.slot_number ?? 0) + 1;
      const { data: created, error: insErr } = await admin.from("admin_unipile_accounts")
        .insert({ slot_number: nextSlot, label: label ?? `Conta Unipile #${nextSlot}`, api_key, dsn, max_profiles: max_profiles ?? 10 })
        .select().maybeSingle();
      if (insErr) return json({ error: insErr.message }, 500);
      return json({ ok: true, account: created });
    }

    case "update_unipile_account": {
      const { unipile_account_id, label, api_key, dsn, max_profiles, active } = body;
      if (!unipile_account_id) return json({ error: "unipile_account_id obrigatório" }, 400);
      const patch: Record<string, any> = {};
      if (label !== undefined) patch.label = label;
      if (api_key !== undefined && api_key) patch.api_key = api_key;
      if (dsn !== undefined && dsn) patch.dsn = dsn;
      if (max_profiles !== undefined) patch.max_profiles = max_profiles;
      if (active !== undefined) patch.active = active;
      const { error: updErr } = await admin.from("admin_unipile_accounts")
        .update(patch).eq("id", unipile_account_id);
      if (updErr) return json({ error: updErr.message }, 500);

      // Se api_key/dsn mudaram, propaga para todos os clientes vinculados
      if (patch.api_key || patch.dsn) {
        const { data: slot } = await admin.from("admin_unipile_accounts")
          .select("api_key, dsn").eq("id", unipile_account_id).maybeSingle();
        const { data: links } = await admin.from("admin_shared_apis")
          .select("client_id").eq("provider", "unipile").eq("enabled", true).eq("unipile_account_id", unipile_account_id);
        for (const link of links ?? []) {
          await admin.from("user_api_keys").upsert(
            { user_id: link.client_id, provider: "unipile", api_key: slot!.api_key, extra: { dsn: slot!.dsn } },
            { onConflict: "user_id,provider" },
          );
        }
      }
      return json({ ok: true, action: "unipile_account_updated", unipile_account_id });
    }

    case "delete_unipile_account": {
      const { unipile_account_id } = body;
      if (!unipile_account_id) return json({ error: "unipile_account_id obrigatório" }, 400);
      // Verifica se há clientes vinculados
      const { count } = await admin.from("admin_shared_apis")
        .select("id", { count: "exact", head: true })
        .eq("provider", "unipile").eq("enabled", true).eq("unipile_account_id", unipile_account_id);
      if ((count ?? 0) > 0) {
        return json({ error: `Não é possível remover: ${count} cliente(s) ainda usam essa conta.` }, 400);
      }
      const { error: delErr } = await admin.from("admin_unipile_accounts").delete().eq("id", unipile_account_id);
      if (delErr) return json({ error: delErr.message }, 500);
      return json({ ok: true, action: "unipile_account_deleted" });
    }

    case "sync_unipile_account": {
      // Lista os perfis REAIS conectados em uma conta Unipile + cruza com clientes do banco.
      // Detecta órfãos (perfil no Unipile sem subscriber) e clientes "fantasma" (slot ativado mas sem account_id).
      const { unipile_account_id } = body;
      if (!unipile_account_id) return json({ error: "unipile_account_id obrigatório" }, 400);

      const { data: slot } = await admin.from("admin_unipile_accounts")
        .select("id, label, slot_number, api_key, dsn, max_profiles, active")
        .eq("id", unipile_account_id).maybeSingle();
      if (!slot) return json({ error: "Conta não encontrada" }, 404);

      let items: any[] = [];
      let fetchError: string | null = null;
      try {
        const r = await fetch(`${slot.dsn}/api/v1/accounts`, {
          headers: { "X-API-KEY": slot.api_key, Accept: "application/json" },
        });
        if (!r.ok) fetchError = `Unipile retornou ${r.status}`;
        else {
          const data = await r.json().catch(() => null) as any;
          items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : (data?.accounts ?? []);
        }
      } catch (e: any) { fetchError = e?.message ?? "erro de rede"; }

      // Clientes vinculados a este slot
      const { data: links } = await admin.from("admin_shared_apis")
        .select("client_id").eq("provider", "unipile").eq("enabled", true).eq("unipile_account_id", unipile_account_id);
      const linkedClientIds = (links ?? []).map((l: any) => l.client_id);

      // Busca metadados dos clientes (e-mail + nome empresa) + account_ids salvos pelo webhook
      const clientMeta: Record<string, { email?: string; company_name?: string }> = {};
      // accountId (Unipile) -> client_id (nosso)
      const accountIdToClient: Record<string, string> = {};
      if (linkedClientIds.length > 0) {
        const { data: brandings } = await admin.from("company_branding")
          .select("user_id, company_name").in("user_id", linkedClientIds);
        for (const b of brandings ?? []) clientMeta[b.user_id] = { company_name: b.company_name };
        for (const uid of linkedClientIds) {
          const { data: ud } = await admin.auth.admin.getUserById(uid);
          if (ud?.user?.email) clientMeta[uid] = { ...(clientMeta[uid] ?? {}), email: ud.user.email };
        }
        // Lê account_ids salvos em user_api_keys.extra (account_id, account_id_google, _instagram, _telegram, _linkedin, _email, _outlook, _imap)
        const { data: keys } = await admin.from("user_api_keys")
          .select("user_id, extra").eq("provider", "unipile").in("user_id", linkedClientIds);
        for (const k of keys ?? []) {
          const extra = (k.extra ?? {}) as Record<string, any>;
          for (const [field, val] of Object.entries(extra)) {
            if (typeof val === "string" && val && field.startsWith("account_id")) {
              accountIdToClient[val] = k.user_id;
            }
          }
        }
      }

      // Para cada CANAL Unipile, casa pelo account_id (fonte gravada pelo webhook)
      const channels = items.map((it: any) => {
        const accountId = it?.id ?? it?.account_id;
        const name = it?.name ?? it?.user_id ?? "";
        const matchedClientId = accountIdToClient[accountId] ?? null;
        return {
          account_id: accountId,
          provider: String(it?.type ?? it?.provider ?? "OTHER").toUpperCase(),
          status: it?.status ?? it?.sources?.[0]?.status ?? "UNKNOWN",
          name,
          created_at: it?.created_at,
          matched_client_id: matchedClientId,
          matched_client_email: matchedClientId ? clientMeta[matchedClientId]?.email : null,
          matched_client_name: matchedClientId ? clientMeta[matchedClientId]?.company_name : null,
          orphan: !matchedClientId,
        };
      });

      // Agrupa canais por PERFIL (nome). Cada perfil = 1 pessoa, pode ter até 4 canais.
      // O limite de 10 da Unipile é por PERFIL, não por canal.
      const profileMap = new Map<string, any>();
      for (const ch of channels) {
        const key = String(ch.name ?? ch.account_id).trim().toLowerCase() || ch.account_id;
        if (!profileMap.has(key)) {
          profileMap.set(key, {
            profile_key: key,
            display_name: ch.name || "(sem nome)",
            matched_client_id: ch.matched_client_id,
            matched_client_email: ch.matched_client_email,
            matched_client_name: ch.matched_client_name,
            orphan: ch.orphan,
            channels: [],
          });
        }
        const p = profileMap.get(key);
        p.channels.push({ provider: ch.provider, account_id: ch.account_id, status: ch.status });
        // se qualquer canal casou com um cliente, o perfil deixa de ser órfão
        if (ch.matched_client_id && !p.matched_client_id) {
          p.matched_client_id = ch.matched_client_id;
          p.matched_client_email = ch.matched_client_email;
          p.matched_client_name = ch.matched_client_name;
          p.orphan = false;
        }
      }
      const profiles = Array.from(profileMap.values());

      // Clientes vinculados sem nenhum account_id casado
      const matchedClients = new Set(profiles.map((p) => p.matched_client_id).filter(Boolean) as string[]);
      const ghostClients = linkedClientIds
        .filter((cid) => !matchedClients.has(cid))
        .map((cid) => ({ client_id: cid, email: clientMeta[cid]?.email, company_name: clientMeta[cid]?.company_name }));

      return json({
        ok: true,
        slot: { id: slot.id, label: slot.label, slot_number: slot.slot_number, max_profiles: slot.max_profiles, active: slot.active },
        used: profiles.length,        // PERFIS (pessoas) — bate com o limite de 10
        channels_count: channels.length, // canais conectados (4x perfil máx.)
        max: slot.max_profiles,
        profiles,
        channels,
        ghost_clients: ghostClients,
        fetch_error: fetchError,
      });
    }

    default:
      return json({ error: `ação desconhecida: ${action}` }, 400);
  }
});


function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
