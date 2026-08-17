import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { PageGuide } from "@/components/PageGuide";
import { translateInvokeError } from "@/lib/friendlyError";
import { useBranding } from "@/hooks/useBranding";
import { SPIN_RAPPORT_TEMPLATE } from "@/lib/spinRapportTemplate";
import {
  Compass,
  Sparkles,
  Target,
  Users,
  ArrowRight,
  AlertTriangle,
  MessageSquare,
  ListChecks,
  MapPin,
  FileCheck,
  Linkedin,
  Instagram,
  IdCard,
  Loader2,
  Globe,
  Save,
  Check,
} from "lucide-react";

// Badge "LIVE": indica que o campo é injetado em tempo real no briefing da agente
// pelos workers (dispatch, qualification, linkedin-dm) via formatLivePanelData.
// Edita no painel → próxima mensagem da agente já usa, sem precisar regenerar.
function LiveBadge() {
  return (
    <Badge
      variant="outline"
      title="Aplicado em tempo real pela sua agente IA — salve o campo e a próxima mensagem já usa."
      className="h-5 border-emerald-500/40 bg-emerald-500/10 px-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
    >
      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      LIVE
    </Badge>
  );
}

interface CanalRec {
  canal: string;
  prioridade: "alta" | "media" | "baixa";
  porque: string;
  termos_busca: string[];
  filtros?: string;
}
interface Plan {
  icp: string;
  personas: string[];
  canais_recomendados: CanalRec[];
  passo_a_passo: string[];
  abordagem_sugerida: string;
  alertas: string[];
}

// Mapeia canal recomendado pelo plano → rota real do app. Rotas que NÃO existem
// (jobs/vagas — páginas não foram criadas) caem em fallback genérico no ícone
// "Sparkles" + rota "/" para evitar 404 ao clicar.
const CANAL_META: Record<string, { icon: any; route: string }> = {
  "Google Maps": { icon: MapPin, route: "/buscas/maps" },
  CNPJ: { icon: FileCheck, route: "/buscas/cnpj" },
  LinkedIn: { icon: Linkedin, route: "/buscas/linkedin" },
  "LinkedIn DM": { icon: Linkedin, route: "/buscas/linkedin-dm" },
  Instagram: { icon: Instagram, route: "/buscas/instagram" },
  Dados4U: { icon: IdCard, route: "/buscas/dados4u" },
  "Busca Suprema": { icon: Sparkles, route: "/" },
};

const PRIORIDADE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  alta: "default",
  media: "secondary",
  baixa: "outline",
};

