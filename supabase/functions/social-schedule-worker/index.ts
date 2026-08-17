// social-schedule-worker — cron 1min: publica posts agendados cujo scheduled_at já passou.
// version: 2026-07-20-secure
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  if (SERVICE_ROLE && auth === `Bearer ${SERVICE_ROLE}`) return true;
  const cs = req.headers.get("x-cron-secret") ?? "";
  if (CRON_SECRET && cs === CRON_SECRET) return true;
  return false;
}

Deno.serve(async (req) => {
  if (!authorized(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: due } = await admin
    .from("social_posts")
    .select("id, user_id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(20);

  const results: any[] = [];
  for (const p of due ?? []) {
    try {
      // Marca publishing pra evitar duplicação
      await admin.from("social_posts").update({ status: "publishing" }).eq("id", p.id);
      const r = await fetch(`${SUPABASE_URL}/functions/v1/social-publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
          "x-user-id": p.user_id,
        },
        body: JSON.stringify({ post_id: p.id, _user_id: p.user_id }),
      });
      const j = await r.json().catch(() => ({}));
      results.push({ id: p.id, ok: r.ok, ...j });
    } catch (e: any) {
      await admin.from("social_posts").update({ status: "failed", last_error: String(e?.message ?? e) }).eq("id", p.id);
      results.push({ id: p.id, ok: false, error: String(e?.message ?? e) });
    }
  }
  return new Response(JSON.stringify({ processed: results.length, results }), { headers: { "Content-Type": "application/json" } });
});
