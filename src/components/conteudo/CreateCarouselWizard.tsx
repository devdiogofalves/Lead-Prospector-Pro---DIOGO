import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, ChevronLeft, ChevronRight, Send, Download, RefreshCw, Image as ImageIcon, Copy, Trash2, Plus, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CAROUSEL_FONTS, FONT_PAIRS } from "@/lib/carouselFonts";
import { SlidePreview, exportSlideBlob, type Slide, type CarouselStyle } from "./CarouselCanvasEditor";
import { useQuery } from "@tanstack/react-query";

const TEMPLATES = [
  { id: "minimalista", label: "Minimalista", overlay: "rgba(0,0,0,0.35)", heading: "#FFFFFF", body: "#F1F5F9" },
  { id: "editorial", label: "Editorial", overlay: "rgba(15,23,42,0.55)", heading: "#F8FAFC", body: "#CBD5E1" },
  { id: "bold", label: "Bold Impact", overlay: "rgba(0,0,0,0.55)", heading: "#FDE047", body: "#FFFFFF" },
  { id: "neon", label: "Neon", overlay: "rgba(15,23,42,0.65)", heading: "#22D3EE", body: "#F8FAFC" },
  { id: "vintage", label: "Vintage", overlay: "rgba(120,53,15,0.45)", heading: "#FEF3C7", body: "#FDE68A" },
  { id: "corporate", label: "Corporate", overlay: "rgba(15,23,42,0.60)", heading: "#FFFFFF", body: "#93C5FD" },
];

type Step = 1 | 2 | 3 | 4 | 5;

