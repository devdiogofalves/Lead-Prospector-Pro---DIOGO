import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Bot, Play, Save, Loader2, Clock, CalendarClock, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageGuide } from "@/components/PageGuide";
import { useBranding } from "@/hooks/useBranding";

// Pequeno tooltip inline pra explicar o que cada campo faz na prática.
// Equipe operadora é digitalmente crua — não pode ter labels enigmáticos sem contexto.
function Hint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

interface AutomationSettings {
  id?: string;
  enabled: boolean;
  frequency_hours: number;
  max_leads_per_run: number;
  run_maps: boolean;
  run_instagram: boolean;
  run_cnpj_enrich: boolean;
  run_dispatch: boolean;
  run_linkedin: boolean;
  auto_socio_linkedin: boolean;
  auto_socio_linkedin_start_cadence: boolean;
  linkedin_search_terms: string[];
  min_score_360: number;
  require_partner_mobile: boolean;
  require_partner_identified: boolean;
  require_whatsapp_validated: boolean;
  maps_niches: string[];
  maps_regions: string[];
  ig_hashtags: string[];
  ig_target_accounts: string[];
  // Canais da automação (togglados individualmente na aba "Canais")
  auto_whatsapp_enabled: boolean;
  auto_email_enabled: boolean;
  auto_instagram_enabled: boolean;
  auto_telegram_enabled: boolean;
  auto_linkedin_dm_enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  last_run_summary: any;
}

const DEFAULT: AutomationSettings = {
  enabled: false,
  frequency_hours: 24,
  max_leads_per_run: 20,
  run_maps: true,
  run_instagram: true,
  run_cnpj_enrich: true,
  run_dispatch: false,
  run_linkedin: false,
  auto_socio_linkedin: false,
  auto_socio_linkedin_start_cadence: false,
  linkedin_search_terms: [],
  min_score_360: 60,
  require_partner_mobile: true,
  require_partner_identified: true,
  require_whatsapp_validated: true,
  maps_niches: [],
  maps_regions: [],
  ig_hashtags: [],
  ig_target_accounts: [],
  auto_whatsapp_enabled: true,
  auto_email_enabled: false,
  auto_instagram_enabled: false,
  auto_telegram_enabled: false,
  auto_linkedin_dm_enabled: false,
  last_run_at: null,
  next_run_at: null,
  last_run_summary: null,
};

function csv(arr: string[]) { return arr.join(", "); }
function fromCsv(s: string): string[] {
  return s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
}
// Input CSV que preserva o texto cru enquanto o usuário digita (permite
// vírgulas, espaços e tokens vazios intermediários). Só normaliza pro array
// no blur — sem isso, o round-trip array↔string apaga a vírgula na hora.
function CsvInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState(csv(value));
  const joined = csv(value);
  useEffect(() => {
    // Sincroniza quando o array externo muda (load inicial, reset), mas não
    // sobrescreve o que o usuário está digitando se já bate após normalizar.
    if (csv(fromCsv(raw)) !== joined) setRaw(joined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined]);
  return (
    <Input
      placeholder={placeholder}
      value={raw}
      onChange={(e) => {
        const v = e.target.value;
        setRaw(v);
        onChange(fromCsv(v));
      }}
      onBlur={() => setRaw(csv(fromCsv(raw)))}
    />
  );
}

function toNum(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (typeof v === "string") { const n = Number(v); return isFinite(n) ? n : 0; }
  if (typeof v === "object") {
    return toNum(v.inserted) + toNum(v.success) + toNum(v.count) + toNum(v.total);
  }
  return 0;
}

function countSavedFromSummary(summary: any): number {
  const tracks = summary?.tracks ?? {};
  return (Object.values(tracks) as any[]).reduce((acc: number, v: any) => {
    const inner = v?.scrape ?? v?.search ?? {};
    const saved = inner?.saved ?? v?.saved ?? (Array.isArray(inner?.leads) ? inner.leads.length : 0);
    return acc + (Number(saved) || 0);
  }, 0);
}

