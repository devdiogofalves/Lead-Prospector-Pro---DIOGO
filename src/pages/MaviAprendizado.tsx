import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Brain, Loader2, Save, Sparkles, Target, AlertCircle, MessageCircle, Wand2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { translateInvokeError } from "@/lib/friendlyError";
import { PageGuide } from "@/components/PageGuide";
import { useBranding } from "@/hooks/useBranding";


// Badge "LIVE": indica que o campo é injetado em tempo real no briefing da agente
// pelos workers (dispatch, qualification, linkedin-dm) via buildBriefingBlock.
// Edita no painel → próxima mensagem da agente já usa.
function LiveBadge() {
  return (
    <Badge
      variant="outline"
      title="Aplicado em tempo real pela sua agente IA — salve o briefing e a próxima mensagem já usa o valor novo."
      className="h-5 border-emerald-500/40 bg-emerald-500/10 px-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
    >
      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      LIVE
    </Badge>
  );
}

/* Descrição elegante embaixo de cada campo — fonte serif itálica */
function FieldHint({ purpose, why, extra }: { purpose: string; why: string; extra?: string }) {
  const serif = { fontFamily: "'Playfair Display', serif", fontStyle: "italic" } as React.CSSProperties;
  const sans = { fontFamily: "Inter, system-ui, sans-serif" } as React.CSSProperties;
  return (
    <div className="mt-1.5 space-y-0.5">
      <p className="text-[11px] leading-relaxed text-muted-foreground/90" style={serif}>
        <span className="text-primary/80 font-medium not-italic" style={sans}>Para que serve:</span> {purpose}
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground/90" style={serif}>
        <span className="text-primary/80 font-medium not-italic" style={sans}>Por que preencher:</span> {why}
      </p>
      {extra && (
        <p className="text-[11px] leading-relaxed text-muted-foreground/70" style={serif}>
          <span className="text-primary/60 font-medium not-italic" style={sans}>Dica:</span> {extra}
        </p>
      )}
    </div>
  );
}

interface SpinBank {
  situacao: string[];
  problema: string[];
  implicacao: string[];
  need_payoff: string[];
}

interface Briefing {
  id?: string;
  icp_descricao: string;
  segmentos_alvo: string[];
  portes_alvo: string[];
  gatilhos_compra: string[];
  objecoes_comuns: string[];
  abordagem_preferida: string;
  personas_alvo: string[];
  clientes_referencia: string[];
  value_props: string[];
  spin_bank: SpinBank;
  learned_patterns: any;
  last_learned_at: string | null;
}

interface BriefingDrafts {
  segmentos_alvo: string;
  portes_alvo: string;
  gatilhos_compra: string;
  objecoes_comuns: string;
  personas_alvo: string;
  clientes_referencia: string;
  value_props: string;
  spin_situacao: string;
  spin_problema: string;
  spin_implicacao: string;
  spin_need_payoff: string;
}

const EMPTY_SPIN: SpinBank = { situacao: [], problema: [], implicacao: [], need_payoff: [] };

const DEFAULT: Briefing = {
  icp_descricao: "",
  segmentos_alvo: [],
  portes_alvo: [],
  gatilhos_compra: [],
  objecoes_comuns: [],
  abordagem_preferida: "",
  personas_alvo: [],
  clientes_referencia: [],
  value_props: [],
  spin_bank: { ...EMPTY_SPIN },
  learned_patterns: {},
  last_learned_at: null,
};

// Briefing 100% personalizado por cliente — sem templates fixos.


const csv = (arr: string[]) => (arr ?? []).join(", ");
const fromCsv = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const lineList = (arr: string[]) => (arr ?? []).join("\n");

