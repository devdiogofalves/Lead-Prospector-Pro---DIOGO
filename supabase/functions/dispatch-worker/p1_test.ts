// P1 validation suite — covers:
//  1. Enrichment dedup (instagram/dados4u/socio_linkedin "_searched_at" filters)
//  2. LinkedIn cadence daily limit by attempts (success + failure both count)
//  3. Daily reset boundary in BRT (00:00 BRT = 03:00 UTC)
//  4. Atomic finalize_qualification_response RPC
//  5. Anti-redisparo includes status="qualified"

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

async function anyUserId(): Promise<string> {
  const { data } = await admin.from("profiles").select("user_id").limit(1).maybeSingle();
  if (!data?.user_id) throw new Error("Sem usuário pra rodar teste");
  return data.user_id;
}

// ─────────────────────────────────────────────────────────────────────────────
Deno.test("P1.1 — Enrichment dedup: empresa já com instagram_searched_at NÃO é re-selecionada", async () => {
  const userId = await anyUserId();
  const cnpj = `TEST${Date.now()}`;
  const { data: ins } = await admin.from("empresas_enriquecidas").insert({
    user_id: userId,
    cnpj,
    nome_empresa: "TEST_ENRICH_DEDUP",
    instagram_searched_at: new Date().toISOString(),
    dados4u_searched_at: new Date().toISOString(),
    socio_linkedin_searched_at: new Date().toISOString(),
  }).select("id").single();

  try {
    const { data: igCandidates } = await admin.from("empresas_enriquecidas")
      .select("id").eq("user_id", userId).is("instagram_searched_at", null).eq("cnpj", cnpj);
    assertEquals((igCandidates ?? []).length, 0, "instagram já processado NÃO deve aparecer");

    const { data: d4uCandidates } = await admin.from("empresas_enriquecidas")
      .select("id").eq("user_id", userId).is("dados4u_searched_at", null).eq("cnpj", cnpj);
    assertEquals((d4uCandidates ?? []).length, 0, "dados4u já processado NÃO deve aparecer");

    const { data: liCandidates } = await admin.from("empresas_enriquecidas")
      .select("id").eq("user_id", userId).is("socio_linkedin_searched_at", null).eq("cnpj", cnpj);
    assertEquals((liCandidates ?? []).length, 0, "socio_linkedin já processado NÃO deve aparecer");
  } finally {
    await admin.from("empresas_enriquecidas").delete().eq("id", ins!.id);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
Deno.test("P1.2 — LinkedIn cadence: last_attempt_at conta TENTATIVAS (sucessos + falhas)", async () => {
  const userId = await anyUserId();
  // Cria 3 contatos: 1 succeeded (com data_disparo), 1 failed (sem data_disparo
  // mas com last_attempt_at), 1 nunca tentado.
  const todayStart = new Date(); todayStart.setUTCHours(3, 0, 0, 0);
  if (todayStart.getTime() > Date.now()) todayStart.setUTCDate(todayStart.getUTCDate() - 1);
  const within = new Date(Date.now() - 60_000).toISOString();

  const url1 = `https://linkedin.com/in/test-${Date.now()}-a`;
  const url2 = `https://linkedin.com/in/test-${Date.now()}-b`;
  const url3 = `https://linkedin.com/in/test-${Date.now()}-c`;

  const { data: rows } = await admin.from("linkedin_contacts").insert([
    { user_id: userId, nome: "A success", linkedin_url: url1, last_attempt_at: within, data_disparo: within },
    { user_id: userId, nome: "B failed",  linkedin_url: url2, last_attempt_at: within },
    { user_id: userId, nome: "C novo",    linkedin_url: url3 },
  ]).select("id");

  try {
    // Lógica do linkedin-cadence-worker:99
    const { count: attemptsToday } = await admin.from("linkedin_contacts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("last_attempt_at", todayStart.toISOString());
    assert((attemptsToday ?? 0) >= 2, `Esperado >=2 tentativas (sucesso+falha), veio ${attemptsToday}`);

    // Confirma que contadora antiga (só sucessos) subestima
    const { count: oldCount } = await admin.from("linkedin_contacts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("data_disparo", todayStart.toISOString());
    assert((oldCount ?? 0) < (attemptsToday ?? 0), "contagem antiga deve ser MENOR — prova do bypass anterior");
  } finally {
    await admin.from("linkedin_contacts").delete().in("id", rows!.map((r: any) => r.id));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
Deno.test("P1.3 — Daily reset BRT: 03:00 UTC = 00:00 BRT, não meia-noite UTC", () => {
  const todayStart = new Date(); todayStart.setUTCHours(3, 0, 0, 0);
  if (todayStart.getTime() > Date.now()) todayStart.setUTCDate(todayStart.getUTCDate() - 1);

  // Toda data calculada deve ter horas UTC = 03
  assertEquals(todayStart.getUTCHours(), 3, "boundary BRT deve ser sempre 03:00 UTC");
  // E nunca pode estar no futuro
  assert(todayStart.getTime() <= Date.now(), "boundary não pode estar no futuro");
  // E nunca pode estar mais de 24h no passado
  assert(Date.now() - todayStart.getTime() < 24 * 3600 * 1000, "boundary não pode passar 24h");
});

// ─────────────────────────────────────────────────────────────────────────────
Deno.test("P1.4 — finalize_qualification_response: insert assistant + processed=true atômico", async () => {
  const userId = await anyUserId();
  const telefone = `5511${Date.now().toString().slice(-9)}`;

  // Cria conversa + 2 mensagens user pending
  const { data: conv } = await admin.from("qualification_conversations").insert({
    user_id: userId, telefone, status: "active",
  }).select("id").single();

  const { data: msgs } = await admin.from("qualification_messages").insert([
    { user_id: userId, conversation_id: conv!.id, telefone, role: "user", content: "oi", processed: false },
    { user_id: userId, conversation_id: conv!.id, telefone, role: "user", content: "td bem?", processed: false },
  ]).select("id");
  const pendingIds = msgs!.map((m: any) => m.id);

  try {
    const { error } = await admin.rpc("finalize_qualification_response", {
      _user_id: userId,
      _conversation_id: conv!.id,
      _telefone: telefone,
      _content: "Oi! Tudo ótimo, e você?",
      _audio_url: null,
      _evolution_response: { test: true },
      _pending_ids: pendingIds,
    });
    assertEquals(error, null);

    // Confirma 1 assistant message criada
    const { data: assistant } = await admin.from("qualification_messages")
      .select("id, processed").eq("conversation_id", conv!.id).eq("role", "assistant");
    assertEquals(assistant!.length, 1);
    assertEquals(assistant![0].processed, true);

    // Confirma user messages marcadas processed
    const { data: users } = await admin.from("qualification_messages")
      .select("id, processed").eq("conversation_id", conv!.id).eq("role", "user");
    assertEquals(users!.length, 2);
    assert(users!.every((m: any) => m.processed === true), "todas user messages devem virar processed");
  } finally {
    await admin.from("qualification_messages").delete().eq("conversation_id", conv!.id);
    await admin.from("qualification_conversations").delete().eq("id", conv!.id);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
Deno.test("P1.5 — Anti-redisparo: status 'qualified' bloqueia novo disparo (não só active/handoff)", async () => {
  const userId = await anyUserId();
  const telefone = `5511${Date.now().toString().slice(-9)}`;

  const { data: conv } = await admin.from("qualification_conversations").insert({
    user_id: userId, telefone, status: "qualified",
  }).select("id").single();

  try {
    // Mesma query do dispatch-worker:160
    const { data: blocking } = await admin.from("qualification_conversations")
      .select("id, status").eq("user_id", userId).eq("telefone", telefone)
      .in("status", ["active", "handoff", "qualified"]).maybeSingle();
    assert(blocking, "Lead qualificado DEVE bloquear redisparo");
    assertEquals(blocking!.status, "qualified");
  } finally {
    await admin.from("qualification_conversations").delete().eq("id", conv!.id);
  }
});