export default function Automacao() {
  const { branding: __b } = useBranding(); const agent = __b.agent_name;
  const company = __b.company_name;

  const [s, setS] = useState<AutomationSettings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const [autofilled, setAutofilled] = useState<{ niches: number; regions: number; terms: number } | null>(null);

  const loadSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const [{ data }, { data: briefing }] = await Promise.all([
      supabase.from("automation_settings" as any).select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("mavi_briefing" as any).select("segmentos_alvo, personas_alvo").eq("user_id", user.id).maybeSingle(),
    ]);
    const merged: AutomationSettings = { ...DEFAULT, ...((data as any) ?? {}) };

    // Auto-preenchimento: se nichos/regiões/termos estiverem vazios, puxa do briefing
    // pra garantir que o pipeline nunca pare por configuração faltando.
    const segs = ((briefing as any)?.segmentos_alvo ?? []) as string[];
    const personas = ((briefing as any)?.personas_alvo ?? []) as string[];
    const defaultRegions = ["São Paulo SP", "Rio de Janeiro RJ", "Belo Horizonte MG", "Curitiba PR", "Brasil"];

    let nichesFilled = 0, regionsFilled = 0, termsFilled = 0;
    if ((merged.maps_niches?.length ?? 0) === 0 && segs.length > 0) {
      merged.maps_niches = segs.slice(0, 30);
      nichesFilled = merged.maps_niches.length;
    }
    if ((merged.maps_regions?.length ?? 0) === 0) {
      merged.maps_regions = defaultRegions;
      regionsFilled = merged.maps_regions.length;
    }
    if ((merged.linkedin_search_terms?.length ?? 0) === 0 && (segs.length + personas.length) > 0) {
      merged.linkedin_search_terms = Array.from(new Set([...segs, ...personas])).slice(0, 30);
      termsFilled = merged.linkedin_search_terms.length;
    }

    setS(merged);

    // P2 UX fix: NÃO persiste auto-preenchimento sem consentimento — antes, qualquer
    // campo limpo intencionalmente pelo usuário era re-populado e salvo automaticamente
    // na próxima visita. Agora, mostramos um banner com botão "Aplicar" (o usuário
    // confirma salvando) ou "Dispensar" (mantém vazio). O merge já está em memória
    // pra UX fluida; o save explícito é o que persiste.
    if (nichesFilled + regionsFilled + termsFilled > 0) {
      setAutofilled({ niches: nichesFilled, regions: regionsFilled, terms: termsFilled });
    }

    return merged;
  };

  useEffect(() => {
    (async () => {
      await loadSettings();
      setLoading(false);
    })();
  }, []);

  // Realtime: quando o cron/auto-prospect grava em automation_settings, atualiza a UI sem polling.
  useEffect(() => {
    let cancelled = false;
    let channel: any = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      channel = supabase
        .channel(`automation_settings:${user.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "automation_settings", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const next = payload.new as AutomationSettings;
            setS((prev) => {
              if (prev.last_run_at && next.last_run_at && prev.last_run_at !== next.last_run_at) {
                const saved = countSavedFromSummary(next.last_run_summary);
                toast({
                  title: `✅ Busca finalizada: ${saved} leads salvos`,
                  description: "Abra Meus Leads → Maps para ver os contatos coletados.",
                });
              }
              return { ...prev, ...next };
            });
          }
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const payload = { ...s, user_id: user.id };
    delete (payload as any).last_run_at;
    delete (payload as any).next_run_at;
    delete (payload as any).last_run_summary;
    const { error } = await supabase.from("automation_settings" as any).upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    else toast({ title: "Configurações salvas" });
  };

  const runNow = async () => {
    setRunning(true);
    // Timeout client-side de 90s. Se passar, libera o botão e avisa o usuário
    // que o backend pode estar lento (4 fontes × N candidatos = muitas queries).
    const timeoutId = setTimeout(() => {
      setRunning(false);
      toast({
        title: "Execução demorou demais",
        description: "Backend > 90s. Provavelmente ainda processando — abra 'Ver detalhes técnicos' em 1-2 min pra ver o resultado.",
        variant: "destructive",
      });
    }, 90_000);

    try {
      const { data, error } = await supabase.functions.invoke("auto-prospect", { body: { manual: true } });
      clearTimeout(timeoutId);
      setRunning(false);
      if (error) {
        toast({ title: "Erro ao executar", description: error.message, variant: "destructive" });
        return;
      }
      if (data?.queued) {
        toast({
          title: "Pipeline iniciado",
          description: "A busca está rodando em background. Você pode fechar essa tela — o resumo atualiza sozinho quando terminar.",
        });
        return;
      }
      const enqueued = data?.summary?.enqueued ?? 0;
      const saved = countSavedFromSummary(data?.summary);
      const attempts = data?.summary?.enqueue_attempts ?? {};
      toast({
        title: `✅ Execução completa: ${saved} leads salvos · ${enqueued} enfileirados`,
        description: Object.keys(attempts).length ? `Tentativas por fonte: ${JSON.stringify(attempts).slice(0, 200)}` : "Veja os contatos em Meus Leads → Maps.",
      });
    } catch (e: any) {
      clearTimeout(timeoutId);
      setRunning(false);
      toast({ title: "Erro ao executar", description: e?.message ?? "Erro desconhecido", variant: "destructive" });
    }
  };

  // Sementeira por referências do tenant — busca Maps usando segmentos_alvo do briefing
  const [seedingMaps, setSeedingMaps] = useState(false);
  const [seedResult, setSeedResult] = useState<any>(null);
  const runSeedMaps = async () => {
    setSeedingMaps(true);
    setSeedResult(null);
    const { data, error } = await supabase.functions.invoke("maps-seed-by-references", { body: {} });
    setSeedingMaps(false);
    if (error) {
      toast({ title: "Erro na sementeira", description: error.message, variant: "destructive" });
      return;
    }
    if (data?.error) {
      toast({ title: "Sementeira não rodou", description: data.error, variant: "destructive" });
      return;
    }
    setSeedResult(data);
    toast({
      title: `🌱 Sementeira completa`,
      description: `${data?.total_saved ?? 0} leads salvos em ${data?.combinations ?? 0} combinações.`,
    });
  };

  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/20"><Bot className="h-6 w-6 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-bold">Prospecção Automatizada</h1>
          <p className="text-sm text-muted-foreground">
            Pipeline Maps → CNPJ → Instagram → {agent} rodando sozinho no horário definido.
          </p>
        </div>
      </div>

      <PageGuide
        storageKey="guide_automacao"
        title="Prospecção Automatizada"
        what={`Liga a captura automática: a cada N horas, o pipeline varre Maps, CNPJ, LinkedIn e Instagram, enriquece via DadosBooster e enfileira na ${agent} — sem ninguém precisar clicar.`}
        steps={[
          { text: "Ative o toggle 'Captura ativa' abaixo" },
          { text: "Defina frequência (ex: 1h) e quais fontes usar" },
          { text: "Clique 'Executar agora' para testar antes de deixar rodando" },
        ]}
        troubleshoot={`Se aparecer '0 enfileirados', confira que o briefing ${company} tem segmentos e personas preenchidos.`}
        troubleshootRoute="/mavi/aprendizado"
      />

      {autofilled && (autofilled.niches + autofilled.regions + autofilled.terms) > 0 && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 flex flex-wrap items-center gap-2">
          <span className="flex-1 min-w-[240px]">
            ✨ Sugestões do briefing pra evitar pipeline vazio:
            {autofilled.niches > 0 && <> <b>{autofilled.niches}</b> nichos,</>}
            {autofilled.regions > 0 && <> <b>{autofilled.regions}</b> regiões,</>}
            {autofilled.terms > 0 && <> <b>{autofilled.terms}</b> termos LinkedIn.</>}
            {" "}Já pré-aplicadas no formulário — revise e clique <b>Aplicar</b> pra salvar, ou <b>Dispensar</b> pra manter vazio.
          </span>
          <Button size="sm" variant="default" onClick={async () => { await save(); setAutofilled(null); }}>
            Aplicar
          </Button>
          <Button size="sm" variant="ghost" onClick={async () => {
            const cleared = { ...s, maps_niches: [], maps_regions: [], linkedin_search_terms: [] };
            setS(cleared);
            setAutofilled(null);
          }}>
            Dispensar
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {s.enabled ? <Badge className="bg-success">ATIVA</Badge> : <Badge variant="secondary">DESATIVADA</Badge>}
                Status do agendamento
                <Hint text="Quando ATIVA: o pg_cron roda a cada hora e dispara este pipeline para os usuários cuja próxima execução já passou. Desligar pausa imediatamente — sua configuração não é perdida, só fica em standby." />
              </CardTitle>
              <CardDescription>Roda a cada hora e dispara só os pipelines com próxima execução vencida.</CardDescription>
            </div>
            <Switch checked={s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} />
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Última execução:</span>
            <span>{s.last_run_at ? format(new Date(s.last_run_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Próxima:</span>
            <span>{s.next_run_at ? format(new Date(s.next_run_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Frequência:</span>
            <span>{s.frequency_hours}h</span>
          </div>
          {s.last_run_summary && (
            <div className="col-span-full">
              <RunSummary summary={s.last_run_summary} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Parâmetros gerais</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-1.5">
              <Label>Frequência (horas)</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    De quantas em quantas horas o ciclo automático roda. Ex.: <b>24</b> = 1x por dia, <b>12</b> = 2x por dia, <b>1</b> = a cada hora.
                    A janela comercial (horário permitido para enviar mensagens) é configurada em <b>Disparo {agent}</b>, não aqui — o ciclo pode rodar fora do horário, mas os envios só saem dentro da janela.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input type="number" min={1} max={168} value={s.frequency_hours}
              onChange={(e) => setS({ ...s, frequency_hours: Math.max(1, Number(e.target.value) || 24) })} />
            <p className="text-[11px] text-muted-foreground mt-1">
              Para garantir que {agent} <b>não envie de madrugada/fim de semana</b>, configure a janela em{" "}
              <Link to="/disparo-humanizado" className="text-primary underline">Disparo {agent} → Anti-ban</Link>.
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <Label>Máx. leads por execução</Label>
              <Hint text={`Quantos leads são processados a cada ciclo automático. Cap interno: 50 (mesmo se você digitar 200). Aumentar acelera a fila ${agent}; diminuir poupa crédito Unipile/DadosBooster.`} />
            </div>
            <Input type="number" min={1} max={200} value={s.max_leads_per_run}
              onChange={(e) => setS({ ...s, max_leads_per_run: Math.max(1, Number(e.target.value) || 20) })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Etapas do pipeline</CardTitle>
          <CardDescription>Ordem fixa: Trilha → CNPJ → Instagram → DadosBooster → 360° → {agent}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            ["run_linkedin", "🎯 Trilha LinkedIn (busca por termo)", "Busca perfis LinkedIn via Unipile usando os termos abaixo. Requer conta Unipile configurada em Configurações → APIs (chave + DSN + account_id). Sem Unipile, esta etapa falha (vê 'Linkedin: erro' nas stats)."],
            ["run_maps", "Buscar empresas no Google Maps", "Busca empresas reais por nicho + região via Google Places API. Requer Google Places API key configurada. Empresas vão pra tabela 'leads' com telefone."],
            ["run_instagram", "Coletar perfis Instagram", "Para cada sócio identificado via CNPJ, busca o perfil Instagram dele pelo nome (Apify). Útil pra qualificar e enriquecer biografia."],
            ["run_cnpj_enrich", "Enriquecer CNPJ em lote (Receita Federal)", `FAZ 2 ETAPAS: (1) DESCOBRE o CNPJ pelo nome via Apify Google Search — necessário pra leads vindos do Maps que não têm CNPJ. (2) Consulta CNPJ.ws (gratuito) e popula QSA (sócios), porte, atividade, endereço. Sem esta etapa, leads do Maps não viram empresas_enriquecidas e fila ${agent} fica vazia.`],
            ["auto_socio_linkedin", "🧲 Buscar sócios identificados no LinkedIn (Fase G)", "Após CNPJ enrich, para cada empresa enriquecida com sócio, busca o LinkedIn dele via Unipile e cria contato em /buscas/linkedin-dm. Consome crédito Unipile POR SÓCIO. Requer Unipile configurado. Recomendo testar com 1-2 empresas antes de ativar em massa."],
            ["auto_socio_linkedin_start_cadence", "↳ Iniciar cadência D+0/+7/+14/+21 automaticamente", "Quando o sócio é encontrado no LinkedIn pela linha acima, já dispara a cadência SPIN. Cuidado: começa a enviar DM real no LinkedIn sem aprovação manual. Mantenha OFF para revisar contatos antes de cadenciar."],
            ["run_dispatch", `Abordar leads ao final (cuidado: envia mensagens)`, `⚠️ Esta é a etapa que efetivamente ENVIA pelos canais ligados abaixo: WhatsApp, e-mail, Instagram DM e Telegram. Para operar sem chip, deixe WhatsApp desligado em Canais da automação e mantenha e-mail/Instagram ligados.`],
          ] as [keyof AutomationSettings, string, string][]).map(([key, label, hint]) => (
            <div key={key} className="flex items-center justify-between rounded border border-border/50 p-3">
              <div className="flex items-center gap-1.5">
                <Label htmlFor={key as string}>{label}</Label>
                <Hint text={hint} />
              </div>
              <Switch id={key as string} checked={(s as any)[key]} onCheckedChange={(v) => setS({ ...s, [key]: v } as any)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            📡 Canais da automação
            <Hint text="Cada canal ligado abaixo entra em paralelo para o mesmo lead — se ele tiver telefone + email + Instagram e todos os 3 canais estiverem ativos, ele recebe abordagem em cada um. Ligue apenas os canais que quer usar; os desligados são ignorados no auto-prospect." />
          </CardTitle>
          <CardDescription>
            Ative um a um ou todos. Cada lead é distribuído em paralelo entre os canais ligados que ele tiver identificador (telefone, email, @Instagram).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            ["auto_whatsapp_enabled", "🟢 WhatsApp (Mandrack multi-chip)", "Canal principal. Usa a rotação automática de chips + warm-up individual. Precisa de pelo menos 1 chip conectado em Configurações → WhatsApp."],
            ["auto_email_enabled", "✉️ E-mail (Unipile)", "Envia a partir da sua conta Gmail/Outlook conectada no Unipile. Exige o email do lead. Enviar da sua conta real melhora entregabilidade vs. serviços de bulk."],
            ["auto_instagram_enabled", "📷 Instagram DM (Unipile)", "Envia direct via sua conta Instagram conectada no Unipile. Exige @username do lead. Usa muito com a fonte Instagram."],
            ["auto_telegram_enabled", "✈️ Telegram (Unipile)", "Envia via sua conta Telegram conectada no Unipile. Exige @username do lead. Poucas fontes trazem esse campo hoje — deixe ligado apenas se você já popula manualmente."],
            ["auto_linkedin_dm_enabled", "💼 LinkedIn DM (cadência Unipile)", "Ativa a cadência de conexão + follow-ups D+0/+7/+14/+21 para leads LinkedIn que não têm WhatsApp. Respeita cap diário de 20 DMs e horário comercial."],
          ] as [keyof AutomationSettings, string, string][]).map(([key, label, hint]) => (
            <div key={key} className="flex items-center justify-between rounded border border-border/50 p-3">
              <div className="flex items-center gap-1.5">
                <Label htmlFor={key as string}>{label}</Label>
                <Hint text={hint} />
              </div>
              <Switch
                id={key as string}
                checked={(s as any)[key]}
                onCheckedChange={(v) => setS({ ...s, [key]: v } as any)}
              />
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Dica: manter só WhatsApp ligado no começo para calibrar a mensagem. Depois vá adicionando outros canais aos poucos e observe a taxa de resposta em cada um.
          </p>
        </CardContent>
      </Card>



      <Card>
        <CardHeader>
          <CardTitle>LinkedIn — Trilha</CardTitle>
          <CardDescription>Termos que a busca automática vai usar (rotação aleatória por execução).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex items-center gap-1.5">
              <Label>Termos de busca (vírgula)</Label>
              <Hint text={`Lista de queries que o Unipile usa pra achar perfis LinkedIn. A cada execução automática, UMA é escolhida aleatoriamente — isso evita pattern previsível que o LinkedIn detectaria. Recomendado para ${company}: 'gerente financeiro varejo SP', 'controller cimenteiras', 'diretor financeiro distribuidora'.`} />
            </div>
            <Input
              placeholder="gerente financeiro varejo, controller cimenteiras, diretor financeiro distribuidora"
              value={s.linkedin_search_terms.join(", ")}
              onChange={(e) => setS({ ...s, linkedin_search_terms: e.target.value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean) })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gatilho de disparo {agent}</CardTitle>
          <CardDescription>Condições mínimas para um lead enriquecido entrar na fila de prospecção.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex items-center gap-1.5">
              <Label>Score 360° mínimo: {s.min_score_360}%</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Percentual mínimo de <b>dados completos</b> (CNPJ válido, sócio identificado, WhatsApp validado, cargo) que um lead precisa ter para entrar na fila.
                    <br /><br />
                    <b>Recomendado: 60–70%.</b> Acima de 80% você dispara só pra leads "perfeitos" (volume baixo). Abaixo de 50% entra muita gente sem dado bom (queima reputação).
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              type="number" min={0} max={100}
              value={s.min_score_360}
              onChange={(e) => setS({ ...s, min_score_360: Math.min(100, Math.max(0, Number(e.target.value) || 60)) })}
            />
          </div>
          {([
            ["require_partner_identified", "Exigir sócio identificado (CNPJ QSA)", `Só envia para empresas onde o CNPJ trouxe o nome do(s) sócio(s) (Quadro de Sócios e Administradores). Sem isso, ${agent} não tem o nome do decisor financeiro pra abordar — fica genérico.`],
            ["require_partner_mobile", "Exigir celular pessoal via DadosBooster", "Só envia para sócios cujo celular pessoal foi encontrado via DadosBooster. Sem isso, o disparo cai no telefone GERAL da empresa — normalmente atende recepção/secretária, não o decisor."],
            ["require_whatsapp_validated", "Exigir WhatsApp validado", "Só aceita números BR mobile padrão WhatsApp (11 dígitos, dígito 9 após DDD, DDI 55). Desligar aceita fixos/landlines também — capta mais leads, mas WhatsApp pode rejeitar entrega em número fixo. Recomendado: deixar LIGADO."],
          ] as [keyof AutomationSettings, string, string][]).map(([key, label, hint]) => (
            <div key={key} className="flex items-center justify-between rounded border border-border/50 p-3">
              <div className="flex items-center gap-1.5">
                <Label htmlFor={key as string}>{label}</Label>
                <Hint text={hint} />
              </div>
              <Switch id={key as string} checked={(s as any)[key]} onCheckedChange={(v) => setS({ ...s, [key]: v } as any)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Google Maps</CardTitle><CardDescription>Nichos e regiões para busca automática.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex items-center gap-1.5">
              <Label>Nichos (separados por vírgula)</Label>
              <Hint text={`Queries que o Google Maps usa pra buscar empresas. Uma é escolhida aleatoriamente a cada execução do auto-prospect. Ex: 'restaurante', 'clínica odontológica', 'cimenteira'. Pra ${company}, use os segmentos do template carregado em /mavi-aprendizado.`} />
            </div>
            <CsvInput
              placeholder="restaurante, clínica odontológica, advogado..."
              value={s.maps_niches}
              onChange={(next) => setS({ ...s, maps_niches: next })}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <Label>Regiões (separadas por vírgula)</Label>
              <Hint text="Cidades/estados pra restringir a busca. Uma é escolhida aleatoriamente por execução. Ex: 'São Paulo SP', 'Salvador BA', 'Brasil' (sem filtro)." />
            </div>
            <CsvInput
              placeholder="São Paulo SP, Belo Horizonte MG..."
              value={s.maps_regions}
              onChange={(next) => setS({ ...s, maps_regions: next })}
            />

          </div>

          {/* Fase H: Sementeira {company} */}
          <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs font-semibold">🌱 Sementeira pelo briefing {company}</Label>
              <Hint text="Usa segmentos_alvo do mavi_briefing (Knowledge pack) cruzados com Regiões acima para buscar via Google Maps imediatamente. Diferente do toggle 'Maps' acima (que roda no cron horário), isto é um disparo ONE-SHOT pra popular leads na hora. Cap: 5 segmentos × 3 regiões × 5 leads = até 75 leads por clique." />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Não depende dos "Nichos" acima — puxa os segmentos diretamente do briefing {company} (template). Bom pra iniciar prospecção rapidamente.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={seedingMaps}
              onClick={runSeedMaps}
            >
              {seedingMaps ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Buscando…</> : `🌱 Buscar com sementeira ${company} agora`}
            </Button>
            {seedResult && (
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                ✓ {seedResult.total_saved} leads salvos em {seedResult.combinations} combinações.
                {seedResult.clientes_referencia_count > 0 && (
                  <> Briefing tem {seedResult.clientes_referencia_count} clientes-referência ativos como prova social.</>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bloco "Instagram por hashtags/contas-alvo" REMOVIDO na Fase E.
          Esses campos estavam na UI mas o backend nunca os consumia — promessa
          de feature inexistente. Instagram continua funcionando, mas via busca
          de perfil do SÓCIO da empresa enriquecida (CNPJ → QSA → IG do nome),
          que é a parte que efetivamente roda no auto-prospect linhas 141-160.
          Se um dia implementarmos hashtag/contas-alvo, os campos voltam aqui. */}

      <Separator />

      <div className="flex gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar
        </Button>
        <Button variant="outline" onClick={runNow} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          Executar agora
        </Button>
      </div>
    </div>
  );
}

function RunSummary({ summary }: { summary: any }) {
  const [open, setOpen] = useState(false);
  const cnpj = toNum(summary?.cnpj?.processed);
  const enqueuedRaw = summary?.enqueued ?? 0;
  const enqueued = typeof enqueuedRaw === "object" && enqueuedRaw !== null
    ? (toNum((enqueuedRaw as any).inserted) + toNum((enqueuedRaw as any).success))
    : toNum(enqueuedRaw);
  const enqueuedSkipped = typeof enqueuedRaw === "object" && enqueuedRaw !== null
    ? toNum((enqueuedRaw as any).skipped) : 0;
  const igSearched = toNum(summary?.instagram?.searched);
  const dados4u = toNum(summary?.dados4u?.queried);
  const tracks = summary?.tracks ?? {};
  const trackEntries = Object.entries(tracks) as [string, any][];
  const trackStats = trackEntries.map(([name, v]) => {
    const inner = v?.scrape ?? v?.search ?? {};
    const rawSaved = inner?.saved ?? v?.saved ?? (Array.isArray(inner?.leads) ? inner.leads.length : 0);
    const rawTotal = inner?.total ?? v?.total ?? (Array.isArray(inner?.leads) ? inner.leads.length : 0);
    return {
      name,
      saved: toNum(rawSaved),
      total: toNum(rawTotal),
      error: v?.error ?? inner?.error ?? null,
      hint: inner?.hint ?? null,
    };
  });
  const totalSaved = trackStats.reduce((a, t) => a + (t.saved || 0), 0);
  const totalScraped = trackStats.reduce((a, t) => a + (t.total || 0), 0);

  // Sincronia: agrega motivos de bloqueio de TODAS as fontes pra mostrar
  // ao operador POR QUE a fila ficou vazia mesmo com leads coletados.
  const attempts = (summary?.enqueue_attempts ?? {}) as Record<
    string,
    { tried: number; enqueued: number; skipped_reasons: Record<string, number> }
  >;
  const totalTried = Object.values(attempts).reduce((a, x) => a + (x?.tried ?? 0), 0);
  const aggregatedReasons: Record<string, number> = {};
  for (const v of Object.values(attempts)) {
    for (const [r, n] of Object.entries(v?.skipped_reasons ?? {})) {
      aggregatedReasons[r] = (aggregatedReasons[r] ?? 0) + (n as number);
    }
  }
  const reasonLabel: Record<string, string> = {
    not_br_mobile: "Telefone não é celular BR (fixo/landline)",
    no_phone: "Sem telefone",
    no_partner: "Sem sócio identificado (CNPJ sem QSA)",
    no_partner_mobile: "Sem celular pessoal do sócio (DadosBooster)",
    phone_too_short: "Telefone curto demais (inválido)",
    already_queued: `Já estava na fila (duplicado)`,
    low_score: "Score 360° abaixo do mínimo",
  };
  const sortedReasons = Object.entries(aggregatedReasons).sort((a, b) => b[1] - a[1]);
  const topReason = sortedReasons[0];
  const topReasonPct = totalTried > 0 && topReason ? Math.round((topReason[1] / totalTried) * 100) : 0;

  // Alertas acionáveis pro operador — explicam em linguagem comum
  // o que precisa mudar pra fila voltar a encher.
  const alerts: { tone: "warn" | "info" | "danger"; msg: string }[] = [];
  if (totalTried > 0 && enqueued === 0) {
    alerts.push({
      tone: "danger",
      msg: `${totalTried} leads avaliados, NENHUM entrou na fila. Veja motivos abaixo e ajuste.`,
    });
  }
  if (topReason && topReasonPct >= 50 && topReason[0] === "not_br_mobile") {
    alerts.push({
      tone: "warn",
      msg: `${topReasonPct}% dos leads bloqueados por telefone fixo. Os nichos atuais do Maps (indústrias/fábricas/transportadoras) trazem linha de empresa, não celular do dono. Use nichos com decisor pessoal (consultórios, autônomos) OU desligue "Exigir WhatsApp validado" e aceite que parte vai falhar entrega.`,
    });
  }
  if (topReason && topReasonPct >= 50 && topReason[0] === "already_queued") {
    alerts.push({
      tone: "info",
      msg: `${topReasonPct}% dos leads já estavam enfileirados. A fonte está esgotada — adicione novos nichos/regiões ou aguarde a próxima rodada do scraper.`,
    });
  }
  const liError = trackStats.find((t) => t.name === "linkedin")?.error
    ?? trackStats.find((t) => t.name === "linkedin")?.hint;
  if (liError && /unipile|account_id|api.key|não.*configurad|not.*configured|unauthorized/i.test(String(liError))) {
    alerts.push({
      tone: "danger",
      msg: `Trilha LinkedIn parou: Unipile sem credenciais. Acesse Configurações → APIs e verifique chave Unipile, DSN e account_id.`,
    });
  }
  if (trackStats.find((t) => t.name === "maps")?.saved === 0 && trackStats.find((t) => t.name === "maps")) {
    alerts.push({
      tone: "warn",
      msg: `Google Maps trouxe 0 leads. Verifique se o nicho da rodada existe na região escolhida — ou se a Google Places API ficou sem cota.`,
    });
  }

  return (
    <div className="rounded border border-border/50 bg-muted/30 p-3 text-xs space-y-2">
      {alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={`rounded px-2 py-1.5 text-[11px] leading-snug border ${
                a.tone === "danger"
                  ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : a.tone === "warn"
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-primary/40 bg-primary/10 text-primary"
              }`}
            >
              {a.msg}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span><b className="text-foreground">{totalScraped}</b> <span className="text-muted-foreground">leads coletados</span></span>
        <span><b className="text-foreground">{totalSaved}</b> <span className="text-muted-foreground">salvos</span></span>
        <span><b className="text-foreground">{cnpj}</b> <span className="text-muted-foreground">CNPJs enriquecidos</span></span>
        <span><b className="text-foreground">{igSearched}</b> <span className="text-muted-foreground">perfis IG buscados</span></span>
        <span><b className="text-foreground">{dados4u}</b> <span className="text-muted-foreground">consultas DadosBooster</span></span>
        <span><b className="text-foreground">{enqueued}</b> <span className="text-muted-foreground">na fila{enqueuedSkipped ? ` (${enqueuedSkipped} ignorados)` : ""}</span></span>
      </div>
      {trackStats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {trackStats.map((t) => (
            <span key={t.name} className={`px-2 py-0.5 rounded border text-muted-foreground ${t.error ? "border-destructive/50 bg-destructive/10" : "border-border/50 bg-background"}`}>
              <b className="text-foreground capitalize">{t.name}</b>: {t.saved}/{t.total}
              {t.error && <span className="text-destructive ml-1">· erro</span>}
            </span>
          ))}
        </div>
      )}
      {sortedReasons.length > 0 && (
        <div className="rounded border border-border/50 bg-background/60 p-2 space-y-1">
          <div className="text-[11px] font-semibold text-foreground">
            Por que leads foram bloqueados da fila ({totalTried} avaliados)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sortedReasons.map(([reason, n]) => {
              const pct = totalTried > 0 ? Math.round((n / totalTried) * 100) : 0;
              return (
                <span
                  key={reason}
                  className="px-2 py-0.5 rounded bg-muted text-[10px] text-foreground"
                  title={`${n} de ${totalTried} (${pct}%)`}
                >
                  <b>{n}</b> {reasonLabel[reason] ?? reason}{" "}
                  <span className="text-muted-foreground">({pct}%)</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
      <button onClick={() => setOpen(!open)} className="text-[11px] text-primary hover:underline">
        {open ? "Ocultar detalhes técnicos" : "Ver detalhes técnicos"}
      </button>
      {open && (
        <pre className="text-[10px] text-muted-foreground bg-background/60 rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap break-all">
          {JSON.stringify(summary, null, 2)}
        </pre>
      )}
    </div>
  );
}