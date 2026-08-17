import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

// Extrai a mensagem real de erro de uma edge function.
// supabase.functions.invoke devolve FunctionsHttpError com o body na `context` (Response).
// Sem isso, o toast mostra só "Edge Function returned a non-2xx status code" e esconde a causa.
async function extractEdgeError(e: unknown, fallback = "Falha"): Promise<string> {
  try {
    if (e instanceof FunctionsHttpError) {
      const ctx = (e as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.clone === "function") {
        try {
          const j = await ctx.clone().json();
          const msg = (j?.error ?? j?.message ?? "") as string;
          const det = j?.details ? ` — ${String(j.details).slice(0, 200)}` : "";
          if (msg) return `${msg}${det}`;
        } catch {
          try {
            const t = await ctx.clone().text();
            if (t) return t.slice(0, 300);
          } catch { /* noop */ }
        }
      }
    }
    const m = (e as { message?: string })?.message;
    return m || fallback;
  } catch {
    return (e as { message?: string })?.message || fallback;
  }
}
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserApiKeys } from "@/hooks/useUserApiKeys";
import { Sparkles, Loader2, Link2, Trash2, RefreshCw, AlertTriangle } from "lucide-react";

type ReferencePage = {
  id: string; url: string; label: string | null; title: string | null;
  summary: string | null; cta: string | null; og_image_url: string | null;
  features: string[] | null; value_props: string[] | null;
  last_scraped_at: string | null; active: boolean;
};

type Template = {
  id: string; slug: string; name: string; description: string | null;
  format: string; slide_count: number; icon: string | null; sort_order: number;
};

