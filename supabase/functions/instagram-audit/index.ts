// instagram-audit — diagnóstico E2E do canal Instagram para o usuário logado.
// Verifica: brand kit, conta Unipile IG, conta Meta IG, regras auto-engage,
// posts agendados/publicados, comentários recentes, DMs recentes, secrets críticos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const resp = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Check = { id: string; label: string; status: "ok" | "warn" | "fail" | "info"; detail?: string; hint?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return resp({ error: "Unauthenticated" }, 401);

    const checks: Check[] = [];

    // 1) Brand kit
    const { data: brand } = await admin.from("social_brand_profile").select("*").eq("user_id", userId).maybeSingle();
    if (!brand) {
      checks.push({ id: "brand_kit", label: "Brand Kit Instagram", status: "fail", detail: "Não analisado", hint: "Cole seu @ na aba Brand Kit e clique em Analisar." });
    } else {
      const missing: string[] = [];
      if (!brand.logo_url) missing.push("logo");
      if (!brand.color_palette || Object.keys(brand.color_palette as object).length === 0) missing.push("paleta");
      if (!Array.isArray(brand.sample_post_urls) || (brand.sample_post_urls as unknown[]).length < 3) missing.push("posts amostra");
      if (!brand.followers_count) missing.push("métricas");
      checks.push({
        id: "brand_kit",
        label: `Brand Kit @${brand.instagram_handle}`,
        status: missing.length ? "warn" : "ok",
        detail: missing.length
          ? `Faltando: ${missing.join(", ")}. Última análise: ${brand.last_analyzed_at ? new Date(brand.last_analyzed_at).toLocaleString("pt-BR") : "—"}`
          : `${brand.followers_count ?? 0} seguidores · ${brand.posts_count ?? 0} posts · engaj ${brand.engagement_rate ?? 0}%`,
        hint: missing.length ? "Clique em 'Re-analisar' na aba Brand Kit." : undefined,
      });
    }

    // 2) Conta Unipile Instagram (publicação + DM)
    const { data: unipileAccounts } = await admin
      .from("user_integrations")
      .select("extra")
      .eq("user_id", userId)
      .maybeSingle();
    const igUnipile = (unipileAccounts?.extra as Record<string, unknown> | null)?.account_id_instagram;
    const { data: apiKey } = await admin
      .from("user_api_keys").select("api_key, extra").eq("user_id", userId).eq("provider", "unipile").maybeSingle();
    if (!apiKey?.api_key) {
      checks.push({ id: "unipile_key", label: "Chave Unipile", status: "fail", detail: "Não configurada", hint: "Configurações → APIs → Unipile." });
    } else {
      checks.push({ id: "unipile_key", label: "Chave Unipile", status: "ok", detail: "Configurada" });
      checks.push({
        id: "unipile_ig",
        label: "Conta Instagram (Unipile)",
        status: igUnipile ? "ok" : "warn",
        detail: igUnipile ? `account_id: ${String(igUnipile).slice(0, 12)}…` : "Não vinculada — DMs em massa e publicação por Unipile vão falhar",
        hint: igUnipile ? undefined : "Configurações → Canais → conectar Instagram via Unipile.",
      });
    }

    // 3) Conta Meta Graph (auto-reply de comentários ManyChat-style)
    const { data: metaAcc } = await admin
      .from("meta_instagram_accounts").select("ig_user_id, username, token_type, expires_at, refreshed_at, metadata")
      .eq("user_id", userId).maybeSingle();
    if (!metaAcc) {
      checks.push({ id: "meta_ig", label: "Instagram Graph API (Meta)", status: "warn", detail: "Não conectada", hint: "Auto-reply de comentário/DM em tempo real exige Meta. Conecte em Configurações → Canais." });
    } else {
      const isPageToken = metaAcc.token_type === "page_token";
      const expiringSoon = !isPageToken && metaAcc.expires_at && new Date(metaAcc.expires_at).getTime() - Date.now() < 7 * 86400000;
      const lastOk = (metaAcc.metadata as Record<string, unknown> | null)?.last_refresh_ok;
      checks.push({
        id: "meta_ig",
        label: `Instagram Graph @${metaAcc.username}`,
        status: lastOk === false ? "fail" : expiringSoon ? "warn" : "ok",
        detail: isPageToken
          ? `Page Token permanente · última revalidação: ${metaAcc.refreshed_at ?? "—"}`
          : expiringSoon ? `Token expira em ${metaAcc.expires_at}` : `Token válido até ${metaAcc.expires_at ?? "—"}`,
        hint: lastOk === false ? "Reconecte via Facebook Login para gerar novo Page Token." : expiringSoon ? "Configurações → Canais → Renovar agora." : undefined,
      });
    }

    // 4) Regras de auto-engajamento
    const { data: rules } = await admin
      .from("social_auto_engage_rules").select("id, mode, keyword, active, send_dm, reply_public")
      .eq("user_id", userId);
    const activeRules = (rules ?? []).filter((r) => r.active);
    checks.push({
      id: "auto_rules",
      label: "Regras Auto-Engajamento",
      status: activeRules.length ? "ok" : "info",
      detail: `${activeRules.length} ativas de ${rules?.length ?? 0} total`,
      hint: activeRules.length ? undefined : "Conteúdo → Auto-Eng para criar regras de DM/comentário automático.",
    });

    // 5) Posts agendados / publicados
    const { data: posts } = await admin
      .from("social_posts").select("id, channel, status, scheduled_at, created_at")
      .eq("user_id", userId).eq("channel", "instagram")
      .order("created_at", { ascending: false }).limit(20);
    const scheduled = (posts ?? []).filter((p) => p.status === "scheduled");
    const published = (posts ?? []).filter((p) => p.status === "published");
    const failed = (posts ?? []).filter((p) => p.status === "failed");
    checks.push({
      id: "posts",
      label: "Posts Instagram",
      status: failed.length > 0 ? "warn" : "ok",
      detail: `${scheduled.length} agendados · ${published.length} publicados · ${failed.length} falhas`,
      hint: failed.length ? "Veja na aba Agendados/Publicados o motivo das falhas." : undefined,
    });

    // 6) Interações recentes (comentários + DMs)
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count: interactions } = await admin
      .from("social_post_interactions").select("*", { count: "exact", head: true })
      .eq("user_id", userId).gte("created_at", since);
    checks.push({
      id: "interactions",
      label: "Interações capturadas (7d)",
      status: (interactions ?? 0) > 0 ? "ok" : "info",
      detail: `${interactions ?? 0} comentários/DMs nos últimos 7 dias`,
      hint: (interactions ?? 0) === 0 ? "Sem interações ainda — publique um post e teste com a palavra-chave da sua regra." : undefined,
    });

    // 7) Secrets críticos
    const hasWebhookSecret = !!Deno.env.get("UNIPILE_WEBHOOK_SECRET");
    const hasMetaToken = !!Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");
    const hasLovableKey = !!Deno.env.get("LOVABLE_API_KEY");
    checks.push({
      id: "secrets",
      label: "Secrets de webhooks",
      status: hasWebhookSecret && hasMetaToken && hasLovableKey ? "ok" : "fail",
      detail: [
        `Unipile: ${hasWebhookSecret ? "✓" : "✗"}`,
        `Meta: ${hasMetaToken ? "✓" : "✗"}`,
        `Lovable AI: ${hasLovableKey ? "✓" : "✗"}`,
      ].join(" · "),
      hint: hasWebhookSecret && hasMetaToken && hasLovableKey ? undefined : "Faltando secrets críticos para autenticar webhooks.",
    });

    // 8) Produtos cadastrados
    const { count: productsCount } = await admin
      .from("social_products").select("*", { count: "exact", head: true })
      .eq("user_id", userId).eq("active", true);
    checks.push({
      id: "products",
      label: "Produtos no Brand Kit",
      status: (productsCount ?? 0) > 0 ? "ok" : "info",
      detail: `${productsCount ?? 0} produtos ativos`,
      hint: (productsCount ?? 0) === 0 ? "Cadastre seus produtos na aba Produtos para gerações segmentadas." : undefined,
    });

    const summary = {
      ok: checks.filter((c) => c.status === "ok").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
      info: checks.filter((c) => c.status === "info").length,
    };
    const ready = summary.fail === 0;

    return resp({ success: true, ready, summary, checks, generated_at: new Date().toISOString() });
  } catch (e) {
    return resp({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