export default function Assistente() {
  const { branding: __b } = useBranding(); const agent = __b.agent_name;
  const company = __b.company_name;

  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [scrapedData, setScrapedData] = useState<any>(null);
  const [scrapeSuggestions, setScrapeSuggestions] = useState<any>(null);
  const [scraping, setScraping] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSystemPrompt, setSavingSystemPrompt] = useState(false);
  const [form, setForm] = useState({
    produto: "",
    publico_alvo: "",
    ticket_medio: "",
    regiao: "",
    diferenciais: "",
    ja_tentou: "",
    site_url: "",
    instagram_url: "",
    gmb_url: "",
    linkedin_url: "",
  });

  // Carrega perfil salvo
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("prospecting_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setForm({
          produto: data.produto || "",
          publico_alvo: data.publico_alvo || "",
          ticket_medio: data.ticket_medio || "",
          regiao: data.regiao || "",
          diferenciais: data.diferenciais || "",
          ja_tentou: data.ja_tentou || "",
          site_url: (data as any).site_url || "",
          instagram_url: (data as any).instagram_url || "",
          gmb_url: (data as any).gmb_url || "",
          linkedin_url: (data as any).linkedin_url || "",
        });
        if (data.plan) setPlan(data.plan as any);
        if (data.system_prompt) setSystemPrompt(data.system_prompt);
        if ((data as any).scraped_data) setScrapedData((data as any).scraped_data);
      }
    })();
  }, []);

  const onChange = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sem usuário autenticado");
      const { error } = await supabase.from("prospecting_profiles").upsert(
        { user_id: user.id, ...form } as any,
        { onConflict: "user_id" },
      );
      if (error) throw error;
      toast.success(`Alterações salvas. A próxima mensagem da ${agent} já usa esses campos.`);
    } catch (err: any) {
      toast.error(translateInvokeError(err, "Salvar dados do negócio"));
    } finally {
      setSavingProfile(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.produto.trim() || !form.publico_alvo.trim()) {
      toast.error("Preencha pelo menos o produto e o público-alvo");
      return;
    }
    setLoading(true);
    setPlan(null);
    try {
      const { data, error } = await supabase.functions.invoke("prospecting-advisor", { body: form });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPlan(data.plan);
      // PROTEÇÃO: nunca sobrescreve um prompt já customizado pelo operador.
      // Só aceita o prompt gerado pelo advisor se o campo atual estiver vazio ou for muito curto (<500 chars).
      const currentPrompt = (systemPrompt || "").trim();
      const incomingPrompt = (data.system_prompt || "").trim();
      const shouldReplacePrompt = currentPrompt.length < 500 && incomingPrompt.length > 0;
      if (shouldReplacePrompt) {
        setSystemPrompt(incomingPrompt);
      }

      // Persiste o perfil (upsert por user_id)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const upsertPayload: any = {
          user_id: user.id,
          ...form,
          plan: data.plan,
        };
        // Só grava system_prompt no banco se for substituir (mesma regra acima).
        if (shouldReplacePrompt) {
          upsertPayload.system_prompt = incomingPrompt;
        }
        await supabase.from("prospecting_profiles").upsert(
          upsertPayload,
          { onConflict: "user_id" },
        );
      }
      if (data.ai_unavailable) {
        toast.warning(data.warning || "Plano padrão gerado e salvo sem IA.");
      } else {
        toast.success(
          shouldReplacePrompt
            ? "Plano gerado e salvo! Já está pronto pro seu disparo."
            : `Plano gerado e salvo. Seu System Prompt ${agent} customizado foi preservado.`
        );
      }
    } catch (err: any) {
      toast.error(translateInvokeError(err, "Gerar plano de prospecção"));
    } finally {
      setLoading(false);
    }
  };

  const handleScrape = async () => {
    if (!form.site_url && !form.instagram_url && !form.gmb_url && !form.linkedin_url) {
      toast.error("Cole pelo menos um link (site, Instagram, GMB ou LinkedIn)");
      return;
    }
    setScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke("business-scrape", {
        body: {
          site_url: form.site_url || undefined,
          instagram_url: form.instagram_url || undefined,
          gmb_url: form.gmb_url || undefined,
          linkedin_url: form.linkedin_url || undefined,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha no scraping");
      setScrapedData(data.data);
      setScrapeSuggestions(data.suggestions || null);

      // 🪄 Auto-preenche campos vazios com as sugestões da IA
      const s = data.suggestions;
      let merged = { ...form };
      if (s) {
        merged = {
          ...form,
          produto: form.produto?.trim() ? form.produto : (s.produto || ""),
          publico_alvo: form.publico_alvo?.trim() ? form.publico_alvo : (s.publico_alvo || ""),
          diferenciais: form.diferenciais?.trim() ? form.diferenciais : (s.diferenciais || ""),
        };
        setForm(merged);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("prospecting_profiles").upsert(
          { user_id: user.id, ...merged, scraped_data: data.data } as any,
          { onConflict: "user_id" },
        );
      }
      toast.success(s ? "Canais analisados — campos preenchidos automaticamente!" : "Conteúdo dos canais capturado.");
    } catch (err: any) {
      toast.error(translateInvokeError(err, "Analisar canais (site/Instagram/GMB/LinkedIn)"));
    } finally {
      setScraping(false);
    }
  };

  // Salva edições do system_prompt — o prompt REAL usado pelos workers
  // (dispatch-worker, qualification-worker, linkedin-dm). Antes esse campo
  // ficava invisível no UI: usuário gerava via "Gerar plano" mas não via o
  // resultado nem podia editar.
  const saveSystemPrompt = async () => {
    if (!systemPrompt.trim()) {
      toast.error(`System prompt vazio — cole o texto ${agent} antes de salvar`);
      return;
    }
    setSavingSystemPrompt(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sem usuário autenticado");
      const { error } = await supabase.from("prospecting_profiles").upsert(
        { user_id: user.id, system_prompt: systemPrompt } as any,
        { onConflict: "user_id" },
      );
      if (error) throw error;
      toast.success(`System prompt salvo. Próxima mensagem da ${agent} já usa.`);
    } catch (err: any) {
      toast.error(translateInvokeError(err, `Salvar System Prompt ${agent}`));
    } finally {
      setSavingSystemPrompt(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/15">
          <Compass className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Assistente de Prospecção</h1>
          <p className="text-sm text-muted-foreground">
            Conte sobre seu negócio e a IA monta o plano: o que buscar, onde buscar e como abordar.
          </p>
        </div>
      </div>

      <PageGuide
        storageKey="guide_assistente"
        title="Assistente de Prospecção"
        what={`Conte sobre o negócio da ${company} — a IA gera o System Prompt que a ${agent} usa em todos os disparos. Campos marcados LIVE atualizam o comportamento da ${agent} sem precisar regenerar.`}
        steps={[
          { text: "Preencha produto, público-alvo, ticket médio e diferenciais (campos LIVE)" },
          { text: "Opcional: cole site/Instagram/GMB e clique 'Analisar canais' para a IA aprender" },
          { text: "Clique 'Gerar plano de prospecção' — o System Prompt aparece em verde abaixo" },
        ]}
        troubleshoot="Se não gerar plano, confira a chave de IA (OpenAI ou Gemini)."
        troubleshootRoute="/configuracoes"
      />

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sobre o seu negócio</CardTitle>
            <CardDescription>Quanto mais detalhes, melhor o plano.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 flex gap-2 items-start">
              <span className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
              <span>
                Campos marcados com <strong>LIVE</strong> são aplicados pela {agent} em tempo real — edite, salve e a próxima mensagem já usa o valor novo. Não é preciso regenerar o System Prompt.
              </span>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label htmlFor="produto">O que você vende? *</Label>
                  <LiveBadge />
                </div>
                <Textarea
                  id="produto"
                  placeholder="Ex: Software de gestão financeira para clínicas odontológicas"
                  value={form.produto}
                  onChange={onChange("produto")}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label htmlFor="publico">Quem é seu cliente ideal? *</Label>
                  <LiveBadge />
                </div>
                <Textarea
                  id="publico"
                  placeholder="Ex: Donos de clínica com 2-10 funcionários no SP/RJ"
                  value={form.publico_alvo}
                  onChange={onChange("publico_alvo")}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label htmlFor="ticket">Ticket médio</Label>
                    <LiveBadge />
                  </div>
                  <Input id="ticket" placeholder="R$ 500/mês" value={form.ticket_medio} onChange={onChange("ticket_medio")} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label htmlFor="regiao">Região</Label>
                    <LiveBadge />
                  </div>
                  <Input id="regiao" placeholder="SP capital" value={form.regiao} onChange={onChange("regiao")} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label htmlFor="dif">Diferenciais</Label>
                  <LiveBadge />
                </div>
                <Textarea id="dif" placeholder="O que te diferencia da concorrência?" value={form.diferenciais} onChange={onChange("diferenciais")} rows={2} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label htmlFor="tent">O que já tentou?</Label>
                  <LiveBadge />
                </div>
                <Textarea id="tent" placeholder="Ex: Tráfego pago, indicação, frio no LinkedIn..." value={form.ja_tentou} onChange={onChange("ja_tentou")} rows={2} />
              </div>

              <div className="space-y-3 pt-3 border-t border-border/40">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold">Seus canais (pra IA estudar)</Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="site" className="text-xs text-muted-foreground">Site</Label>
                  <Input id="site" placeholder="https://seusite.com.br" value={form.site_url} onChange={onChange("site_url")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ig" className="text-xs text-muted-foreground">Instagram</Label>
                  <Input id="ig" placeholder="https://instagram.com/seuperfil" value={form.instagram_url} onChange={onChange("instagram_url")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gmb" className="text-xs text-muted-foreground">Google Meu Negócio</Label>
                  <Input id="gmb" placeholder="https://maps.app.goo.gl/..." value={form.gmb_url} onChange={onChange("gmb_url")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lkin" className="text-xs text-muted-foreground">LinkedIn (empresa ou seu perfil)</Label>
                  <Input id="lkin" placeholder="https://www.linkedin.com/company/..." value={form.linkedin_url} onChange={onChange("linkedin_url")} />
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={handleScrape} disabled={scraping}>
                  {scraping ? <><Loader2 className="h-4 w-4 animate-spin" /> Analisando seus canais...</> : <><Globe className="h-4 w-4" /> Analisar meus canais</>}
                </Button>
                {scrapedData && (
                  <p className="text-xs text-muted-foreground">
                    ✓ Capturado: {Object.keys(scrapedData).join(", ")}
                  </p>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="outline" className="w-full" onClick={saveProfile} disabled={savingProfile || loading}>
                  {savingProfile ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Salvar alterações
                    </>
                  )}
                </Button>
                <Button type="submit" className="w-full" disabled={loading || savingProfile}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Montando plano...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Gerar plano de prospecção
                  </>
                )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* 🧠 Sugestões geradas a partir da análise dos canais (auto-preenchimento + pesquisa de mercado + mensagens de conexão LinkedIn) */}
          {scrapeSuggestions && (
            <Card className="border-primary/40 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Análise dos seus canais
                </CardTitle>
                <CardDescription>
                  Gerado a partir do site/Instagram/GMB/LinkedIn que você informou. Os campos vazios do formulário já foram preenchidos automaticamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {scrapeSuggestions.sobre_negocio && (
                  <div>
                    <p className="font-semibold mb-1">Sobre o negócio</p>
                    <p className="text-muted-foreground whitespace-pre-line">{scrapeSuggestions.sobre_negocio}</p>
                  </div>
                )}
                {scrapeSuggestions.pesquisa_mercado && (
                  <div>
                    <p className="font-semibold mb-1 flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> Pesquisa de mercado do seu segmento</p>
                    <p className="text-muted-foreground whitespace-pre-line">{scrapeSuggestions.pesquisa_mercado}</p>
                  </div>
                )}
                {Array.isArray(scrapeSuggestions.canais_recomendados) && scrapeSuggestions.canais_recomendados.length > 0 && (
                  <div>
                    <p className="font-semibold mb-2">Onde focar o disparo em massa</p>
                    <div className="space-y-2">
                      {scrapeSuggestions.canais_recomendados.map((c: any, i: number) => (
                        <div key={i} className="rounded-md border border-border/60 p-2.5">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={PRIORIDADE_VARIANT[c.prioridade] || "outline"} className="text-[10px] uppercase">{c.prioridade}</Badge>
                            <span className="font-medium">{c.canal}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{c.porque}</p>
                          {Array.isArray(c.termos_busca) && c.termos_busca.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {c.termos_busca.map((t: string, j: number) => (
                                <Badge key={j} variant="outline" className="font-mono text-[10px]">{t}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(scrapeSuggestions.mensagens_conexao_exemplo) && scrapeSuggestions.mensagens_conexao_exemplo.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                    <p className="font-semibold mb-1 flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                      <Linkedin className="h-3.5 w-3.5" /> Mensagens de CONEXÃO (LinkedIn)
                    </p>
                    <p className="text-xs text-muted-foreground mb-2">
                      ⚠️ Regra de ouro: sempre enviar uma <strong>mensagem de conexão</strong> antes do DM de venda. Exemplos pra você se inspirar:
                    </p>
                    <ul className="space-y-1.5">
                      {scrapeSuggestions.mensagens_conexao_exemplo.map((m: string, i: number) => (
                        <li key={i} className="rounded bg-background/60 p-2 text-xs italic">"{m}"</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* System Prompt SEMPRE visível — antes ficava escondido até gerar plano */}
          <Card className="border-emerald-500/40 bg-emerald-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-500" />
                System Prompt da {agent}
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                  {systemPrompt.trim().length > 0 ? "EM USO" : "VAZIO"}
                </Badge>
              </CardTitle>
              <CardDescription>
                Prompt que a <strong>{agent}</strong> usa em todo disparo WhatsApp, qualificação e LinkedIn DM. Use o template SPIN+Rapport como base, edite e salve — a próxima mensagem já usa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={14}
                className="font-mono text-xs"
                placeholder={`Cole aqui o System Prompt da ${agent} ou clique em "Restaurar template SPIN+Rapport" para carregar o template padrão.`}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveSystemPrompt} disabled={savingSystemPrompt} size="sm">
                  {savingSystemPrompt
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Salvando…</>
                    : <><Check className="h-3 w-3" /> Salvar System Prompt</>}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const filled = SPIN_RAPPORT_TEMPLATE
                      .replace(/\[NOME DA EMPRESA\]/g, company)
                      .replace(/\[DESCREVA A SOLUÇÃO\/PRODUTO\]/g, form.produto?.trim() || "[descreva aqui sua solução/produto]");
                    setSystemPrompt(filled);
                    toast.success("Template SPIN+Rapport carregado. Revise e clique em Salvar.");
                  }}
                >
                  <Sparkles className="h-3 w-3" /> Restaurar template SPIN+Rapport
                </Button>
              </div>
            </CardContent>
          </Card>

          {!plan && !loading && !scrapeSuggestions && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground space-y-2">
                <Compass className="h-10 w-10 mx-auto opacity-40" />
                <p className="text-sm">Preencha o formulário ao lado e a IA vai recomendar onde buscar seus melhores leads.</p>
              </CardContent>
            </Card>
          )}

          {loading && (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary mb-3" />
                <p className="text-sm">Analisando seu negócio e cruzando com as melhores fontes de lead…</p>
              </CardContent>
            </Card>
          )}

          {plan && (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    Cliente Ideal (ICP)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">{plan.icp}</p>
                  {plan.personas?.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {plan.personas.map((p, i) => (
                        <Badge key={i} variant="secondary">{p}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Canais recomendados</CardTitle>
                  <CardDescription>Onde buscar seus leads, em ordem de prioridade.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {plan.canais_recomendados?.map((c, i) => {
                    const meta = CANAL_META[c.canal] || { icon: Sparkles, route: "/" };
                    const Icon = meta.icon;
                    return (
                      <div key={i} className="rounded-lg border border-border/60 p-4 space-y-2 hover:border-primary/40 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-primary" />
                            <span className="font-semibold">{c.canal}</span>
                            <Badge variant={PRIORIDADE_VARIANT[c.prioridade] || "outline"} className="text-[10px] uppercase">
                              {c.prioridade}
                            </Badge>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => navigate(meta.route)}>
                            Ir buscar <ArrowRight className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">{c.porque}</p>
                        {c.termos_busca?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {c.termos_busca.map((t, j) => (
                              <Badge key={j} variant="outline" className="font-mono text-xs">{t}</Badge>
                            ))}
                          </div>
                        )}
                        {c.filtros && (
                          <p className="text-xs text-muted-foreground italic">Filtros: {c.filtros}</p>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {plan.passo_a_passo?.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ListChecks className="h-4 w-4 text-primary" /> Passo a passo
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ol className="space-y-2">
                      {plan.passo_a_passo.map((p, i) => (
                        <li key={i} className="flex gap-3 text-sm">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">
                            {i + 1}
                          </span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              )}

              {plan.abordagem_sugerida && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-primary" /> Abordagem sugerida
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-line">{plan.abordagem_sugerida}</p>
                  </CardContent>
                </Card>
              )}

              {plan.alertas?.length > 0 && (
                <Card className="border-warning/40">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning" /> Alertas
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5 text-sm">
                      {plan.alertas.map((a, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-warning">•</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}


            </>
          )}
        </div>
      </div>
    </div>
  );
}