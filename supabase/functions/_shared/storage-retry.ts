// Retry com backoff exponencial para uploads no Supabase Storage (Lovable Cloud).
// Uso: await uploadWithRetry(admin, "bucket", path, bytes, { contentType });
// Reintenta erros transitórios (rede, 5xx, timeout) até `maxAttempts`.
// Não reintenta erros determinísticos (409 duplicate, 400 payload, 401/403).

export type UploadOptions = {
  contentType?: string;
  upsert?: boolean;
  maxAttempts?: number;
  baseDelayMs?: number;
};

const TRANSIENT_HINTS = [
  "fetch failed", "network", "timeout", "timed out", "socket",
  "econnreset", "eai_again", "aborted", "temporarily",
];

function isTransient(err: any): boolean {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  const status = Number(err?.statusCode ?? err?.status ?? 0);
  if (status >= 500 && status < 600) return true;
  if (status === 429) return true;
  if (TRANSIENT_HINTS.some((h) => msg.includes(h))) return true;
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function uploadWithRetry(
  admin: any,
  bucket: string,
  path: string,
  body: Uint8Array | Blob | ArrayBuffer | File,
  opts: UploadOptions = {},
): Promise<{ data: any; error: any; attempts: number }> {
  const max = Math.max(1, opts.maxAttempts ?? 4);
  const base = Math.max(100, opts.baseDelayMs ?? 400);
  let lastErr: any = null;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      const res = await admin.storage.from(bucket).upload(path, body, {
        contentType: opts.contentType,
        upsert: opts.upsert ?? false,
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
    console.warn(`[storage-retry] ${bucket}/${path} attempt ${attempt} failed, retrying in ${delay}ms:`, lastErr?.message ?? lastErr);
    await sleep(delay);
  }
  return { data: null, error: lastErr, attempts: max };
}
