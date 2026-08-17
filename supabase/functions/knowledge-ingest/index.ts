// knowledge-ingest — Ingestão de documentos para a base de conhecimento (RAG).
// Fluxo: a UI cria a linha em knowledge_documents (+ sobe o arquivo no bucket
// knowledge-docs) e chama esta função com { document_id }. Também aceita texto
// colado direto com { title, text }.
//
// Passos: baixa/recebe texto → extrai (PDF via unpdf, ou txt/md cru) → quebra em
// chunks → gera embeddings (Gemini text-embedding-004, 768 dims, via chave do
// cliente OU admin compartilhado) → grava em knowledge_chunks.
//
// A chave de IA é resolvida por get_ai_key_for_user (mesma regra dos workers).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMBED_URL = "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent";

// Quebra o texto em pedaços de ~1200 chars com ~150 de sobreposição, tentando
// cortar em fim de parágrafo/frase para não partir ideias no meio.
function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length);
    if (end < clean.length) {
      const slice = clean.slice(i, end);
      const cut = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "), slice.lastIndexOf("\n"));
      if (cut > size * 0.5) end = i + cut + 1;
    }
    const piece = clean.slice(i, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    i = end - overlap;
  }
  return chunks;
}

async function extractText(bytes: Uint8Array, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const { extractText: pdfExtract, getDocumentProxy } = await import("https://esm.sh/unpdf@0.11.0");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await pdfExtract(pdf, { mergePages: true });
    return String(text ?? "");
  }
  // txt, md, csv, json → decodifica como UTF-8
  return new TextDecoder().decode(bytes);
}

async function embed(text: string, key: string): Promise<number[] | null> {
  const r = await fetch(`${EMBED_URL}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "models/text-embedding-004", content: { parts: [{ text }] } }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const v = j?.embedding?.values;
  return Array.isArray(v) && v.length === 768 ? v : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  let docId: string | null = null;
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Missing Authorization" }, 401);
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return json({ error: "Unauthenticated" }, 401);

    const body = await req.json().catch(() => ({}));

    // Resolve a chave Gemini (própria do cliente ou admin compartilhado).
    const { data: gkey } = await admin.rpc("get_ai_key_for_user", { _user_id: userId, _provider: "gemini" });
    if (!gkey) return json({ error: "Configure sua chave Gemini em Configurações → APIs (ou peça ao admin p/ compartilhar)." }, 400);

    // Modo 1: texto colado. Cria o doc na hora.
    let rawText = "";
    let filename = "documento.txt";
    if (typeof body?.text === "string" && body.text.trim()) {
      const { data: created, error: cErr } = await admin.from("knowledge_documents")
        .insert({ user_id: userId, title: (body.title || "Texto colado").slice(0, 200), source_type: "text", status: "processing" })
        .select("id").single();
      if (cErr) return json({ error: cErr.message }, 500);
      docId = created.id;
      rawText = body.text;
    } else if (body?.document_id) {
      // Modo 2: documento já criado pela UI + arquivo no bucket.
      docId = String(body.document_id);
      const { data: doc } = await admin.from("knowledge_documents")
        .select("id, user_id, storage_path, title").eq("id", docId).maybeSingle();
      if (!doc || doc.user_id !== userId) return json({ error: "Documento não encontrado" }, 404);
      await admin.from("knowledge_documents").update({ status: "processing", error: null }).eq("id", docId);
      if (!doc.storage_path) return json({ error: "Documento sem arquivo" }, 400);
      filename = doc.title || doc.storage_path;
      const { data: file, error: dErr } = await admin.storage.from("knowledge-docs").download(doc.storage_path);
      if (dErr || !file) throw new Error(`download falhou: ${dErr?.message ?? "sem arquivo"}`);
      rawText = await extractText(new Uint8Array(await file.arrayBuffer()), doc.storage_path);
    } else {
      return json({ error: "Envie { document_id } ou { title, text }" }, 400);
    }

    const text = (rawText || "").trim();
    if (text.length < 20) throw new Error("Texto extraído vazio ou muito curto");

    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("Nenhum chunk gerado");

    // Limpa chunks antigos deste doc (reprocessamento idempotente).
    await admin.from("knowledge_chunks").delete().eq("document_id", docId);

    let ok = 0;
    for (let idx = 0; idx < chunks.length; idx++) {
      const vec = await embed(chunks[idx], gkey as string);
      if (!vec) continue; // pula chunk que falhou embedding (não derruba tudo)
      const { error: insErr } = await admin.from("knowledge_chunks").insert({
        document_id: docId, user_id: userId, chunk_index: idx, content: chunks[idx], embedding: vec as any,
      });
      if (!insErr) ok++;
    }

    if (ok === 0) throw new Error("Falha ao gerar embeddings (verifique a chave Gemini)");

    await admin.from("knowledge_documents").update({
      status: "ready", char_count: text.length, chunk_count: ok, updated_at: new Date().toISOString(),
    }).eq("id", docId);

    return json({ ok: true, document_id: docId, chunks: ok, chars: text.length });
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 400);
    if (docId) await admin.from("knowledge_documents").update({ status: "failed", error: msg }).eq("id", docId);
    return json({ error: msg }, 500);
  }
});
