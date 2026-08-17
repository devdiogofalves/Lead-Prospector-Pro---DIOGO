// Kiwify Webhook → auto-provisionamento de conta LeadsBooster.
//
// Eventos tratados:
//   order.approved / purchase.approved / order_approved → cria usuário + branding inicial
//   subscription.canceled / order.refunded              → pausa conta (não deleta)
//
// Configuração no Supabase Dashboard → Edge Functions → Secrets:
//   KIWIFY_WEBHOOK_TOKEN  = token configurado no painel do produto Kiwify (obrigatório em produção)
//
// URL para configurar no Kiwify:
//   https://<project-ref>.supabase.co/functions/v1/kiwify-webhook?token=SEU_TOKEN
//
// Ref: https://docs.kiwify.com.br/webhooks

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kiwify-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function allowInsecureWebhooks() {
  return Deno.env.get("ALLOW_INSECURE_WEBHOOKS") === "true";
}

// Limites de recursos por plano — sincronizados com admin-manage-client
const PLAN_LIMITS: Record<string, {
  chips_limit: number | null;
  dispatches_daily_limit: number | null;
  linkedin_enabled: boolean;
  instagram_enabled: boolean;
  email_dispatch_enabled: boolean;
  reseller_enabled: boolean;
}> = {
  // O nome do plano no Kiwify deve conter uma das palavras-chave abaixo (case-insensitive)
  // Planos comerciais atuais (mensal/semestral/anual) — recursos completos, alinhados a admin-manage-client
  mensal:     { chips_limit: null, dispatches_daily_limit: null, linkedin_enabled: true,  instagram_enabled: true,  email_dispatch_enabled: true,  reseller_enabled: false },
  semestral:  { chips_limit: null, dispatches_daily_limit: null, linkedin_enabled: true,  instagram_enabled: true,  email_dispatch_enabled: true,  reseller_enabled: false },
  anual:      { chips_limit: null, dispatches_daily_limit: null, linkedin_enabled: true,  instagram_enabled: true,  email_dispatch_enabled: true,  reseller_enabled: false },
  free:       { chips_limit: null, dispatches_daily_limit: null, linkedin_enabled: true,  instagram_enabled: true,  email_dispatch_enabled: true,  reseller_enabled: false },
  // Planos legados (mantidos para compatibilidade)
  starter:    { chips_limit: 1,    dispatches_daily_limit: 50,   linkedin_enabled: false, instagram_enabled: false, email_dispatch_enabled: false, reseller_enabled: false },
  pro:        { chips_limit: 3,    dispatches_daily_limit: 200,  linkedin_enabled: true,  instagram_enabled: true,  email_dispatch_enabled: false, reseller_enabled: false },
  agency:     { chips_limit: null, dispatches_daily_limit: null, linkedin_enabled: true,  instagram_enabled: true,  email_dispatch_enabled: true,  reseller_enabled: false },
  whitelabel: { chips_limit: null, dispatches_daily_limit: null, linkedin_enabled: true,  instagram_enabled: true,  email_dispatch_enabled: true,  reseller_enabled: true  },
};

// Detecta o plano pelo nome do produto/plano do Kiwify
function detectPlan(planName: string | null): string {
  if (!planName) return "mensal";
  const n = planName.toLowerCase();
  if (n.includes("white") || n.includes("label") || n.includes("revend")) return "whitelabel";
  if (n.includes("agency") || n.includes("agência") || n.includes("agencia")) return "agency";
  // Planos comerciais atuais por ciclo de cobrança
  if (n.includes("anual") || n.includes("anfual") || n.includes("year")) return "anual";
  if (n.includes("semestral") || n.includes("semestre")) return "semestral";
  if (n.includes("mensal") || n.includes("mensual") || n.includes("month")) return "mensal";
  if (n.includes("free") || n.includes("grat-") || n.includes("gratis") || n.includes("grátis")) return "free";
  if (n.includes("pro"))     return "pro";
  if (n.includes("starter") || n.includes("básico") || n.includes("basico")) return "starter";
  return "mensal"; // fallback: plano comercial padrão (recursos completos)
}

