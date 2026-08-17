import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserApiKeys } from "@/hooks/useUserApiKeys";
import { Sparkles, Calendar, BarChart3, Bot, Layers, Send, Trash2, ExternalLink, KeyRound, Wand2, Zap, Instagram, Package, Activity, Film } from "lucide-react";
import AutoEngajamentoTab from "@/components/conteudo/AutoEngajamentoTab";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import CalendarioTab from "@/components/conteudo/CalendarioTab";
import BrandKitTab from "@/components/conteudo/BrandKitTab";
import ProdutosTab from "@/components/conteudo/ProdutosTab";
import DiagnosticoTab from "@/components/conteudo/DiagnosticoTab";
import InsightsTab from "@/components/conteudo/InsightsTab";
import TemplatesTab from "@/components/conteudo/TemplatesTab";
import ReelsStudioTab from "@/components/conteudo/ReelsStudioTab";

type Channel = "linkedin" | "instagram" | "threads";
type MediaType = "text" | "image" | "carousel" | "video";
type PostFormat = "feed" | "stories" | "reels" | "carousel";
type VisualStyle = "realista" | "futurista" | "vibe" | "ugc" | "minimalista" | "cinematografico" | "editorial" | "ilustracao";

const VISUAL_STYLES: { value: VisualStyle; label: string; hint: string }[] = [
  { value: "realista", label: "📸 Realista", hint: "photorealistic editorial photography, natural lighting, 35mm lens, shallow depth of field, true-to-life skin tones and textures" },
  { value: "ugc", label: "🤳 UGC / Selfie", hint: "amateur smartphone selfie aesthetic, front camera POV, slightly imperfect framing, real ambient light, authentic user-generated content vibe, no studio polish" },
  { value: "futurista", label: "🛸 Futurista", hint: "futuristic sci-fi aesthetic, neon accents, holographic UI elements, glass and chrome materials, volumetric lighting, cyberpunk-inspired but clean and premium" },
  { value: "vibe", label: "🌈 Vibe / Aesthetic", hint: "trendy aesthetic mood, soft gradients, dreamy pastel or sunset palette, film grain, blurry bokeh, gen-Z vibe board energy" },
  { value: "minimalista", label: "⬜ Minimalista", hint: "minimalist composition, lots of negative space, single subject, muted neutral palette, soft diffused lighting, swiss design influence" },
  { value: "cinematografico", label: "🎬 Cinematográfico", hint: "cinematic still frame, anamorphic lens, dramatic key light, teal-and-orange grading, depth and atmosphere, movie production quality" },
  { value: "editorial", label: "📰 Editorial", hint: "high-fashion editorial photography, magazine cover quality, bold composition, studio lighting with rim light, premium brand feel" },
  { value: "ilustracao", label: "🎨 Ilustração", hint: "modern flat illustration, vector style, bold geometric shapes, limited color palette, editorial illustration like NYT or Stripe blog" },
];

const KIE_AFFILIATE = "https://kie.ai?ref=leadsbooster";

