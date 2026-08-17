// social-weekly-insights: análise IA + melhor horário + heatmap [v2 filter+deltas]
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { generateAIContent } from "../_shared/ai-json.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HOUR_BUCKETS = [
  { label: "0-4h", from: 0, to: 4 },
  { label: "4-8h", from: 4, to: 8 },
  { label: "8-12h", from: 8, to: 12 },
  { label: "12-16h", from: 12, to: 16 },
  { label: "16-20h", from: 16, to: 20 },
  { label: "20-24h", from: 20, to: 24 },
];
const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function brasiliaParts(iso: string): { dow: number; hour: number } | null {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      hour: "numeric",
      hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hr = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = map[wd] ?? -1;
    if (dow < 0) return null;
    return { dow, hour: (hr === 24 ? 0 : hr) };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "not_authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(SUPABASE_URL, SERVICE);

    // Parse optional filters
    let channelFilter: "all" | "instagram" | "linkedin" = "all";
    try {
      const body = await req.json();
      if (body?.channel === "instagram" || body?.channel === "linkedin") channelFilter = body.channel;
    } catch { /* no body */ }

    const now = Date.now();
    const since = new Date(now - 30 * 24 * 3600 * 1000).toISOString();
    const prevSince = new Date(now - 60 * 24 * 3600 * 1000).toISOString();
    const prevUntil = since;

    let q = admin
      .from("social_posts")
      .select("id, channel, post_format, media_type, caption, status, scheduled_at, published_at, likes, comments_count, dms_sent, leads_created")
      .eq("user_id", user.id)
      .eq("status", "published")
      .gte("published_at", prevSince)
      .order("published_at", { ascending: false })
      .limit(400);
    if (channelFilter !== "all") q = q.eq("channel", channelFilter);
    const { data: allPosts = [] } = await q;
    const posts = (allPosts ?? []).filter((p: any) => (p.published_at ?? "") >= since);
    const prevPosts = (allPosts ?? []).filter((p: any) => (p.published_at ?? "") < since && (p.published_at ?? "") >= prevSince);

    const list = posts ?? [];

    // ---- Heatmap (7 dias × 6 buckets) ----
    const heatSum: number[][] = Array.from({ length: 7 }, () => Array(HOUR_BUCKETS.length).fill(0));
    const heatCount: number[][] = Array.from({ length: 7 }, () => Array(HOUR_BUCKETS.length).fill(0));

    type Slot = { dow: number; bucket: number; score: number };
    const slots: Slot[] = [];

    for (const p of list) {
      const when = p.published_at ?? p.scheduled_at;
      if (!when) continue;
      const parts = brasiliaParts(when);
      if (!parts) continue;
      const bucket = HOUR_BUCKETS.findIndex((b) => parts.hour >= b.from && parts.hour < b.to);
      if (bucket < 0) continue;
      const engagement = (p.likes ?? 0) + 3 * (p.comments_count ?? 0) + 5 * (p.dms_sent ?? 0) + 10 * (p.leads_created ?? 0);
      heatSum[parts.dow][bucket] += engagement;
      heatCount[parts.dow][bucket] += 1;
      slots.push({ dow: parts.dow, bucket, score: engagement });
    }

    const heatmap = heatSum.map((row, d) => row.map((s, b) => ({
      day: DAY_LABELS[d],
      bucket: HOUR_BUCKETS[b].label,
      avg: heatCount[d][b] > 0 ? Math.round(s / heatCount[d][b]) : 0,
      count: heatCount[d][b],
    })));

    // ---- Top 3 melhores horários (média mínimo 1 post) ----
    const ranked = heatmap.flat().filter((c) => c.count > 0).sort((a, b) => b.avg - a.avg).slice(0, 3);

    // ---- Resumo agregado ----
    const totals = list.reduce((acc, p) => ({
      posts: acc.posts + 1,
      likes: acc.likes + (p.likes ?? 0),
      comments: acc.comments + (p.comments_count ?? 0),
      dms: acc.dms + (p.dms_sent ?? 0),
      leads: acc.leads + (p.leads_created ?? 0),
    }), { posts: 0, likes: 0, comments: 0, dms: 0, leads: 0 });

    const totals_prev = prevPosts.reduce((acc: any, p: any) => ({
      posts: acc.posts + 1,
      likes: acc.likes + (p.likes ?? 0),
      comments: acc.comments + (p.comments_count ?? 0),
      dms: acc.dms + (p.dms_sent ?? 0),
      leads: acc.leads + (p.leads_created ?? 0),
    }), { posts: 0, likes: 0, comments: 0, dms: 0, leads: 0 });

    const pct = (curr: number, prev: number) => {
      if (prev <= 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };
    const deltas = {
      posts: pct(totals.posts, totals_prev.posts),
      likes: pct(totals.likes, totals_prev.likes),
      comments: pct(totals.comments, totals_prev.comments),
      dms: pct(totals.dms, totals_prev.dms),
      leads: pct(totals.leads, totals_prev.leads),
    };

    // top posts
    const topPosts = [...list].map((p) => ({
      caption: (p.caption ?? "").slice(0, 120),
      format: p.post_format ?? p.media_type,
      likes: p.likes ?? 0,
      comments: p.comments_count ?? 0,
      leads: p.leads_created ?? 0,
      published_at: p.published_at,
    })).sort((a, b) => (b.likes + 3 * b.comments + 10 * b.leads) - (a.likes + 3 * a.comments + 10 * a.leads)).slice(0, 5);

    // ---- Narrativa IA ----
    let ai_summary = "";
    if (totals.posts > 0) {
      const payload = {
        period_days: 30,
        totals,
        top_posts: topPosts,
        best_times: ranked,
        sample_size: list.length,
      };
      const sysMsg = "Você é um analista de marketing de Instagram brasileiro. Escreva em PT-BR, direto e acionável. 4-6 bullets curtos com dados concretos. Sem floreios.";
      const userMsg = `Analise os últimos 30 dias dessa conta e devolva:\n1) O que está performando (formato, tema, horário)\n2) O que NÃO está performando\n3) 3 ações específicas pra próxima semana\n\nDados:\n${JSON.stringify(payload, null, 2)}`;
      try {
        ai_summary = await generateAIContent(admin, user.id, { system: sysMsg, user: userMsg, temperature: 0.4 });
      } catch (e) {
        ai_summary = `(IA indisponível: ${String((e as Error)?.message ?? e).slice(0, 120)})`;
      }
    } else if (totals.posts === 0) {
      ai_summary = "Sem posts publicados nos últimos 30 dias. Publique pelo menos 3-5 posts pra IA gerar análise.";
    }

    return new Response(JSON.stringify({
      success: true,
      generated_at: new Date().toISOString(),
      channel: channelFilter,
      totals,
      totals_prev,
      deltas,
      heatmap,
      best_times: ranked,
      top_posts: topPosts,
      ai_summary,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
