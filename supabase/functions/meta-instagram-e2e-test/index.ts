// meta-instagram-e2e-test — validação ativa ponta-a-ponta do canal Meta/Instagram.
// Executa chamadas reais nas APIs e devolve relatório
// passo-a-passo com sucesso/erro/logs para cada etapa: token, webhook subs, comentários,
// DMs, Story replies, regras de auto-engajamento, eventos recentes e decisão de IA.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateAIContent } from "../_shared/ai-json.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const resp = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Step = {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail" | "skip";
  ms: number;
  detail?: string;
  data?: unknown;
  error?: string;
  hint?: string;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T | null; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { value, ms: Date.now() - t0 };
  } catch (e) {
    return { value: null, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Resolve userId: tenta JWT, depois ?user_id=, depois primeira conta Meta
    let userId: string | null = null;
    const auth = req.headers.get("Authorization") ?? "";
    if (auth.startsWith("Bearer ")) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } },
      );
      const { data: u } = await userClient.auth.getUser();
      userId = u?.user?.id ?? null;
    }
    const url = new URL(req.url);
    if (!userId) userId = url.searchParams.get("user_id");
    if (!userId) {
      const body = await req.json().catch(() => ({}));
      userId = body?.user_id ?? null;
    }
    if (!userId) {
      const { data: any1 } = await admin.from("meta_instagram_accounts")
        .select("user_id").order("created_at", { ascending: false }).limit(1).maybeSingle();
      userId = any1?.user_id ?? null;
    }
    if (!userId) return resp({ error: "no user_id resolvable" }, 400);

    const steps: Step[] = [];
    const push = (s: Step) => steps.push(s);

    // ───── 1) Conta Meta Instagram conectada
    const { data: metaAcc } = await admin
      .from("meta_instagram_accounts")
      .select("ig_user_id, username, access_token, token_type, expires_at, refreshed_at, metadata")
      .eq("user_id", userId).maybeSingle();


    if (!metaAcc) {
      push({ id: "meta_account", label: "Conta Meta/Instagram", status: "fail", ms: 0,
        detail: "Nenhuma conta vinculada", hint: "Configurações → Canais → Conectar via Facebook." });
      return resp({ success: false, ready: false, steps,
        summary: { ok: 0, warn: 0, fail: 1, skip: 0 },
        generated_at: new Date().toISOString() });
    }
    push({ id: "meta_account", label: `Conta @${metaAcc.username}`, status: "ok", ms: 0,
      detail: `ig_user_id=${metaAcc.ig_user_id} · token=${metaAcc.token_type}` });

    const token = metaAcc.access_token as string;
    const igId = metaAcc.ig_user_id as string;

    // ───── 2) Token vivo? (debug_token / /me)
    {
      const r = await timed(async () => {
        const res = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(token)}`);
        const j = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(j));
        return j;
      });
      push({
        id: "token_live", label: "Token Meta válido (Graph /me)",
        status: r.error ? "fail" : "ok", ms: r.ms,
        detail: r.error ? r.error.slice(0, 200) : `id=${(r.value as any)?.id} name=${(r.value as any)?.name ?? "-"}`,
        error: r.error, hint: r.error ? "Reconecte via Facebook Login para regerar Page Token permanente." : undefined,
      });
    }

    // ───── 3) Conta IG acessível
    {
      const r = await timed(async () => {
        const res = await fetch(`https://graph.facebook.com/v21.0/${igId}?fields=username,followers_count,media_count&access_token=${encodeURIComponent(token)}`);
        const j = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(j));
        return j;
      });
      push({
        id: "ig_account", label: "Instagram Business reachable",
        status: r.error ? "fail" : "ok", ms: r.ms,
        detail: r.error ? r.error.slice(0, 200) : `@${(r.value as any)?.username} · ${(r.value as any)?.followers_count} seguidores · ${(r.value as any)?.media_count} posts`,
        error: r.error,
      });
    }

    // ───── 4) Webhook subscriptions ativas (Instagram Login)
    {
      const r = await timed(async () => {
        const res = await fetch(`https://graph.instagram.com/v21.0/${igId}/subscribed_apps?access_token=${encodeURIComponent(token)}`);
        const j = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(j));
        return j;
      });
      const subs = (r.value as any)?.data ?? [];
      const fields: string[] = subs[0]?.subscribed_fields ?? [];
      const needs = ["comments", "messages"];
      const missing = needs.filter((f) => !fields.includes(f));
      push({
        id: "webhook_subs", label: "Webhooks do Instagram inscritos",
        status: r.error ? "fail" : missing.length ? "warn" : "ok", ms: r.ms,
        detail: r.error ? r.error.slice(0, 200) : `Campos inscritos: ${fields.join(", ") || "nenhum"}`,
        data: { subscribed_fields: fields, missing },
        hint: missing.length ? `Faltam: ${missing.join(", ")}. Reconecte o Instagram para reinscrever.` : undefined,
        error: r.error,
      });
    }

    // ───── 5) Últimos 5 comentários (Graph)
    {
      const r = await timed(async () => {
        // pega 3 mídias recentes e seus comentários
        const m = await fetch(`https://graph.facebook.com/v21.0/${igId}/media?fields=id,caption,timestamp,comments_count&limit=3&access_token=${encodeURIComponent(token)}`);
        const mj = await m.json();
        if (!m.ok) throw new Error(JSON.stringify(mj));
        const media = mj.data ?? [];
        const out: any[] = [];
        for (const mediaItem of media) {
          if ((mediaItem.comments_count ?? 0) === 0) continue;
          const c = await fetch(`https://graph.facebook.com/v21.0/${mediaItem.id}/comments?fields=id,text,from,timestamp&limit=3&access_token=${encodeURIComponent(token)}`);
          const cj = await c.json();
          if (c.ok) out.push({ media_id: mediaItem.id, comments: cj.data ?? [] });
        }
        return out;
      });
      const total = (r.value ?? []).reduce((a: number, m: any) => a + (m.comments?.length ?? 0), 0);
      push({
        id: "graph_comments", label: "Leitura de comentários (Graph)",
        status: r.error ? "fail" : "ok", ms: r.ms,
        detail: r.error ? r.error.slice(0, 200) : `${total} comentários lidos em ${(r.value ?? []).length} posts recentes`,
        data: r.value, error: r.error,
      });
    }

    // ───── 6) Conversas DM (Graph Messenger Platform on IG)
    {
      const r = await timed(async () => {
        const res = await fetch(`https://graph.facebook.com/v21.0/${igId}/conversations?platform=instagram&fields=id,updated_time,participants&limit=5&access_token=${encodeURIComponent(token)}`);
        const j = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(j));
        return j;
      });
      const convs = (r.value as any)?.data ?? [];
      push({
        id: "graph_dms", label: "Conversas DM (Graph)",
        status: r.error ? "warn" : "ok", ms: r.ms,
        detail: r.error ? r.error.slice(0, 200) : `${convs.length} conversas recentes`,
        data: convs.slice(0, 3), error: r.error,
        hint: r.error ? "Permissão instagram_manage_messages pode estar faltando — reconecte." : undefined,
      });
    }

    // ───── 7) Eventos de webhook recebidos (últimos 7d)
    {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: events, error } = await admin
        .from("meta_webhook_events")
        .select("event_type, created_at, processed, processing_error")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20);
      const byType: Record<string, number> = {};
      const failures: string[] = [];
      (events ?? []).forEach((e: any) => {
        byType[e.event_type] = (byType[e.event_type] ?? 0) + 1;
        if (!e.processed && e.processing_error) failures.push(e.processing_error);
      });
      push({
        id: "webhook_events", label: "Eventos de webhook (7d)",
        status: error ? "fail" : (events ?? []).length === 0 ? "info" as any : failures.length ? "warn" : "ok",
        ms: 0,
        detail: error ? error.message : `${events?.length ?? 0} eventos · tipos: ${JSON.stringify(byType)}`,
        data: { failures: failures.slice(0, 5) },
        hint: (events?.length ?? 0) === 0 ? "Nenhum evento ainda. Comente em um post para gerar tráfego de teste." : undefined,
      });
    }

    // ───── 8) Story replies / mensagens com story_reply (últimos 30 eventos)
    {
      const { data: storyEvents } = await admin
        .from("meta_webhook_events")
        .select("payload, created_at")
        .eq("event_type", "messages")
        .order("created_at", { ascending: false })
        .limit(50);
      const replies = (storyEvents ?? []).filter((e: any) => {
        const p = e.payload as any;
        return JSON.stringify(p ?? {}).includes("story");
      });
      push({
        id: "story_replies", label: "Story replies capturados",
        status: replies.length > 0 ? "ok" : "info" as any, ms: 0,
        detail: `${replies.length} mensagens vinculadas a stories nos eventos recentes`,
        hint: replies.length === 0 ? "Publique um Story e responda nele para validar o caminho." : undefined,
      });
    }

    // ───── 9) Regras de auto-engajamento ativas
    {
      const { data: rules } = await admin
        .from("social_auto_engage_rules")
        .select("id, mode, keyword, active")
        .eq("user_id", userId).eq("channel", "instagram");
      const active = (rules ?? []).filter((r: any) => r.active);
      push({
        id: "rules", label: "Regras Auto-Engajamento (Instagram)",
        status: active.length ? "ok" : "warn", ms: 0,
        detail: `${active.length} ativas / ${rules?.length ?? 0} total`,
        hint: active.length ? undefined : "Conteúdo → Auto-Eng para criar regras com keyword + DM.",
      });
    }

    // ───── 10) IA decision smoke test (provedor configurado pelo assinante/admin)
    {
      const r = await timed(() => generateAIContent(admin, userId!, {
        system: "Responda apenas JSON: {\"intent\":\"interesse|duvida|spam\"}",
        user: "Comentario: 'EU QUERO!!!'",
        json: true,
        maxTokens: 80,
      }));
      push({
        id: "ai_decision", label: "Decisão de IA (OpenAI/Gemini configurado)",
        status: r.error ? "fail" : "ok", ms: r.ms,
        detail: r.error ? r.error : `resposta: ${String(r.value).slice(0, 120)}`,
        error: r.error,
        hint: r.error ? "Configure uma chave OpenAI ou Gemini nas configurações de IA." : undefined,
      });
    }

    const summary = {
      ok: steps.filter((s) => s.status === "ok").length,
      warn: steps.filter((s) => s.status === "warn").length,
      fail: steps.filter((s) => s.status === "fail").length,
      skip: steps.filter((s) => s.status === "skip").length,
    };

    return resp({
      success: true,
      ready: summary.fail === 0,
      summary,
      steps,
      account: { username: metaAcc.username, ig_user_id: igId, token_type: metaAcc.token_type },
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    return resp({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
