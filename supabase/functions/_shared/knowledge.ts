// Shared RAG helper — extracted read-only from qualification-worker so other
// functions (meta-instagram-webhook, etc.) can inject knowledge base context
// without touching the WhatsApp worker.
//
// Fail-safe: any error / missing gemini key / no chunks → returns "".

export async function retrieveKnowledgeBlock(
  admin: any,
  userId: string,
  query: string,
  geminiKey: string | null | undefined,
): Promise<string> {
  try {
    if (!geminiKey || !query || query.trim().length < 3) return "";
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text: query.slice(0, 1000) }] },
        }),
      },
    );
    if (!r.ok) return "";
    const j = await r.json();
    const vec = j?.embedding?.values;
    if (!Array.isArray(vec) || vec.length !== 768) return "";
    const { data } = await admin.rpc("match_knowledge_chunks", {
      _user_id: userId,
      _query: vec,
      _match_count: 4,
    });
    const good = ((data as any[] | null) ?? [])
      .filter((x) => (x.similarity ?? 0) > 0.5)
      .map((x) => String(x.content));
    if (good.length === 0) return "";
    return `\n\n=== BASE DE CONHECIMENTO DA EMPRESA (fonte de verdade — se a resposta estiver aqui, USE; não invente além disto) ===\n${good.map((c, i) => `[${i + 1}] ${c}`).join("\n\n")}\n=== FIM BASE DE CONHECIMENTO ===`;
  } catch (_e) {
    return "";
  }
}

// Retorna quantos hits — útil para log de validação.
export async function retrieveKnowledgeStats(
  admin: any,
  userId: string,
  query: string,
  geminiKey: string | null | undefined,
): Promise<{ block: string; hits: number }> {
  const block = await retrieveKnowledgeBlock(admin, userId, query, geminiKey);
  if (!block) return { block: "", hits: 0 };
  const hits = (block.match(/\n\[\d+\]/g) ?? []).length;
  return { block, hits };
}
