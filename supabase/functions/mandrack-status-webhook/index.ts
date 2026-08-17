// version: 2026-07-21-dual-mode-secret
// P0 item 3: Recebe eventos de ACK do Mandrack/WuzAPI e atualiza dispatch_queue
// com delivered_at / read_at para desbloquear o CRM baseado em entrega real (item 4).
//
// URL de instalação (Mandrack /webhook):
//   {SUPABASE_URL}/functions/v1/mandrack-status-webhook?user_id={USER_UUID}&t={MANDRACK_WEBHOOK_SECRET}
//
// SEGURANÇA (dual-mode, migração gradual):
//   - Se MANDRACK_WEBHOOK_SECRET estiver setado, aceita header `x-webhook-secret` OU query `?t=`.
//   - Se o segredo bater, confia no `user_id` da URL.
//   - Se não bater, ainda processa (compat com chips já instalados) mas loga warning.
//     Após migrar todos os chips para incluir `?t=`, remover o fallback (`ALLOW_UNSIGNED=false`).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MANDRACK_WEBHOOK_SECRET") ?? "";
const ALLOW_UNSIGNED = (Deno.env.get("MANDRACK_WEBHOOK_ALLOW_UNSIGNED") ?? "true").toLowerCase() !== "false";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Extrai lista de IDs de mensagem de qualquer variação do payload.
function extractMessageIds(payload: any): string[] {
  const ids = new Set<string>();
  const push = (v: any) => {
    if (Array.isArray(v)) v.forEach(push);
    else if (typeof v === "string" && v.length > 0) ids.add(v);
    else if (v && typeof v === "object") {
      if (v.ID) ids.add(String(v.ID));
      if (v.Id) ids.add(String(v.Id));
      if (v.id) ids.add(String(v.id));
    }
  };
  push(payload?.MessageIDs);
  push(payload?.messageIds);
  push(payload?.message_ids);
  push(payload?.Info?.ID);
  push(payload?.info?.id);
  push(payload?.id);
  push(payload?.ID);
  return [...ids];
}

// Descobre se evento é delivery, read, ou ack numérico (2=server, 3=delivered, 4=read).
function classifyAck(payload: any, eventName: string): "delivered" | "read" | null {
  const type = String(payload?.Type ?? payload?.type ?? payload?.status ?? "").toLowerCase();
  const ack = payload?.Ack ?? payload?.ack ?? payload?.ACK;
  const evLower = eventName.toLowerCase();

  if (type.includes("read") || evLower.includes("read")) return "read";
  if (typeof ack === "number") {
    if (ack >= 4) return "read";
    if (ack >= 3) return "delivered";
    return null; // ack=2 (server) não é entrega ao destinatário
  }
  if (type.includes("deliver") || type.includes("received")) return "delivered";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");

    // Dual-mode: valida o secret se presente. Senão, aceita e loga warning
    // até todos os chips serem re-registrados com `?t=` (ALLOW_UNSIGNED=false).
    const providedSecret = req.headers.get("x-webhook-secret") ?? url.searchParams.get("t") ?? "";
    const signed = WEBHOOK_SECRET.length > 0 && providedSecret === WEBHOOK_SECRET;
    if (!signed) {
      if (!ALLOW_UNSIGNED) return json({ error: "invalid_webhook_secret" }, 401);
      console.warn("mandrack-status-webhook: unsigned request accepted (dual-mode)", { userId, hasSecret: !!providedSecret });
    }


    const raw = await req.json().catch(() => ({}));
    const body = raw?.body && typeof raw.body === "object" ? raw.body : raw;
    const eventPayload = body?.event ?? body?.Event ?? body;
    const eventName = String(body?.type ?? body?.Type ?? eventPayload?.type ?? eventPayload?.Type ?? "");
    const data = eventPayload?.data ?? eventPayload?.Data ?? eventPayload;

    const kind = classifyAck(data, eventName);
    if (!kind) {
      // Silenciosamente ignora eventos que não são ACK (Message, Presence, etc)
      return json({ ok: true, ignored: eventName || "unknown" });
    }

    const ids = extractMessageIds(data);
    if (ids.length === 0) return json({ ok: true, ignored: "no_message_ids" });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const now = new Date().toISOString();

    // Update por batch. Restringe por user_id se veio na URL — evita cross-tenant
    // caso o mesmo endpoint receba de múltiplos clientes (o param faz parte do
    // webhook instalado por tenant).
    let q = admin.from("dispatch_queue").update(
      kind === "read"
        ? { read_at: now, delivered_at: now, provider_status: "read" }
        : { delivered_at: now, provider_status: "delivered" }
    ).in("provider_message_id", ids);

    if (userId) q = q.eq("user_id", userId);

    const { error, count } = await q.select("id", { count: "exact", head: true });
    if (error) throw error;

    return json({ ok: true, kind, matched: count ?? 0, ids: ids.length });
  } catch (e: any) {
    console.error("mandrack-status-webhook error:", e?.message);
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});
