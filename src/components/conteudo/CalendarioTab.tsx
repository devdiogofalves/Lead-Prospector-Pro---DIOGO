import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wand2, CheckCircle2, Image as ImageIcon, Video, Calendar as CalendarIcon, Trash2, Sparkles, Send, Download } from "lucide-react";
import CreatePostWizard from "./CreatePostWizard";
import { CreateCarouselWizard } from "./CreateCarouselWizard";
import { AutomateCommentsModal } from "./AutomateCommentsModal";
import WeekCalendarGrid from "./WeekCalendarGrid";

async function downloadPostMedia(post: { id: string; media_urls: string[]; cover_url: string | null; post_format: string | null; media_type: string }) {
  const urls = [...(post.media_urls ?? [])];
  if (post.cover_url && !urls.includes(post.cover_url)) urls.unshift(post.cover_url);
  if (urls.length === 0) {
    toast({ title: "Nada pra baixar", description: "Gere a mídia primeiro.", variant: "destructive" });
    return;
  }
  const ext = (u: string, fallback: string) => {
    const m = u.split("?")[0].match(/\.([a-zA-Z0-9]{2,5})$/);
    return m ? m[1].toLowerCase() : fallback;
  };
  toast({ title: `Baixando ${urls.length} arquivo(s)...` });
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    try {
      const res = await fetch(u, { mode: "cors" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${post.post_format ?? post.media_type}-${post.id.slice(0, 6)}-${i + 1}.${ext(u, post.media_type === "video" ? "mp4" : "jpg")}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      // fallback: abrir em nova aba
      window.open(u, "_blank", "noopener");
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

type Post = {
  id: string; channel: string; post_format: string | null; media_type: string;
  caption: string; hashtags: string | null; ai_prompt: string | null; status: string;
  scheduled_at: string | null; auto_approve: boolean; plan_id: string | null;
  media_urls: string[]; reference_asset_ids: string[]; cover_url: string | null;
  unipile_account_id: string | null; post_url: string | null; last_error: string | null;
};
type UnipileAccount = { id: string; name: string; type?: string; status?: string | null; blocked?: boolean };

export default function CalendarioTab() {
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [generatingMedia, setGeneratingMedia] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [automatePostId, setAutomatePostId] = useState<string | null>(null);
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [view, setView] = useState<"list" | "week">("list");

  const { data: plans = [] } = useQuery({
    queryKey: ["social_content_plans"],
    queryFn: async () => {
      const { data } = await supabase.from("social_content_plans").select("*").order("week_start", { ascending: false }).limit(10);
      return data ?? [];
    },
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["social_posts_with_plan"],
    queryFn: async () => {
      const { data } = await supabase.from("social_posts").select("*").order("scheduled_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(80);
      return (data ?? []) as Post[];
    },
  });

  const { data: igAccounts = [] } = useQuery({
    queryKey: ["unipile_accounts", "instagram"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("unipile-list-accounts", { body: { channel: "instagram" } });
      return ((data as { accounts?: UnipileAccount[] })?.accounts ?? []) as UnipileAccount[];
    },
  });
  const { data: liAccounts = [] } = useQuery({
    queryKey: ["unipile_accounts", "linkedin"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("unipile-list-accounts", { body: { channel: "linkedin" } });
      return ((data as { accounts?: UnipileAccount[] })?.accounts ?? []) as UnipileAccount[];
    },
  });

  const { data: brandProfile } = useQuery({
    queryKey: ["social_brand_profile"],
    queryFn: async () => {
      const { data } = await supabase.from("social_brand_profile").select("logo_url,sample_post_urls").maybeSingle();
      return data as { logo_url?: string | null; sample_post_urls?: string[] | null } | null;
    },
  });

  const getBrandReferenceUrls = () => [
    brandProfile?.logo_url,
    ...((Array.isArray(brandProfile?.sample_post_urls) ? brandProfile?.sample_post_urls : []) ?? []).slice(0, 3),
  ].filter(Boolean) as string[];

  async function setPostAccount(id: string, accountId: string) {
    await supabase.from("social_posts").update({ unipile_account_id: accountId, last_error: null }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] });
  }

  async function publishNow(post: Post) {
    // Instagram publica pela conta Meta conectada (resolvida por usuário no backend),
    // então não exige conta Unipile. LinkedIn é 100% Unipile e continua exigindo.
    if (post.channel !== "instagram" && !post.unipile_account_id) {
      toast({ title: "Escolha a conta de destino", description: "Selecione qual conta receberá o post antes de publicar.", variant: "destructive" });
      return;
    }
    setPublishingId(post.id);
    try {
      const { data, error } = await supabase.functions.invoke("social-publish", { body: { post_id: post.id } });
      if (error) throw error;
      const d = data as { success?: boolean; url?: string; error?: string };
      if (!d?.success) throw new Error(d?.error ?? "Falha ao publicar");
      toast({ title: "Publicado!", description: d.url ?? "Confira no Instagram." });
      qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] });
      if (post.channel === "instagram") setAutomatePostId(post.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro ao publicar", description: msg, variant: "destructive" });
    } finally {
      setPublishingId(null);
    }
  }

  async function generatePlan() {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("social-weekly-planner", { body: {} });
      if (error) throw error;
      if (!(data as { success?: boolean })?.success) throw new Error((data as { error?: string })?.error ?? "Falha ao gerar plano");
      toast({ title: "Plano semanal gerado!", description: `${(data as { posts_count?: number }).posts_count} posts criados.` });
      qc.invalidateQueries({ queryKey: ["social_content_plans"] });
      qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] });
      qc.invalidateQueries({ queryKey: ["social_posts"] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function generateMonthlyPlan() {
    const monthIn = window.prompt("Mês do plano (YYYY-MM). Deixe em branco para o próximo mês:", "");
    const storiesIn = Number(window.prompt("Quantos stories?", "20") ?? 20);
    const feedIn = Number(window.prompt("Quantos posts de feed?", "10") ?? 10);
    const reelsIn = Number(window.prompt("Quantos reels?", "5") ?? 5);
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("social-monthly-plan", {
        body: { month: monthIn || undefined, stories: storiesIn, feed: feedIn, reels: reelsIn },
      });
      if (error) throw error;
      if (!(data as { success?: boolean })?.success) throw new Error((data as { error?: string })?.error ?? "Falha ao gerar plano mensal");
      toast({ title: "Plano mensal gerado!", description: `${(data as { posts_count?: number }).posts_count} posts criados para ${(data as { month?: string }).month}.` });
      qc.invalidateQueries({ queryKey: ["social_content_plans"] });
      qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] });
      qc.invalidateQueries({ queryKey: ["social_posts"] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function generateMedia(post: Post) {
    setGeneratingMedia(post.id);
    try {
      // pega URLs das referências
      let refUrls: string[] = getBrandReferenceUrls();
      if (post.reference_asset_ids?.length) {
        const { data } = await supabase.from("social_brand_assets").select("public_url").in("id", post.reference_asset_ids);
        refUrls = [...refUrls, ...(data ?? []).map((a: { public_url: string }) => a.public_url).filter(Boolean)];
      }
      const aspect = post.post_format === "reels" || post.post_format === "stories" ? "9:16" : post.post_format === "carousel" ? "4:5" : "1:1";
      const { data, error } = await supabase.functions.invoke("kie-ai-generate", {
        body: {
          type: post.media_type === "video" ? "video" : "image",
          prompt: post.ai_prompt ?? post.caption.slice(0, 200),
          aspect_ratio: aspect,
          reference_image_urls: refUrls,
        },
      });
      if (error) throw error;
      const d = data as { success?: boolean; needs_key?: boolean; async?: boolean; urls?: string[]; task_id?: string; error?: string };
      if (d?.needs_key) { toast({ title: "Configure Kie.ai", description: d.error }); return; }
      if (d?.success === false) throw new Error(d.error ?? "Kie.ai não gerou a mídia");
      if (d?.async && d.task_id) {
        toast({ title: post.media_type === "video" ? "Renderizando vídeo com fala (Omni)..." : "Renderizando...", description: "A mídia aparece automaticamente em alguns segundos." });
        const kind = post.media_type === "video" ? "video" : "image";
        const engine = (data as { engine?: string })?.engine ?? (kind === "video" ? "omni" : "image");
        let attempts = 0;
        const tick = async () => {
          attempts++;
          const { data: pd } = await supabase.functions.invoke("kie-ai-generate", {
            body: { type: "poll", task_id: d.task_id, kind, engine },
          });

          const r = pd as { success?: boolean; urls?: string[]; status?: string; error?: string };
          if (r?.urls && r.urls.length > 0) {
            await supabase.from("social_posts").update({ media_urls: r.urls }).eq("id", post.id);
            qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] });
            toast({ title: "Mídia pronta!" });
            setGeneratingMedia(null);
            return;
          }
          if (r?.success === false || r?.error || String(r?.status ?? "").toUpperCase().includes("FAIL")) {
            toast({ title: "Falha", description: r?.error ?? r?.status, variant: "destructive" });
            setGeneratingMedia(null);
            return;
          }
          if (attempts >= 40) {
            toast({ title: "Demorou demais", description: "Tente gerar novamente." });
            setGeneratingMedia(null);
            return;
          }
          setTimeout(tick, 5000);
        };
        setTimeout(tick, 5000);
        return; // polling cuida do setGeneratingMedia
      }
      const urls = d?.urls ?? [];
      if (urls.length > 0) {
        await supabase.from("social_posts").update({ media_urls: urls }).eq("id", post.id);
        qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] });
        toast({ title: "Mídia gerada" });
      } else {
        throw new Error(d?.error ?? "A Kie.ai terminou sem devolver URL da imagem.");
      }
      setGeneratingMedia(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro", description: msg, variant: "destructive" });
      setGeneratingMedia(null);
    }
  }

  async function generateCover(post: Post) {
    setGeneratingMedia(post.id);
    try {
      let refUrls: string[] = getBrandReferenceUrls();
      if (post.reference_asset_ids?.length) {
        const { data } = await supabase.from("social_brand_assets").select("public_url").in("id", post.reference_asset_ids);
        refUrls = [...refUrls, ...(data ?? []).map((a: { public_url: string }) => a.public_url).filter(Boolean)];
      }
      const coverPrompt = `Vertical 9:16 Instagram Reels COVER (thumbnail). Eye-catching, bold title-card composition with large readable subject, high contrast, on-brand. Based on: ${post.ai_prompt ?? post.caption.slice(0, 200)}. No text overlay, no watermark, sharp focus.`;
      const { data, error } = await supabase.functions.invoke("kie-ai-generate", {
        body: { type: "image", prompt: coverPrompt, aspect_ratio: "9:16", reference_image_urls: refUrls },
      });
      if (error) throw error;
      const d = data as { success?: boolean; async?: boolean; urls?: string[]; task_id?: string; error?: string };
      if (d?.success === false) throw new Error(d.error ?? "Falha ao gerar capa");
      if (d?.async && d.task_id) {
        toast({ title: "Renderizando capa do Reels...", description: "Aparece em alguns segundos." });
        let attempts = 0;
        const tick = async () => {
          attempts++;
          const { data: pd } = await supabase.functions.invoke("kie-ai-generate", {
            body: { type: "poll", task_id: d.task_id, kind: "image", engine: "image" },
          });
          const r = pd as { urls?: string[]; success?: boolean; status?: string; error?: string };
          if (r?.urls && r.urls.length > 0) {
            await supabase.from("social_posts").update({ cover_url: r.urls[0] }).eq("id", post.id);
            qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] });
            toast({ title: "Capa pronta!" });
            setGeneratingMedia(null);
            return;
          }
          if (r?.success === false || r?.error) {
            toast({ title: "Falha", description: r?.error ?? r?.status, variant: "destructive" });
            setGeneratingMedia(null);
            return;
          }
          if (attempts >= 40) { setGeneratingMedia(null); return; }
          setTimeout(tick, 5000);
        };
        setTimeout(tick, 5000);
        return;
      }
      const urls = d?.urls ?? [];
      if (urls.length > 0) {
        await supabase.from("social_posts").update({ cover_url: urls[0] }).eq("id", post.id);
        qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] });
        toast({ title: "Capa gerada" });
      }
      setGeneratingMedia(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro", description: msg, variant: "destructive" });
      setGeneratingMedia(null);
    }
  }

  async function uploadCover(post: Post, file: File) {
    setGeneratingMedia(post.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `covers/${user.id}/${post.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("social-assets").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage.from("social-assets").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (sErr || !signed?.signedUrl) throw sErr ?? new Error("Falha ao gerar URL");
      await supabase.from("social_posts").update({ cover_url: signed.signedUrl }).eq("id", post.id);
      qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] });
      toast({ title: "Capa enviada" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro no upload", description: msg, variant: "destructive" });
    } finally {
      setGeneratingMedia(null);
    }
  }


  async function approvePost(id: string) {
    await supabase.from("social_posts").update({ status: "scheduled" }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] });
    qc.invalidateQueries({ queryKey: ["social_posts"] });
    toast({ title: "Aprovado e agendado" });
    const p = posts.find((x) => x.id === id);
    if (p?.channel === "instagram") setAutomatePostId(id);
  }

  async function updateCaption(id: string, caption: string) {
    await supabase.from("social_posts").update({ caption }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] });
  }

  async function regenerateCopy(post: Post, theme: string, cta: string, systemOverride: string) {
    try {
      const { data, error } = await supabase.functions.invoke("social-auto-prompt", {
        body: {
          channel: post.channel,
          media_type: post.media_type,
          aspect_ratio: post.post_format === "reels" || post.post_format === "stories" ? "9:16" : post.post_format === "carousel" ? "4:5" : "1:1",
          theme_hint: theme,
          cta_text: cta,
          system_override: systemOverride,
        },
      });
      if (error) throw error;
      const d = data as { success?: boolean; image_prompt?: string; caption?: string; hashtags?: string; error?: string };
      if (!d?.success) throw new Error(d?.error ?? "Falha ao regerar copy");
      await supabase.from("social_posts").update({
        ai_prompt: d.image_prompt,
        caption: d.caption,
        hashtags: d.hashtags,
      }).eq("id", post.id);
      qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] });
      toast({ title: "Copy regerada!", description: "Tema e CTA aplicados." });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    }
  }

  async function deletePost(id: string) {
    await supabase.from("social_posts").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] });
    qc.invalidateQueries({ queryKey: ["social_posts"] });
  }

  const drafts = posts.filter((p) => p.status === "draft");
  const scheduled = posts.filter((p) => p.status === "scheduled");

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Wand2 className="h-5 w-5 text-primary" /> Calendário Semanal Automático</CardTitle>
          <p className="text-sm text-muted-foreground">
            A IA gera 6 posts on-brand (2 feed + 2 reels + 2 stories) baseados no seu briefing e biblioteca de referências.
            Stories agendam direto; feed e reels viram rascunhos para você aprovar.
          </p>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-2 items-center">
            <Badge variant="outline">{drafts.length} aguardando aprovação</Badge>
            <Badge>{scheduled.length} agendados</Badge>
            <Badge variant="secondary">{plans.length} planos gerados</Badge>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <CreatePostWizard igAccounts={igAccounts} liAccounts={liAccounts}
              onCreated={() => { qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] }); qc.invalidateQueries({ queryKey: ["social_posts"] }); }} />
            <Button onClick={() => setCarouselOpen(true)} variant="outline" className="gap-2 border-primary/50 hover:bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
              ✨ Novo Carrossel Multi-Fonte
            </Button>
            <Button onClick={generatePlan} disabled={generating} variant="outline">
              <Sparkles className="h-4 w-4 mr-2" />
              {generating ? "Gerando..." : "🪄 Plano da semana"}
            </Button>
            <Button onClick={generateMonthlyPlan} disabled={generating}>
              <CalendarIcon className="h-4 w-4 mr-2" />
              {generating ? "Gerando..." : "🗓️ Plano do mês (20+10+5)"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Visualização:</span>
        <Button size="sm" variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")}>Lista</Button>
        <Button size="sm" variant={view === "week" ? "default" : "outline"} onClick={() => setView("week")}>
          <CalendarIcon className="h-3 w-3 mr-1" />Semana (drag & drop)
        </Button>
      </div>

      {view === "week" && <WeekCalendarGrid posts={posts} />}

      {view === "list" && drafts.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-2">📝 Rascunhos para aprovar ({drafts.length})</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {drafts.map((p) => (
              <PostCard key={p.id} post={p} accounts={p.channel === "linkedin" ? liAccounts : igAccounts}
                onApprove={approvePost} onDelete={deletePost} onGenMedia={generateMedia} onGenCover={generateCover}
                onUploadCover={uploadCover}
                generatingMedia={generatingMedia === p.id} onCaptionChange={updateCaption} onRegenerate={regenerateCopy}
                onAccountChange={setPostAccount} onPublishNow={publishNow} publishing={publishingId === p.id} />
            ))}
          </div>
        </div>
      )}

      {view === "list" && scheduled.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-2">📅 Agendados ({scheduled.length})</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {scheduled.map((p) => (
              <PostCard key={p.id} post={p} accounts={p.channel === "linkedin" ? liAccounts : igAccounts}
                onApprove={approvePost} onDelete={deletePost} onGenMedia={generateMedia} onGenCover={generateCover}
                onUploadCover={uploadCover}
                generatingMedia={generatingMedia === p.id} onCaptionChange={updateCaption} onRegenerate={regenerateCopy}
                onAccountChange={setPostAccount} onPublishNow={publishNow} publishing={publishingId === p.id} />
            ))}
          </div>
        </div>
      )}

      {posts.length === 0 && (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">
          Nenhum plano ainda. Clique em "🪄 Gerar plano da semana" para começar.
        </CardContent></Card>
      )}

      <AutomateCommentsModal
        open={!!automatePostId}
        postId={automatePostId}
        onClose={() => setAutomatePostId(null)}
      />

      <CreateCarouselWizard open={carouselOpen} onOpenChange={setCarouselOpen} />
    </div>
  );
}

function PostCard({ post, accounts, onApprove, onDelete, onGenMedia, onGenCover, onUploadCover, generatingMedia, onCaptionChange, onRegenerate, onAccountChange, onPublishNow, publishing }: {
  post: Post;
  accounts: UnipileAccount[];
  onApprove: (id: string) => void;
  onDelete: (id: string) => void;
  onGenMedia: (post: Post) => void;
  onGenCover: (post: Post) => void;
  onUploadCover: (post: Post, file: File) => void;
  generatingMedia: boolean;
  onCaptionChange: (id: string, caption: string) => void;
  onRegenerate: (post: Post, theme: string, cta: string, systemOverride: string) => Promise<void>;
  onAccountChange: (id: string, accountId: string) => void;
  onPublishNow: (post: Post) => void;
  publishing: boolean;
}) {
  const [caption, setCaption] = useState(post.caption);
  const [theme, setTheme] = useState("");
  const [cta, setCta] = useState("Link na bio");
  const [sysPrompt, setSysPrompt] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refineTone, setRefineTone] = useState("punchier");
  const [refineInstr, setRefineInstr] = useState("");
  const [showRefine, setShowRefine] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [scriptDuration, setScriptDuration] = useState(15);
  const [scriptStyle, setScriptStyle] = useState("hook_viral");
  const [scriptLoading, setScriptLoading] = useState(false);
  const [script, setScript] = useState<null | {
    hook?: string; scenes?: { t?: string; fala?: string; acao?: string; texto_tela?: string }[];
    cta_final?: string; audio_sugerido?: string; hashtags?: string; dicas_gravacao?: string[];
  }>(null);
  const formatLabel = post.post_format ?? post.media_type;
  const FormatIcon = post.media_type === "video" ? Video : ImageIcon;
  const hasMedia = post.media_urls && post.media_urls.length > 0;

  async function handleRegen() {
    setRegenerating(true);
    try {
      await onRegenerate(post, theme, cta, sysPrompt);
      setCaption(""); // será atualizado pelo refetch da query
    } finally {
      setRegenerating(false);
    }
  }

  async function handleRefine() {
    const base = caption || post.caption;
    if (!base?.trim()) {
      toast({ title: "Sem legenda", description: "Gere uma legenda antes de refinar.", variant: "destructive" });
      return;
    }
    setRefining(true);
    try {
      const { data, error } = await supabase.functions.invoke("social-caption-refine", {
        body: { caption: base, tone: refineTone, instructions: refineInstr, channel: post.channel },
      });
      if (error) throw error;
      const d = data as { success?: boolean; caption?: string; hashtags?: string; notes?: string; error?: string };
      if (!d?.success || !d.caption) throw new Error(d?.error ?? "Falha ao refinar");
      const updates: Record<string, string> = { caption: d.caption };
      if (d.hashtags) updates.hashtags = d.hashtags;
      await supabase.from("social_posts").update(updates).eq("id", post.id);
      setCaption(d.caption);
      onCaptionChange(post.id, d.caption);
      toast({ title: "Legenda refinada ✨", description: d.notes ?? "Pronto." });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro ao refinar", description: msg, variant: "destructive" });
    } finally {
      setRefining(false);
    }
  }

  async function handleScript() {
    setScriptLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("social-reels-script", {
        body: {
          duration: scriptDuration,
          style: scriptStyle,
          theme: theme || undefined,
          cta: cta || undefined,
          base_caption: caption || post.caption || undefined,
        },
      });
      if (error) throw error;
      const d = data as { success?: boolean; script?: typeof script; error?: string };
      if (!d?.success || !d.script) throw new Error(d?.error ?? "Falha ao gerar roteiro");
      setScript(d.script);
      toast({ title: "Roteiro pronto 🎬" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro no roteiro", description: msg, variant: "destructive" });
    } finally {
      setScriptLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1 items-center">
            <Badge><FormatIcon className="h-3 w-3 mr-1" />{formatLabel}</Badge>
            {post.scheduled_at && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />{new Date(post.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={() => onDelete(post.id)}><Trash2 className="h-3 w-3" /></Button>
        </div>

        <div className="space-y-2 rounded border border-dashed p-2 bg-muted/30">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase">Tema</label>
              <Input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="ex: dor de não escalar prospecção"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase">CTA</label>
              <Input
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder="ex: Link na bio / Comenta SISTEMA"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-[10px] text-muted-foreground underline"
          >
            {showAdvanced ? "− system prompt customizado" : "+ usar meu system prompt"}
          </button>
          {showAdvanced && (
            <Textarea
              rows={3}
              value={sysPrompt}
              onChange={(e) => setSysPrompt(e.target.value)}
              placeholder="Cole aqui um system prompt customizado (substitui o padrão)."
              className="text-xs"
            />
          )}
          <Button size="sm" variant="secondary" className="w-full h-8" onClick={handleRegen} disabled={regenerating}>
            <Sparkles className="h-3 w-3 mr-1" />
            {regenerating ? "Regerando copy + prompt..." : "✨ Aplicar tema/CTA e regerar copy"}
          </Button>
        </div>

        {(() => {
          const isVertical = post.post_format === "reels" || post.post_format === "stories";
          const isCarousel = post.post_format === "carousel";
          const aspectClass = isVertical ? "aspect-[9/16]" : isCarousel ? "aspect-[4/5]" : "aspect-square";
          return hasMedia ? (
            post.media_type === "video" ? (
              <video src={post.media_urls[0]} controls poster={post.cover_url ?? undefined} className={`w-full rounded bg-black ${aspectClass} object-cover`} />
            ) : (
              <img src={post.media_urls[0]} alt="" className={`w-full ${aspectClass} object-cover rounded`} />
            )
          ) : (
            <Button size="sm" variant="outline" className="w-full" onClick={() => onGenMedia(post)} disabled={generatingMedia}>
              {generatingMedia ? "Gerando mídia..." : post.media_type === "video" ? "🎬 Gerar vídeo com fala (Omni)" : "🎨 Gerar mídia on-brand"}
            </Button>
          );
        })()}

        {post.post_format === "reels" && (
          <div className="rounded border border-dashed p-2 bg-muted/20 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] font-medium text-muted-foreground uppercase">Capa do Reels (9:16)</span>
              <div className="flex gap-1 items-center">
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => onGenCover(post)} disabled={generatingMedia}>
                  {generatingMedia ? "Gerando..." : post.cover_url ? "🔄 Regerar IA" : "🖼️ Gerar com IA"}
                </Button>
                <label className="h-6 text-[10px] px-2 rounded border bg-background hover:bg-accent cursor-pointer inline-flex items-center">
                  📤 Upload
                  <input type="file" accept="image/*" className="hidden" disabled={generatingMedia}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadCover(post, f); e.currentTarget.value = ""; }} />
                </label>
              </div>
            </div>
            {post.cover_url && (
              <img src={post.cover_url} alt="capa" className="w-24 aspect-[9/16] object-cover rounded border" />
            )}
          </div>
        )}

        {post.post_format === "reels" && (
          <div className="rounded border border-dashed p-2 bg-muted/20 space-y-2">
            <button type="button" onClick={() => setShowScript((v) => !v)} className="text-[10px] text-muted-foreground underline">
              {showScript ? "− roteiro de Reels" : "🎬 gerar roteiro de Reels (segundo-a-segundo)"}
            </button>
            {showScript && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select value={scriptDuration} onChange={(e) => setScriptDuration(Number(e.target.value))} className="h-8 text-xs rounded border bg-background px-2">
                    <option value={5}>⏱️ 5s — pílula</option>
                    <option value={15}>⏱️ 15s — padrão</option>
                    <option value={30}>⏱️ 30s — desenvolvido</option>
                    <option value={60}>⏱️ 60s — completo</option>
                  </select>
                  <select value={scriptStyle} onChange={(e) => setScriptStyle(e.target.value)} className="h-8 text-xs rounded border bg-background px-2">
                    <option value="hook_viral">🔥 Hook viral</option>
                    <option value="tutorial">🧰 Tutorial passo-a-passo</option>
                    <option value="storytelling">📖 Storytelling</option>
                    <option value="depoimento">💬 Depoimento / case</option>
                    <option value="polemico">⚡ Polêmico</option>
                  </select>
                </div>
                <Button size="sm" variant="secondary" className="w-full h-8" onClick={handleScript} disabled={scriptLoading}>
                  <Sparkles className="h-3 w-3 mr-1" />
                  {scriptLoading ? "Roteirizando..." : script ? "🔁 Regerar roteiro" : "🎬 Gerar roteiro"}
                </Button>
                {script && (
                  <div className="space-y-2 text-xs">
                    {script.hook && <div className="rounded bg-primary/10 border border-primary/30 p-2"><span className="text-[10px] uppercase text-primary font-semibold">Hook</span><p className="font-medium">{script.hook}</p></div>}
                    {(script.scenes ?? []).map((s, i) => (
                      <div key={i} className="rounded border p-2 bg-background/50 space-y-1">
                        <div className="flex items-center gap-2"><Badge variant="outline" className="text-[10px]">{s.t ?? `cena ${i+1}`}</Badge></div>
                        {s.fala && <p><span className="text-[10px] uppercase text-muted-foreground">🎙️ fala:</span> {s.fala}</p>}
                        {s.acao && <p className="text-muted-foreground"><span className="text-[10px] uppercase">🎥 ação:</span> {s.acao}</p>}
                        {s.texto_tela && <p className="text-primary"><span className="text-[10px] uppercase">💬 texto na tela:</span> {s.texto_tela}</p>}
                      </div>
                    ))}
                    {script.cta_final && <div className="rounded border border-dashed p-2"><span className="text-[10px] uppercase text-muted-foreground">CTA final</span><p>{script.cta_final}</p></div>}
                    {script.audio_sugerido && <p className="text-[11px] text-muted-foreground">🎵 {script.audio_sugerido}</p>}
                    {script.dicas_gravacao && script.dicas_gravacao.length > 0 && (
                      <ul className="text-[11px] text-muted-foreground list-disc pl-4">
                        {script.dicas_gravacao.map((d, i) => <li key={i}>{d}</li>)}
                      </ul>
                    )}
                    <Button size="sm" variant="ghost" className="w-full h-7 text-[10px]" onClick={() => {
                      const txt = [
                        `HOOK: ${script.hook ?? ""}`,
                        "",
                        ...(script.scenes ?? []).map((s, i) => `[${s.t ?? `cena ${i+1}`}]\n🎙️ ${s.fala ?? ""}\n🎥 ${s.acao ?? ""}${s.texto_tela ? `\n💬 ${s.texto_tela}` : ""}`),
                        "",
                        `CTA: ${script.cta_final ?? ""}`,
                        script.audio_sugerido ? `🎵 Áudio: ${script.audio_sugerido}` : "",
                      ].filter(Boolean).join("\n\n");
                      navigator.clipboard.writeText(txt).then(() => toast({ title: "Roteiro copiado" }));
                    }}>📋 Copiar roteiro</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <Textarea
          rows={8}
          value={caption || post.caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => caption && caption !== post.caption && onCaptionChange(post.id, caption)}
          className="text-xs leading-relaxed whitespace-pre-wrap"
        />
        {post.hashtags && <p className="text-[11px] text-muted-foreground leading-relaxed">{post.hashtags}</p>}

        <div className="rounded border border-dashed p-2 bg-muted/20 space-y-2">
          <button type="button" onClick={() => setShowRefine((v) => !v)} className="text-[10px] text-muted-foreground underline">
            {showRefine ? "− refinar legenda com IA" : "✨ refinar legenda com IA"}
          </button>
          {showRefine && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={refineTone}
                  onChange={(e) => setRefineTone(e.target.value)}
                  className="h-8 text-xs rounded border bg-background px-2"
                >
                  <option value="punchier">⚡ Mais punchy</option>
                  <option value="shorter">✂️ Mais curto</option>
                  <option value="longer">📖 Mais longo/profundo</option>
                  <option value="emotional">❤️ Mais emocional</option>
                  <option value="professional">💼 Mais profissional</option>
                  <option value="custom">🎯 Instruções minhas</option>
                </select>
                <Button size="sm" variant="secondary" className="h-8" onClick={handleRefine} disabled={refining}>
                  <Sparkles className="h-3 w-3 mr-1" />
                  {refining ? "Refinando..." : "Aplicar"}
                </Button>
              </div>
              {refineTone === "custom" && (
                <Textarea
                  rows={2}
                  value={refineInstr}
                  onChange={(e) => setRefineInstr(e.target.value)}
                  placeholder="Ex: começar com pergunta, citar caso de cliente, terminar com CTA pra DM"
                  className="text-xs"
                />
              )}
            </div>
          )}
        </div>


        {hasMedia && (
          <Button size="sm" variant="ghost" className="w-full h-7 text-[11px]" onClick={() => downloadPostMedia(post)}>
            <Download className="h-3 w-3 mr-1" /> Baixar mídia{post.media_urls.length > 1 ? ` (${post.media_urls.length} slides)` : ""}
          </Button>
        )}

        <div className="rounded border p-2 space-y-2 bg-muted/20">
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Conta de destino ({post.channel})</label>
          {post.channel === "instagram" && (
            <p className="text-[10px] text-emerald-500">✓ Instagram publica pela sua conta Meta conectada (estável). A conta abaixo (Unipile) só é usada como reserva — não precisa selecionar.</p>
          )}
          <select
            value={post.unipile_account_id ?? ""}
            onChange={(e) => onAccountChange(post.id, e.target.value)}
            className="w-full h-8 text-xs rounded border bg-background px-2"
          >
            <option value="">— escolha a conta —</option>
            {accounts.map((a) => {
              // Rótulo legível: se `name` parece um ID cru da Unipile (sem @, sem espaço,
              // longo), mostra "reserva (Unipile)". Se tiver @username, mostra "@name · reserva".
              const looksLikeRawId = !!a.name && !a.name.includes("@") && !a.name.includes(" ") && a.name.length >= 16;
              const base = post.channel === "instagram"
                ? (looksLikeRawId
                    ? "Instagram · reserva (Unipile)"
                    : `@${a.name.replace(/^@/, "")} · reserva`)
                : a.name;
              const statusSuffix = a.status && a.status !== "OK" ? ` (${a.status})` : "";
              return (
                <option key={a.id} value={a.id} disabled={a.blocked}>{base}{statusSuffix}</option>
              );
            })}
          </select>
          {accounts.some((a) => a.blocked) && (
            <p className="text-[10px] text-destructive">Conta bloqueada porque também aparece em outro painel. Reconecte o Instagram correto em Canais.</p>
          )}
          {!post.unipile_account_id && accounts.length > 1 && (
            <p className="text-[10px] text-amber-500">⚠️ Você tem {accounts.length} contas conectadas. Sem escolher, o post pode ir pra conta errada.</p>
          )}
          {post.post_url && (
            <a href={post.post_url} target="_blank" rel="noreferrer" className="text-[10px] text-primary underline block">Ver post publicado →</a>
          )}
          {post.last_error && post.status === "failed" && (
            <p className="text-[10px] text-destructive">❌ {post.last_error}</p>
          )}
        </div>

        <div className="flex gap-2">
          {post.status === "draft" && (
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onApprove(post.id)}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar e agendar
            </Button>
          )}
          <Button size="sm" className="flex-1" onClick={() => onPublishNow(post)} disabled={publishing || !hasMedia}>
            <Send className="h-4 w-4 mr-1" />
            {publishing ? "Publicando..." : "📤 Publicar agora"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
