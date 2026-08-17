// e2e-validate — runs a full end-to-end diagnostic + optional real test sends
// POST { send_test?: boolean, email?: string, telegram_provider_id?: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Check = { area: string; status: "ok" | "warn" | "fail" | "skip"; detail: string; data?: unknown };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Auth: who is calling
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return json({ error: "not_authenticated" }, 401);
    }
    const uid = user.id;

    const body = await req.json().catch(() => ({}));
    const sendTest: boolean = body.send_test ?? false;
    const testEmail: string | undefined = body.email;
    const tgProviderId: string | undefined = body.telegram_provider_id;

    const checks: Check[] = [];
    const push = (c: Check) => checks.push(c);

    // ── 1. API KEYS ─────────────────────────────────
    const { data: keys } = await admin.from("user_api_keys").select("provider, api_key, extra").eq("user_id", uid);
    const keyMap: Record<string, { set: boolean; extra: any }> = {};
    (keys ?? []).forEach((k: any) => { keyMap[k.provider] = { set: !!k.api_key, extra: k.extra ?? {} }; });
    const required = ["unipile", "gemini", "openai", "apify", "dados4u", "google_places", "kie_ai"];
    for (const p of required) {
      push({ area: `key:${p}`, status: keyMap[p]?.set ? "ok" : "fail", detail: keyMap[p]?.set ? "configured" : "missing" });
    }

    // ── 2. UNIPILE ACCOUNT IDS PER CHANNEL ──────────
    const uniExtra = keyMap.unipile?.extra ?? {};
    for (const ch of ["email", "linkedin", "instagram", "telegram"]) {
      const acc = uniExtra[`account_id_${ch}`];
      push({ area: `unipile:${ch}`, status: acc ? "ok" : "warn", detail: acc ? `account ${String(acc).slice(0, 8)}…` : "no cached account" });
    }

    // ── 3. WHATSAPP CHIPS ───────────────────────────
    const { data: chips } = await admin.from("whatsapp_instances").select("id, instance_name, active, paused").eq("user_id", uid);
    const activeChips = (chips ?? []).filter((c: any) => c.active && !c.paused);
    push({
      area: "whatsapp:chips",
      status: activeChips.length > 0 ? "ok" : "fail",
      detail: `${activeChips.length} chip(s) ativo(s) / ${chips?.length ?? 0} total`,
      data: activeChips.map((c: any) => c.instance_name),
    });

    // ── 4. LEADS / PROSPECÇÃO ───────────────────────
    const sources = ["leads", "linkedin_contacts", "instagram_contacts", "empresas_enriquecidas"];
    for (const t of sources) {
      const { count } = await admin.from(t).select("*", { count: "exact", head: true }).eq("user_id", uid);
      push({ area: `leads:${t}`, status: (count ?? 0) > 0 ? "ok" : "warn", detail: `${count ?? 0} registro(s)` });
    }

    // ── 5. CRON / WORKERS ───────────────────────────
    let cronRows: any = null;
    try { const r = await admin.rpc("get_worker_metrics" as any); cronRows = r.data; } catch (_) {}
    push({ area: "workers:metrics", status: cronRows ? "ok" : "warn", detail: cronRows ? "metrics OK" : "metrics RPC indisponível", data: cronRows });

    // ── 6. SOCIAL RULES ─────────────────────────────
    const { data: rules } = await admin.from("social_auto_engage_rules").select("mode, channel, active").eq("user_id", uid);
    const rulesActive = (rules ?? []).filter((r: any) => r.active);
    push({
      area: "social:rules",
      status: rulesActive.length >= 3 ? "ok" : rulesActive.length > 0 ? "warn" : "fail",
      detail: `${rulesActive.length} regra(s) ativa(s) — recomendado 3 IG + 3 LinkedIn`,
      data: rulesActive,
    });

    const { count: postsCount } = await admin.from("social_posts").select("*", { count: "exact", head: true }).eq("user_id", uid);
    push({ area: "social:posts", status: (postsCount ?? 0) > 0 ? "ok" : "warn", detail: `${postsCount ?? 0} post(s)` });

    // ── 7. QUALIFICAÇÃO ─────────────────────────────
    const { count: qual24h } = await admin
      .from("qualification_messages").select("*", { count: "exact", head: true })
      .eq("user_id", uid).gte("created_at", new Date(Date.now() - 86400000).toISOString());
    push({ area: "qualification:24h", status: "ok", detail: `${qual24h ?? 0} mensagens nas últimas 24h` });

    // ── 8. WEBHOOKS UNIPILE configurados? (via secret) ─
    const wsSecret = Deno.env.get("UNIPILE_WEBHOOK_SECRET");
    push({ area: "webhook:secret", status: wsSecret ? "ok" : "fail", detail: wsSecret ? "UNIPILE_WEBHOOK_SECRET set" : "missing" });

    // ── 9. TESTES REAIS (opcional) ──────────────────
    const tests: any[] = [];

    if (sendTest && testEmail) {
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/unipile-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: req.headers.get("Authorization") ?? "" },
          body: JSON.stringify({
            channel: "email",
            to: testEmail,
            subject: "✅ Teste E2E — LeadsBooster",
            html: `<div style="font-family:Arial;padding:24px"><h2>Teste E2E</h2><p>Se você está lendo, o canal de e-mail via Unipile está funcionando.</p><p>Disparado em ${new Date().toLocaleString("pt-BR")}.</p></div>`,
          }),
        });
        const txt = await resp.text();
        tests.push({ channel: "email", to: testEmail, ok: resp.ok, status: resp.status, body: txt.slice(0, 300) });
      } catch (e) {
        tests.push({ channel: "email", to: testEmail, ok: false, error: String(e) });
      }
    }

    if (sendTest && tgProviderId) {
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/unipile-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: req.headers.get("Authorization") ?? "" },
          body: JSON.stringify({
            channel: "telegram",
            attendees_ids: [tgProviderId],
            text: `✅ Teste E2E LeadsBooster — ${new Date().toLocaleString("pt-BR")}`,
          }),
        });
        const txt = await resp.text();
        tests.push({ channel: "telegram", to: tgProviderId, ok: resp.ok, status: resp.status, body: txt.slice(0, 300) });
      } catch (e) {
        tests.push({ channel: "telegram", to: tgProviderId, ok: false, error: String(e) });
      }
    }

    // ── SUMÁRIO ─────────────────────────────────────
    const summary = {
      ok: checks.filter((c) => c.status === "ok").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
    };

    return json({ user_id: uid, summary, checks, tests, generated_at: new Date().toISOString() }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