export default function TemplatesTab() {
  const qc = useQueryClient();
  const { get: getApiKey } = useUserApiKeys();
  const hasKieKey = !!getApiKey("kie_ai");
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<{ structure: { title: string; slides: { index: number; headline: string; body?: string }[] }; slides: string[]; post_id?: string } | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ["social_post_templates"],
    queryFn: async () => {
      const { data } = await supabase.from("social_post_templates").select("*").eq("active", true).order("sort_order");
      return (data ?? []) as Template[];
    },
  });

  const active = templates.find((t) => t.slug === openSlug) ?? null;

  async function handleGenerate() {
    if (!active) return;
    if (!hasKieKey) {
      toast({
        title: "Chave Kie.ai não configurada",
        description: "Para gerar as imagens do carrossel você precisa configurar a chave Kie.ai em Configurações → APIs.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    setPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke("social-thematic-carousel", {
        body: { topic: topic || undefined, format_hint: active.format, channel: "instagram", save: true },
      });
      if (error) throw error;
      const d = data as { success?: boolean; error?: string; slides?: string[]; structure?: { title: string; slides: { index: number; headline: string; body?: string }[] }; post_id?: string; errors?: string[] };
      if (!d?.success) throw new Error(d?.error ?? "Falha ao gerar");
      const totalPlanned = d.structure?.slides?.length ?? d.slides?.length ?? 0;
      const rendered = d.slides?.length ?? 0;
      const failed = Math.max(0, totalPlanned - rendered);
      setPreview({ structure: d.structure!, slides: d.slides ?? [], post_id: d.post_id });
      qc.invalidateQueries({ queryKey: ["social_posts"] });
      qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] });
      if (failed > 0) {
        const hint = d.errors?.[0] ? ` (${String(d.errors[0]).slice(0, 120)})` : "";
        toast({
          title: `Gerado com falhas parciais`,
          description: `${failed} de ${totalPlanned} slides falharam${hint}. Os ${rendered} restantes foram salvos como rascunho.`,
        });
      } else {
        toast({ title: "Carrossel gerado", description: `${rendered} slides on-brand criados como rascunho.` });
      }
    } catch (e) {
      const description = await extractEdgeError(e, "Falha ao gerar carrossel");
      toast({ title: "Erro ao gerar carrossel", description, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  function closeAll() {
    setOpenSlug(null); setTopic(""); setPreview(null);
  }

  return (
    <div className="space-y-6">
      <ReferenceLibrary />
      <BrandKitStudio />

      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Templates de Carrossel On-Brand</h2>
        <p className="text-sm text-muted-foreground">Clica num formato, dá o tema (ou deixa a IA escolher), e ela monta o carrossel inteiro usando paleta, tipografia e tom de voz do seu Brand Kit.</p>
      </div>

      {!hasKieKey && (
        <div className="flex items-start gap-2 p-3 rounded border border-amber-500/40 bg-amber-500/10 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Chave Kie.ai não configurada</p>
            <p className="text-xs mt-0.5">
              As imagens do carrossel dependem da Kie.ai. Configure a chave em{" "}
              <Link to="/configuracoes" className="underline font-medium">Configurações → APIs</Link>{" "}
              para liberar a geração. A estrutura de texto até funciona sem ela, mas os slides não sairão renderizados.
            </p>
          </div>
        </div>
      )}


      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {templates.map((t) => (
          <Card key={t.id} className="cursor-pointer hover:border-primary transition" onClick={() => setOpenSlug(t.slug)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-2xl">{t.icon ?? "✨"}</span>
                <span>{t.name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">{t.description}</p>
              <Badge variant="secondary" className="mt-2">{t.slide_count} slides</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!openSlug} onOpenChange={(o) => !o && closeAll()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{active?.icon}</span> {active?.name}
            </DialogTitle>
          </DialogHeader>

          {!preview ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{active?.description}</p>
              <div>
                <Label>Tema do carrossel (opcional)</Label>
                <Input
                  placeholder={active?.format === "listicle" ? 'Ex.: "7 workflows do n8n que toda agência precisa salvar"' : "Deixe vazio pra IA escolher um tema do seu nicho"}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">Quanto mais específico, melhor. A IA usa o tema literal.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              <div>
                <h3 className="font-semibold">{preview.structure.title}</h3>
                <p className="text-xs text-muted-foreground">{preview.slides.length} slides gerados e salvos como rascunho no Calendário.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {preview.slides.map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} alt={`Slide ${i + 1}`} className="w-full aspect-square object-cover rounded border" />
                    <Badge className="absolute top-1 left-1">{i + 1}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            {!preview ? (
              <>
                <Button variant="outline" onClick={closeAll}>Cancelar</Button>
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando {active?.slide_count} slides...</> : <><Sparkles className="h-4 w-4 mr-2" /> Gerar carrossel</>}
                </Button>
              </>
            ) : (
              <Button onClick={closeAll}>Fechar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ====================== Brand Kit Studio (teste rápido Feed / Stories / Carrossel) ======================

type StudioFormat = "feed" | "stories" | "carousel";

function BrandKitStudio() {
  const qc = useQueryClient();
  const { get: getApiKey } = useUserApiKeys();
  const hasKieKey = !!getApiKey("kie_ai");
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<StudioFormat>("feed");
  const [referencePageId, setReferencePageId] = useState<string>("none");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ format: StudioFormat; slides: string[]; structure: { title: string; caption: string; hashtags: string }; post_id?: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");

  // Carrega brand kit pra mostrar paleta no header (validação visual)
  const { data: brand } = useQuery({
    queryKey: ["social_brand_profile_studio"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("social_brand_profile").select("color_palette,voice_tone,niche").eq("user_id", u.user.id).maybeSingle();
      return data as { color_palette: Record<string, string> | null; voice_tone: string | null; niche: string | null } | null;
    },
  });

  const { data: refs = [] } = useQuery({
    queryKey: ["social_reference_pages_select"],
    queryFn: async () => {
      const { data } = await supabase.from("social_reference_pages").select("id,label,url,title,brand_data,og_image_url").eq("active", true).order("created_at", { ascending: false });
      return (data ?? []) as (Pick<ReferencePage, "id" | "label" | "url" | "title" | "og_image_url"> & { brand_data: { name?: string; logo?: string; palette?: Record<string, string> } | null })[];
    },
  });

  const selectedRef = refs.find((r) => r.id === referencePageId) ?? null;
  const refPalette = (selectedRef?.brand_data?.palette ?? {}) as Record<string, string>;
  const brandPalette = (brand?.color_palette ?? {}) as Record<string, string>;
  const usingRef = !!selectedRef && !!(refPalette.primary || refPalette.secondary || refPalette.accent);
  const palette = usingRef ? refPalette : brandPalette;
  const hasBrand = !!brand && !!(brandPalette.primary || brandPalette.secondary || brandPalette.accent);

  async function generate(fmt: StudioFormat) {
    if (!hasKieKey) {
      toast({
        title: "Chave Kie.ai não configurada",
        description: "Para gerar as imagens você precisa configurar a chave Kie.ai em Configurações → APIs.",
        variant: "destructive",
      });
      return;
    }
    setFormat(fmt);
    setLoading(true);
    setResult(null);
    try {
      const formatHint = fmt === "carousel" ? "listicle" : fmt;
      const { data, error } = await supabase.functions.invoke("social-thematic-carousel", {
        body: {
          topic: topic || undefined,
          format_hint: formatHint,
          channel: "instagram",
          save: true,
          reference_page_id: referencePageId !== "none" ? referencePageId : undefined,
        },
      });
      if (error) throw error;
      const d = data as { success?: boolean; error?: string; slides?: string[]; structure?: { title: string; caption: string; hashtags: string; slides?: unknown[] }; post_id?: string; errors?: string[] };
      if (!d?.success) throw new Error(d?.error ?? "Falha ao gerar");
      setResult({ format: fmt, slides: d.slides ?? [], structure: d.structure!, post_id: d.post_id });
      qc.invalidateQueries({ queryKey: ["social_posts"] });
      const totalPlanned = (d.structure?.slides as unknown[] | undefined)?.length ?? d.slides?.length ?? 0;
      const rendered = d.slides?.length ?? 0;
      const failed = Math.max(0, totalPlanned - rendered);
      const label = fmt === "stories" ? "Stories" : fmt === "feed" ? "Feed" : "Carrossel";
      if (failed > 0) {
        const hint = d.errors?.[0] ? ` (${String(d.errors[0]).slice(0, 120)})` : "";
        toast({ title: `${label}: falhas parciais`, description: `${failed} de ${totalPlanned} slides falharam${hint}. ${rendered} salvo(s) como rascunho.` });
      } else {
        toast({ title: `${label} gerado on-brand`, description: `${rendered} mídia(s) salva(s) como rascunho.` });
      }
    } catch (e) {
      const description = await extractEdgeError(e, "Falha ao gerar mídia");
      toast({ title: "Erro ao gerar", description, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function downloadAll() {
    if (!result) return;
    for (let i = 0; i < result.slides.length; i++) {
      try {
        const r = await fetch(result.slides[i]);
        const blob = await r.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${result.format}_${i + 1}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(a.href);
      } catch { /* skip */ }
    }
    toast({ title: "Download iniciado", description: `${result.slides.length} arquivo(s).` });
  }

  async function publishNow() {
    if (!result?.post_id) return;
    setActionLoading("publish");
    try {
      const { data, error } = await supabase.functions.invoke("social-publish", { body: { post_id: result.post_id } });
      if (error) throw error;
      if ((data as { success?: boolean })?.success === false) throw new Error((data as { error?: string }).error ?? "Falha");
      toast({ title: "Publicado", description: "Post enviado para o Instagram." });
    } catch (e) {
      toast({ title: "Erro ao publicar", description: (e as Error).message, variant: "destructive" });
    } finally { setActionLoading(null); }
  }

  async function schedule() {
    if (!result?.post_id || !scheduleAt) return;
    setActionLoading("schedule");
    try {
      const { error } = await supabase.from("social_posts").update({ status: "scheduled", scheduled_at: new Date(scheduleAt).toISOString() }).eq("id", result.post_id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["social_posts"] });
      qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] });
      toast({ title: "Agendado", description: `Para ${new Date(scheduleAt).toLocaleString("pt-BR")}.` });
    } catch (e) {
      toast({ title: "Erro ao agendar", description: (e as Error).message, variant: "destructive" });
    } finally { setActionLoading(null); }
  }


  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          🧪 Testar Brand Kit (Feed · Stories · Carrossel)
        </CardTitle>
        <p className="text-xs text-muted-foreground">Gera os 3 formatos usando a paleta, tipografia e tom do seu Brand Kit — pra validar se está saindo no nível instagem.ai antes de agendar em escala.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasKieKey && (
          <div className="text-xs p-2 rounded bg-amber-500/10 text-amber-700 border border-amber-500/30 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Chave <strong>Kie.ai</strong> obrigatória para gerar as imagens. Configure em{" "}
              <Link to="/configuracoes" className="underline font-medium">Configurações → APIs</Link>.
            </span>
          </div>
        )}
        {!hasBrand && (
          <div className="text-xs p-2 rounded bg-amber-500/10 text-amber-700 border border-amber-500/30">
            ⚠️ Brand Kit ainda não preenchido. Vá em <strong>Brand Kit</strong> e puxe do seu Instagram primeiro — sem paleta o resultado fica genérico.
          </div>
        )}
        {(hasBrand || usingRef) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            {usingRef ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">
                {selectedRef?.brand_data?.logo && (
                  <img src={selectedRef.brand_data.logo} alt="" referrerPolicy="no-referrer" className="w-4 h-4 rounded object-contain" />
                )}
                🔗 Usando marca da referência: <strong>{selectedRef?.brand_data?.name ?? selectedRef?.label ?? selectedRef?.title}</strong>
              </span>
            ) : (
              <span>Paleta Brand Kit:</span>
            )}
            {["primary", "secondary", "accent"].map((k) =>
              palette[k] ? <span key={k} className="inline-flex items-center gap-1"><span className="w-4 h-4 rounded border" style={{ backgroundColor: palette[k] }} /> {palette[k]}</span> : null,
            )}
            {!usingRef && brand?.voice_tone && <span className="ml-3">Tom: <em>{brand.voice_tone.slice(0, 60)}</em></span>}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Tema (opcional — IA escolhe do seu nicho se vazio)</Label>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder='Ex.: "3 erros ao automatizar follow-up"' />
          </div>
          <div>
            <Label className="text-xs">🔗 Página de referência (opcional)</Label>
            <Select value={referencePageId} onValueChange={setReferencePageId}>
              <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma — usar só Brand Kit</SelectItem>
                {refs.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.label ?? r.title ?? r.url.slice(0, 60)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">Adicione URLs na Biblioteca acima ↑</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button onClick={() => generate("feed")} disabled={loading || !hasKieKey} variant={format === "feed" && loading ? "default" : "outline"}>
            {loading && format === "feed" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : "📷 "}Feed (1:1)
          </Button>
          <Button onClick={() => generate("stories")} disabled={loading || !hasKieKey} variant={format === "stories" && loading ? "default" : "outline"}>
            {loading && format === "stories" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : "📱 "}Stories (9:16)
          </Button>
          <Button onClick={() => generate("carousel")} disabled={loading || !hasKieKey} variant={format === "carousel" && loading ? "default" : "outline"}>
            {loading && format === "carousel" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : "🎠 "}Carrossel
          </Button>
        </div>

        {result && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{result.structure.title}</p>
                <p className="text-xs text-muted-foreground">{result.slides.length} mídia(s) · salvo como rascunho no Calendário</p>
              </div>
              <Badge>{result.format}</Badge>
            </div>
            <div className={`grid gap-2 ${result.format === "stories" ? "grid-cols-2 sm:grid-cols-3" : result.format === "feed" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
              {result.slides.map((url, i) => (
                <div key={i} className="relative">
                  <img src={url} alt={`Slide ${i + 1}`} className={`w-full rounded border ${result.format === "stories" ? "aspect-[9/16] object-cover" : "aspect-square object-cover"}`} />
                  {result.slides.length > 1 && <Badge className="absolute top-1 left-1">{i + 1}</Badge>}
                </div>
              ))}
            </div>
            {result.structure.caption && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Ver legenda + hashtags</summary>
                <pre className="whitespace-pre-wrap mt-2 p-2 bg-muted rounded">{result.structure.caption}{"\n\n"}{result.structure.hashtags}</pre>
              </details>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
              <Button size="sm" variant="outline" onClick={downloadAll}>⬇️ Baixar</Button>
              <Button size="sm" onClick={publishNow} disabled={!result.post_id || actionLoading === "publish"}>
                {actionLoading === "publish" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : "🚀 "}Postar agora
              </Button>
              <div className="flex items-center gap-1 ml-auto">
                <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="h-8 w-[200px]" />
                <Button size="sm" variant="secondary" onClick={schedule} disabled={!result.post_id || !scheduleAt || actionLoading === "schedule"}>
                  {actionLoading === "schedule" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : "📅 "}Agendar
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ====================== Biblioteca de Referências (LPs / páginas de produto) ======================

function ReferenceLibrary() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [rescanId, setRescanId] = useState<string | null>(null);

  const { data: refs = [], isLoading } = useQuery({
    queryKey: ["social_reference_pages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("social_reference_pages")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as ReferencePage[];
    },
  });

  async function addRef() {
    if (!/^https?:\/\//i.test(url)) {
      toast({ title: "URL inválida", description: "Use http(s)://", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke("social-scrape-reference", {
        body: { url, label: label || undefined },
      });
      if (error) throw error;
      const d = data as { success?: boolean; error?: string };
      if (!d?.success) throw new Error(d?.error ?? "Falha");
      toast({ title: "Referência salva", description: "Página analisada e disponível pra usar nas gerações." });
      setUrl(""); setLabel("");
      qc.invalidateQueries({ queryKey: ["social_reference_pages"] });
      qc.invalidateQueries({ queryKey: ["social_reference_pages_select"] });
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally { setAdding(false); }
  }

  async function rescan(r: ReferencePage) {
    setRescanId(r.id);
    try {
      const { error } = await supabase.functions.invoke("social-scrape-reference", {
        body: { url: r.url, label: r.label ?? undefined },
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["social_reference_pages"] });
      toast({ title: "Reanalisado" });
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally { setRescanId(null); }
  }

  async function remove(id: string) {
    if (!confirm("Remover essa referência?")) return;
    await supabase.from("social_reference_pages").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["social_reference_pages"] });
    qc.invalidateQueries({ queryKey: ["social_reference_pages_select"] });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" /> Biblioteca de Referências
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Adicione URLs das suas LPs/páginas de produto. A IA lê headline, features e benefícios reais e usa como base factual nas postagens — sem inventar nada.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="https://lp.leadsbooster.com.br/"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Rótulo (opcional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="sm:w-[200px]"
          />
          <Button onClick={addRef} disabled={adding || !url}>
            {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : "+ "}Adicionar
          </Button>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : refs.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhuma referência ainda. Cole uma URL acima — a IA vai extrair tudo automaticamente.</p>
        ) : (
          <div className="space-y-2">
            {refs.map((r) => (
              <div key={r.id} className="flex items-start gap-3 p-3 rounded border bg-card">
                {r.og_image_url ? (
                  <img src={r.og_image_url} alt="" className="w-16 h-16 rounded object-cover border flex-shrink-0" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-16 h-16 rounded border bg-muted flex items-center justify-center flex-shrink-0">
                    <Link2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{r.label ?? r.title ?? r.url}</p>
                    {(r.features?.length ?? 0) > 0 && <Badge variant="secondary" className="text-[10px]">{r.features?.length} features</Badge>}
                  </div>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground truncate block hover:underline">{r.url}</a>
                  {r.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.summary}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="ghost" onClick={() => rescan(r)} disabled={rescanId === r.id} title="Reanalisar">
                    {rescanId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(r.id)} title="Remover">
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
