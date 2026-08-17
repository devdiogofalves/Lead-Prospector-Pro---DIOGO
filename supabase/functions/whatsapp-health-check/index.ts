// version: 2026-07-21-chip-health-no-false-close
// P0 item 1: Health check dos chips WhatsApp.
// Roda periodicamente (cron 2min) — verifica status real de cada whatsapp_instances.active=true
// consultando /session/status no Mandrack e persiste em `status` + `last_health_check_at`.
// Sem UI de status baseada em polling nem lógica de retry aqui — só coleta.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAND_URL_DEFAULT = "https://api.mandrackstudio.ia.br";
const MAND_URL = (Deno.env.get("MANDRACK_URL") ?? MAND_URL_DEFAULT).trim().replace(/\/$/, "");

// Rate-limit por invocação — evita martelar Mandrack se houver centenas de chips.
const MAX_PER_TICK = 50;

function normalizeMandrackStatus(body: any, ok: boolean, httpStatus: number): string | null {
  const data = body?.data ?? {};
  const raw = String(
    data?.Status ?? data?.status ?? data?.state ?? data?.connection ?? body?.status ?? body?.state ?? "",
  ).toLowerCase();

  // Mandrack alterna entre booleanos (`loggedIn`/`connected`) e strings
  // (`Status`). O bug do Lucas: o health-check ignorava `loggedIn=true` e
  // marcava `close` em respostas válidas sem `Status=open`.
  if (data?.loggedIn === true || data?.isLoggedIn === true) return "open";
  if (/open|connected|online|ready|working|authorized/.test(raw)) return "open";
  if (data?.connected === true || /connecting|pair|qr|scan/.test(raw)) return "connecting";
  if (/close|closed|disconnect|logged.?out|unauthori[sz]ed|no.?session/.test(raw)) return "close";
  if (data?.loggedIn === false && data?.connected === false) return "close";

  // 401/403 normalmente indica token inválido/revogado: não é falha transitória.
  if (httpStatus === 401 || httpStatus === 403) return "close";
  if (!ok) return null;
  return raw || "unknown";
}

async function checkOne(admin: any, chip: any): Promise<{ id: string; status: string; changed: boolean; transient?: boolean }> {
  const token = chip.mandrack_instance_token;
  if (!token) return { id: chip.id, status: "no_token", changed: false };
  let status: string | null = "unknown";
  try {
    const r = await fetch(`${MAND_URL}/session/status`, {
      method: "GET",
      headers: { token, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    const j = await r.json().catch(() => ({}));
    status = normalizeMandrackStatus(j, r.ok, r.status);
  } catch (e: any) {
    console.warn(`[whatsapp-health-check] transient status error chip=${chip.id}: ${e?.message ?? e}`);
    status = null;
  }

  if (!status) {
    // Falha transitória da API Mandrack não deve derrubar chip recém-conectado.
    // Preserva o último status e só atualiza o timestamp de verificação.
    await admin.from("whatsapp_instances")
      .update({ last_health_check_at: new Date().toISOString() })
      .eq("id", chip.id);
    return { id: chip.id, status: String(chip.status ?? "unknown"), changed: false, transient: true };
  }

  const changed = String(chip.status ?? "") !== status;
  await admin.from("whatsapp_instances")
    .update({ status, last_health_check_at: new Date().toISOString() })
    .eq("id", chip.id);
  return { id: chip.id, status, changed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Prioriza chips com health-check mais antigo / nunca verificados.
    const { data: chips, error } = await admin
      .from("whatsapp_instances")
      .select("id, user_id, instance_name, mandrack_instance_token, status, last_health_check_at")
      .eq("active", true)
      .order("last_health_check_at", { ascending: true, nullsFirst: true })
      .limit(MAX_PER_TICK);

    if (error) throw error;
    const list = chips ?? [];

    // Paraleliza em pequenos lotes para não estourar concurrency.
    const results: any[] = [];
    const batchSize = 8;
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      const settled = await Promise.allSettled(batch.map((c) => checkOne(admin, c)));
      for (const s of settled) {
        if (s.status === "fulfilled") results.push(s.value);
        else results.push({ error: String(s.reason) });
      }
    }

    return new Response(JSON.stringify({
      ok: true, checked: results.length,
      open: results.filter((r) => r.status === "open").length,
      close: results.filter((r) => r.status === "close").length,
      changes: results.filter((r) => r.changed).length,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("whatsapp-health-check error:", e?.message);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
