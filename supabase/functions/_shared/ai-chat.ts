// redeploy 2026-07-14 gemini remove extra_body + retry sem reasoning_effort
// Cadeia de fallback IA: OpenAI (chave do usuario/admin) -> Gemini (chave do usuario/admin).
// Faz failover automático em erros de quota/rate limit/servidor.
// Retorna { text, provider_used, attempts }.

export type ChatContentPart = { type: string; [k: string]: unknown };
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ChatContentPart[] };

export type AiChatOptions = {
  openaiKey?: string;
  geminiKey?: string;
  messages: ChatMessage[];
  openaiModel?: string;   // default gpt-4o-mini
  geminiModel?: string;   // default gemini-2.5-flash
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" | "text" };
  presence_penalty?: number;
  frequency_penalty?: number;
};

export type AiChatResult = {
  text: string;
  provider: "openai" | "gemini";
  finish_reason?: string;
  attempts: Array<{ provider: string; status: number; ok: boolean; error?: string; finish_reason?: string; length?: number }>;
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

// Falhas que devem disparar failover para próximo provider
function shouldFailover(status: number, bodyText: string): boolean {
  if (status === 429) return true;                     // rate limit / quota
  if (status === 402) return true;                     // credits/billing
  if (status === 401 || status === 403) return true;   // chave inválida/revogada
  if (status >= 500) return true;                      // provider caiu
  if (/insufficient_quota|quota_exceeded|billing/i.test(bodyText)) return true;
  return false;
}

async function callOpenAi(key: string, o: AiChatOptions) {
  const body: Record<string, unknown> = {
    model: o.openaiModel ?? "gpt-4o-mini",
    messages: o.messages,
  };
  if (o.temperature !== undefined) body.temperature = o.temperature;
  if (o.max_tokens !== undefined) body.max_tokens = o.max_tokens;
  if (o.response_format) body.response_format = o.response_format;
  if (o.presence_penalty !== undefined) body.presence_penalty = o.presence_penalty;
  if (o.frequency_penalty !== undefined) body.frequency_penalty = o.frequency_penalty;
  const r = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r;
}

function buildGeminiBody(o: AiChatOptions, opts: { includeThinkingOff: boolean }): Record<string, unknown> {
  const model = o.geminiModel ?? "gemini-2.5-flash";
  const body: Record<string, unknown> = {
    model,
    messages: o.messages,
  };
  if (o.temperature !== undefined) body.temperature = o.temperature;
  if (o.max_tokens !== undefined) body.max_tokens = o.max_tokens;
  if (o.response_format) body.response_format = o.response_format;
  // Gemini 2.5 conta tokens de "thinking" dentro de max_tokens. O endpoint
  // OpenAI-compat do Google aceita `reasoning_effort` ("none"/"low"/etc) —
  // NÃO aceita `extra_body` (esse é conceito do SDK OpenAI client-side, não
  // vira wire field). Enviar `extra_body` no corpo retorna 400 "unknown field".
  if (opts.includeThinkingOff && /^gemini-2\.5/i.test(model)) {
    body.reasoning_effort = "none";
  }
  return body;
}

async function fetchGemini(key: string, body: Record<string, unknown>) {
  // O endpoint OpenAI-compatível do Google (/v1beta/openai/chat/completions) exige a
  // chave em `Authorization: Bearer`, NÃO em `?key=` (esse só vale nos endpoints nativos
  // :generateContent).
  return await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
}

async function callGemini(key: string, o: AiChatOptions) {
  // 1ª tentativa: com reasoning_effort=none (para gemini-2.5).
  const body1 = buildGeminiBody(o, { includeThinkingOff: true });
  const r1 = await fetchGemini(key, body1);
  if (r1.ok) return r1;
  // Se falhou com 400 mencionando param inválido de thinking/reasoning, retry
  // limpo — nunca deixe uma incompatibilidade de parâmetro derrubar o provider.
  if (r1.status === 400) {
    const t = await r1.clone().text();
    const looksLikeParamErr = /reasoning_effort|extra_body|unknown\s*field|invalid|unsupported/i.test(t);
    if (looksLikeParamErr) {
      console.warn("[ai-chat] Gemini 400 em param de thinking — retry sem reasoning_effort:", t.slice(0, 300));
      const body2 = buildGeminiBody(o, { includeThinkingOff: false });
      return await fetchGemini(key, body2);
    }
  }
  return r1;
}

/**
 * Ordem de fallback (por decisao do produto):
 *   1. OpenAI (chave do usuario ou admin compartilhada)
 *   2. Gemini (chave do usuario ou admin compartilhada)
 *
 * Falhas de quota/rate/401/5xx acionam o próximo provider automaticamente.
 * Se todos falharem, lança Error com o resumo das tentativas.
 */
export async function aiChat(opts: AiChatOptions): Promise<AiChatResult> {
  const attempts: AiChatResult["attempts"] = [];

  const providers: Array<{ name: "openai" | "gemini"; run: () => Promise<Response> }> = [];
  if (opts.openaiKey) providers.push({ name: "openai", run: () => callOpenAi(opts.openaiKey!, opts) });
  if (opts.geminiKey) providers.push({ name: "gemini", run: () => callGemini(opts.geminiKey!, opts) });

  if (providers.length === 0) {
    throw new Error("Nenhuma chave IA configurada (OpenAI/Gemini). Configure uma chave do cliente ou admin compartilhada.");
  }

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    try {
      const r = await p.run();
      if (r.ok) {
        const j = await r.json();
        const text = (j.choices?.[0]?.message?.content ?? "").toString().trim();
        const finish_reason = j.choices?.[0]?.finish_reason;
        // Resposta truncada por limite de tokens com texto muito curto
        // (Gemini 2.5 consome tokens em "thinking" e devolve fragmento). Trata
        // como falha para acionar failover em vez de retornar lixo ao usuário.
        if (finish_reason === "length" && text.length < 40) {
          attempts.push({ provider: p.name, status: r.status, ok: false, error: "truncated_length_short", finish_reason, length: text.length });
          const isLast = i === providers.length - 1;
          if (isLast) throw new Error(`${p.name.toUpperCase()} truncated: finish_reason=length len=${text.length}`);
          continue;
        }
        attempts.push({ provider: p.name, status: r.status, ok: true, finish_reason, length: text.length });
        return { text, provider: p.name, finish_reason, attempts };
      }
      const t = await r.text();
      attempts.push({ provider: p.name, status: r.status, ok: false, error: t.slice(0, 200) });
      const isLast = i === providers.length - 1;
      if (isLast || !shouldFailover(r.status, t)) {
        throw new Error(`${p.name.toUpperCase()} ${r.status}: ${t.slice(0, 200)}`);
      }
      // continua para próximo provider
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      attempts.push({ provider: p.name, status: 0, ok: false, error: msg.slice(0, 200) });
      const isLast = i === providers.length - 1;
      if (isLast) throw new Error(`Todos os providers IA falharam: ${JSON.stringify(attempts)}`);
    }
  }
  throw new Error(`aiChat esgotou providers: ${JSON.stringify(attempts)}`);
}
