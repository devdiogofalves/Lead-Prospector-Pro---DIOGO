import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { translateInvokeError } from "@/lib/friendlyError";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Pencil } from "lucide-react";
import {
  Instagram, Sparkles, RefreshCw, Upload, Image as ImageIcon, Palette,
  Users, Heart, TrendingUp, BadgeCheck, Link as LinkIcon, Copy, ExternalLink,
  BarChart3, Eye, Bookmark, Share2,
} from "lucide-react";
import BibliotecaTab from "@/components/conteudo/BibliotecaTab";

const BIO_DOMAIN = "leadsbooster.com.br";

export default function BrandKitTab() {
  const qc = useQueryClient();
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [slugInput, setSlugInput] = useState("");
  const [savingSlug, setSavingSlug] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [manual, setManual] = useState({
    display_name: "",
    niche: "",
    voice_tone: "",
    cta_style: "",
    visual_mood: "",
    photography_style: "",
    bio: "",
  });

  const { data: brand } = useQuery({
    queryKey: ["social_brand_profile"],
    queryFn: async () => {
      const { data } = await supabase.from("social_brand_profile").select("*").maybeSingle();
      return data as any;
    },
  });

  useEffect(() => {
    if (brand?.bio_link_slug) setSlugInput(brand.bio_link_slug);
    else if (brand?.instagram_handle) setSlugInput(slugify(brand.instagram_handle));
  }, [brand?.bio_link_slug, brand?.instagram_handle]);

  useEffect(() => {
    if (!brand) return;
    setManual({
      display_name: brand.display_name ?? "",
      niche: brand.niche ?? "",
      voice_tone: brand.voice_tone ?? "",
      cta_style: brand.cta_style ?? "",
      visual_mood: brand.visual_mood ?? "",
      photography_style: brand.photography_style ?? "",
      bio: brand.bio ?? "",
    });
  }, [brand?.id]);

  async function saveManual() {
    setSavingManual(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not_authed");
      const payload: Record<string, any> = { user_id: user.id };
      for (const [k, v] of Object.entries(manual)) {
        const t = typeof v === "string" ? v.trim() : v;
        if (t !== "" && t !== null && t !== undefined) payload[k] = t;
      }
      const { error } = await supabase
        .from("social_brand_profile")
        .upsert(payload as any, { onConflict: "user_id" });
      if (error) throw error;
      toast({ title: "✅ Brand Kit salvo" });
      qc.invalidateQueries({ queryKey: ["social_brand_profile"] });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setSavingManual(false);
    }
  }

  async function analyze() {
    const h = (handle || brand?.instagram_handle || "").trim();
    if (!h) return toast({ title: "Cole seu @ do Instagram primeiro" });
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("social-brand-from-instagram", { body: { handle: h } });
      if (error) throw error;
      const d = data as { success?: boolean; error?: string };
      if (!d?.success) throw new Error(d?.error ?? "Falha");
      toast({ title: "✨ Brand kit atualizado!" });
      qc.invalidateQueries({ queryKey: ["social_brand_profile"] });
    } catch (e: any) {
      const raw = String(e?.message ?? e?.error ?? e ?? "").toLowerCase();
      let description: string;
      if (raw.includes("configure sua chave apify") || raw.includes("apify_missing_key") || (raw.includes("apify") && raw.includes("chave"))) {
        description = "Para analisar o perfil automaticamente, configure sua chave Apify em Configurações → APIs. A publicação de posts NÃO depende disso.";
      } else if (raw.includes("apify_quota") || raw.includes("quota") || raw.includes("402") || raw.includes("payment required") || raw.includes("saldo") || raw.includes("credit")) {
        description = "Sua cota da Apify acabou. Renove em Configurações → APIs. A publicação de posts NÃO depende disso.";
      } else if (raw.includes("not found") || raw.includes("404") || raw.includes("perfil") && raw.includes("existe")) {
        description = "Perfil do Instagram não encontrado. Confira o @ e tente novamente. A publicação de posts NÃO depende disso.";
      } else {
        description = translateInvokeError(e, "Análise do Instagram") + " A publicação de posts NÃO depende disso.";
      }
      toast({ title: "Brand Kit — Instagram", description, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function refreshInsights() {
    setInsightsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-instagram-insights", { body: {} });
      if (error) throw error;
      const d = data as { ok?: boolean; error?: string; hint?: string };
      if (!d?.ok) throw new Error(d?.hint ?? d?.error ?? "Falha");
      toast({ title: "📊 Métricas atualizadas" });
      qc.invalidateQueries({ queryKey: ["social_brand_profile"] });
    } catch (e: any) {
      toast({ title: "Erro métricas", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setInsightsLoading(false);
    }
  }

  async function saveSlug() {
    const s = slugify(slugInput);
    if (!s) return toast({ title: "Slug inválido" });
    setSavingSlug(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not_authed");
      const { error } = await supabase
        .from("social_brand_profile")
        .update({ bio_link_slug: s })
        .eq("user_id", user.id);
      if (error) throw error;
      toast({ title: "Slug salvo", description: `${BIO_DOMAIN}/bio/${s}` });
      qc.invalidateQueries({ queryKey: ["social_brand_profile"] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message?.includes("unique") ? "Esse slug já está em uso" : String(e?.message ?? e), variant: "destructive" });
    } finally {
      setSavingSlug(false);
    }
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const urls: string[] = Array.isArray(brand?.avatar_urls) ? [...(brand.avatar_urls as string[])] : [];
    for (const f of files) {
      const path = `${user.id}/avatars/${Date.now()}_${f.name}`;
      const { error } = await supabase.storage.from("social-assets").upload(path, f);
      if (error) { toast({ title: "Upload falhou", description: error.message, variant: "destructive" }); continue; }
      const { data: signed } = await supabase.storage.from("social-assets").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signed?.signedUrl) urls.push(signed.signedUrl);
    }
    await supabase.from("social_brand_profile").upsert({ user_id: user.id, avatar_urls: urls }, { onConflict: "user_id" });
    qc.invalidateQueries({ queryKey: ["social_brand_profile"] });
    toast({ title: `${files.length} avatar(es) salvo(s)` });
  }

  const palette = (brand?.color_palette as Record<string, string> | undefined) ?? {};
  const samples = (brand?.sample_post_urls as string[] | undefined) ?? [];
  const avatars = (brand?.avatar_urls as string[] | undefined) ?? [];
  const insights = brand?.insights as any;
  const insightsPosts: any[] = insights?.posts ?? [];

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Instagram className="h-4 w-4" /> Brand Kit do Instagram
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Cole seu @ — a IA analisa logo, paleta, tipografia, mood e tom de voz dos seus últimos posts. Todo conteúdo gerado passa a seguir esse padrão.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder={brand?.instagram_handle ? `@${brand.instagram_handle}` : "@seunome"}
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
            />
            <Button onClick={analyze} disabled={loading}>
              {loading ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {brand?.instagram_handle ? "Re-analisar" : "Analisar perfil"}
            </Button>
          </div>
          {brand?.last_analyzed_at && (
            <p className="text-xs text-muted-foreground">
              Última análise: {new Date(brand.last_analyzed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </p>
          )}
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <BadgeCheck className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Fonte única — aplicado automaticamente em:</span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {[
                "Compor post",
                "Templates de Carrossel",
                "Reels IA (roteiro)",
                "Planejamento mensal",
                "Legendas & refino",
                "Auto-DM Instagram",
                "Resposta a comentários",
              ].map((f) => (
                <Badge key={f} variant="secondary" className="font-normal">{f}</Badge>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Paleta, tipografia, tom de voz e mood ficam sincronizados em todos os geradores. Ao re-analisar, o padrão atualiza em tudo.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <Collapsible open={manualOpen} onOpenChange={setManualOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/40 transition">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Pencil className="h-4 w-4" /> Preencher manualmente
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${manualOpen ? "rotate-180" : ""}`} />
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Opcional. A publicação de posts não depende disso — mas um Brand Kit bem preenchido melhora muito o conteúdo que a IA gera.
              </p>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nome da marca</Label>
                  <Input value={manual.display_name} onChange={(e) => setManual({ ...manual, display_name: e.target.value })} placeholder="Ex.: LeadsBooster" />
                </div>
                <div>
                  <Label className="text-xs">Nicho / segmento</Label>
                  <Input value={manual.niche} onChange={(e) => setManual({ ...manual, niche: e.target.value })} placeholder="Ex.: SaaS de prospecção B2B" />
                </div>
                <div>
                  <Label className="text-xs">Clima visual</Label>
                  <Input value={manual.visual_mood} onChange={(e) => setManual({ ...manual, visual_mood: e.target.value })} placeholder="Ex.: clean, tech, vibrante" />
                </div>
                <div>
                  <Label className="text-xs">Estilo de foto/imagem</Label>
                  <Input value={manual.photography_style} onChange={(e) => setManual({ ...manual, photography_style: e.target.value })} placeholder="Ex.: mockups de tela, fotos naturais" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Tom de voz</Label>
                <Textarea rows={2} value={manual.voice_tone} onChange={(e) => setManual({ ...manual, voice_tone: e.target.value })} placeholder="Ex.: consultivo, direto, sem jargão. Fala com dono de negócio." />
              </div>
              <div>
                <Label className="text-xs">Estilo de CTA</Label>
                <Textarea rows={2} value={manual.cta_style} onChange={(e) => setManual({ ...manual, cta_style: e.target.value })} placeholder="Ex.: 'Comenta AGENDA que te chamo no direct'" />
              </div>
              <div>
                <Label className="text-xs">Bio / descrição curta</Label>
                <Textarea rows={3} value={manual.bio} onChange={(e) => setManual({ ...manual, bio: e.target.value })} placeholder="Bio que resume o que a marca faz e para quem." />
              </div>
              <div className="flex justify-end">
                <Button onClick={saveManual} disabled={savingManual}>
                  {savingManual ? "Salvando..." : "Salvar Brand Kit"}
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>




      {brand && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Palette className="h-4 w-4" /> Identidade extraída
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 items-start">
                {brand.logo_url && (
                  <img
                    src={brand.logo_url}
                    alt="logo"
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    className="w-24 h-24 rounded-lg object-cover border shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold">{brand.display_name ?? brand.instagram_handle}</div>
                  <div className="text-xs text-muted-foreground">@{brand.instagram_handle}</div>
                  {brand.bio && (
                    <p className="text-sm mt-2 whitespace-pre-line">{brand.bio}</p>
                  )}
                </div>
              </div>

              {(brand.followers_count || brand.posts_count || brand.engagement_rate) && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <Metric icon={<Users className="h-4 w-4" />} label="Seguidores" value={fmtNum(brand.followers_count)} />
                  <Metric icon={<Users className="h-4 w-4 opacity-60" />} label="Seguindo" value={fmtNum(brand.following_count)} />
                  <Metric icon={<ImageIcon className="h-4 w-4" />} label="Posts" value={fmtNum(brand.posts_count)} />
                  <Metric icon={<Heart className="h-4 w-4" />} label="Likes médios" value={fmtNum(brand.avg_likes)} />
                  <Metric icon={<TrendingUp className="h-4 w-4" />} label="Engaj." value={brand.engagement_rate ? `${brand.engagement_rate}%` : "—"} />
                </div>
              )}
              {brand.verified && (
                <div className="flex items-center gap-1 text-xs text-primary">
                  <BadgeCheck className="h-3.5 w-3.5" /> Conta verificada
                  {brand.is_business && <Badge variant="outline" className="ml-2 text-[10px]">Business</Badge>}
                </div>
              )}
              <div>
                <Label className="text-xs">Paleta</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {Object.entries(palette).map(([k, v]) => v && (
                    <div key={k} className="text-center">
                      <div className="w-12 h-12 rounded border" style={{ background: v }} />
                      <span className="text-[10px] text-muted-foreground">{k}</span>
                      <div className="text-[10px] font-mono">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <div><strong>Nicho:</strong> {brand.niche ?? "—"}</div>
                <div><strong>Tipografia:</strong> {brand.font_style ?? "—"}</div>
                <div><strong>Mood:</strong> {brand.visual_mood ?? "—"}</div>
                <div><strong>Fotografia:</strong> {brand.photography_style ?? "—"}</div>
                <div className="md:col-span-2"><strong>Layout recorrente:</strong> {brand.layout_pattern ?? "—"}</div>
                <div className="md:col-span-2"><strong>Tom de voz:</strong> {brand.voice_tone ?? "—"}</div>
                <div className="md:col-span-2"><strong>CTA pattern:</strong> {brand.cta_style ?? "—"}</div>
              </div>
              {samples.length > 0 && (
                <div>
                  <Label className="text-xs">Posts analisados ({samples.length})</Label>
                  <div className="grid grid-cols-6 gap-2 mt-1">
                    {samples.slice(0, 12).map((u) => (
                      <img
                        key={u}
                        src={u}
                        alt="post"
                        referrerPolicy="no-referrer"
                        crossOrigin="anonymous"
                        className="aspect-square object-cover rounded border"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* MÉTRICAS REAIS (Meta Insights) */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> Métricas reais (Meta Insights)
              </CardTitle>
              <Button size="sm" variant="outline" onClick={refreshInsights} disabled={insightsLoading}>
                {insightsLoading ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                Atualizar
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {!insights && (
                <p className="text-sm text-muted-foreground">
                  Clique em <strong>Atualizar</strong> para puxar reach, saves, shares e visualizações dos últimos 12 posts via Meta Graph. Requer Instagram conectado em <em>Canais</em>.
                </p>
              )}
              {insights && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Atualizado em {new Date(brand.insights_updated_at ?? insights.fetched_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </p>
                  {insightsPosts.length > 0 && (
                    <div className="grid md:grid-cols-2 gap-2">
                      {insightsPosts.slice(0, 6).map((p: any) => (
                        <a
                          key={p.id}
                          href={p.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="flex gap-2 p-2 rounded border hover:bg-muted/40 transition"
                        >
                          {p.media_url && (
                            <img src={p.media_url} alt="" referrerPolicy="no-referrer" className="w-16 h-16 object-cover rounded shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs truncate">{p.caption ?? "(sem legenda)"}</div>
                            <div className="flex gap-3 mt-1 text-[11px] text-muted-foreground">
                              <span><Eye className="h-3 w-3 inline mr-0.5" />{fmtNum(p.insights?.reach)}</span>
                              <span><Bookmark className="h-3 w-3 inline mr-0.5" />{fmtNum(p.insights?.saved)}</span>
                              <span><Share2 className="h-3 w-3 inline mr-0.5" />{fmtNum(p.insights?.shares)}</span>
                              <span><Heart className="h-3 w-3 inline mr-0.5" />{fmtNum(p.like_count)}</span>
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> Avatar UGC (sua imagem nos reels)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Suba 1-3 fotos suas em ângulos diferentes. A IA usa elas como referência para manter o mesmo rosto em reels e capas.
              </p>
              <div className="flex gap-2 flex-wrap">
                {avatars.map((u) => (
                  <img key={u} src={u} alt="avatar" className="w-20 h-20 rounded-lg object-cover border" />
                ))}
                <label className="w-20 h-20 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-muted">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <input type="file" accept="image/*" multiple className="hidden" onChange={uploadAvatar} />
                </label>
              </div>
            </CardContent>
          </Card>

          <BioLinkCard
            brand={brand}
            slugInput={slugInput}
            setSlugInput={setSlugInput}
            saveSlug={saveSlug}
            saving={savingSlug}
          />

          {/* BIBLIOTECA DE REFERÊNCIAS (incorporada) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">📚 Biblioteca de Referências</CardTitle>
              <p className="text-xs text-muted-foreground">
                Logos, templates e moods extras que a IA usa em conjunto com o Brand Kit.
              </p>
            </CardHeader>
            <CardContent>
              <BibliotecaTab />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function slugify(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="text-base font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function BioLinkCard({
  brand, slugInput, setSlugInput, saveSlug, saving,
}: { brand: any; slugInput: string; setSlugInput: (v: string) => void; saveSlug: () => void; saving: boolean }) {
  const effectiveSlug = brand.bio_link_slug ?? slugInput ?? brand.instagram_handle;
  const publicUrl = `https://${BIO_DOMAIN}/bio/${effectiveSlug}`;
  const previewUrl = `${window.location.origin}/bio/${effectiveSlug}`;
  const copy = async (u: string) => {
    await navigator.clipboard.writeText(u);
    toast({ title: "Link copiado", description: "Cole na bio do seu Instagram." });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <LinkIcon className="h-4 w-4" /> Sua página Link na Bio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Linktree white-label automático usando sua paleta, logo, bio e produtos. URL pública:
        </p>

        <div>
          <Label className="text-xs">Slug personalizado</Label>
          <div className="flex gap-2 mt-1">
            <div className="flex items-center gap-1 flex-1 rounded-md border px-2 bg-muted/40">
              <span className="text-xs text-muted-foreground whitespace-nowrap">{BIO_DOMAIN}/bio/</span>
              <Input
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className="border-0 bg-transparent focus-visible:ring-0 px-1 h-8"
                placeholder="seu-nome"
              />
            </div>
            <Button onClick={saveSlug} disabled={saving || !slugInput}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Input value={publicUrl} readOnly className="font-mono text-xs" />
          <Button variant="outline" onClick={() => copy(publicUrl)}><Copy className="h-4 w-4" /></Button>
          <Button asChild><a href={previewUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" />Preview</a></Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          A URL pública só fica ativa quando o domínio <strong>{BIO_DOMAIN}</strong> estiver apontando pro app. Enquanto isso, use o preview acima pra testar.
        </p>
      </CardContent>
    </Card>
  );
}
