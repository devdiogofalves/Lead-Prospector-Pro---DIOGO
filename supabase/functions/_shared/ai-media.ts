export type MediaKeys = {
  openaiKey?: string;
  geminiKey?: string;
  kieKey?: string;
};

export async function getResolvedMediaKeys(admin: any, userId: string): Promise<MediaKeys> {
  try {
    const [{ data: ok }, { data: gk }, { data: kk }] = await Promise.all([
      admin.rpc("get_ai_key_for_user", { _user_id: userId, _provider: "openai" }),
      admin.rpc("get_ai_key_for_user", { _user_id: userId, _provider: "gemini" }),
      admin.rpc("get_ai_key_for_user", { _user_id: userId, _provider: "kie_ai" }),
    ]);
    return {
      openaiKey: String(ok ?? "").trim() || undefined,
      geminiKey: String(gk ?? "").trim() || undefined,
      kieKey: String(kk ?? "").trim() || undefined,
    };
  } catch {
    return {};
  }
}

function aspectToOpenAiSize(aspectRatio: string): string {
  const ratio = String(aspectRatio || "1:1");
  if (ratio === "16:9" || ratio === "3:2") return "1536x1024";
  if (ratio === "9:16" || ratio === "4:5" || ratio === "3:4" || ratio === "2:3") return "1024x1536";
  return "1024x1024";
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.startsWith("data:") ? b64.split(",")[1] : b64;
  return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
}

import { uploadWithRetry } from "./storage-retry.ts";

async function storeImage(admin: any, userId: string, bytes: Uint8Array, contentType = "image/png"): Promise<string | null> {
  const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
  const path = `${userId}/generated/${Date.now()}_${crypto.randomUUID()}.${ext}`;
  const up = await uploadWithRetry(admin, "social-assets", path, bytes, { contentType, upsert: false });
  if (up.error) throw new Error(`Upload da imagem: ${up.error.message} (após ${up.attempts} tentativa(s))`);
  const { data: signed } = await admin.storage.from("social-assets").createSignedUrl(path, 60 * 60 * 24 * 30);
  return signed?.signedUrl ?? null;
}

export async function generateOpenAIImages(opts: {
  admin: any;
  userId: string;
  apiKey: string;
  prompt: string;
  count?: number;
  aspectRatio?: string;
  model?: string;
}): Promise<{ urls: string[]; raw?: any }> {
  const count = Math.max(1, Math.min(Number(opts.count ?? 1), 4));
  const body: Record<string, unknown> = {
    model: opts.model || "gpt-image-1",
    prompt: opts.prompt,
    size: aspectToOpenAiSize(opts.aspectRatio ?? "1:1"),
    n: count,
  };

  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (!r.ok) throw new Error(`OpenAI Images ${r.status}: ${text.slice(0, 400)}`);

  const urls: string[] = [];
  for (const item of parsed?.data ?? []) {
    if (item?.b64_json) {
      const signed = await storeImage(opts.admin, opts.userId, base64ToBytes(item.b64_json), "image/png");
      if (signed) urls.push(signed);
      continue;
    }
    if (item?.url) {
      const img = await fetch(item.url);
      if (img.ok) {
        const contentType = img.headers.get("content-type") || "image/png";
        const signed = await storeImage(opts.admin, opts.userId, new Uint8Array(await img.arrayBuffer()), contentType);
        if (signed) urls.push(signed);
      } else {
        urls.push(item.url);
      }
    }
  }
  if (urls.length === 0) throw new Error("OpenAI nao retornou imagem utilizavel.");
  return { urls, raw: parsed };
}

