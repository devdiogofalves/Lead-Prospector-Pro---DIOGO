// unipile-relation-webhook — recebe evento `new_relation` da Unipile (= alguém
// aceitou seu convite no LinkedIn). Liga a cadência: marca etapa="primeira"
// e data_prox_disparo=now() para o linkedin-cadence-worker enviar a 1ª mensagem
// na próxima execução horária.
//
// CONFIGURAÇÃO NO UNIPILE:
// Cadastrar este URL no painel como "New Relation Webhook":
//   https://<project>.supabase.co/functions/v1/unipile-relation-webhook
// Use ?token=XXX ou header X-Webhook-Token com UNIPILE_WEBHOOK_SECRET em produção.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function allowInsecureWebhooks() {
  return Deno.env.get("ALLOW_INSECURE_WEBHOOKS") === "true";
}

function extractAccountId(p: any): string | null {
  return p?.account_id ?? p?.account?.id ?? p?.data?.account_id ?? null;
}

function extractRelation(p: any): { provider_id?: string; profile_url?: string; name?: string } {
  const r = p?.user ?? p?.relation ?? p?.attendee ?? p?.data ?? p ?? {};
  return {
    provider_id: r.provider_id ?? r.member_id ?? r.id ?? r.public_identifier ?? undefined,
    profile_url: r.profile_url ?? r.public_profile_url ?? r.url ?? undefined,
    name: r.name ?? r.full_name ?? undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Use POST", { status: 405, headers: corsHeaders });

  const requiredSecret = Deno.env.get("UNIPILE_WEBHOOK_SECRET") ?? "";
  if (!requiredSecret && !allowInsecureWebhooks()) {
    console.error("[unipile-relation-webhook] UNIPILE_WEBHOOK_SECRET ausente");
    return json({ ok: false, error: "webhook secret not configured" }, 500);
  }
  if (requiredSecret) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? req.headers.get("X-Webhook-Token");
    if (token !== requiredSecret) return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  let payload: any;
  try { payload = await req.json(); }
  catch { return new Response("Invalid JSON", { status: 400, headers: corsHeaders }); }

  console.log("[unipile-relation-webhook] payload:", JSON.stringify(payload).slice(0, 600));

  const accountId = extractAccountId(payload);
  if (!accountId) return json({ ok: true, skipped: "no_account_id" });

  const rel = extractRelation(payload);
  if (!rel.provider_id && !rel.profile_url) return json({ ok: true, skipped: "no_identification" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve user_id pelo account_id
  const { data: keyRow } = await admin
    .from("user_api_keys")
    .select("user_id")
    .eq("provider", "unipile")
    .filter("extra->>account_id", "eq", accountId)
    .maybeSingle();

  if (!keyRow?.user_id) return json({ ok: true, skipped: "account_id_not_mapped", account_id: accountId });

  // Encontra contato na cadência (idle ou active com etapa nota_conexao)
  let contact: any = null;
  if (rel.profile_url) {
    const { data } = await admin.from("linkedin_contacts")
      .select("id, nome, etapa_atual, cadencia_status")
      .eq("user_id", keyRow.user_id)
      .eq("linkedin_url", rel.profile_url)
      .maybeSingle();
    contact = data;
  }
  if (!contact && rel.provider_id) {
    const { data } = await admin.from("linkedin_contacts")
      .select("id, nome, etapa_atual, cadencia_status")
      .eq("user_id", keyRow.user_id)
      .or(`provider_id.eq.${rel.provider_id},linkedin_url.ilike.%${rel.provider_id}%`)
      .limit(1)
      .maybeSingle();
    contact = data;
  }

  if (!contact) return json({ ok: true, skipped: "no_contact_match", relation: rel });

  // Aceitou convite → cadência ativa, etapa = "primeira", disparar já.
  // BUG FIX (mai/2026): antes setava "primeira_msg" — mas CADENCE_STEPS em
  // linkedin-dm:29 conhece "primeira", "followup1", "followup2", "encerramento".
  // Como o cadence_advance recusa etapas fora dessa lista, o lead que aceitava
  // o convite ficava com etapa_atual="primeira_msg" e o cron falhava todo
  // disparo até atingir 3 tentativas → cadencia_status="failed". Lead aceitava
  // mas NUNCA recebia a 1ª mensagem. Agora alinha com CADENCE_STEPS.
  const nowIso = new Date().toISOString();
  const { error } = await admin.from("linkedin_contacts")
    .update({
      cadencia_status: "active",
      etapa_atual: "primeira",
      conexao_aceita_em: nowIso,
      data_prox_disparo: nowIso,
      provider_id: rel.provider_id ?? null,
      unipile_account_id: accountId,
    })
    .eq("id", contact.id);

  if (error) return json({ ok: false, error: error.message }, 500);

  console.log(`[unipile-relation-webhook] ${contact.nome} aceitou convite → cadência ativada (etapa: primeira)`);
  return json({ ok: true, contact_id: contact.id, contact_name: contact.nome, advanced_to: "primeira" });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}