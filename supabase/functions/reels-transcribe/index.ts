// reels-transcribe — recebe áudio/vídeo (multipart file OU url) e retorna
// transcript com timing por palavra usando OpenAI STT.
// Body opções:
//   1) multipart/form-data com "file" (blob)
//   2) JSON { video_url: string }  → baixa e envia
// Retorna: { ok, text, words: [{word, start, end}], duration_s }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getResolvedMediaKeys } from "../_shared/ai-media.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return json({ error: "Unauthenticated" }, 401);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const keys = await getResolvedMediaKeys(admin, userId);
    if (!keys.openaiKey) {
      return json({
        error: "Configure OpenAI em Configuracoes > APIs ou ative uma chave OpenAI compartilhada pelo admin para transcrever audios.",
      }, 400);
    }

    const ct = req.headers.get("content-type") ?? "";
    let file: File | null = null;
    let filename = "audio.webm";

    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      const f = fd.get("file");
      if (f instanceof File) { file = f; filename = f.name || filename; }
    } else {
      const body = await req.json().catch(() => ({}));
      const url = String(body?.video_url ?? "").trim();
      if (!url) return json({ error: "video_url ou file obrigatório" }, 400);
      const r = await fetch(url);
      if (!r.ok) return json({ error: `download falhou: ${r.status}` }, 400);
      const blob = await r.blob();
      const ext = (url.split("?")[0].split(".").pop() ?? "mp4").toLowerCase();
      filename = `input.${ext}`;
      file = new File([blob], filename, { type: blob.type || "video/mp4" });
    }
    if (!file) return json({ error: "arquivo não recebido" }, 400);
    if (file.size < 1024) return json({ error: "arquivo muito curto/vazio" }, 400);

    const upstream = new FormData();
    upstream.append("model", "gpt-4o-mini-transcribe");
    upstream.append("file", file, filename);
    upstream.append("response_format", "verbose_json");
    upstream.append("timestamp_granularities[]", "word");

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${keys.openaiKey}` },
      body: upstream,
    });
    const txt = await r.text();
    if (!r.ok) {
      // fallback: sem verbose_json/word timings → simple json
      const upstream2 = new FormData();
      upstream2.append("model", "gpt-4o-mini-transcribe");
      upstream2.append("file", file, filename);
      const r2 = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${keys.openaiKey}` },
        body: upstream2,
      });
      const t2 = await r2.text();
      if (!r2.ok) return json({ error: `STT ${r2.status}: ${t2.slice(0,300)}` }, 502);
      const p2 = JSON.parse(t2);
      const text = String(p2?.text ?? "").trim();
      // sintetiza timing evenly (0..duration) — cliente pode passar duração real depois
      const tokens = text.split(/\s+/).filter(Boolean);
      const dur = 0;
      const step = tokens.length > 0 ? 1 : 0;
      const words = tokens.map((w, i) => ({ word: w, start: i * step, end: (i + 1) * step }));
      return json({ ok: true, text, words, duration_s: dur, synthetic: true });
    }

    const parsed = JSON.parse(txt);
    const text: string = parsed?.text ?? "";
    const wArr = Array.isArray(parsed?.words) ? parsed.words : [];
    const words = wArr.map((w: any) => ({
      word: String(w.word ?? w.text ?? "").trim(),
      start: Number(w.start ?? 0),
      end: Number(w.end ?? 0),
    })).filter((w: any) => w.word);
    const dur = Number(parsed?.duration ?? (words.at(-1)?.end ?? 0));
    return json({ ok: true, text, words, duration_s: dur });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
