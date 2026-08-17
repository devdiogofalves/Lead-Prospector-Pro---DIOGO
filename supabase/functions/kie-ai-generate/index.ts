// kie-ai-generate - proxy for subscriber media generation.
// Uses subscriber/admin keys resolved by get_ai_key_for_user:
// - OpenAI Images for synchronous image/carousel generation.
// - Kie.ai for reference-image generation, GPT Image-2 jobs and video jobs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateOpenAIImages, getResolvedMediaKeys } from "../_shared/ai-media.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KIE_BASE = "https://api.kie.ai/api/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resp({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return resp({ error: "Unauthenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const type = String(body?.type ?? "image");
    const prompt = String(body?.prompt ?? "").trim();
    const count = Math.max(1, Math.min(10, Number(body?.count ?? 1)));
    const referenceImageUrls: string[] = Array.isArray(body?.reference_image_urls) ? body.reference_image_urls.slice(0, 5) : [];
    const aspectRatio = String(body?.aspect_ratio ?? "1:1");
    if (!prompt && type !== "poll" && type !== "credits") return resp({ error: "prompt obrigatorio" }, 400);

    const keys = await getResolvedMediaKeys(admin, userId);
    // Fallback direto se o RPC nao retornar a chave kie_ai (evita regressao silenciosa)
    let kieKey = keys.kieKey ?? "";
    if (!kieKey) {
      const { data: kieRow } = await admin.from("user_api_keys").select("api_key").eq("user_id", userId).eq("provider", "kie_ai").maybeSingle();
      kieKey = (kieRow?.api_key ?? "").trim();
    }
    const kieHeaders = { Authorization: `Bearer ${kieKey}`, "Content-Type": "application/json", accept: "application/json" };

    async function checkKieCredits(minRequired = 1): Promise<{ ok: boolean; credits: number; error?: string }> {
      if (!kieKey) return { ok: false, credits: 0, error: "Chave Kie.ai nao configurada." };
      try {
        const r = await fetch(`${KIE_BASE}/chat/credit`, { headers: kieHeaders });
        const t = await r.text();
        let j: any = {};
        try { j = JSON.parse(t); } catch { /* keep empty */ }
        if (!r.ok || (typeof j?.code === "number" && j.code !== 200)) {
          if (r.status === 401 || j?.code === 401) {
            return { ok: false, credits: 0, error: "Chave Kie.ai invalida ou revogada. Atualize em Configuracoes > APIs." };
          }
          return { ok: false, credits: 0, error: `Falha ao consultar creditos Kie.ai (${r.status}): ${j?.msg ?? t.slice(0, 200)}` };
        }
        const credits = Number(j?.data ?? 0);
        if (credits < minRequired) {
          return { ok: false, credits, error: `Creditos Kie.ai insuficientes (saldo atual: ${credits}). Recarregue em https://kie.ai/billing.` };
        }
        return { ok: true, credits };
      } catch (e: any) {
        return { ok: false, credits: 0, error: `Erro ao consultar creditos Kie.ai: ${String(e?.message ?? e).slice(0, 200)}` };
      }
    }

    if (type === "credits") {
      const c = await checkKieCredits(0);
      return resp({ success: c.ok, credits: c.credits, error: c.error ?? null });
    }

    if (type === "image" || type === "carousel") {
      const model = String(body?.model ?? "openai-gpt-image");
      const total = type === "carousel" ? Math.max(1, Math.min(count, 4)) : 1;
      const wantsOpenAI = ["openai-gpt-image", "gpt-image-1", "gpt-image-1-mini"].includes(model);

      if (wantsOpenAI && referenceImageUrls.length === 0) {
        if (!keys.openaiKey) {
          return resp({
            success: false,
            needs_key: true,
            error: "Configure OpenAI em Configuracoes > APIs ou ative uma chave OpenAI compartilhada pelo admin para gerar imagens.",
          }, 200);
        }
        try {
          const generated = await generateOpenAIImages({
            admin,
            userId,
            apiKey: keys.openaiKey!,
            prompt,
            count: total,
            aspectRatio,
            model: model === "gpt-image-1-mini" ? "gpt-image-1-mini" : "gpt-image-1",
          });
          return resp({ success: true, async: false, urls: generated.urls, model, engine: "openai-images" });
        } catch (e: any) {
          if (!kieKey) return resp({ success: false, error: String(e?.message ?? e).slice(0, 400) }, 200);
          console.warn(`[kie-ai-generate] OpenAI Images failed, falling back to Kie.ai: ${String(e?.message ?? e).slice(0, 200)}`);
        }
      }

      if (!kieKey) {
        return resp({
          success: false,
          needs_key: true,
          affiliate_url: "https://kie.ai?ref=leadsbooster",
          error: "Configure Kie.ai em Configuracoes > APIs para modelos Kie.ai, imagem com referencia ou fallback de imagem.",
        }, 200);
      }

      const credits = await checkKieCredits(1);
      if (!credits.ok) {
        return resp({ success: false, needs_credits: true, credits: credits.credits, topup_url: "https://kie.ai/billing", error: credits.error }, 200);
      }

      const isI2I = referenceImageUrls.length > 0;
      const input: Record<string, unknown> = { prompt, aspect_ratio: aspectRatio };
      if (isI2I) input.input_urls = referenceImageUrls.slice(0, 16);
      const payload = {
        model: isI2I ? "gpt-image-2-image-to-image" : "gpt-image-2-text-to-image",
        input,
      };
      const r = await fetch(`${KIE_BASE}/jobs/createTask`, { method: "POST", headers: kieHeaders, body: JSON.stringify(payload) });
      const t = await r.text();
      if (!r.ok) return resp({ success: false, error: `Kie.ai GPT Image-2 ${r.status}: ${t.slice(0, 400)}` }, 502);
      let j: any = {};
      try { j = JSON.parse(t); } catch { /* keep empty */ }
      if (typeof j?.code === "number" && j.code !== 200) {
        return resp({ success: false, error: `Kie.ai ${j.code}: ${j?.msg ?? "falha"}`, raw: j }, 200);
      }
      const taskId = j?.data?.taskId ?? j?.taskId ?? j?.task_id;
      if (!taskId) return resp({ success: false, error: "GPT Image-2 sem taskId", raw: j }, 200);
      return resp({ success: true, async: true, task_id: taskId, type, model: "gpt-image-2", engine: "gpt-image-2" });
    }

    if (type === "video") {
      if (!kieKey) {
        return resp({
          success: false,
          needs_key: true,
          affiliate_url: "https://kie.ai?ref=leadsbooster",
          error: "Configure Kie.ai em Configuracoes > APIs para gerar videos.",
        }, 200);
      }
      const credits = await checkKieCredits(10);
      if (!credits.ok) {
        return resp({ success: false, needs_credits: true, credits: credits.credits, topup_url: "https://kie.ai/billing", error: credits.error }, 200);
      }

      const model = String(body?.model ?? "gemini-omni-video");
      const duration = String(body?.duration ?? "10");
      const aspectVideo = aspectRatio === "9:16" ? "9:16" : "16:9";

      if (model === "veo3" || model === "veo3_fast") {
        const payload: Record<string, unknown> = { prompt, model, aspectRatio: aspectVideo };
        if (referenceImageUrls.length > 0) payload.imageUrls = referenceImageUrls;
        const r = await fetch(`${KIE_BASE}/veo/generate`, { method: "POST", headers: kieHeaders, body: JSON.stringify(payload) });
        const t = await r.text();
        if (!r.ok) return resp({ success: false, error: `Kie.ai video ${r.status}: ${t.slice(0, 400)}` }, 502);
        let j: Record<string, unknown> = {};
        try { j = JSON.parse(t); } catch { /* keep empty */ }
        const data = (j?.data as Record<string, unknown> | undefined) ?? {};
        const taskId = (data.taskId ?? j.taskId) as string | undefined;
        return resp({ success: true, async: true, task_id: taskId, type, model, engine: "veo", raw: j });
      }

      const input: Record<string, unknown> = { prompt, duration, aspect_ratio: aspectVideo };
      if (referenceImageUrls.length > 0) input.image_urls = referenceImageUrls.slice(0, 7);
      const payload = { model: "gemini-omni-video", input };
      const r = await fetch(`${KIE_BASE}/jobs/createTask`, { method: "POST", headers: kieHeaders, body: JSON.stringify(payload) });
      const t = await r.text();
      if (!r.ok) return resp({ success: false, error: `Kie.ai Omni ${r.status}: ${t.slice(0, 400)}` }, 502);
      let j: Record<string, unknown> = {};
      try { j = JSON.parse(t); } catch { /* keep empty */ }
      if (typeof (j as any)?.code === "number" && (j as any).code !== 200) {
        return resp({ success: false, error: `Kie.ai Omni ${(j as any).code}: ${(j as any)?.msg ?? "falha"}`, raw: j }, 200);
      }
      const data = (j?.data as Record<string, unknown> | undefined) ?? {};
      const taskId = (data.taskId ?? (j as any).taskId) as string | undefined;
      return resp({ success: true, async: true, task_id: taskId, type, model: "gemini-omni-video", engine: "omni", raw: j });
    }

    if (type === "poll") {
      if (!kieKey) return resp({ success: false, needs_key: true, error: "Configure Kie.ai em Configuracoes > APIs para consultar tarefas." }, 200);
      const taskId = String(body?.task_id ?? "");
      const which = String(body?.kind ?? "image");
      const engine = String(body?.engine ?? (which === "video" ? "omni" : "image"));
      const endpoint = engine === "veo"
        ? `${KIE_BASE}/veo/record-info?taskId=${taskId}`
        : (engine === "omni" || engine === "gpt-image-2" || engine === "jobs")
          ? `${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`
          : `${KIE_BASE}/gpt4o-image/record-info?taskId=${taskId}`;

      const r = await fetch(endpoint, { headers: kieHeaders });
      const t = await r.text();
      if (!r.ok) return resp({ success: false, error: `Kie.ai poll ${r.status}: ${t.slice(0, 400)}` }, 502);
      let j: any = {};
      try { j = JSON.parse(t); } catch { /* keep empty */ }
      const d = j?.data ?? {};
      const status = d.state ?? d.status ?? d.successFlag ?? j?.status ?? "PENDING";
      const resultJson = typeof d.resultJson === "string"
        ? (() => { try { return JSON.parse(d.resultJson); } catch { return {}; } })()
        : typeof d.response === "string"
          ? (() => { try { return JSON.parse(d.response); } catch { return {}; } })()
          : (d.response ?? d.resultJson ?? {});
      const urls: string[] = [
        ...(Array.isArray(resultJson?.resultUrls) ? resultJson.resultUrls : []),
        ...(Array.isArray(resultJson?.result_urls) ? resultJson.result_urls : []),
        ...(Array.isArray(resultJson?.videoUrls) ? resultJson.videoUrls : []),
        ...(Array.isArray(d?.info?.result_urls) ? d.info.result_urls : []),
        ...(Array.isArray(d.resultUrls) ? d.resultUrls : []),
        ...(Array.isArray(d.result_urls) ? d.result_urls : []),
        ...(Array.isArray(d.urls) ? d.urls : []),
        ...(d.videoUrl ? [d.videoUrl] : []),
        ...(resultJson?.videoUrl ? [resultJson.videoUrl] : []),
      ].filter(Boolean);
      const failed = String(status).toLowerCase() === "fail" || String(status).toUpperCase().includes("FAIL") || d.failMsg || d.errorMessage;
      return resp({ success: !failed, status, urls, error: d.failMsg ?? d.errorMessage ?? null, raw: j });
    }

    return resp({ error: "type invalido (image|carousel|video|poll|credits)" }, 400);
  } catch (e: any) {
    return resp({ error: String(e?.message ?? e).slice(0, 400) }, 500);
  }
});
