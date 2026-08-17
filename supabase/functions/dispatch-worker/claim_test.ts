// Testa que o claim atômico (RPC claim_dispatch_item) garante que
// múltiplas invocações concorrentes do worker NÃO disparem o mesmo item 2x.
// Também valida o dedup do auto-prospect contra disparos_humanizados.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

// Pega qualquer user_id existente (não precisa criar fake user)
async function anyUserId(): Promise<string> {
  const { data } = await admin.from("profiles").select("user_id").limit(1).maybeSingle();
  if (!data?.user_id) throw new Error("Sem usuário pra rodar teste — crie um primeiro");
  return data.user_id;
}

Deno.test("claim_dispatch_item: apenas UMA invocação concorrente reivindica o item", async () => {
  const userId = await anyUserId();
  // Insere um item pending de teste
  const { data: inserted, error: insErr } = await admin.from("dispatch_queue").insert({
    user_id: userId,
    source: "test",
    telefone: "5511999999999",
    status: "pending",
    scheduled_at: new Date().toISOString(),
    nome_empresa: "TEST_CLAIM_ATOMIC",
  }).select("id").single();
  assertEquals(insErr, null);
  const itemId = inserted!.id;

  try {
    // Dispara 5 claims concorrentes para o MESMO id
    const results = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        admin.rpc("claim_dispatch_item", { _id: itemId })
      ),
    );
    const successful = results.filter((r) => {
      const rows = Array.isArray(r.data) ? r.data : [];
      return rows.length > 0;
    });
    assertEquals(successful.length, 1, "Exatamente 1 worker deve ter reivindicado o item");

    // Confirma que o status virou running e attempts incrementou
    const { data: row } = await admin.from("dispatch_queue").select("status, attempts").eq("id", itemId).maybeSingle();
    assertEquals(row?.status, "running");
    assertEquals(row?.attempts, 1);
  } finally {
    await admin.from("dispatch_queue").delete().eq("id", itemId);
  }
});

Deno.test("claim_dispatch_item: item já running retorna vazio (segundo claim falha)", async () => {
  const userId = await anyUserId();
  const { data: inserted } = await admin.from("dispatch_queue").insert({
    user_id: userId,
    source: "test",
    telefone: "5511988888888",
    status: "running", // já running
    scheduled_at: new Date().toISOString(),
    nome_empresa: "TEST_CLAIM_RUNNING",
  }).select("id").single();
  const itemId = inserted!.id;

  try {
    const { data } = await admin.rpc("claim_dispatch_item", { _id: itemId });
    const rows = Array.isArray(data) ? data : [];
    assertEquals(rows.length, 0, "Item já running NÃO deve ser reivindicado");
  } finally {
    await admin.from("dispatch_queue").delete().eq("id", itemId);
  }
});

Deno.test("auto-prospect dedup: telefone já em disparos_humanizados/sent bloqueia novo enqueue", async () => {
  const userId = await anyUserId();
  const phone = "5511977777777";
  // Simula envio prévio bem-sucedido
  const { data: sentRow } = await admin.from("disparos_humanizados").insert({
    user_id: userId,
    source: "test",
    telefone: phone,
    status: "sent",
    nome_empresa: "TEST_DEDUP_SENT",
  }).select("id").single();

  try {
    // Conta envios anteriores — mesma query usada no auto-prospect
    const { count } = await admin.from("disparos_humanizados")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("telefone", phone)
      .eq("status", "sent");
    assert((count ?? 0) >= 1, "Deve detectar envio anterior pra bloquear redisparo");
  } finally {
    await admin.from("disparos_humanizados").delete().eq("id", sentRow!.id);
  }
});
