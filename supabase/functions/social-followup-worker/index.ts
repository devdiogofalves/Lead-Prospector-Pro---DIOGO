// social-followup-worker — processa social_scheduled_followups vencidos.
// Roda via pg_cron a cada 5 minutos. Envia DM via Unipile (canal IG/LinkedIn).
// version: 2026-07-20-secure
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateAIContent } from "../_shared/ai-json.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const resp = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  if (SERVICE_ROLE && auth === `Bearer ${SERVICE_ROLE}`) return true;
  const cs = req.headers.get("x-cron-secret") ?? "";
  if (CRON_SECRET && cs === CRON_SECRET) return true;
  return false;
}

const TONE_GUIDE: Record<string, string> = {
  casual: "Tom descontraído, próximo, com 0-1 emoji.",
  professional: "Tom profissional, claro, direto, sem emojis.",
  consultive: "Tom consultivo SPIN: termine com UMA pergunta de descoberta.",
};

async function aiRewrite(admin: any, userId: string, baseText: string, ctx: string, tone: string): Promise<string> {
  try {
    const content = await generateAIContent(admin, userId, {
      system: `Reescreva a mensagem em PT-BR. ${TONE_GUIDE[tone] ?? TONE_GUIDE.casual} 1-2 frases curtas. Retorne APENAS o texto.`,
      user: `Contexto: ${ctx}\n\nBase: "${baseText}"`,
      maxTokens: 200,
    });
    return String(content ?? "").trim() || baseText;
  } catch { return baseText; }
}

async function sendDM(admin: any, userId: string, accountId: string, providerId: string, text: string) {
  const { data: keyRow } = await admin.from("user_api_keys").select("api_key, extra").eq("user_id", userId).eq("provider", "unipile").maybeSingle();
  const apiKey = (keyRow?.api_key ?? "").trim();
  if (!apiKey) return { ok: false, err: "no_unipile_key" };
  const dsn = ((keyRow?.extra as any)?.dsn ?? "https://api.unipile.com:443").replace(/\/+$/, "");
  const fd = new FormData();
  fd.set("account_id", accountId);
  fd.set("text", text);
  fd.append("attendees_ids", providerId);
  const rr = await fetch(`${dsn}/api/v1/chats`, { method: "POST", headers: { "X-API-KEY": apiKey }, body: fd });
  const tt = await rr.text();
  return { ok: rr.ok, err: rr.ok ? null : `${rr.status}: ${tt.slice(0,200)}` };
}

Deno.serve(async (req) => {
  if (!authorized(req)) return resp({ error: "unauthorized" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const nowIso = new Date().toISOString();

  const { data: due, error } = await admin
    .from("social_scheduled_followups")
    .select("*")
    .eq("sent", false)
    .lte("scheduled_at", nowIso)
    .lt("attempts", 5)
    .limit(50);

  if (error) return resp({ error: error.message }, 500);
  if (!due?.length) return resp({ ok: true, processed: 0 });

  let success = 0, failed = 0;
  for (const f of due) {
    try {
      let text = f.message as string;
      if (f.use_ai) {
        const tone = (f.context as any)?.tone ?? "casual";
        const trigger = (f.context as any)?.trigger ?? "interaction";
        text = await aiRewrite(admin, f.user_id, text, `Follow-up de ${trigger} com ${f.actor_name || f.actor_handle || "lead"}.`, tone);
      }
      const r = await sendDM(admin, f.user_id, f.account_id, f.actor_provider_id, text);
      if (r.ok) {
        await admin.from("social_scheduled_followups").update({
          sent: true, sent_at: new Date().toISOString(), attempts: (f.attempts ?? 0) + 1,
        }).eq("id", f.id);
        success++;
      } else {
        await admin.from("social_scheduled_followups").update({
          attempts: (f.attempts ?? 0) + 1, error: r.err,
        }).eq("id", f.id);
        failed++;
      }
    } catch (e: any) {
      await admin.from("social_scheduled_followups").update({
        attempts: (f.attempts ?? 0) + 1, error: String(e?.message ?? e).slice(0, 200),
      }).eq("id", f.id);
      failed++;
    }
  }

  return resp({ ok: true, processed: due.length, success, failed });
});