export function CreateCarouselWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [step, setStep] = useState<Step>(1);
  const [theme, setTheme] = useState("");
  const [slidesCount, setSlidesCount] = useState<5 | 7 | 10>(7);
  const [template, setTemplate] = useState(TEMPLATES[0]);
  const [pairName, setPairName] = useState<string>(FONT_PAIRS[0].name);
  const [headingFont, setHeadingFont] = useState(FONT_PAIRS[0].heading);
  const [bodyFont, setBodyFont] = useState(FONT_PAIRS[0].body);
  const [generating, setGenerating] = useState(false);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [caption, setCaption] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [regenBusy, setRegenBusy] = useState<null | "text" | "background" | "both">(null);


  const { data: brand } = useQuery({
    queryKey: ["brand_kit_min"],
    queryFn: async () => {
      const { data } = await supabase.from("social_brand_profile").select("logo_url,color_palette,font_style").maybeSingle();
      return data;
    },
    enabled: open,
  });

  const style: CarouselStyle = {
    headingFont,
    bodyFont,
    headingColor: template.heading,
    bodyColor: template.body,
    overlayColor: template.overlay,
    logoUrl: brand?.logo_url ?? undefined,
    template: template.id,
  };

  function reset() {
    setStep(1); setTheme(""); setSlides([]); setCaption(""); setActiveIdx(0);
  }

  async function generate() {
    if (!theme.trim()) return toast({ title: "Descreva o tema do carrossel", variant: "destructive" });
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("carousel-generate", {
        body: {
          theme,
          slides_count: slidesCount,
          template: template.id,
          fonts: { heading: headingFont, body: bodyFont },
          generate_backgrounds: true,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setSlides((data as any).slides ?? []);
      setCaption((data as any).caption ?? "");
      setStep(5);
    } catch (e: any) {
      toast({ title: "Erro ao gerar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  function updateSlide(i: number, patch: Partial<Slide>) {
    setSlides((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function regenerateSlide(kind: "text" | "background" | "both") {
    if (!slides[activeIdx]) return;
    setRegenBusy(kind);
    try {
      const { data, error } = await supabase.functions.invoke("carousel-generate", {
        body: {
          theme,
          slides_count: slidesCount,
          template: template.id,
          fonts: { heading: headingFont, body: bodyFont },
          regenerate: { kind, index: activeIdx, current: slides[activeIdx], total: slides.length },
        },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      if (d?.slide) updateSlide(activeIdx, d.slide);
      toast({ title: `Slide ${activeIdx + 1} atualizado` });
    } catch (e: any) {
      toast({ title: "Falha ao regerar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setRegenBusy(null);
    }
  }

  function moveSlide(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    setSlides((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setActiveIdx(j);
  }

  function duplicateSlide(i: number) {
    setSlides((prev) => {
      const next = [...prev];
      next.splice(i + 1, 0, { ...prev[i] });
      return next;
    });
    setActiveIdx(i + 1);
  }

  function deleteSlide(i: number) {
    if (slides.length <= 1) return toast({ title: "Não é possível excluir o último slide", variant: "destructive" });
    setSlides((prev) => prev.filter((_, idx) => idx !== i));
    setActiveIdx((idx) => Math.max(0, Math.min(idx, slides.length - 2)));
  }

  function addSlide() {
    setSlides((prev) => [
      ...prev,
      { heading: "Novo slide", body: "Edite este slide ou peça para a IA regenerar.", image_prompt: "abstract minimal gradient background" } as Slide,
    ]);
    setActiveIdx(slides.length);
  }


  async function downloadAll() {
    toast({ title: `Renderizando ${slides.length} slides…` });
    for (let i = 0; i < slides.length; i++) {
      const blob = await exportSlideBlob(slides[i], style, i, slides.length);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `carrossel-${i + 1}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 800);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async function saveDraft() {
    setPublishing(true);
    try {
      // faz upload dos slides pro storage
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("não autenticado");
      const urls: string[] = [];
      for (let i = 0; i < slides.length; i++) {
        const blob = await exportSlideBlob(slides[i], style, i, slides.length);
        const path = `${user.id}/carousels/${Date.now()}-${i + 1}.png`;
        const { error: upErr } = await supabase.storage.from("social-assets").upload(path, blob, { contentType: "image/png", upsert: true });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage.from("social-assets").createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signed?.signedUrl) urls.push(signed.signedUrl);
      }
      const { error: insErr } = await supabase.from("social_posts").insert({
        user_id: user.id,
        channel: "instagram",
        status: "draft",
        media_type: "carousel",
        post_format: "carousel",
        caption,
        media_urls: urls,
        cover_url: urls[0] ?? null,
        carousel_slides: slides,
        carousel_fonts: { heading: headingFont, body: bodyFont },
        carousel_template: template.id,
      });
      if (insErr) throw insErr;
      toast({ title: "Carrossel salvo em Rascunhos", description: "Vá para o Calendário e escolha data/hora para publicar." });
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Novo Carrossel Multi-Fonte
            <Badge variant="outline" className="ml-2">Passo {step} / 5</Badge>
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Sobre o que é o carrossel?</Label>
              <Textarea
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="Ex: 5 erros que estão matando seu Instagram em 2026"
                rows={3}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">A IA vai estruturar hook, storytelling e CTA automaticamente.</p>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!theme.trim()}>Próximo <ChevronRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Label>Quantos slides?</Label>
            <div className="grid grid-cols-3 gap-3">
              {[5, 7, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setSlidesCount(n as any)}
                  className={`p-6 rounded-lg border-2 text-center transition ${slidesCount === n ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
                >
                  <div className="text-3xl font-bold">{n}</div>
                  <div className="text-xs text-muted-foreground mt-1">{n === 5 ? "Ágil" : n === 7 ? "Ideal" : "Deep dive"}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button>
              <Button onClick={() => setStep(3)}>Próximo <ChevronRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <Label>Escolha o estilo visual</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t)}
                  className={`p-4 rounded-lg border-2 text-left transition ${template.id === t.id ? "border-primary" : "border-border hover:border-primary/50"}`}
                  style={{ background: t.overlay.replace("0.35", "0.9").replace("0.55", "0.9").replace("0.65", "0.9").replace("0.60", "0.9").replace("0.45", "0.9") }}
                >
                  <div className="font-bold text-base" style={{ color: t.heading }}>{t.label}</div>
                  <div className="text-xs mt-1" style={{ color: t.body }}>Sample body text</div>
                </button>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button>
              <Button onClick={() => setStep(4)}>Próximo <ChevronRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <Label>Par de fontes recomendado</Label>
              <Select value={pairName} onValueChange={(v) => {
                setPairName(v);
                const p = FONT_PAIRS.find((x) => x.name === v);
                if (p) { setHeadingFont(p.heading); setBodyFont(p.body); }
              }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_PAIRS.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      <span style={{ fontFamily: p.heading, fontWeight: 700 }}>{p.name}</span>
                      <span className="text-muted-foreground text-xs ml-2">— {p.mood}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fonte do título</Label>
                <Select value={headingFont} onValueChange={setHeadingFont}>
                  <SelectTrigger className="mt-1" style={{ fontFamily: headingFont }}><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {CAROUSEL_FONTS.map((f) => (
                      <SelectItem key={f.id} value={f.family} style={{ fontFamily: f.family }}>
                        {f.family}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fonte do corpo</Label>
                <Select value={bodyFont} onValueChange={setBodyFont}>
                  <SelectTrigger className="mt-1" style={{ fontFamily: bodyFont }}><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {CAROUSEL_FONTS.map((f) => (
                      <SelectItem key={f.id} value={f.family} style={{ fontFamily: f.family }}>
                        {f.family}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* preview */}
            <div className="rounded-lg border border-border p-4 space-y-2" style={{ background: template.overlay.replace(/[\d.]+\)$/, "0.95)") }}>
              <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 32, color: template.heading, lineHeight: 1.1 }}>
                5 erros que estão matando seu Instagram
              </div>
              <div style={{ fontFamily: bodyFont, fontSize: 15, color: template.body }}>
                Deslize e veja se você comete algum deles no seu perfil.
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(3)}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button>
              <Button onClick={generate} disabled={generating} className="gap-2">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? "Gerando… (30-60s)" : "Gerar carrossel"}
              </Button>
            </div>
          </div>
        )}

        {step === 5 && slides.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
              {/* preview grande */}
              <div>
                <SlidePreview slide={slides[activeIdx]} style={style} index={activeIdx} total={slides.length} />
                <div className="flex items-center justify-between mt-2">
                  <Button size="sm" variant="ghost" onClick={() => setActiveIdx((i) => Math.max(0, i - 1))} disabled={activeIdx === 0}>
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground">Slide {activeIdx + 1} / {slides.length}</span>
                  <Button size="sm" variant="ghost" onClick={() => setActiveIdx((i) => Math.min(slides.length - 1, i + 1))} disabled={activeIdx === slides.length - 1}>
                    Próximo <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {/* editor do slide */}
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => regenerateSlide("text")} disabled={!!regenBusy} className="gap-1">
                    {regenBusy === "text" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Regenerar texto
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => regenerateSlide("background")} disabled={!!regenBusy} className="gap-1">
                    {regenBusy === "background" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                    Regenerar fundo
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => regenerateSlide("both")} disabled={!!regenBusy} className="gap-1">
                    {regenBusy === "both" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Ambos
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1 border-t border-border pt-2">
                  <Button size="sm" variant="ghost" onClick={() => moveSlide(activeIdx, -1)} disabled={activeIdx === 0} title="Mover para cima"><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => moveSlide(activeIdx, 1)} disabled={activeIdx === slides.length - 1} title="Mover para baixo"><ArrowDown className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => duplicateSlide(activeIdx)} title="Duplicar"><Copy className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteSlide(activeIdx)} title="Excluir" className="text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
                <div>
                  <Label>Título do slide {activeIdx + 1}</Label>
                  <Textarea value={slides[activeIdx].heading} onChange={(e) => updateSlide(activeIdx, { heading: e.target.value })} rows={2} className="mt-1" />
                </div>
                <div>
                  <Label>Corpo</Label>
                  <Textarea value={slides[activeIdx].body} onChange={(e) => updateSlide(activeIdx, { body: e.target.value })} rows={3} className="mt-1" />
                </div>
                <div>
                  <Label>Legenda do post</Label>
                  <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} className="mt-1" />
                </div>
              </div>
            </div>

            {/* thumbnails */}
            <div className="flex gap-2 overflow-x-auto pb-2 items-stretch">
              {slides.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  className={`shrink-0 w-24 rounded-md border-2 overflow-hidden relative ${i === activeIdx ? "border-primary" : "border-transparent"}`}
                >
                  <SlidePreview slide={s} style={style} index={i} total={slides.length} className="w-full aspect-[4/5]" />
                  <span className="absolute top-1 left-1 bg-black/70 text-white text-[10px] rounded px-1">{i + 1}</span>
                </button>
              ))}
              <button
                onClick={addSlide}
                className="shrink-0 w-24 aspect-[4/5] rounded-md border-2 border-dashed border-border hover:border-primary flex items-center justify-center text-muted-foreground hover:text-primary"
                title="Adicionar slide"
              >
                <Plus className="h-6 w-6" />
              </button>
            </div>


            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(4)}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={downloadAll} className="gap-2"><Download className="h-4 w-4" /> Baixar PNGs</Button>
                <Button onClick={saveDraft} disabled={publishing} className="gap-2">
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Salvar em Rascunhos
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