export default function Conteudo() {
  const qc = useQueryClient();
  const { get: getKey, upsert: upsertKey } = useUserApiKeys();
  const hasKieKey = !!getKey("kie_ai");

  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") || "criar");
  const [criarSub, setCriarSub] = useState("compose");
  const [calSub, setCalSub] = useState("calendar");
  const [marcaSub, setMarcaSub] = useState("brand");
  const [autoSub, setAutoSub] = useState("rules");

  // Compose state
  const [channels, setChannels] = useState<Channel[]>(["linkedin"]);
  const channel: Channel = channels[0] ?? "linkedin"; // canal "primário" pra aspect ratio / prompts
  const hasInstagram = channels.includes("instagram");
  const linkedinOnly = channels.length > 0 && !hasInstagram && channels.includes("linkedin");
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [postFormat, setPostFormat] = useState<PostFormat>("feed");
  const [visualStyle, setVisualStyle] = useState<VisualStyle>("realista");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState<string>("");
  const [publishing, setPublishing] = useState(false);
  const [autoModalOpen, setAutoModalOpen] = useState(false);
  const [autoTheme, setAutoTheme] = useState("");
  const [autoLoading, setAutoLoading] = useState(false);

  // Auto-engagement
  const [autoDmEnabled, setAutoDmEnabled] = useState(false);
  const [autoDmKeyword, setAutoDmKeyword] = useState("");
  const [autoDmMessage, setAutoDmMessage] = useState("");
  const [autoCommentReply, setAutoCommentReply] = useState("");
  const [autoDmOnLike, setAutoDmOnLike] = useState(false);
  const [autoDmOnFollow, setAutoDmOnFollow] = useState(false);
  const [autoDmLink, setAutoDmLink] = useState("");
  const [autoDmCtaLabel, setAutoDmCtaLabel] = useState("");

  // Kie.ai key inline — nunca lemos o segredo, só permitimos digitar novo
  const [kieInput, setKieInput] = useState("");

  // Consome ?tab=criar&seed=... vindo do "Criar post baseado no top" (Insights)
  useEffect(() => {
    const seed = searchParams.get("seed");
    const tabParam = searchParams.get("tab");
    if (tabParam) {
      setTab(tabParam);
      if (tabParam === "criar") setCriarSub("compose");
    }
    if (seed) {
      const decoded = seed.slice(0, 1200);
      setAiPrompt(decoded);
      setAutoTheme(decoded);
      toast({ title: "Tema carregado do top post", description: "Ajuste se quiser e clique em Gerar." });
      // limpa a URL pra não re-disparar
      const next = new URLSearchParams(searchParams);
      next.delete("seed");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // LinkedIn não suporta Stories/Reels/Carrossel — força Feed quando IG não estiver marcado.
  useEffect(() => {
    if (linkedinOnly && postFormat !== "feed") {
      setPostFormat("feed");
      setMediaType((prev) => (prev === "carousel" ? "image" : prev));
    }
  }, [linkedinOnly, postFormat]);

  const { data: posts = [] } = useQuery({
    queryKey: ["social_posts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("social_posts").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const scheduled = posts.filter((p: any) => p.status === "scheduled");
  const published = posts.filter((p: any) => p.status === "published");

  async function runKieGenerate(promptText: string, refUrls: string[] = [], opts: { injectStyle?: boolean } = {}) {
    const styleHint = VISUAL_STYLES.find((s) => s.value === visualStyle)?.hint ?? "";
    const finalPrompt = opts.injectStyle && styleHint && !promptText.toLowerCase().includes("photorealistic") && !promptText.toLowerCase().includes("cinematic")
      ? `${promptText}. Style: ${styleHint}. No text, no watermark, no logo.`
      : promptText;
    if (!hasKieKey) {
      toast({
        title: "Configure sua chave Kie.ai",
        description: "Ou use nosso link de afiliado.",
        action: <Button size="sm" asChild><a href={KIE_AFFILIATE} target="_blank" rel="noreferrer">Criar conta</a></Button> as any,
      });
      return;
    }
    setGenerating(true);
    setGenStatus("Enviando para Kie.ai...");
    let polling = false;
    try {
      const aspect = postFormat === "stories" || postFormat === "reels" ? "9:16" : postFormat === "carousel" ? "4:5" : "1:1";
      const { data, error } = await supabase.functions.invoke("kie-ai-generate", {
        body: {
          type: mediaType === "video" ? "video" : mediaType === "carousel" ? "carousel" : "image",
          prompt: finalPrompt,
          count: mediaType === "carousel" ? 4 : 1,
          aspect_ratio: aspect,
          reference_image_urls: refUrls,
        },
      });
      if (error) throw error;
      const d = data as { success?: boolean; needs_key?: boolean; async?: boolean; urls?: string[]; task_id?: string; error?: string };
      if (d?.needs_key) {
        toast({ title: "Chave Kie.ai necessária", description: d.error });
        return;
      }
      if (d?.success === false) throw new Error(d.error ?? "Kie.ai não gerou a mídia");
      if (d?.async && d.task_id) {
        polling = true;
        setGenStatus(mediaType === "video" ? "⏳ Omni renderizando vídeo com fala (pode levar 60-180s)..." : "⏳ Kie.ai renderizando (pode levar 30-90s)...");
        const kind = mediaType === "video" ? "video" : "image";
        const engine = (d as { engine?: string }).engine ?? (kind === "video" ? "omni" : "image");
        let attempts = 0;
        const tick = async () => {
          attempts++;
          setGenStatus(`⏳ Renderizando... tentativa ${attempts}/40`);
          const { data: pollData } = await supabase.functions.invoke("kie-ai-generate", {
            body: { type: "poll", task_id: d.task_id, kind, engine },
          });

          const pd = pollData as { success?: boolean; urls?: string[]; status?: string; error?: string };
          if (pd?.urls && pd.urls.length > 0) {
            setMediaUrls(pd.urls);
            setGenerating(false);
            setGenStatus("");
            toast({ title: "✅ Mídia pronta!", description: "Confira o preview abaixo." });
            return;
          }
          if (pd?.success === false || pd?.error || String(pd?.status ?? "").toUpperCase().includes("FAIL")) {
            setGenerating(false);
            setGenStatus("");
            toast({ title: "Falha na geração", description: pd?.error ?? pd?.status ?? "A Kie.ai não retornou a imagem.", variant: "destructive" });
            return;
          }
          if (attempts >= 40) {
            setGenerating(false);
            setGenStatus("");
            toast({ title: "Demorou demais", description: "Tente 'Verificar geração' em seguida." });
            return;
          }
          setTimeout(tick, 5000);
        };
        setTimeout(tick, 5000);
        return;
      }
      const urls = d?.urls ?? [];
      if (urls.length === 0) throw new Error(d?.error ?? "A Kie.ai terminou sem devolver URL da imagem.");
      setMediaUrls(urls);
      toast({ title: `${urls.length} mídia(s) gerada(s)` });
    } catch (e: any) {
      toast({ title: "Erro ao gerar", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      if (!polling) { setGenerating(false); setGenStatus(""); }
    }
  }

  async function handleGenerate() {
    // Sempre enriquece com dados do negócio + o que o usuário escreveu (theme_hint)
    setAutoTheme(aiPrompt);
    setAutoModalOpen(true);
  }

  async function handleAutoContent() {
    setAutoLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("social-auto-prompt", {
        body: { channel, media_type: mediaType, theme_hint: autoTheme, visual_style: visualStyle },
      });
      if (error) throw error;
      const d = data as { success?: boolean; needs_briefing?: boolean; error?: string; image_prompt?: string; caption?: string; hashtags?: string; reference_image_urls?: string[] };
      if (d?.needs_briefing) {
        if (autoTheme.trim()) {
          setAutoModalOpen(false);
          toast({ title: "Sem briefing — gerando do seu prompt direto", description: "Preencha o Assistente para resultados on-brand." });
          await runKieGenerate(autoTheme, [], { injectStyle: true });
          return;
        }
        toast({ title: "Briefing incompleto", description: d.error, variant: "destructive" });
        return;
      }
      if (!d?.success || !d.image_prompt) throw new Error(d?.error ?? "Falha ao gerar prompt");
      setAiPrompt(d.image_prompt);
      if (d.caption) setCaption(d.caption);
      if (d.hashtags) setHashtags(d.hashtags);
      setAutoModalOpen(false);
      setAutoTheme("");
      toast({ title: "Conteúdo on-brand pronto", description: "Gerando a mídia agora..." });
      await runKieGenerate(d.image_prompt, d.reference_image_urls ?? []);
    } catch (e: any) {
      toast({ title: "Erro", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setAutoLoading(false);
    }
  }





  async function handlePublish(when: "now" | "schedule") {
    if (!caption.trim() && mediaUrls.length === 0) return toast({ title: "Adicione legenda ou mídia" });
    if (when === "schedule" && !scheduledAt) return toast({ title: "Escolha data/hora" });
    if (channels.length === 0) return toast({ title: "Selecione pelo menos 1 canal" });
    setPublishing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const results: { channel: Channel; ok: boolean; msg: string }[] = [];

      for (const ch of channels) {
        const insertData: any = {
          user_id: user!.id,
          channel: ch,
          media_type: mediaType,
          post_format: postFormat,
          media_urls: mediaUrls,
          caption,
          hashtags,
          ai_prompt: aiPrompt || null,
          status: when === "schedule" ? "scheduled" : "draft",
          scheduled_at: when === "schedule" ? new Date(scheduledAt).toISOString() : null,
          // NOTE (Fase 2, passo 1): campos auto_dm_* legados NÃO são mais gravados aqui.
          // A automação de resposta/DM por post agora é criada em `social_auto_engage_rules`
          // logo após a inserção do post (bloco abaixo). Fonte única = tabela canônica.
        };
        const { data: post, error } = await supabase.from("social_posts").insert(insertData).select().single();
        if (error) { results.push({ channel: ch, ok: false, msg: error.message }); continue; }

        // Cria regra canônica de auto-engajamento vinculada a ESTE post (só IG suporta hoje).
        // Prioridade 10 = mesma convenção do AutomateCommentsModal: regras por post ganham
        // das regras globais (priority 100) do Auto-Engajamento.
        if (autoDmEnabled && ch === "instagram") {
          const rulePayload: any = {
            user_id: user!.id,
            channel: "instagram",
            post_id: post.id,
            mode: autoDmKeyword.trim() ? "keyword" : "global",
            keyword: autoDmKeyword.trim() || null,
            dm_template: autoDmMessage.trim() || null,
            public_reply_template: autoCommentReply.trim() || null,
            cta_link: autoDmLink.trim() || null,
            cta_label: autoDmCtaLabel.trim() || null,
            reply_public: !!autoCommentReply.trim(),
            send_dm: true,
            capture_lead: true,
            active: true,
            priority: 10,
            // "DM ao curtir/seguir" (autoDmOnLike/autoDmOnFollow) não é aplicado por post:
            // essas ações são globais e devem ser criadas como regras 'thank_like' /
            // 'welcome_follow' na aba Auto-Engajamento. Mantemos os toggles na UI só como
            // conveniência visual; ignoramos aqui para não duplicar dados.
          };
          const { error: ruleErr } = await supabase.from("social_auto_engage_rules").insert(rulePayload);
          if (ruleErr) {
            console.warn("[Conteudo] falha ao criar regra auto-engage vinculada ao post:", ruleErr.message);
          }
        }

        if (when === "now") {
          const { data: pubRes, error: pubErr } = await supabase.functions.invoke("social-publish", { body: { post_id: post.id } });
          if (pubErr) { results.push({ channel: ch, ok: false, msg: pubErr.message }); continue; }
          const ok = !!(pubRes as any)?.success;
          results.push({ channel: ch, ok, msg: ok ? ((pubRes as any)?.url ?? "publicado") : ((pubRes as any)?.error ?? "falhou") });
        } else {
          results.push({ channel: ch, ok: true, msg: "agendado" });
        }
      }

      const okCount = results.filter((r) => r.ok).length;
      const fails = results.filter((r) => !r.ok);
      if (okCount > 0) toast({ title: `${okCount}/${channels.length} canal(is) ${when === "now" ? "publicado(s)" : "agendado(s)"}`, description: fails.length ? `Falhas: ${fails.map((f) => `${f.channel}: ${f.msg}`).join(" | ")}` : undefined });
      if (okCount === 0) toast({ title: "Nenhum canal publicou", description: fails.map((f) => `${f.channel}: ${f.msg}`).join(" | "), variant: "destructive" });

      // Reset
      setCaption(""); setHashtags(""); setAiPrompt(""); setMediaUrls([]); setScheduledAt("");
      setAutoDmEnabled(false); setAutoDmKeyword(""); setAutoDmMessage(""); setAutoCommentReply("");
      setAutoDmOnLike(false); setAutoDmOnFollow(false); setAutoDmLink(""); setAutoDmCtaLabel("");
      qc.invalidateQueries({ queryKey: ["social_posts"] });
      setTab("calendario");
      setCalSub(when === "schedule" ? "scheduled" : "published");
    } catch (e: any) {
      toast({ title: "Erro", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  }

  async function handleDelete(id: string) {
    await supabase.from("social_posts").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["social_posts"] });
    toast({ title: "Removido" });
  }

  async function handlePublishNow(id: string) {
    const { data, error } = await supabase.functions.invoke("social-publish", { body: { post_id: id } });
    if (error || !(data as any)?.success) {
      toast({ title: "Erro", description: (data as any)?.error ?? error?.message, variant: "destructive" });
    } else {
      toast({ title: "Publicado" });
      qc.invalidateQueries({ queryKey: ["social_posts"] });
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const { data: { user } } = await supabase.auth.getUser();
    const urls: string[] = [];
    for (const f of files) {
      const path = `${user!.id}/${Date.now()}_${f.name}`;
      const { error } = await supabase.storage.from("branding-logos").upload(path, f);
      if (error) { toast({ title: "Upload falhou", description: error.message, variant: "destructive" }); continue; }
      const { data: pub } = supabase.storage.from("branding-logos").getPublicUrl(path);
      urls.push(pub.publicUrl);
    }
    setMediaUrls((prev) => [...prev, ...urls]);
    toast({ title: `${urls.length} arquivo(s) enviado(s)` });
  }

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Sparkles className="h-7 w-7 nucleo-accent" /> Postagem</h1>
        <p className="text-muted-foreground text-sm mt-1">Crie, agende, publique e automatize DMs no LinkedIn e Instagram — com IA on-brand.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="theme-nucleo">
        <TabsList className="flex w-full justify-start gap-1 p-1 bg-transparent">
          <TabsTrigger value="criar" className="gap-1.5"><Sparkles className="h-4 w-4" /> Criar</TabsTrigger>
          <TabsTrigger value="calendario" className="gap-1.5"><Calendar className="h-4 w-4" /> Calendário</TabsTrigger>
          <TabsTrigger value="marca" className="gap-1.5"><Instagram className="h-4 w-4" /> Marca</TabsTrigger>
          <TabsTrigger value="automacao" className="gap-1.5"><Zap className="h-4 w-4" /> Automação</TabsTrigger>
          <TabsTrigger value="insights" className="gap-1.5"><BarChart3 className="h-4 w-4" /> Insights</TabsTrigger>
        </TabsList>

        {/* ============ CRIAR (sub: Compor · Reels · Carrosséis · Kie.ai) ============ */}
        <TabsContent value="criar" className="mt-4">
          <Tabs value={criarSub} onValueChange={setCriarSub}>
            <TabsList className="mb-3">
              <TabsTrigger value="compose" className="gap-1.5"><Sparkles className="h-4 w-4" /> Compor</TabsTrigger>
              <TabsTrigger value="reels" className="gap-1.5"><Film className="h-4 w-4" /> Reels IA <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">IG</Badge></TabsTrigger>
              <TabsTrigger value="templates" className="gap-1.5"><Layers className="h-4 w-4" /> Carrosséis <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">IG</Badge></TabsTrigger>
              <TabsTrigger value="kie" className="gap-1.5"><KeyRound className="h-4 w-4" /> Kie.ai</TabsTrigger>
            </TabsList>

            <TabsContent value="reels"><ReelsStudioTab /></TabsContent>
            <TabsContent value="templates"><TemplatesTab /></TabsContent>




        {/* ============ COMPOSE ============ */}
        <TabsContent value="compose" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">1. Canal & formato</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Canais de publicação (marque um ou mais)</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {[
                      { v: "linkedin", label: "💼 LinkedIn", disabled: false },
                      { v: "instagram", label: "📸 Instagram", disabled: false },
                      { v: "threads", label: "🧵 Threads (em breve)", disabled: true },
                    ].map((c) => {
                      const active = channels.includes(c.v as Channel);
                      return (
                        <button
                          key={c.v}
                          type="button"
                          disabled={c.disabled}
                          onClick={() => {
                            if (c.disabled) return;
                            setChannels((prev) =>
                              prev.includes(c.v as Channel)
                                ? prev.filter((x) => x !== c.v)
                                : [...prev, c.v as Channel]
                            );
                          }}
                          className={`px-3 py-1.5 rounded-full border text-sm transition ${
                            c.disabled
                              ? "opacity-50 cursor-not-allowed border-muted"
                              : active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Threads ainda não é suportado pela Unipile — assim que liberarem, ativamos automaticamente.</p>
                </div>
                <div>
                  <Label>Formato</Label>
                  <Select value={postFormat} onValueChange={(v) => {
                    const f = v as PostFormat;
                    setPostFormat(f);
                    if (f === "reels") setMediaType("video");
                    else if (f === "carousel") setMediaType("carousel");
                    else if (f === "stories") setMediaType((prev) => (prev === "video" ? "video" : "image"));
                    else setMediaType((prev) => (prev === "carousel" ? "image" : prev));
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="feed">📰 Feed (1:1)</SelectItem>
                      {hasInstagram && <SelectItem value="stories">📱 Stories (9:16)</SelectItem>}
                      {hasInstagram && <SelectItem value="reels">🎬 Reels (9:16, vídeo)</SelectItem>}
                      {hasInstagram && <SelectItem value="carousel">🎠 Carrossel (4:5)</SelectItem>}
                    </SelectContent>
                  </Select>
                  {linkedinOnly && (
                    <p className="text-[11px] text-muted-foreground mt-1">Só Feed no LinkedIn. Stories, Reels e Carrossel são exclusivos do Instagram — marque também o 📸 Instagram acima para liberar.</p>
                  )}
                </div>
                <div>
                  <Label>Tipo de mídia</Label>
                  <Select value={mediaType} onValueChange={(v) => setMediaType(v as MediaType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto</SelectItem>
                      <SelectItem value="image">Imagem</SelectItem>
                      <SelectItem value="carousel">Carrossel</SelectItem>
                      <SelectItem value="video">Vídeo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">2. Mídia</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Estilo visual</Label>
                  <Select value={visualStyle} onValueChange={(v) => setVisualStyle(v as VisualStyle)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VISUAL_STYLES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Define o "look" — evita aquela cara genérica de IA.</p>
                </div>
                <div>
                  <Label>Gerar com IA (Kie.ai)</Label>
                  <Textarea
                    placeholder={mediaType === "video" ? "Descreva o vídeo (Veo3 / Omni)..." : "Descreva a imagem (GPT-Image-2)..."}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    rows={2}
                  />
                  <div className="flex gap-2 mt-2">
                    <Button onClick={handleGenerate} disabled={generating} size="sm">
                      {generating ? "Gerando..." : <><Sparkles className="h-4 w-4 mr-1" /> Gerar com IA + dados do negócio</>}
                    </Button>
                    <Button onClick={() => runKieGenerate(aiPrompt, [], { injectStyle: true })} disabled={generating || !aiPrompt.trim()} variant="outline" size="sm">
                      Gerar só do prompt
                    </Button>
                  </div>
                  {genStatus && <p className="text-xs text-primary mt-2 animate-pulse">{genStatus}</p>}
                </div>
                <div className="text-xs text-muted-foreground text-center">— ou —</div>
                <div>
                  <Label>Upload próprio</Label>
                  <Input type="file" multiple accept="image/*,video/*" onChange={handleFileUpload} />
                </div>
                {mediaUrls.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs">Preview ({mediaUrls.length})</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {mediaUrls.map((u, i) => (
                        <div key={i} className="relative rounded-lg border overflow-hidden bg-muted/20">
                          {u.match(/\.(mp4|webm|mov)$/i) ? (
                            <video src={u} controls className="w-full h-auto" />
                          ) : (
                            <a href={u} target="_blank" rel="noreferrer">
                              <img src={u} className="w-full h-auto object-contain" alt={`Mídia ${i + 1}`} />
                            </a>
                          )}
                          <button onClick={() => setMediaUrls((p) => p.filter((_, j) => j !== i))}
                            className="absolute top-1 right-1 bg-destructive text-white p-1 rounded shadow">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>



          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>3. Copy</span>
                {mediaUrls[0] && (
                  <Button size="sm" variant="outline" onClick={async () => {
                    const { data, error } = await supabase.functions.invoke("social-caption-from-image", {
                      body: { image_url: mediaUrls[0], channel },
                    });
                    if (error || !(data as { success?: boolean })?.success) {
                      toast({ title: "Erro", description: (data as { error?: string })?.error ?? error?.message, variant: "destructive" });
                      return;
                    }
                    const d = data as { caption?: string; hashtags?: string };
                    if (d.caption) setCaption(d.caption);
                    if (d.hashtags) setHashtags(d.hashtags);
                    toast({ title: "Copy gerada a partir da imagem" });
                  }}>
                    <Wand2 className="h-3 w-3 mr-1" /> Copy a partir da imagem
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea placeholder="Sua legenda..." value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} />
              <Input placeholder="#hashtag1 #hashtag2" value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
            </CardContent>
          </Card>

          {hasInstagram && (
          <Card className={autoDmEnabled ? "border-primary" : ""}>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /> 4. Boost Reply deste post (opcional)</span>
                <div className="flex items-center gap-2">
                  <Label htmlFor="boostreply-toggle" className="text-xs font-normal text-muted-foreground">Ativar</Label>
                  <Switch id="boostreply-toggle" checked={autoDmEnabled} onCheckedChange={setAutoDmEnabled} />
                </div>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Quando alguém comentar a <strong>palavra-chave</strong>, o painel responde no comentário e manda DM com o link/presente. Se desligado, vale a regra global da aba <strong>Auto-Engajamento</strong>.
              </p>
              <p className="text-[11px] text-muted-foreground/80 mt-1">
                💡 As automações de resposta ficam todas em <strong>Auto-Engajamento</strong> — o que você configurar aqui vira uma regra vinculada a este post.
              </p>
            </CardHeader>
            {autoDmEnabled && (
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label>Palavra-chave do gatilho</Label>
                    <Input placeholder='ex: "EU QUERO", "LINK", "PRESENTE"' value={autoDmKeyword} onChange={(e) => setAutoDmKeyword(e.target.value)} />
                    <p className="text-xs text-muted-foreground mt-1">Deixe vazio para responder qualquer comentário deste post.</p>
                  </div>
                  <div>
                    <Label>Resposta pública no comentário</Label>
                    <Input placeholder="Te mandei no direct 💌" value={autoCommentReply} onChange={(e) => setAutoCommentReply(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Mensagem da DM privada</Label>
                  <Textarea rows={2} placeholder="Oi {name}! Vi seu comentário e separei isso pra você 👇" value={autoDmMessage} onChange={(e) => setAutoDmMessage(e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-1">Use <code>{"{name}"}</code> para o nome/@ de quem comentou.</p>
                </div>
                <div className="grid md:grid-cols-3 gap-3 border rounded-lg p-3 bg-muted/30">
                  <div className="md:col-span-2">
                    <Label>🔗 Link enviado na DM</Label>
                    <Input placeholder="https://… (presente, cupom, WhatsApp, página)" value={autoDmLink} onChange={(e) => setAutoDmLink(e.target.value)} />
                    <p className="text-xs text-muted-foreground mt-1">Anexado ao final da mensagem da DM.</p>
                  </div>
                  <div>
                    <Label>Texto do botão (opcional)</Label>
                    <Input placeholder="Ex: Quero o presente" value={autoDmCtaLabel} onChange={(e) => setAutoDmCtaLabel(e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-6">
                  <div className="flex items-center gap-2"><Switch checked={autoDmOnLike} onCheckedChange={setAutoDmOnLike} /><Label className="text-sm">Mandar DM também para quem curtir</Label></div>
                  <div className="flex items-center gap-2"><Switch checked={autoDmOnFollow} onCheckedChange={setAutoDmOnFollow} /><Label className="text-sm">Mandar DM para novo seguidor</Label></div>
                </div>
              </CardContent>
            )}
          </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">4. Publicar</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <Label>Agendar para</Label>
                  <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                </div>
                <Button onClick={() => handlePublish("schedule")} disabled={publishing} variant="outline">
                  <Calendar className="h-4 w-4 mr-1" /> Agendar
                </Button>
                <Button onClick={() => handlePublish("now")} disabled={publishing}>
                  <Send className="h-4 w-4 mr-1" /> Publicar agora
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ KIE.AI (dentro de Criar) ============ */}
        <TabsContent value="kie" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4 nucleo-accent" /> Chave Kie.ai</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Kie.ai gera imagens (GPT-Image-2), carrosséis e vídeos (Veo3 / Omni) com qualidade profissional.
                Cole sua chave abaixo. Se ainda não tem conta,{" "}
                <a href={KIE_AFFILIATE} target="_blank" rel="noreferrer" className="text-primary underline">crie uma com nosso link de afiliado</a>.
              </p>
              <Input
                type="password"
                placeholder="sk-..."
                value={kieInput}
                onChange={(e) => setKieInput(e.target.value)}
              />
              <Button onClick={() => upsertKey.mutate({ provider: "kie_ai", api_key: kieInput })}>Salvar chave</Button>
              <div className="text-xs text-muted-foreground border-t pt-3">
                Modelos sugeridos: <strong>GPT-Image-2</strong> para imagem/carrossel, <strong>Veo3</strong> ou <strong>Omni</strong> para vídeo.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ============ CALENDÁRIO (sub: Calendário · Agendados · Publicados) ============ */}
        <TabsContent value="calendario" className="mt-4">
          <Tabs value={calSub} onValueChange={setCalSub}>
            <TabsList className="mb-3">
              <TabsTrigger value="calendar" className="gap-1.5"><Calendar className="h-4 w-4" /> Calendário</TabsTrigger>
              <TabsTrigger value="scheduled" className="gap-1.5"><Wand2 className="h-4 w-4" /> Agendados ({scheduled.length})</TabsTrigger>
              <TabsTrigger value="published" className="gap-1.5"><BarChart3 className="h-4 w-4" /> Publicados ({published.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="calendar"><CalendarioTab /></TabsContent>

            <TabsContent value="scheduled" className="space-y-2">
              {scheduled.length === 0 && <p className="text-muted-foreground text-sm">Nenhum post agendado.</p>}
              {scheduled.map((p: any) => (
                <Card key={p.id}>
                  <CardContent className="p-4 flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex gap-2 items-center mb-1">
                        <Badge>{p.channel}</Badge>
                        <Badge variant="outline">{p.media_type}</Badge>
                        <span className="text-xs text-muted-foreground">{new Date(p.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                      </div>
                      <p className="text-sm line-clamp-2">{p.caption}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handlePublishNow(p.id)}><Send className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="published" className="space-y-2">
              {published.length === 0 && <p className="text-muted-foreground text-sm">Nenhum post publicado.</p>}
              {published.map((p: any) => (
                <Card key={p.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex gap-2 items-center">
                        <Badge>{p.channel}</Badge>
                        <Badge variant="outline">{p.media_type}</Badge>
                        <span className="text-xs text-muted-foreground">{new Date(p.published_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                      </div>
                      {p.post_url && (
                        <Button size="sm" variant="ghost" asChild>
                          <a href={p.post_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                        </Button>
                      )}
                    </div>
                    <p className="text-sm line-clamp-2 mb-2">{p.caption}</p>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>❤️ {p.likes}</span>
                      <span>💬 {p.comments_count}</span>
                      <span>📩 {p.dms_sent} DMs</span>
                      <span>🎯 {p.leads_created} leads</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ============ MARCA (sub: Brand Kit · Produtos) ============ */}
        <TabsContent value="marca" className="mt-4">
          <Tabs value={marcaSub} onValueChange={setMarcaSub}>
            <TabsList className="mb-3">
              <TabsTrigger value="brand" className="gap-1.5"><Instagram className="h-4 w-4" /> Brand Kit</TabsTrigger>
              <TabsTrigger value="products" className="gap-1.5"><Package className="h-4 w-4" /> Produtos</TabsTrigger>
            </TabsList>
            <TabsContent value="brand"><BrandKitTab /></TabsContent>
            <TabsContent value="products"><ProdutosTab /></TabsContent>
          </Tabs>
        </TabsContent>

        {/* ============ AUTOMAÇÃO (sub: Regras · Diagnóstico) ============ */}
        <TabsContent value="automacao" className="mt-4">
          <Tabs value={autoSub} onValueChange={setAutoSub}>
            <TabsList className="mb-3">
              <TabsTrigger value="rules" className="gap-1.5"><Zap className="h-4 w-4" /> Regras de auto-engajamento</TabsTrigger>
              <TabsTrigger value="diag" className="gap-1.5"><Activity className="h-4 w-4" /> Diagnóstico <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">IG</Badge></TabsTrigger>
            </TabsList>
            <TabsContent value="rules"><AutoEngajamentoTab /></TabsContent>
            <TabsContent value="diag"><DiagnosticoTab /></TabsContent>
          </Tabs>
        </TabsContent>

        {/* ============ INSIGHTS ============ */}
        <TabsContent value="insights" className="mt-4"><InsightsTab /></TabsContent>
      </Tabs>


      <AlertDialog open={autoModalOpen} onOpenChange={setAutoModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Criar conteúdo automático?</AlertDialogTitle>
            <AlertDialogDescription>
              Você não preencheu o prompt. Quer que a IA monte tudo (imagem + legenda + hashtags) puxando os dados do seu negócio (Assistente → Negócio + Knowledge Pack) e da sua Biblioteca de Referências?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">Tema (opcional — deixe vazio para a IA escolher)</Label>
            <Input
              placeholder='ex: "Como reduzir custo de aquisição de cliente"'
              value={autoTheme}
              onChange={(e) => setAutoTheme(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={autoLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleAutoContent(); }} disabled={autoLoading}>
              {autoLoading ? "Gerando..." : "✨ Gerar tudo automático"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

