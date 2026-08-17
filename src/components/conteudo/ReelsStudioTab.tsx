import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, Sparkles, Video as VideoIcon, Download, Save, Type } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CAROUSEL_FONTS } from "@/lib/carouselFonts";

type Word = { word: string; start: number; end: number };
type CaptionStyle = {
  mode: "wordByWord" | "karaoke";
  font: string;
  fontSize: number;
  color: string;
  highlight: string;
  bg: "none" | "black" | "brand";
  positionY: number; // 0..1 (fração da altura)
  stroke: boolean;
};

const DEFAULT_STYLE: CaptionStyle = {
  mode: "wordByWord",
  font: "Bebas Neue",
  fontSize: 72,
  color: "#FFFFFF",
  highlight: "#22D3EE",
  bg: "black",
  positionY: 0.78,
  stroke: true,
};

export default function ReelsStudioTab() {
  const [mode, setMode] = useState<"upload" | "ai">("upload");

  // Upload state
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [words, setWords] = useState<Word[]>([]);
  const [text, setText] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [style, setStyle] = useState<CaptionStyle>(DEFAULT_STYLE);
  const [rendering, setRendering] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState<string>("");

  // AI-gen state
  const [theme, setTheme] = useState("");
  const [aiDuration, setAiDuration] = useState(15);
  const [aiStyle, setAiStyle] = useState("hook_viral");
  const [aiCta, setAiCta] = useState("Link na bio");
  const [aiScript, setAiScript] = useState<any>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [, setAiVideoTaskId] = useState<string>("");
  const [aiVideoPolling, setAiVideoPolling] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [curTime, setCurTime] = useState(0);

  // Sync video time → curTime
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const on = () => setCurTime(v.currentTime);
    v.addEventListener("timeupdate", on);
    return () => v.removeEventListener("timeupdate", on);
  }, [videoUrl]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("video/")) return toast.error("Envie um arquivo de vídeo");
    if (f.size > 100 * 1024 * 1024) return toast.error("Máximo 100 MB");
    setVideoBlob(f);
    setVideoUrl(URL.createObjectURL(f));
    setWords([]); setText(""); setRenderedUrl("");
  }

  async function transcribe() {
    if (!videoBlob) return toast.error("Nenhum vídeo carregado");
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("file", videoBlob, "video.mp4");
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const r = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reels-transcribe`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Falha transcrição");
      let ws: Word[] = j.words ?? [];
      // Se sintético (sem timing), distribui pela duração real do vídeo
      if (j.synthetic && duration > 0 && ws.length > 0) {
        const step = duration / ws.length;
        ws = ws.map((w, i) => ({ word: w.word, start: i * step, end: (i + 1) * step }));
      }
      setWords(ws);
      setText(j.text ?? "");
      toast.success(`${ws.length} palavras transcritas`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTranscribing(false);
    }
  }

  // Overlay renderer (por tempo atual)
  function activeCaption() {
    if (!words.length) return null;
    if (style.mode === "wordByWord") {
      const w = words.find((x) => curTime >= x.start && curTime < x.end);
      return w ? { text: w.word.toUpperCase(), highlight: -1, tokens: [] } : null;
    }
    // karaoke — linha de ~7 palavras em torno do índice ativo
    const idx = words.findIndex((x) => curTime >= x.start && curTime < x.end);
    if (idx < 0) return null;
    const from = Math.max(0, idx - 3), to = Math.min(words.length, idx + 4);
    const line = words.slice(from, to);
    return {
      text: line.map((w) => w.word).join(" ").toUpperCase(),
      highlight: idx - from,
      tokens: line.map((w) => w.word.toUpperCase()),
    };
  }

  async function renderVideo() {
    if (!videoRef.current || !words.length) return toast.error("Faça a transcrição primeiro");
    setRendering(true); setRenderedUrl("");
    try {
      const v = videoRef.current;
      const w = v.videoWidth, h = v.videoHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;

      // Captura streams
      const canvasStream = canvas.captureStream(30);
      // deno-lint-ignore no-explicit-any
      const videoStream = (v as any).captureStream?.() as MediaStream | undefined;
      const audioTrack = videoStream?.getAudioTracks?.()[0];
      if (audioTrack) canvasStream.addTrack(audioTrack);

      const mime = MediaRecorder.isTypeSupported("video/mp4")
        ? "video/mp4"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const rec = new MediaRecorder(canvasStream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise<Blob>((res) => (rec.onstop = () => res(new Blob(chunks, { type: mime }))));

      // Play + draw loop
      v.currentTime = 0;
      await v.play();
      rec.start();

      let raf = 0;
      const draw = () => {
        ctx.drawImage(v, 0, 0, w, h);
        drawCaption(ctx, v.currentTime, w, h, style, words);
        if (!v.ended) raf = requestAnimationFrame(draw);
      };
      draw();

      await new Promise<void>((res) => {
        v.onended = () => { cancelAnimationFrame(raf); rec.stop(); res(); };
      });

      const blob = await done;
      // Upload
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? "anon";
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      const path = `${uid}/reels/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("social-assets").upload(path, blob, {
        contentType: mime, upsert: true,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("social-assets").getPublicUrl(path);
      setRenderedUrl(pub.publicUrl);
      toast.success("Reel renderizado!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRendering(false);
    }
  }

  async function savePost() {
    if (!renderedUrl && !videoUrl) return toast.error("Renderize primeiro");
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return toast.error("Sem sessão");
    const { error } = await supabase.from("social_posts").insert({
      user_id: uid,
      channel: "instagram",
      post_format: "reels",
      status: "draft",
      caption: text,
      media_urls: renderedUrl ? [renderedUrl] : [videoUrl],
      reel_captions: words as any,
      reel_caption_style: style as any,
      reel_source_url: videoUrl,
      reel_rendered_url: renderedUrl || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Salvo em rascunhos");
  }

  // AI generation
  async function generateAi() {
    if (!theme.trim()) return toast.error("Digite o tema");
    setAiGenerating(true); setAiScript(null); setAiVideoTaskId("");
    try {
      const { data, error } = await supabase.functions.invoke("social-reels-script", {
        body: { theme, duration: aiDuration, style: aiStyle, cta: aiCta },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setAiScript((data as any).script);
      toast.success("Roteiro gerado! Agora gerando vídeo com Gemini Omni…");

      // Vídeo com IA — chama kie-ai-generate (async)
      const scenesText = ((data as any).script?.scenes ?? []).map((s: any) => `${s.fala} — ${s.acao}`).join(" | ");
      const prompt = `${theme}. ${scenesText}. Style: vertical 9:16, ${aiStyle}, professional, brand-safe.`;
      const { data: vid, error: vErr } = await supabase.functions.invoke("kie-ai-generate", {
        body: { type: "video", prompt, model: "gemini-omni-video" },
      });
      if (vErr) throw vErr;
      if ((vid as any)?.task_id) {
        setAiVideoTaskId((vid as any).task_id);
        pollVideo((vid as any).task_id);
      } else if ((vid as any)?.error) {
        toast.error("Vídeo IA: " + (vid as any).error);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAiGenerating(false);
    }
  }

  async function pollVideo(taskId: string) {
    setAiVideoPolling(true);
    try {
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const { data } = await supabase.functions.invoke("kie-ai-generate", {
          body: { type: "poll", task_id: taskId, kind: "video", engine: "omni" },
        });
        const urls = (data as any)?.urls ?? [];
        if (urls.length > 0) {
          const url = urls[0];
          // baixa como blob para poder legendar
          const r = await fetch(url);
          const blob = await r.blob();
          setVideoBlob(blob);
          setVideoUrl(URL.createObjectURL(blob));
          setMode("upload");
          toast.success("Vídeo IA pronto! Agora transcreva para adicionar legendas.");
          return;
        }
      }
      toast.error("Timeout aguardando vídeo IA");
    } finally {
      setAiVideoPolling(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <VideoIcon className="h-5 w-5 text-primary" /> Estúdio de Reels IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-2" />Upload de vídeo</TabsTrigger>
              <TabsTrigger value="ai"><Sparkles className="h-4 w-4 mr-2" />Gerar com IA</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-3 mt-4">
              <Input type="file" accept="video/*" onChange={onUpload} />
              {videoUrl && (
                <Button onClick={transcribe} disabled={transcribing} className="gap-2">
                  {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Type className="h-4 w-4" />}
                  {transcribing ? "Transcrevendo…" : "Transcrever com IA"}
                </Button>
              )}
            </TabsContent>

            <TabsContent value="ai" className="space-y-3 mt-4">
              <div>
                <Label>Tema</Label>
                <Textarea rows={2} value={theme} onChange={(e) => setTheme(e.target.value)}
                  placeholder="Ex: 3 erros que fazem seu Instagram não vender" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Duração</Label>
                  <Select value={String(aiDuration)} onValueChange={(v) => setAiDuration(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15s</SelectItem>
                      <SelectItem value="30">30s</SelectItem>
                      <SelectItem value="60">60s</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Estilo</Label>
                  <Select value={aiStyle} onValueChange={setAiStyle}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hook_viral">Hook Viral</SelectItem>
                      <SelectItem value="tutorial">Tutorial</SelectItem>
                      <SelectItem value="storytelling">Storytelling</SelectItem>
                      <SelectItem value="depoimento">Depoimento</SelectItem>
                      <SelectItem value="polemico">Polêmico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>CTA</Label>
                  <Input value={aiCta} onChange={(e) => setAiCta(e.target.value)} />
                </div>
              </div>
              <Button onClick={generateAi} disabled={aiGenerating || aiVideoPolling} className="gap-2">
                {(aiGenerating || aiVideoPolling) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {aiGenerating ? "Gerando roteiro…" : aiVideoPolling ? "Renderizando vídeo IA…" : "Gerar Reel"}
              </Button>
              {aiScript && (
                <div className="mt-3 p-3 rounded-lg border bg-muted/30 text-xs space-y-2 max-h-64 overflow-y-auto">
                  <div><b>Hook:</b> {aiScript.hook}</div>
                  {(aiScript.scenes ?? []).map((s: any, i: number) => (
                    <div key={i}><b>{s.t}:</b> {s.fala}<br /><span className="text-muted-foreground">{s.acao}</span></div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {videoUrl && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          {/* Preview */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Preview</CardTitle></CardHeader>
            <CardContent>
              <div className="relative w-full mx-auto" style={{ maxWidth: 360 }}>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  className="w-full rounded-lg bg-black"
                  onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration)}
                  style={{ aspectRatio: "9/16", objectFit: "cover" }}
                />
                {/* Overlay */}
                <div ref={overlayRef}
                  className="absolute inset-x-0 flex justify-center pointer-events-none px-4"
                  style={{ top: `${style.positionY * 100}%`, transform: "translateY(-50%)" }}
                >
                  {(() => {
                    const cap = activeCaption();
                    if (!cap) return null;
                    const baseStyle: React.CSSProperties = {
                      fontFamily: `"${style.font}", sans-serif`,
                      fontSize: `${style.fontSize / 3}px`, // preview escala
                      fontWeight: 900,
                      lineHeight: 1.1,
                      textAlign: "center",
                      WebkitTextStroke: style.stroke ? "2px black" : undefined,
                      padding: style.bg !== "none" ? "6px 12px" : undefined,
                      background: style.bg === "black" ? "rgba(0,0,0,0.7)"
                        : style.bg === "brand" ? style.highlight : "transparent",
                      color: style.color,
                      borderRadius: 6,
                    };
                    if (style.mode === "wordByWord") {
                      return <div style={baseStyle}>{cap.text}</div>;
                    }
                    return (
                      <div style={baseStyle}>
                        {cap.tokens.map((t, i) => (
                          <span key={i} style={{ color: i === cap.highlight ? style.highlight : style.color, marginRight: 6 }}>{t}</span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="flex gap-2 mt-3 flex-wrap">
                <Button onClick={renderVideo} disabled={rendering || !words.length} className="gap-2">
                  {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <VideoIcon className="h-4 w-4" />}
                  {rendering ? "Renderizando…" : "Renderizar com legendas"}
                </Button>
                {renderedUrl && (
                  <>
                    <Button variant="outline" asChild className="gap-2">
                      <a href={renderedUrl} download target="_blank" rel="noreferrer"><Download className="h-4 w-4" />Baixar</a>
                    </Button>
                    <Button variant="secondary" onClick={savePost} className="gap-2">
                      <Save className="h-4 w-4" />Salvar em Rascunhos
                    </Button>
                  </>
                )}
              </div>
              {text && <p className="mt-3 text-xs text-muted-foreground line-clamp-3"><b>Transcript:</b> {text}</p>}
            </CardContent>
          </Card>

          {/* Style panel */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Estilo das legendas</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Estilo</Label>
                <RadioGroup value={style.mode} onValueChange={(v) => setStyle({ ...style, mode: v as any })}>
                  <div className="flex items-center gap-2"><RadioGroupItem value="wordByWord" id="wbw" /><Label htmlFor="wbw" className="text-xs">Palavra por palavra (Submagic)</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="karaoke" id="kar" /><Label htmlFor="kar" className="text-xs">Frase/Karaokê</Label></div>
                </RadioGroup>
              </div>
              <div>
                <Label>Fonte</Label>
                <Select value={style.font} onValueChange={(v) => setStyle({ ...style, font: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CAROUSEL_FONTS.map((f) => (
                      <SelectItem key={f.id} value={f.family} style={{ fontFamily: f.family }}>{f.family}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tamanho: {style.fontSize}px</Label>
                <Slider min={32} max={140} step={4} value={[style.fontSize]}
                  onValueChange={([v]) => setStyle({ ...style, fontSize: v })} />
              </div>
              <div>
                <Label>Posição vertical: {Math.round(style.positionY * 100)}%</Label>
                <Slider min={10} max={95} step={1} value={[style.positionY * 100]}
                  onValueChange={([v]) => setStyle({ ...style, positionY: v / 100 })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Cor texto</Label>
                  <Input type="color" value={style.color} onChange={(e) => setStyle({ ...style, color: e.target.value })} />
                </div>
                <div>
                  <Label>Destaque</Label>
                  <Input type="color" value={style.highlight} onChange={(e) => setStyle({ ...style, highlight: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Fundo</Label>
                <Select value={style.bg} onValueChange={(v) => setStyle({ ...style, bg: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem fundo</SelectItem>
                    <SelectItem value="black">Preto translúcido</SelectItem>
                    <SelectItem value="brand">Cor da marca</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Canvas drawing for MediaRecorder export
function drawCaption(
  ctx: CanvasRenderingContext2D,
  t: number, w: number, h: number,
  style: CaptionStyle, words: Word[],
) {
  ctx.save();
  const size = style.fontSize;
  ctx.font = `900 ${size}px "${style.font}", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const y = h * style.positionY;

  if (style.mode === "wordByWord") {
    const wr = words.find((x) => t >= x.start && t < x.end);
    if (!wr) { ctx.restore(); return; }
    drawTextBox(ctx, wr.word.toUpperCase(), w / 2, y, style);
  } else {
    const idx = words.findIndex((x) => t >= x.start && t < x.end);
    if (idx < 0) { ctx.restore(); return; }
    const from = Math.max(0, idx - 3), to = Math.min(words.length, idx + 4);
    const line = words.slice(from, to).map((wo) => wo.word.toUpperCase());
    const activeI = idx - from;
    // Mede
    const spaces = ctx.measureText(" ").width;
    const widths = line.map((tk) => ctx.measureText(tk).width);
    const total = widths.reduce((a, b) => a + b, 0) + spaces * (line.length - 1);
    let x = w / 2 - total / 2;
    // Fundo geral
    if (style.bg !== "none") {
      const bg = style.bg === "black" ? "rgba(0,0,0,0.75)" : style.highlight;
      ctx.fillStyle = bg;
      const pad = 20;
      ctx.fillRect(w / 2 - total / 2 - pad, y - size / 2 - 8, total + pad * 2, size + 16);
    }
    line.forEach((tk, i) => {
      const cx = x + widths[i] / 2;
      ctx.fillStyle = i === activeI ? style.highlight : style.color;
      if (style.stroke) { ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.strokeText(tk, cx, y); }
      ctx.fillText(tk, cx, y);
      x += widths[i] + spaces;
    });
  }
  ctx.restore();
}

function drawTextBox(ctx: CanvasRenderingContext2D, txt: string, cx: number, cy: number, style: CaptionStyle) {
  const m = ctx.measureText(txt);
  const pad = 24;
  const boxW = m.width + pad * 2;
  const boxH = style.fontSize + 20;
  if (style.bg !== "none") {
    ctx.fillStyle = style.bg === "black" ? "rgba(0,0,0,0.75)" : style.highlight;
    ctx.fillRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);
  }
  if (style.stroke) {
    ctx.lineWidth = 6; ctx.strokeStyle = "#000";
    ctx.strokeText(txt, cx, cy);
  }
  ctx.fillStyle = style.color;
  ctx.fillText(txt, cx, cy);
}