// Kiwify pode enviar o evento em campos diferentes dependendo da versão do webhook.
// Esta função normaliza para um formato único.
function parseKiwifyPayload(body: any): {
  event: string;
  email: string | null;
  name: string;
  phone: string | null;
  subscriptionId: string | null;
  orderId: string | null;
  planName: string | null;
} {
  // Kiwify usa tanto body.event quanto body.type
  const event = String(body.event ?? body.type ?? "").toLowerCase();

  // Buyer pode estar em body.data.buyer, body.buyer, body.data.customer ou body.customer
  const buyer =
    body.data?.buyer ??
    body.buyer ??
    body.data?.customer ??
    body.customer ??
    {};

  const email = (buyer.email ?? body.email ?? "").trim().toLowerCase() || null;
  const name = (buyer.name ?? buyer.full_name ?? "").trim();
  const phone = (buyer.mobile ?? buyer.phone ?? buyer.celular ?? "").replace(/\D/g, "") || null;

  const subscriptionId =
    body.data?.subscription?.id ??
    body.subscription?.id ??
    body.subscription_id ??
    null;

  const orderId =
    body.data?.order_id ??
    body.order_id ??
    body.id ??
    null;

  const planName =
    body.data?.plan?.name ??
    body.plan?.name ??
    body.product?.name ??
    null;

  return { event, email, name, phone, subscriptionId, orderId, planName };
}

function isApprovedEvent(event: string): boolean {
  return [
    "order.approved", "order_approved",
    "purchase.approved", "purchase_approved",
    "subscription.active", "subscription_active",
  ].some((e) => event.includes(e.replace(".", "")) || event === e);
}