const draftsFromBriefing = (briefing: Briefing): BriefingDrafts => ({
  segmentos_alvo: csv(briefing.segmentos_alvo),
  portes_alvo: csv(briefing.portes_alvo),
  gatilhos_compra: csv(briefing.gatilhos_compra),
  objecoes_comuns: csv(briefing.objecoes_comuns),
  personas_alvo: csv(briefing.personas_alvo),
  clientes_referencia: csv(briefing.clientes_referencia),
  value_props: lineList(briefing.value_props),
  spin_situacao: lineList(briefing.spin_bank?.situacao ?? []),
  spin_problema: lineList(briefing.spin_bank?.problema ?? []),
  spin_implicacao: lineList(briefing.spin_bank?.implicacao ?? []),
  spin_need_payoff: lineList(briefing.spin_bank?.need_payoff ?? []),
});

const briefingWithDrafts = (briefing: Briefing, drafts: BriefingDrafts): Briefing => ({
  ...briefing,
  segmentos_alvo: fromCsv(drafts.segmentos_alvo),
  portes_alvo: fromCsv(drafts.portes_alvo),
  gatilhos_compra: fromCsv(drafts.gatilhos_compra),
  objecoes_comuns: fromCsv(drafts.objecoes_comuns),
  personas_alvo: fromCsv(drafts.personas_alvo),
  clientes_referencia: fromCsv(drafts.clientes_referencia),
  value_props: drafts.value_props.split("\n").map((x) => x.trim()).filter(Boolean),
  spin_bank: {
    situacao: fromCsv(drafts.spin_situacao),
    problema: fromCsv(drafts.spin_problema),
    implicacao: fromCsv(drafts.spin_implicacao),
    need_payoff: fromCsv(drafts.spin_need_payoff),
  },
});

