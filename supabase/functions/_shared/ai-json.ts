// Shared helper for TEXT/JSON generation in content functions.
// Resolves tenant OpenAI/Gemini keys first, then admin-shared keys through
// get_ai_key_for_user. Lovable AI Gateway is not used in subscriber runtime.

import { aiChat } from "./ai-chat.ts";

export async function generateAIContent(
  admin: any,
  userId: string,
  opts: {
    system: string;
    user: string;
    json?: boolean;
    maxTokens?: number;
    temperature?: number;
    openaiModel?: string;
    geminiModel?: string;
  },
): Promise<string> {
  const [{ data: ok }, { data: gk }] = await Promise.all([
    admin.rpc("get_ai_key_for_user", { _user_id: userId, _provider: "openai" }),
    admin.rpc("get_ai_key_for_user", { _user_id: userId, _provider: "gemini" }),
  ]);
  const out = await aiChat({
    openaiKey: (ok as string) || undefined,
    geminiKey: (gk as string) || undefined,
    openaiModel: opts.openaiModel,
    geminiModel: opts.geminiModel,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
  });
  return out.text || "";
}