function isCanceledEvent(event: string): boolean {
  return [
    "order.refunded", "order_refunded",
    "purchase.refunded", "purchase_refunded",
    "subscription.canceled", "subscription_canceled",
    "subscription.cancelled", "subscription_cancelled",
    "subscription.expired", "subscription_expired",
  ].some((e) => event.includes(e.replace(".", "")) || event === e);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    // ── Verificação de token ────────────────────────────────────────────────
    // Configure KIWIFY_WEBHOOK_TOKEN no Supabase Dashboard → Edge Functions → Secrets.
    // Em produção, o secret é obrigatório. Para desenvolvimento/local, defina
    // ALLOW_INSECURE_WEBHOOKS=true conscientemente.
    const expectedToken = Deno.env.get("KIWIFY_WEBHOOK_TOKEN") ?? "";
    if (!expectedToken && !allowInsecureWebhooks()) {
      console.error("[kiwify-webhook] KIWIFY_WEBHOOK_TOKEN ausente");
      return json({ error: "webhook secret not configured" }, 500);
    }
    if (expectedToken) {
      const url = new URL(req.url);
      const receivedToken =
        url.searchParams.get("token") ??
        req.headers.get("x-kiwify-token") ??
        req.headers.get("x-token") ??
        "";
      if (receivedToken !== expectedToken) {
        console.warn("[kiwify-webhook] token inválido recebido");
        return json({ error: "unauthorized" }, 401);
      }
    }

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "body inválido" }, 400);

    const { event, email, name, phone, subscriptionId, orderId, planName } = parseKiwifyPayload(body);

    console.log(`[kiwify-webhook] event=${event} email=${email} order=${orderId}`);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── COMPRA APROVADA ─────────────────────────────────────────────────────
    if (isApprovedEvent(event)) {
      if (!email) {
        console.error("[kiwify-webhook] compra aprovada sem e-mail:", JSON.stringify(body).slice(0, 300));
        return json({ error: "email não encontrado no payload" }, 400);
      }

      // Verifica se usuário já existe (re-compra / upgrade de plano)
      const { data: existingUsers } = await admin.auth.admin.listUsers();
      const existing = existingUsers?.users?.find((u) => u.email === email);

      let userId: string;

      if (existing) {
        // Usuário já existe → apenas reativa (remove pausa) e atualiza metadados
        userId = existing.id;
        await admin.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...existing.user_metadata,
            kiwify_subscription_id: subscriptionId ?? existing.user_metadata?.kiwify_subscription_id,
            kiwify_order_id: orderId,
            plan: planName ?? "leadsbooster",
            account_active: true,
          },
        });
        // Reativa disparo se estava pausado por cancelamento
        await admin.from("dispatch_settings").update({ paused: false })
          .eq("user_id", userId);
        console.log(`[kiwify-webhook] usuário reativado: ${email}`);
      } else {
        // Novo usuário → convida via e-mail (Supabase envia o link de definição de senha)
        const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
          data: {
            full_name: name,
            phone: phone ?? "",
            kiwify_subscription_id: subscriptionId,
            kiwify_order_id: orderId,
            plan: planName ?? "leadsbooster",
            account_active: true,
          },
          redirectTo: "https://leadsbooster.com.br",
        });

        if (inviteError) {
          console.error("[kiwify-webhook] erro ao criar usuário:", inviteError.message);
          return json({ error: inviteError.message }, 500);
        }

        userId = invited.user!.id;
        console.log(`[kiwify-webhook] usuário criado: ${email} (id=${userId})`);
      }

      // Detecta plano pelo nome do produto/plano Kiwify e aplica limites
      const detectedPlan = detectPlan(planName);
      const limits = PLAN_LIMITS[detectedPlan] ?? PLAN_LIMITS.starter;

      // Grava subscription com plano e feature flags
      await admin.from("client_subscriptions").upsert({
        user_id:                userId,
        plan:                   detectedPlan,
        status:                 "active",
        kiwify_subscription_id: subscriptionId ?? null,
        kiwify_order_id:        orderId ?? null,
        current_period_start:   new Date().toISOString(),
        ...limits,
      }, { onConflict: "user_id" });

      // Cria branding inicial APENAS se ainda não existir — nunca sobrescreve a
      // personalização white-label do cliente em renovações/rebills recorrentes.
      const { data: existingBranding } = await admin.from("company_branding")
        .select("user_id").eq("user_id", userId).maybeSingle();
      if (!existingBranding) {
        await admin.from("company_branding").insert({
          user_id:      userId,
          company_name: name || "Minha Empresa",
          agent_name:   "IA assistente",
        });
      }

      // ── BOAS-VINDAS: gera link mágico de acesso ao painel ────────────────
      // Sempre regenera para garantir link válido (Supabase expira em 24h)
      const PANEL_URL = "https://leadsbooster.com.br";
      const GROUP_URL = "https://chat.whatsapp.com/FqKaeXxk3Xz3McHx34TGm9";
      let accessLink = PANEL_URL;
      try {
        const { data: linkData } = await admin.auth.admin.generateLink({
          type: existing ? "magiclink" : "invite",
          email,
          options: { redirectTo: PANEL_URL },
        });
        if (linkData?.properties?.action_link) accessLink = linkData.properties.action_link;
      } catch (e) {
        console.warn("[kiwify-webhook] falha ao gerar link de acesso:", (e as any)?.message);
      }

      const firstName = (name || "").split(" ")[0] || "tudo bem";
      const welcomeText =