export default function MaviAprendizado({ view = "all" }: { view?: "all" | "edit" | "insights" }) {
  const { branding: __b } = useBranding(); const agent = __b.agent_name;

  const [b, setB] = useState<Briefing>(DEFAULT);
  const [drafts, setDrafts] = useState<BriefingDrafts>(() => draftsFromBriefing(DEFAULT));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("mavi_briefing" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        const loaded = { ...DEFAULT, ...(data as any), spin_bank: { ...EMPTY_SPIN, ...((data as any).spin_bank ?? {}) } };
        setB(loaded);
        setDrafts(draftsFromBriefing(loaded));
      }

      // Preenche autopreenchimento com dados da aba Negócio (prospecting_profiles)
      const { data: profile } = await supabase
        .from("prospecting_profiles")
        .select("produto, publico_alvo, regiao, ticket_medio, diferenciais, ja_tentou")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile) {
        setAdvProduto(profile.produto || "");
        setAdvPublico(profile.publico_alvo || "");
        setAdvRegiao(profile.regiao || "");
        setAdvTicket(profile.ticket_medio || "");
        setAdvDiferenciais(profile.diferenciais || "");
        setAdvJaTentou(profile.ja_tentou || "");
      }

      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const nextBriefing = briefingWithDrafts(b, drafts);
    const payload: any = {
      user_id: user.id,
      icp_descricao: nextBriefing.icp_descricao,
      segmentos_alvo: nextBriefing.segmentos_alvo,
      portes_alvo: nextBriefing.portes_alvo,
      gatilhos_compra: nextBriefing.gatilhos_compra,
      objecoes_comuns: nextBriefing.objecoes_comuns,
      abordagem_preferida: nextBriefing.abordagem_preferida,
      personas_alvo: nextBriefing.personas_alvo,
      clientes_referencia: nextBriefing.clientes_referencia,
      value_props: nextBriefing.value_props,
      spin_bank: nextBriefing.spin_bank ?? EMPTY_SPIN,
    };
    const { error } = await supabase.from("mavi_briefing" as any).upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    else {
      setB(nextBriefing);
      toast({ title: "Briefing salvo", description: `A ${agent} vai usar isso nas próximas conversas.` });
    }
  };

  // Fase H-2: resolve CNAE/atividade real de cada cliente-referência
  const [refiningCnaes, setRefiningCnaes] = useState(false);
  const refineCnaes = async () => {
    if (!confirm("Isto vai consultar o CNPJ de cada cliente-referência (até 10) via Apify + CNPJ.ws pra extrair o CNAE real. Consome créditos Apify. Continuar?")) return;
    setRefiningCnaes(true);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-references-activities", {
        body: { force: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const atividades = data?.atividades_unicas ?? [];
      toast({
        title: `🎯 Sementeira refinada`,
        description: data?.cached
          ? "Cache encontrado, atividades já estavam resolvidas. Use 'Forçar refresh' se quiser reprocessar."
          : `${atividades.length} atividade(s) CNAE resolvida(s) de ${data?.processed ?? 0} cliente(s) referência. A próxima sementeira no /automacao vai usar essas atividades específicas.`,
      });
    } catch (e: any) {
      toast({ title: "Erro ao refinar", description: translateInvokeError(e, `Refinar aprendizado ${agent}`), variant: "destructive" });
    } finally {
      setRefiningCnaes(false);
    }
  };



  const analyzeNow = async (reanalyze = false) => {
    if (reanalyze) setReanalyzing(true); else setAnalyzing(true);
    const { data, error } = await supabase.functions.invoke("mavi-learn", { body: { manual: true, reanalyze } });
    if (reanalyze) setReanalyzing(false); else setAnalyzing(false);
    if (error) {
      toast({ title: "Erro na análise", description: error.message, variant: "destructive" });
    } else {
      const novas = data?.outcomes_analyzed ?? 0;
      const total = data?.total_considered ?? 0;
      toast({
        title: "Análise concluída",
        description: novas > 0
          ? `${novas} nova(s) conversa(s) analisada(s). Total considerado: ${total}.`
          : total > 0
            ? `Nenhuma conversa nova. Padrões recalculados sobre ${total} conversa(s) já analisada(s).`
            : "Nenhuma conversa nos últimos 7 dias.",
      });
      // recarrega
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: fresh } = await supabase
          .from("mavi_briefing" as any)
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        if (fresh) setB({ ...DEFAULT, ...(fresh as any) });
      }
    }
  };

  // ===== Autopreenchimento via Assistente de Prospecção =====
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advProduto, setAdvProduto] = useState("");
  const [advPublico, setAdvPublico] = useState("");
  const [advRegiao, setAdvRegiao] = useState("");
  const [advTicket, setAdvTicket] = useState("");
  const [advDiferenciais, setAdvDiferenciais] = useState("");
  const [advJaTentou, setAdvJaTentou] = useState("");

  const uniq = (arr: string[]) => Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));

  const runAdvisor = async () => {
    if (!advProduto.trim() || !advPublico.trim()) {
      toast({ title: "Preencha produto e público-alvo", variant: "destructive" });
      return;
    }
    setAdvisorLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("prospecting-advisor", {
        body: {
          produto: advProduto.trim(),
          publico_alvo: advPublico.trim(),
          regiao: advRegiao.trim() || undefined,
          ticket_medio: advTicket.trim() || undefined,
          diferenciais: advDiferenciais.trim() || undefined,
          ja_tentou: advJaTentou.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const plan = data?.plan ?? {};

      const segmentosFromChannels = uniq(
        (plan.canais_recomendados ?? []).flatMap((c: any) => Array.isArray(c?.termos_busca) ? c.termos_busca : [])
      );
      const valueProps = uniq([
        ...advDiferenciais.split(/[,\n]/),
        ...(Array.isArray(plan.passo_a_passo) ? [] : []),
      ]);

      const current = briefingWithDrafts(b, drafts);
      const planSpin = plan.spin_bank ?? {};
      const mergedSpin: SpinBank = {
        situacao: uniq([...(current.spin_bank?.situacao ?? []), ...((planSpin.situacao as string[]) ?? [])]),
        problema: uniq([...(current.spin_bank?.problema ?? []), ...((planSpin.problema as string[]) ?? [])]),
        implicacao: uniq([...(current.spin_bank?.implicacao ?? []), ...((planSpin.implicacao as string[]) ?? [])]),
        need_payoff: uniq([...(current.spin_bank?.need_payoff ?? []), ...((planSpin.need_payoff as string[]) ?? [])]),
      };

      const nextBriefing = {
        ...current,
        icp_descricao: current.icp_descricao?.trim() ? current.icp_descricao : (plan.icp ?? ""),
        personas_alvo: current.personas_alvo?.length ? current.personas_alvo : uniq(plan.personas ?? []),
        segmentos_alvo: current.segmentos_alvo?.length ? current.segmentos_alvo : segmentosFromChannels,
        abordagem_preferida: current.abordagem_preferida?.trim() ? current.abordagem_preferida : (plan.abordagem_sugerida ?? ""),
        objecoes_comuns: current.objecoes_comuns?.length ? current.objecoes_comuns : uniq(plan.alertas ?? []),
        value_props: current.value_props?.length ? current.value_props : valueProps,
        spin_bank: mergedSpin,
      } as Briefing;

      setB(nextBriefing);
      setDrafts(draftsFromBriefing(nextBriefing));

      setAdvisorOpen(false);
      toast({
        title: data?.ai_unavailable ? "Plano padrão aplicado" : "✨ Briefing preenchido pela IA",
        description: data?.ai_unavailable
          ? (data?.warning ?? "Configure sua chave Gemini para um plano personalizado.")
          : "Revise os campos e clique em Salvar briefing.",
      });
    } catch (e: any) {
      toast({ title: "Erro no autopreenchimento", description: translateInvokeError(e, "Autopreenchimento"), variant: "destructive" });
    } finally {
      setAdvisorLoading(false);
    }
  };

  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>;


  const lp = b.learned_patterns ?? {};
  const topSegmentos: any[] = Array.isArray(lp.top_segmentos_qualificados) ? lp.top_segmentos_qualificados : [];
  const topSegmentosConversados: any[] = Array.isArray(lp.top_segmentos_conversados) ? lp.top_segmentos_conversados : [];
  const topObjecoes: any[] = Array.isArray(lp.top_objecoes) ? lp.top_objecoes : [];
  const melhoresAberturas: any[] = Array.isArray(lp.melhores_aberturas) ? lp.melhores_aberturas : [];
  const faseTravada: string | null = lp.fase_spin_mais_travada ?? null;
  const segmentosVisiveis = topSegmentos.length ? topSegmentos : topSegmentosConversados;

  return (
    <div className="space-y-6">
      {view === "all" && (
        <>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20"><Brain className="h-6 w-6 text-primary" /></div>
            <div>
              <h1 className="text-2xl font-bold">Aprendizado {agent}</h1>
              <p className="text-sm text-muted-foreground">
                Você descreve o cliente ideal. A {agent} aprende com as conversas e refina a abordagem.
              </p>
            </div>
          </div>
          <PageGuide
        storageKey="guide_aprendizado"
        title={`Aprendizado ${agent}`}
        what="Briefing da sua empresa que a IA consulta em CADA mensagem (disparo, qualificação, LinkedIn). Quanto mais completo, mais personalizada fica a abordagem com os leads."
        steps={[
          { text: "Preencha cada campo com os dados reais do seu negócio (ICP, segmentos, personas, value props)" },
          { text: "Edite clientes-referência, segmentos, personas e value props conforme seu nicho" },
          { text: "Use 'Refinar CNAEs' para sementeira mais precisa (auto-prospect fica afiado)" },
        ]}
        troubleshoot={`${agent} fala genérico nas mensagens? Verifique se segmentos_alvo e personas_alvo estão preenchidos aqui.`}
      />
        </>
      )}

      {view !== "insights" && (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2"><Target className="h-4 w-4" /> Briefing da empresa</CardTitle>
              <CardDescription>O que define um lead bom para vocês. Isso vai pro system prompt da {agent}.</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => setAdvisorOpen(true)}
            >
              <Wand2 className="h-3.5 w-3.5 mr-1.5" />
              Autopreencher com IA
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 flex gap-2 items-start">
            <span className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span>
              Campos marcados com <strong>LIVE</strong> entram no briefing da {agent} imediatamente após salvar — disparo, qualificação e LinkedIn DM usam o valor atualizado.
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Label>Descrição do cliente ideal (ICP)</Label>
              <LiveBadge />
            </div>
            <Textarea
              rows={3}
              placeholder="Ex.: Empresas B2B com carteira de inadimplência > 50 mil, 10 a 200 funcionários, sem departamento jurídico estruturado..."
              value={b.icp_descricao ?? ""}
              onChange={(e) => setB({ ...b, icp_descricao: e.target.value })}
            />
            <FieldHint
              purpose="Define quem é seu cliente perfeito em termos de empresa, setor, tamanho e dores."
              why="Sem ICP claro, a IA dispara mensagens genéricas e a taxa de resposta cai drasticamente."
              extra="Quanto mais específico (ex: 'clínicas odontológicas com 3+ cadeiras'), melhor a segmentação."
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <Label>Segmentos-alvo (vírgula)</Label>
                <LiveBadge />
              </div>
              <Input
                placeholder="clínicas, escolas particulares, distribuidoras, e-commerce"
                value={drafts.segmentos_alvo}
                onChange={(e) => setDrafts((d) => ({ ...d, segmentos_alvo: e.target.value }))}
              />
              <FieldHint
                purpose="Lista os nichos e setores que sua empresa atende com excelência."
                why="A IA usa isso para filtrar leads no Google Maps e calibrar a abordagem por segmento."
                extra="Separe por vírgula. Ex: clínicas, escolas particulares, distribuidoras."
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <Label>Portes-alvo (vírgula)</Label>
                <LiveBadge />
              </div>
              <Input
                placeholder="ME, EPP, Médio"
                value={drafts.portes_alvo}
                onChange={(e) => setDrafts((d) => ({ ...d, portes_alvo: e.target.value }))}
              />
              <FieldHint
                purpose="Tamanho da empresa que você consegue atender com seu modelo de negócio."
                why="Um produto para MEI é diferente de um para multinacional. A IA evita oferecer o pacote errado."
                extra="ME = Microempresa (até 3,6 mi/ano), EPP = Pequeno Porte (até 78 mi/ano)."
              />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Label>Gatilhos de compra (vírgula)</Label>
              <LiveBadge />
            </div>
            <Input
              placeholder="inadimplência alta, equipe sobrecarregada, perda de clientes, fechamento de balanço"
              value={drafts.gatilhos_compra}
              onChange={(e) => setDrafts((d) => ({ ...d, gatilhos_compra: e.target.value }))}
            />
            <FieldHint
              purpose="Eventos ou situações que fazem seu lead perceber que precisa da sua solução."
              why="A IA abre conversas com perguntas situacionais relevantes, na fase S do SPIN."
              extra="Pense em mudanças de cenário: expansão, crise, sazonalidade, turnover."
            />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Label>Objeções comuns (vírgula)</Label>
              <LiveBadge />
            </div>
            <Input
              placeholder="tenho funcionário interno, já tenho assessoria, custa caro, não preciso agora"
              value={drafts.objecoes_comuns}
              onChange={(e) => setDrafts((d) => ({ ...d, objecoes_comuns: e.target.value }))}
            />
            <FieldHint
              purpose="As resistências e desculpas que você mais ouve durante o processo comercial."
              why="A IA antecipa objeções e já traz argumentos na fase N, aumentando a taxa de conversão."
              extra="Não omita as mais difíceis. 'Já tenho fornecedor' é objeção, não muralha."
            />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Label>Abordagem preferida</Label>
              <LiveBadge />
            </div>
            <Textarea
              rows={2}
              placeholder="Ex.: SPIN consultivo, perguntas situacionais primeiro, sem pitch nas 3 primeiras mensagens..."
              value={b.abordagem_preferida ?? ""}
              onChange={(e) => setB({ ...b, abordagem_preferida: e.target.value })}
            />
            <FieldHint
              purpose="Estilo de venda que funciona no seu mercado — consultivo, direto, técnico, etc."
              why="A IA ajusta o tom e a velocidade da conversa. SPIN consultivo funciona melhor em B2B complexo."
              extra="Se você nunca vende no 1º contato, escreva aqui. A IA respeita sua cadência."
            />
          </div>

          <Separator className="my-2" />
          <div className="text-xs text-muted-foreground -mb-2">Contexto comercial específico (preencha pra IA ficar consultiva de verdade)</div>

          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Label>Personas decisoras (cargos-alvo, vírgula)</Label>
              <LiveBadge />
            </div>
            <Input
              placeholder="Gerente Financeiro, Controller, Coordenador Financeiro, Diretor Financeiro"
              value={drafts.personas_alvo}
              onChange={(e) => setDrafts((d) => ({ ...d, personas_alvo: e.target.value }))}
            />
            <FieldHint
              purpose="Cargos que tomam decisão de compra no seu processo comercial."
              why="A IA filtra LinkedIn por esses cargos e direciona a abordagem para quem manda."
              extra="Coloque o C-Level e quem influencia. Ex: CFO + Controller."
            />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Label>Clientes-referência (prova social, vírgula)</Label>
              <LiveBadge />
            </div>
            <Textarea
              rows={3}
              placeholder="Ex: Cliente A, Cliente B, Cliente C..."
              value={drafts.clientes_referencia}
              onChange={(e) => setDrafts((d) => ({ ...d, clientes_referencia: e.target.value }))}
            />
            <FieldHint
              purpose="Empresas já atendidas que servem de prova social nas conversas."
              why="A IA cita 1-2 nomes relevantes quando o lead demonstra interesse, criando confiança."
              extra="Nome fantasia ou razão social. A IA nunca cita a lista inteira de uma vez."
            />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Label>Value props (uma por linha)</Label>
              <LiveBadge />
            </div>
            <Textarea
              rows={4}
              placeholder={"Não exigimos time interno de cobrança — assumimos a operação.\nProjeto sem ônus para o contratante, só no êxito.\n11 anos de mercado, especialistas exclusivos em cobrança..."}
              value={drafts.value_props}
              onChange={(e) => setDrafts((d) => ({ ...d, value_props: e.target.value }))}
            />
            <FieldHint
              purpose="Frases de valor que justificam por que o lead deve escolher você."
              why="A IA usa essas frases APENAS na fase N, quando o lead já verbalizou a dor."
              extra="Uma por linha. Foque no resultado, não na feature. 'Reduz inadimplência em 40%' > 'temos software'."
            />
          </div>

          <div className="space-y-3 rounded-md border border-border/60 p-3">
            <div className="text-xs font-semibold flex items-center gap-2">
              Banco SPIN da sua oferta <LiveBadge />
            </div>
            <FieldHint
              purpose="Banco de perguntas específicas do nicho para cada fase do SPIN Selling."
              why="Quanto mais perguntas, mais variação nas mensagens. Evita repetição e soa humano."
              extra="Separe por vírgula ou quebra de linha. A IA escolhe uma por mensagem contextualmente."
            />
            <div>
              <Label className="text-xs">S — Situação (entender contexto atual)</Label>
              <Textarea
                rows={2}
                placeholder="Hoje vocês têm operação estruturada de cobrança? | A cobrança é mais amigável ou jurídica?"
                value={drafts.spin_situacao}
                onChange={(e) => setDrafts((d) => ({ ...d, spin_situacao: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">P — Problema (identificar dor)</Label>
              <Textarea
                rows={2}
                placeholder="Quais os maiores desafios hoje nesse processo? | O time consegue dar conta da demanda?"
                value={drafts.spin_problema}
                onChange={(e) => setDrafts((d) => ({ ...d, spin_problema: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">I — Implicação (ampliar impacto)</Label>
              <Textarea
                rows={2}
                placeholder="Qual impacto disso no fluxo de caixa? | Quanto tempo do time é perdido com cobrança?"
                value={drafts.spin_implicacao}
                onChange={(e) => setDrafts((d) => ({ ...d, spin_implicacao: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">N — Need Payoff (lead verbaliza a necessidade)</Label>
              <Textarea
                rows={2}
                placeholder="Se vocês conseguissem resolver isso sem aumentar a equipe, faria sentido?"
                value={drafts.spin_need_payoff}
                onChange={(e) => setDrafts((d) => ({ ...d, spin_need_payoff: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar briefing
            </Button>
            <Button onClick={refineCnaes} variant="outline" type="button" disabled={refiningCnaes}>
              {refiningCnaes ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Target className="h-4 w-4 mr-2" />}
              Refinar sementeira (CNAE real)
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {view === "all" && <Separator />}

      {view !== "edit" && (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> O que a {agent} aprendeu</CardTitle>
              <CardDescription>
                Atualizado automaticamente todo dia às 03:00 com base nas conversas dos últimos 7 dias.
                {b.last_learned_at && (
                  <> Última análise: {format(new Date(b.last_learned_at), "dd/MM HH:mm", { locale: ptBR })}.</>
                )}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => analyzeNow(false)} disabled={analyzing || reanalyzing}>
                {analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Brain className="h-4 w-4 mr-2" />}
                Forçar análise
              </Button>
              <Button variant="secondary" onClick={() => analyzeNow(true)} disabled={analyzing || reanalyzing}>
                {reanalyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Re-analisar tudo
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-success" /> {topSegmentos.length ? "Top segmentos qualificados" : "Segmentos detectados"}</div>
            {segmentosVisiveis.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem dados ainda.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {segmentosVisiveis.slice(0, 5).map((s, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{typeof s === "string" ? s : `${s.label} (${s.count})`}</Badge>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold"><AlertCircle className="h-4 w-4 text-destructive" /> Objeções mais comuns</div>
            {topObjecoes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem dados ainda.</p>
            ) : (
              <ul className="text-xs text-muted-foreground space-y-1">
                {topObjecoes.slice(0, 5).map((o, i) => (
                  <li key={i}>• {typeof o === "string" ? o : `${o.label} (${o.count})`}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-border/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold"><MessageCircle className="h-4 w-4 text-primary" /> Melhores aberturas</div>
            {melhoresAberturas.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem dados ainda.</p>
            ) : (
              <ul className="text-xs text-muted-foreground space-y-1">
                {melhoresAberturas.slice(0, 3).map((a, i) => (
                  <li key={i}>• {typeof a === "string" ? a : a.label ?? JSON.stringify(a)}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-border/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">Fase SPIN onde mais lead trava</div>
            <p className="text-xs text-muted-foreground">{faseTravada ?? "Sem dados ainda."}</p>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Diálogo: Autopreenchimento via Assistente de Prospecção */}
      <Dialog open={advisorOpen} onOpenChange={(o) => !advisorLoading && setAdvisorOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" /> Assistente de Prospecção
            </DialogTitle>
            <DialogDescription>
              Conte sobre seu negócio e a IA monta o plano: <strong>o que buscar</strong>, <strong>onde buscar</strong> e <strong>como abordar</strong>. Campos já preenchidos não são sobrescritos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Produto / serviço *</Label>
              <Input
                placeholder="Ex.: Recuperação de crédito B2B no êxito"
                value={advProduto}
                onChange={(e) => setAdvProduto(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Público-alvo *</Label>
              <Input
                placeholder="Ex.: clínicas odontológicas, distribuidoras de alimentos"
                value={advPublico}
                onChange={(e) => setAdvPublico(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Região</Label>
                <Input
                  placeholder="Brasil / SP / Sul…"
                  value={advRegiao}
                  onChange={(e) => setAdvRegiao(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Ticket médio</Label>
                <Input
                  placeholder="R$ 5k / mês"
                  value={advTicket}
                  onChange={(e) => setAdvTicket(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Diferenciais</Label>
              <Textarea
                rows={2}
                placeholder="O que torna sua oferta única"
                value={advDiferenciais}
                onChange={(e) => setAdvDiferenciais(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">O que já tentou (opcional)</Label>
              <Textarea
                rows={2}
                placeholder="Tráfego pago, indicações, prospecção fria..."
                value={advJaTentou}
                onChange={(e) => setAdvJaTentou(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdvisorOpen(false)} disabled={advisorLoading}>
              Cancelar
            </Button>
            <Button onClick={runAdvisor} disabled={advisorLoading || !advProduto.trim() || !advPublico.trim()}>
              {advisorLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Gerar plano e preencher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
