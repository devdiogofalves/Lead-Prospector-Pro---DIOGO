import { supabase } from "@/integrations/supabase/client";

// Retry com backoff exponencial para uploads no Supabase Storage (Lovable Cloud).
// Reintenta apenas erros transitórios (rede, 5xx, 429, timeout). Erros determinísticos
// (arquivo duplicado, payload inválido, permissão) falham na primeira tentativa.

export type UploadWithRetryOptions = {
  contentType?: string;
  upsert?: boolean;
  maxAttempts?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
};

const TRANSIENT_HINTS = [
  "fetch", "network", "timeout", "timed out", "socket",
  "econnreset", "aborted", "load failed", "temporarily",
];

function isTransient(err: any): boolean {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  const status = Number(err?.statusCode ?? err?.status ?? 0);
  if (status >= 500 && status < 600) return true;
  if (status === 429) return true;
  if (!status && TRANSIENT_HINTS.some((h) => msg.includes(h))) return true;
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function uploadToStorageWithRetry(
  bucket: string,
  path: string,
  file: File | Blob | ArrayBuffer | Uint8Array,
  opts: UploadWithRetryOptions = {},
) {
  const max = Math.max(1, opts.maxAttempts ?? 4);
  const base = Math.max(100, opts.baseDelayMs ?? 400);
  let lastErr: any = null;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      const res = await supabase.storage.from(bucket).upload(path, file as any, {
        upsert: opts.upsert ?? true,
        contentType: opts.contentType,
      });
      if (!res.error) return { data: res.data, error: null, attempts: attempt };
      lastErr = res.error;
      if (!isTransient(res.error) || attempt === max) {
        return { data: null, error: res.error, attempts: attempt };
      }
    } catch (e) {
      lastErr = e;
      if (!isTransient(e) || attempt === max) {
        return { data: null, error: e, attempts: attempt };
      }
    }
    const delay = base * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
    opts.onRetry?.(attempt, delay, lastErr);
    await sleep(delay);
  }
  return { data: null, error: lastErr, attempts: max };
}