`Olá ${firstName}! 🚀

Sua assinatura do *LeadsBooster* foi confirmada.

✅ *Acesse seu painel agora:*
${accessLink}

👥 *Entre no grupo exclusivo de clientes* (suporte, novidades, treinamentos):
${GROUP_URL}

Qualquer dúvida é só responder aqui.
Bem-vindo(a) ao time!`;

      // 1) WhatsApp via Mandrack (chip admin) — best effort
      if (phone) {
        try {
          await sendWelcomeWhatsApp(admin, phone, welcomeText);
        } catch (e) {
          console.warn("[kiwify-webhook] welcome WA falhou:", (e as any)?.message);
        }
      }

      // 2) E-mail branded via app emails (quando domínio estiver verificado)
      try {
        await admin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "welcome-leadsbooster",
            recipientEmail: email,
            idempotencyKey: `welcome-${userId}-${orderId ?? "noorder"}`,
            templateData: {
              firstName: firstName === "tudo bem" ? "" : firstName,
              accessLink,
              groupLink: GROUP_URL,
              plan: detectedPlan,
            },
          },
        });
      } catch (e) {
        console.warn("[kiwify-webhook] welcome email falhou (domínio não configurado?):", (e as any)?.message);
      }

      console.log(`[kiwify-webhook] plano: ${detectedPlan} | reseller: ${limits.reseller_enabled}`);
      return json({
        ok: true,
        action:           existing ? "reactivated" : "created",
        userId,
        email,
        plan:             detectedPlan,
        reseller_enabled: limits.reseller_enabled,
      });

    }

    // ── CANCELAMENTO / REEMBOLSO ────────────────────────────────────────────
    if (isCanceledEvent(event)) {
      if (!email) return json({ ok: true, ignored: "no email for cancellation" });

      const { data: users } = await admin.auth.admin.listUsers();
      const user = users?.users?.find((u) => u.email === email);
      if (!user) return json({ ok: true, ignored: "user not found" });

      // Pausa todos os disparos (não deleta dados — cliente pode reativar)
      await admin.from("dispatch_settings").upsert({ user_id: user.id, paused: true }, { onConflict: "user_id" });
      await admin.from("client_subscriptions").upsert({
        user_id: user.id, status: "canceled", canceled_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      // Marca metadados
      await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, account_active: false, canceled_at: new Date().toISOString() },
      });

      console.log(`[kiwify-webhook] conta pausada por cancelamento: ${email}`);
      return json({ ok: true, action: "paused", email });
    }

    // Evento desconhecido — aceita para não gerar retry no Kiwify
    console.log(`[kiwify-webhook] evento ignorado: ${event}`);
    return json({ ok: true, ignored: true, event });

  } catch (e: any) {
    console.error("[kiwify-webhook] erro:", e?.message);
    return json({ error: e.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Envia boas-vindas via WhatsApp usando o primeiro chip ativo do admin.
// Falha silenciosamente se nenhum chip estiver conectado.
async function sendWelcomeWhatsApp(admin: any, phone: string, text: string) {
  const ADMIN_EMAIL = "nucleodameta@gmail.com";

  // Acha o user_id do admin
  const { data: users } = await admin.auth.admin.listUsers();
  const adminUser = users?.users?.find((u: any) => u.email === ADMIN_EMAIL);
  if (!adminUser) throw new Error("admin user not found");

  // Busca um chip ativo do admin
  const { data: instance } = await admin
    .from("whatsapp_instances")
    .select("instance_name, mandrack_instance_token")
    .eq("user_id", adminUser.id)
    .eq("active", true)
    .eq("paused", false)
    .not("mandrack_instance_token", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!instance?.mandrack_instance_token) {
    console.log("[kiwify-webhook] nenhum chip admin disponível — pulando WA");
    return;
  }

  const base = (Deno.env.get("MANDRACK_URL") ?? "https://api.mandrackstudio.ia.br")
    .trim().replace(/\/$/, "");
  const url = `${base}/chat/send/text`;

  // Normaliza telefone BR (55 + DDD + 9 + 8 dígitos)
  let p = phone.replace(/\D/g, "");
  if (p.length === 11) p = "55" + p;
  if (p.length === 10) p = "55" + p.slice(0, 2) + "9" + p.slice(2);

  const r = await fetch(url, {
    method: "POST",
    headers: { token: instance.mandrack_instance_token, "Content-Type": "application/json" },
    body: JSON.stringify({ phone: p, body: text, delay: false }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(`Mandrack ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  }
  console.log(`[kiwify-webhook] welcome WA enviado para ${p}`);
}

