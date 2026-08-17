// social-assets-upload — upload de referências visuais (logo, avatar UGC, templates).
// Body: multipart form-data { file, kind, label?, is_default? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { uploadWithRetry } from "../_shared/storage-retry.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_KINDS = ["feed_template","carousel_template","mood","ugc_avatar","logo"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resp({ error: "Method not allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: auth } } });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return resp({ error: "Unauthenticated" }, 401);

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const kind = String(form.get("kind") ?? "");
    const label = (form.get("label") as string | null) ?? null;
    const isDefault = String(form.get("is_default") ?? "false") === "true";

    if (!file) return resp({ error: "file obrigatório" }, 400);
    if (!ALLOWED_KINDS.includes(kind)) return resp({ error: `kind inválido (${ALLOWED_KINDS.join("|")})` }, 400);
    if (file.size > 15 * 1024 * 1024) return resp({ error: "Arquivo > 15MB" }, 400);

    const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
    const path = `${userId}/${kind}/${Date.now()}_${crypto.randomUUID()}.${ext}`;
    const buf = new Uint8Array(await file.arrayBuffer());
    const up = await uploadWithRetry(admin, "social-assets", path, buf, { contentType: file.type, upsert: false });
    if (up.error) return resp({ error: `Upload: ${up.error.message} (após ${up.attempts} tentativa(s))` }, 500);

    // signed URL longa (7 dias) — Kie.ai precisa baixar a referência
    const { data: signed } = await admin.storage.from("social-assets").createSignedUrl(path, 60 * 60 * 24 * 7);

    if (isDefault) {
      await admin.from("social_brand_assets").update({ is_default: false }).eq("user_id", userId).eq("kind", kind);
    }

    const { data: row, error } = await admin.from("social_brand_assets").insert({
      user_id: userId, kind, storage_path: path, public_url: signed?.signedUrl ?? null, label, is_default: isDefault,
    }).select().single();
    if (error) return resp({ error: error.message }, 500);

    return resp({ success: true, asset: row });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return resp({ error: msg.slice(0, 400) }, 500);
  }
});
