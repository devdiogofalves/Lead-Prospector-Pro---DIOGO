import { supabase } from "@/integrations/supabase/client";

// Buckets que passaram a ser privados. Precisamos gerar signed URL na leitura
// para não quebrar áudios/anexos já salvos com URL pública ou assinaturas antigas.
const PRIVATE_BUCKETS = new Set(["disparos-audio", "qualificacao-audio", "support-attachments"]);

// Extrai { bucket, path } de uma URL do Supabase Storage (pública OU assinada).
export function parseStorageUrl(url: string | null | undefined): { bucket: string; path: string } | null {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?]+)/);
  if (!m) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2]) };
}

// Retorna signed URL (1h) se a URL apontar para um bucket privado. Caso contrário,
// devolve a própria URL. Silencioso em erro para não quebrar renderização.
export async function signStoredMediaUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const parsed = parseStorageUrl(url);
  if (!parsed || !PRIVATE_BUCKETS.has(parsed.bucket)) return url;
  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, 60 * 60);
  if (error || !data?.signedUrl) return url;
  return data.signedUrl;
}
