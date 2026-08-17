import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Rocket, Database, PenLine, Clock, RefreshCw, Pause, Play, AlertTriangle, CheckCircle2, Send, Shield, Eye, Loader2, ChevronDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { translateInvokeError } from "@/lib/friendlyError";
import { PageGuide } from "@/components/PageGuide";
import { useBranding } from "@/hooks/useBranding";

type LeadShape = {
  id?: string; nome_empresa?: string; telefone?: string;
  especialidades?: string | null; mensagem?: string | null; source?: string;
  site?: string | null; linkedin_url?: string | null; instagram_url?: string | null;
};

const SOURCES = [
  { key: "leads", label: "Maps", map: (r: any) => ({ id: r.id, source: "leads", nome_empresa: r.nome_empresa, telefone: r.telefone, especialidades: r.especialidades, mensagem: r.mensagem }) },
  { key: "instagram_contacts", label: "Instagram", map: (r: any) => ({ id: r.id, source: "instagram_contacts", nome_empresa: r.nome ?? r.username, telefone: r.whatsapp ?? "", especialidades: r.bio, mensagem: r.mensagem }) },
  { key: "linkedin_contacts", label: "LinkedIn", map: (r: any) => ({
      id: r.id,
      source: "linkedin_contacts",
      nome_empresa: r.nome || r.empresa || "(sem nome)",
      telefone: r.telefone ?? "",
      especialidades: [r.cargo, r.empresa].filter(Boolean).join(" @ ") || null,
      mensagem: r.mensagem,
    }) },
  { key: "empresas_enriquecidas", label: "Empresas", map: (r: any) => ({ id: r.id, source: "empresas_enriquecidas", nome_empresa: r.nome_empresa, telefone: r.telefone ?? "", especialidades: r.atividade_principal, mensagem: null as string | null }) },
];

export default function DisparoHumanizado() {
  const qc = useQueryClient();
  const { branding } = useBranding();
  const company = branding.company_name;
  const agent = branding.agent_name;


  // WhatsApp gate — separa "desconectado" de "conectado porém pausado".
  // Antes a tela mostrava "WhatsApp desconectado" quando o chip estava OPEN no
  // Mandrack, mas pausado por proteção/auto-pause. Isso gerava a mensagem falsa
  // "conecte" para quem já estava conectado.
  const { data: waStatus = { total: 0, connected: 0, ready: 0, pausedConnected: 0 } } = useQuery({
    queryKey: ["wa_readiness_gate"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("id, active, paused, status")
        .eq("active", true);
      const rows = data ?? [];
      const connected = rows.filter((i: any) => i.status === "open").length;
      const ready = rows.filter((i: any) => i.status === "open" && !i.paused).length;
      const pausedConnected = rows.filter((i: any) => i.status === "open" && i.paused).length;
      return { total: rows.length, connected, ready, pausedConnected };
    },
    refetchInterval: 30000,
  });
  const waConnected = waStatus.ready > 0;
  const waPausedButConnected = !waConnected && waStatus.pausedConnected > 0;

  // Settings
  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ["dispatch_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("dispatch_settings").select("*").maybeSingle();
      return data;
    },
  });

  const [minDelay, setMinDelay] = useState(45);
  const [maxDelay, setMaxDelay] = useState(180);
  const [hourStart, setHourStart] = useState(9);
  const [hourEnd, setHourEnd] = useState(18);
  const [respectHours, setRespectHours] = useState(true);
  const [dailyLimit, setDailyLimit] = useState(80);
  const [useAudio, setUseAudio] = useState(true);
  const [audioRatio, setAudioRatio] = useState(0.25);
  const [proxyUrl, setProxyUrl] = useState("");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setMinDelay(settings.min_delay_seconds);
    setMaxDelay(settings.max_delay_seconds);
    setHourStart(settings.business_hour_start);
    setHourEnd(settings.business_hour_end);
    setRespectHours(settings.respect_business_hours);
    setDailyLimit(settings.daily_limit);
    setUseAudio(settings.use_audio);
    setAudioRatio(Number(settings.audio_ratio));
    setProxyUrl(settings.proxy_url ?? "");
    setPaused(settings.paused);
  }, [settings]);

  const saveSettings = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("dispatch_settings").upsert({
      user_id: u.user.id,
      min_delay_seconds: minDelay,
      max_delay_seconds: maxDelay,
      business_hour_start: hourStart,
      business_hour_end: hourEnd,
      respect_business_hours: respectHours,
      daily_limit: dailyLimit,
      use_audio: useAudio,
      audio_ratio: audioRatio,
      proxy_url: proxyUrl || null,
      paused,
    }, { onConflict: "user_id" });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Configurações salvas" }); refetchSettings(); }
  };

  const togglePause = async () => {
    const newPaused = !paused;
    setPaused(newPaused); // optimistic
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setPaused(!newPaused);
      toast({ title: "Sessão expirada", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("dispatch_settings").upsert({
      user_id: u.user.id, paused: newPaused,
    }, { onConflict: "user_id" });
    if (error) {
      // Reverte UI pra não dar falsa sensação de pausa enquanto worker continua disparando.
      setPaused(!newPaused);
      toast({ title: "Erro ao salvar pausa", description: error.message, variant: "destructive" });
      return;
    }
    refetchSettings();
  };

  // Fonte de leads
  const [activeSource, setActiveSource] = useState(SOURCES[0].key);
  const sourceCfg = SOURCES.find((s) => s.key === activeSource)!;
  const { data: rows = [], isFetching, refetch } = useQuery({
    queryKey: ["disparo-source", activeSource],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(sourceCfg.key as any)
        .select("*")
        .or("disparo.is.null,disparo.eq.Não")
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []).map(sourceCfg.map);
    },
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => setSelected(new Set(rows.map((r) => r.id!)));
  const clearSel = () => setSelected(new Set());

  // Manual
  const [activeTab, setActiveTab] = useState<"db" | "manual">("db");
  const [manual, setManual] = useState<LeadShape>({
    nome_empresa: "", telefone: "", especialidades: "",
    site: "", linkedin_url: "", instagram_url: "",
  });

  // Enfileira
  const [enqueueing, setEnqueueing] = useState(false);
  const [enriching, setEnriching] = useState(false);

  // Preview MAVI (anti-ceticismo): operador vê a mensagem antes de enfileirar
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewLead, setPreviewLead] = useState<any>(null);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [previewParts, setPreviewParts] = useState<string[]>([]);
  const [previewGrounding, setPreviewGrounding] = useState(false);
  const [previewDetailsOpen, setPreviewDetailsOpen] = useState(false);

  // Pega o primeiro lead elegível (manual ou primeiro selecionado do banco) pra prévia
  const pickLeadForPreview = (): any | null => {
    if (activeTab === "manual") {
      if (!manual.nome_empresa) return null;
      return { ...manual };
    }
    const first = rows.find((r) => selected.has(r.id!));
    return first ?? null;
  };

  const openPreview = async () => {
    const lead = pickLeadForPreview();
    if (!lead) {
      toast({ title: "Sem lead pra pré-visualizar", description: activeTab === "manual" ? "Preencha pelo menos nome da empresa." : "Selecione 1 lead do banco." });
      return;
    }
    setPreviewLead(lead);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewResult(null);
    setPreviewParts([]);
    try {
      const { data, error } = await supabase.functions.invoke("dispatch-preview", {
        body: { lead, with_grounding: previewGrounding },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPreviewResult(data);
      setPreviewParts(Array.isArray(data?.parts) ? data.parts : []);
    } catch (e: any) {
      toast({ title: "Erro na prévia", description: translateInvokeError(e, `Prévia ${agent}`), variant: "destructive" });
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const regeneratePreview = async () => {
    if (!previewLead) return;
    setPreviewLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("dispatch-preview", {
        body: { lead: previewLead, with_grounding: previewGrounding },
      });
      if (error) throw error;
      setPreviewResult(data);
      setPreviewParts(Array.isArray(data?.parts) ? data.parts : []);
    } catch (e: any) {
      toast({ title: "Erro ao regerar", description: translateInvokeError(e, "Regerar prévia"), variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

  const enqueueFromPreview = async () => {
    if (!previewLead || !previewParts.length) {
      toast({ title: "Gere a prévia primeiro", description: "Clique em 'Pré-visualizar mensagem'.", variant: "destructive" });
      return;
    }
    // Une as parts no formato JSON que o worker espera (parseMessageParts decompõe novamente)
    const mensagemJson = JSON.stringify({
      messages: previewParts.map((m, i) => ({ part: i + 1, message: m })),
    });
    setEnqueueing(true);
    try {
      const leadPayload = activeTab === "manual"
        ? { ...previewLead, source: "manual", mensagem: mensagemJson }
        : { source: previewLead.source, source_id: previewLead.id, nome_empresa: previewLead.nome_empresa,
            telefone: previewLead.telefone, especialidades: previewLead.especialidades, mensagem: mensagemJson };
      const { data, error } = await supabase.functions.invoke("dispatch-enqueue", {
        body: { leads: [leadPayload], proxy_url: proxyUrl || null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Fecha o modal SÓ após sucesso confirmado. Antes fechava antes do invoke
      // — se falhasse, operador perdia a prévia e tinha que regenerar.
      setPreviewOpen(false);
      toast({ title: `🚀 1 envio na fila`, description: `Mensagem aprovada e enviada para fila ${agent}.` });
      clearSel();
      qc.invalidateQueries({ queryKey: ["dispatch_queue"] });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro ao enfileirar", description: translateInvokeError(e, `Enfileirar ${agent}`), variant: "destructive" });
    } finally {
      setEnqueueing(false);
    }
  };

  const enrichLinkedInDados4u = async () => {
    const ids = selected.size > 0
      ? rows.filter((r) => selected.has(r.id!)).map((r) => r.id!)
      : rows.filter((r) => !r.telefone || String(r.telefone).replace(/\D/g, "").length < 10).map((r) => r.id!);
    if (ids.length === 0) {
      toast({ title: "Nada para enriquecer", description: "Selecione contatos LinkedIn ou deixe que enriqueça os sem telefone." });
      return;
    }
    if (ids.length > 20 && !confirm(`Enriquecer ${ids.length} contatos no DadosBooster?`)) return;
    setEnriching(true);
    let ok = 0, fail = 0, found = 0;
    // Captura o último erro pra incluir no toast final — antes engolíamos tudo,
    // operador via "5 falha(s)" sem saber se era 429 / auth-fail / sem nome.
    let lastError: string | null = null;
    try {
      const { data: contatos } = await supabase
        .from("linkedin_contacts")
        .select("id, nome, telefone")
        .in("id", ids);
      for (const c of contatos ?? []) {
        const nome = (c.nome || "").trim();
        if (!nome) { fail++; lastError = "Contato sem nome"; continue; }
        try {
          const { data, error } = await supabase.functions.invoke("dados4u-query-v2", {
            body: { tipo: "nome", valor: nome, leadId: c.id },
          });
          if (error?.message?.includes("Erro Dados4U 404") || data?.notFound) {
            ok++;
            continue;
          }
          if (error || !data?.success) {
            fail++;
            lastError = error?.message ?? data?.error ?? "Resposta inesperada do DadosBooster";
            continue;
          }
          const cel = data?.consulta?.celulares?.[0]?.numero
            ?? data?.consulta?.fixos?.[0]?.numero
            ?? null;
          const email = data?.consulta?.emails?.[0]?.email ?? null;
          const upd: any = {};
          if (cel && (!c.telefone || String(c.telefone).replace(/\D/g, "").length < 10)) upd.telefone = cel;
          if (email) upd.email = email;
          if (Object.keys(upd).length > 0) {
            await supabase.from("linkedin_contacts").update(upd).eq("id", c.id);
            if (upd.telefone) found++;
          }
          ok++;
        } catch (e: any) {
          fail++;
          lastError = e?.message ?? String(e);
        }
      }
      toast({
        title: `DadosBooster: ${ok} consultado(s)`,
        description: `${found} com telefone novo · ${fail} falha(s)${lastError && fail > 0 ? ` · último erro: ${lastError.slice(0, 80)}` : ""}`,
        variant: fail > 0 && ok === 0 ? "destructive" : "default",
      });
      refetch();
    } finally {
      setEnriching(false);
    }
  };

  const enqueue = async () => {
    if (!waConnected) {
      toast({ title: "WhatsApp desconectado", description: "Conecte seu WhatsApp em Configurações → WhatsApp antes de disparar.", variant: "destructive" });
      return;
    }
    setEnqueueing(true);
    try {
      let leads: LeadShape[] = [];
      if (activeTab === "db") {
        leads = rows
          .filter((r) => selected.has(r.id!))
          .filter((r) => !!r.telefone && String(r.telefone).replace(/\D/g, "").length >= 10)
          .map((r) => ({
            source: r.source, source_id: r.id, nome_empresa: r.nome_empresa,
            telefone: r.telefone, mensagem: r.mensagem,
          }));
        const skipped = selected.size - leads.length;
        if (skipped > 0) {
          toast({ title: `${skipped} lead(s) ignorado(s)`, description: "Sem telefone válido. Enriqueça via DadosBooster antes." });
        }
      } else {
        if (!manual.nome_empresa || !manual.telefone) {
          toast({ title: "Preencha nome e telefone", variant: "destructive" });
          return;
        }
        leads = [{ ...manual, source: "manual" }];
      }
      if (!leads.length) { toast({ title: "Selecione ao menos 1 lead", variant: "destructive" }); return; }

      const { data, error } = await supabase.functions.invoke("dispatch-enqueue", {
        body: { leads, proxy_url: proxyUrl || null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: `🚀 ${data.queued} envio(s) na fila`,
        description: `Último agendado: ${formatEta(data.eta)}${data.instances_used > 1 ? ` · ${data.instances_used} chips` : ""}`,
      });
      clearSel();
      qc.invalidateQueries({ queryKey: ["dispatch_queue"] });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro ao enfileirar lote", description: translateInvokeError(e, "Enfileirar leads"), variant: "destructive" });
    } finally {
      setEnqueueing(false);
    }
  };

  // Fila desta tela é SOMENTE WhatsApp. Antes a tela de Disparo WhatsApp somava
  // logs de Instagram/Telegram/E-mail gravados na mesma dispatch_queue, então
  // aparecia "14 enviados" aqui mesmo sem nenhum WhatsApp sair.
  // Multicanal fica nas telas próprias.
  // Ordena por created_at DESC pra mostrar leads recém-enfileirados PRIMEIRO.
  // Antes: scheduled_at ASC fazia novos itens caírem no final dos 100 visíveis.
  // Quando dispatch-worker cancelava por anti-redisparo, operador não via.
  const { data: queue = [] } = useQuery({
    queryKey: ["dispatch_queue"],
    queryFn: async () => {
      const { data } = await supabase.from("dispatch_queue").select("*")
        .or("channel.eq.whatsapp,channel.is.null")
        .order("created_at", { ascending: false }).limit(100);
      return data ?? [];
    },
    refetchInterval: 20000,
    refetchIntervalInBackground: false,
  });

  // Mapa de chips para exibir nome do chip na fila (id → instance_name)
  const { data: chipMap = {} } = useQuery({
    queryKey: ["whatsapp_instances_map"],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_instances").select("id, instance_name");
      const map: Record<string, string> = {};
      for (const c of data ?? []) map[c.id] = c.instance_name;
      return map;
    },
    staleTime: 60000,
  });

  const stats = useMemo(() => {
    const s = { pending: 0, running: 0, sent: 0, failed: 0, cancelled: 0 };
    queue.forEach((q: any) => { s[q.status as keyof typeof s] = (s[q.status as keyof typeof s] ?? 0) + 1; });
    return s;
  }, [queue]);

  // "Enviados hoje" — quantos sent_at caem no dia atual (BRT). Ajuda operador a saber
  // quão perto está do daily_limit (e do warmup limit se conta nova).
  const sentToday = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    return queue.filter((q: any) => q.status === "sent" && q.sent_at && new Date(q.sent_at).getTime() >= startMs).length;
  }, [queue]);

  // Cancelados por anti-redisparo (skipped_duplicate). Quando aparece, é porque o
  // lead enfileirado já tinha conversa ativa em qualification_conversations — MAVI
  // não dispara abertura nova pra não parecer bot quebrado.
  const cancelledByDup = useMemo(() => {
    return queue.filter((q: any) =>
      q.status === "cancelled"
      && q.last_error
      && String(q.last_error).includes("skipped_duplicate")
    ).length;
  }, [queue]);

  const nextEta = useMemo(() => {
    const next = queue.find((q: any) => q.status === "pending");
    return next?.scheduled_at;
  }, [queue]);

  // Pré-disparo: quais chaves o usuário tem configuradas?
  const { data: apiKeyProviders } = useQuery({
    queryKey: ["api_keys_dispatch_readiness"],
    queryFn: async () => {
      const { data } = await supabase.from("user_api_keys").select("provider");
      return new Set((data ?? []).map((k: any) => k.provider as string));
    },
  });
  const hasIaKey = !!(apiKeyProviders?.has("openai") || apiKeyProviders?.has("gemini"));
  const hasElevenKey = !!apiKeyProviders?.has("elevenlabs");

  // Auto-pause detection: pausado + falhas recentes = pause automático do worker
  const recentFailures = useMemo(() => {
    const cutoff = Date.now() - 30 * 60 * 1000;
    return queue.filter((q: any) =>
      q.status === "failed" && q.updated_at && new Date(q.updated_at).getTime() > cutoff
    );
  }, [queue]);
  const autoPaused = paused && recentFailures.length >= 3;
  const lastAutoFailReason = recentFailures.find((q: any) => q.last_error)?.last_error;

  const cancelPending = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) { toast({ title: "Erro", description: "Não autenticado", variant: "destructive" }); return; }
    const { error } = await supabase.from("dispatch_queue")
      .update({ status: "cancelled" }).eq("status", "pending").eq("user_id", userId);
    if (error) {
      toast({ title: "Erro ao cancelar pendentes", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Pendentes cancelados" });
    qc.invalidateQueries({ queryKey: ["dispatch_queue"] });
  };

  const clearSent = async () => {
    if (!confirm("Remover todos os envios já realizados da fila? (Eles continuam no Pipeline)")) return;
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) { toast({ title: "Erro", description: "Não autenticado", variant: "destructive" }); return; }
    const { error } = await supabase.from("dispatch_queue").delete().eq("status", "sent").eq("user_id", userId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Enviados removidos" }); qc.invalidateQueries({ queryKey: ["dispatch_queue"] }); }
  };

  const removeQueueItem = async (id: string) => {
    const { error } = await supabase.from("dispatch_queue").delete().eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else qc.invalidateQueries({ queryKey: ["dispatch_queue"] });
  };

  const resumePausedOpenChips = async () => {
    const { error } = await (supabase.from("whatsapp_instances") as any)
      .update({ paused: false })
      .eq("active", true)
      .eq("paused", true)
      .eq("status", "open");
    if (error) {
      toast({ title: "Erro ao retomar chip", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Chip retomado", description: "O WhatsApp já estava conectado; apenas removi a pausa de disparo." });
    qc.invalidateQueries({ queryKey: ["wa_readiness_gate"] });
    qc.invalidateQueries({ queryKey: ["whatsapp_instances_map"] });
  };

  const waBlockTitle = waPausedButConnected
    ? "WhatsApp conectado, mas pausado."
    : waStatus.total > 0
      ? "Nenhum chip WhatsApp online."
      : "Nenhum WhatsApp configurado.";
  const waBlockDescription = waPausedButConnected
    ? `${waStatus.pausedConnected} chip(s) estão conectados no Mandrack, porém pausados para disparo. Retome o chip para a fila voltar a andar.`
    : waStatus.total > 0
      ? "Existe chip cadastrado, mas nenhum está online agora. Reconecte/escaneie o QR na aba WhatsApp."
      : "Conecte ao menos um chip em Configurações → WhatsApp antes de disparar.";

  return (
    <div className="container mx-auto p-4 lg:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" />
            Disparo {agent}
          </h1>
          <p className="text-sm text-muted-foreground">
            Fila nativa com delay adaptativo, janela comercial, limite diário e proxy anti-ban.
          </p>
        </div>
        <Button onClick={togglePause} variant={paused ? "default" : "outline"} size="sm">
          {paused ? <><Play className="h-4 w-4 mr-1" />Retomar</> : <><Pause className="h-4 w-4 mr-1" />Pausar</>}
        </Button>
      </div>

      <PageGuide
        storageKey="guide_disparo"
        title={`Disparo ${agent} WhatsApp`}
        what={`A ${agent} envia mensagens humanizadas via WhatsApp. Você seleciona leads e revisa a prévia antes de cada envio — ou enfileira em massa com a IA gerando texto personalizado por lead.`}
        steps={[
          { text: "WhatsApp pareado (instância Mandrack ativa)", route: "/whatsapp" },
          { text: "Selecione leads na tabela abaixo ou cole 1 lead manualmente na aba 'Manual'" },
          { text: "Clique 'Pré-visualizar mensagem' → revise → 'Aprovar e enfileirar'" },
        ]}
        troubleshoot="Mensagem falhando? Abra Saúde do Sistema para ver qual peça está com problema."
        troubleshootRoute="/saude"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatBox label="Pendentes" value={stats.pending} icon={<Clock className="h-4 w-4" />} />
        <StatBox label="Enviando" value={stats.running} icon={<Send className="h-4 w-4 text-blue-500" />} />
        <StatBox label={`Hoje${dailyLimit ? ` / ${dailyLimit}` : ""}`} value={sentToday} icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} highlight={dailyLimit > 0 && sentToday >= dailyLimit * 0.8} />
        <StatBox label="Enviados" value={stats.sent} icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} />
        <StatBox label="Falhas" value={stats.failed} icon={<AlertTriangle className="h-4 w-4 text-destructive" />} />
        <StatBox label="Cancelados" value={stats.cancelled} icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} highlight={cancelledByDup > 0} />
      </div>

      {!waConnected && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="py-3 flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span><strong>{waBlockTitle}</strong> {waBlockDescription}</span>
            </div>
            {waPausedButConnected ? (
              <Button size="sm" variant="default" onClick={resumePausedOpenChips}>
                Retomar chip
              </Button>
            ) : (
              <Button asChild size="sm" variant="default">
                <Link to="/whatsapp">Abrir WhatsApp</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pré-disparo: chave de IA obrigatória — sem ela o worker falha em todos os leads */}
      {!hasIaKey && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="py-3 flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span><strong>Sem chave de IA.</strong> {agent} usa OpenAI ou Gemini para gerar cada mensagem — disparos vão falhar até você configurar.</span>
            </div>
            <Button asChild size="sm" variant="default">
              <Link to="/configuracoes">Configurar agora</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Aviso (não bloqueia): áudio configurado mas sem ElevenLabs → vai sair só texto */}
      {hasIaKey && useAudio && !hasElevenKey && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="py-3 flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span><strong>Áudio ativado sem ElevenLabs.</strong> A {agent} vai mandar tudo em texto até você adicionar a chave (sem erro, mas sem áudio).</span>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/configuracoes">Adicionar chave</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Auto-pause detectado: 3+ falhas em 30min + paused = worker se auto-protegeu */}
      {autoPaused && (
        <Card className="border-destructive bg-destructive/15">
          <CardContent className="py-3 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span><strong>🚨 {agent} foi pausada automaticamente.</strong> {recentFailures.length} falhas em sequência nos últimos 30 min — o worker se auto-protegeu pra evitar ban.</span>
            </div>
            {lastAutoFailReason && (
              <div className="text-xs text-destructive/90 pl-6 font-mono">
                Último erro: {String(lastAutoFailReason).slice(0, 200)}
              </div>
            )}
            <div className="pl-6 text-xs">
              Corrija a causa acima e clique em <strong>Retomar</strong> no topo da tela.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Anti-redisparo: leads enfileirados que JÁ tinham conversa ativa.
          Explica pro user "enfileirei mas não aparece como pending". */}
      {cancelledByDup > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="py-3 space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span><strong>{cancelledByDup} lead(s) cancelados por anti-redisparo.</strong></span>
            </div>
            <div className="text-xs text-muted-foreground pl-6">
              Esses leads já tinham conversa ativa (active/handoff) em <a href="/conversas" className="underline">Conversas</a>. {agent} não envia abertura nova pra não parecer bot quebrado.
              Veja a coluna <em>Status</em> da fila abaixo — itens marcados "cancelado" têm o motivo em <em>last_error</em>.
              <br />Pra reativar: finalize/ignore as conversas em /conversas.
            </div>
          </CardContent>
        </Card>
      )}

      {nextEta && (
        <Card className="bg-primary/5 border-primary/30">
          <CardContent className="py-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span>Próximo envio: <strong>{formatEta(nextEta)}</strong></span>
              <span className="text-xs text-muted-foreground">({stats.pending} na fila)</span>
            </div>
            <Button size="sm" variant="ghost" onClick={cancelPending}>Cancelar pendentes</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Lead picker */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads para disparo</CardTitle>
            <CardDescription>Selecione os leads ou digite manualmente</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="db"><Database className="h-3.5 w-3.5 mr-1" />Do banco</TabsTrigger>
                <TabsTrigger value="manual"><PenLine className="h-3.5 w-3.5 mr-1" />Manual</TabsTrigger>
              </TabsList>
              <TabsContent value="db" className="pt-3 space-y-3">
                <div className="flex gap-2 flex-wrap">
                  {SOURCES.map((s) => (
                    <Button key={s.key} size="sm" variant={activeSource === s.key ? "default" : "outline"}
                      onClick={() => { setActiveSource(s.key); clearSel(); }}>
                      {s.label}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => refetch()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="secondary" onClick={selectAll}>Todos</Button>
                  <Button size="sm" variant="ghost" onClick={clearSel}>Limpar</Button>
                  {activeSource === "linkedin_contacts" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={enrichLinkedInDados4u}
                      disabled={enriching}
                      title="Buscar telefone/email no DadosBooster"
                    >
                      {enriching ? "Enriquecendo..." : "Enriquecer no DadosBooster"}
                    </Button>
                  )}
                </div>
                <div className="max-h-72 overflow-auto space-y-1.5 rounded-md border border-border p-2">
                  {isFetching && <Skeleton className="h-12" />}
                  {!isFetching && rows.length === 0 && <p className="text-xs text-muted-foreground p-2">Nenhum lead disponível.</p>}
                  {rows.map((r) => (
                    <button key={r.id} onClick={() => toggleSelect(r.id!)}
                      className={`w-full text-left p-2 rounded-md text-xs border transition-colors ${
                        selected.has(r.id!) ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted"
                      }`}>
                      <div className="font-semibold">{r.nome_empresa || "(sem nome)"}</div>
                      {r.especialidades && (
                        <div className="text-muted-foreground truncate">{r.especialidades}</div>
                      )}
                      <div className="text-muted-foreground">{r.telefone || "sem telefone"}</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{selected.size} selecionado(s)</p>
              </TabsContent>
              <TabsContent value="manual" className="pt-3 space-y-2">
                <Input placeholder="Nome empresa *" value={manual.nome_empresa ?? ""} onChange={(e) => setManual({ ...manual, nome_empresa: e.target.value })} />
                <Input placeholder="Telefone (5511999999999) *" value={manual.telefone ?? ""} onChange={(e) => setManual({ ...manual, telefone: e.target.value })} />
                <Input placeholder="Nicho / especialidade" value={manual.especialidades ?? ""} onChange={(e) => setManual({ ...manual, especialidades: e.target.value })} />
                <Input placeholder="URL do site (opcional)" value={manual.site ?? ""} onChange={(e) => setManual({ ...manual, site: e.target.value })} />
                <Input placeholder="URL LinkedIn (opcional)" value={manual.linkedin_url ?? ""} onChange={(e) => setManual({ ...manual, linkedin_url: e.target.value })} />
                <Input placeholder="URL Instagram (opcional)" value={manual.instagram_url ?? ""} onChange={(e) => setManual({ ...manual, instagram_url: e.target.value })} />
                <p className="text-[11px] text-muted-foreground">A IA vai ler essas URLs (via Jina AI) pra criar uma abordagem totalmente personalizada com o que a empresa realmente faz.</p>
              </TabsContent>
            </Tabs>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <Button onClick={openPreview} variant="outline" disabled={previewLoading || !hasIaKey} className="w-full" title={!hasIaKey ? "Sem chave de IA configurada" : `Veja o que a ${agent} vai dizer antes de enfileirar`}>
                <Eye className="h-4 w-4 mr-2" />
                Prévia {agent}
              </Button>
              <Button onClick={enqueue} disabled={enqueueing || !waConnected} className="w-full">
                <Rocket className="h-4 w-4 mr-2" />
                {!waConnected
                  ? waPausedButConnected ? "WA pausado" : "WA desconectado"
                  : enqueueing
                    ? "Enfileirando..."
                    : "Adicionar à fila"}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
              💡 Use <strong>Prévia {agent}</strong> pra ver e editar a mensagem antes de disparar — não consome conta WhatsApp.
            </p>
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> Anti-ban
            </CardTitle>
            <CardDescription>Delays, janela comercial e proxy</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Delay mín (s)</Label>
                <Input type="number" value={minDelay} onChange={(e) => setMinDelay(+e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Delay máx (s)</Label>
                <Input type="number" value={maxDelay} onChange={(e) => setMaxDelay(+e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hora início</Label>
                <Input type="number" min={0} max={23} value={hourStart} onChange={(e) => setHourStart(+e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hora fim</Label>
                <Input type="number" min={0} max={23} value={hourEnd} onChange={(e) => setHourEnd(+e.target.value)} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Limite diário</Label>
                <Input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(+e.target.value)} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Proxy URL (opcional)</Label>
                <Input placeholder="http://user:pass@host:port" value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <Switch checked={respectHours} onCheckedChange={setRespectHours} />
                <Label className="text-xs">Respeitar horário comercial</Label>
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <Switch checked={useAudio} onCheckedChange={setUseAudio} />
                <Label className="text-xs">Enviar áudio (ElevenLabs)</Label>
              </div>
              {useAudio && (
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Proporção de áudio: {Math.round(audioRatio * 100)}%</Label>
                  <Input type="range" min={0} max={1} step={0.05} value={audioRatio} onChange={(e) => setAudioRatio(+e.target.value)} />
                </div>
              )}
            </div>
            <Button onClick={saveSettings} variant="secondary" className="w-full">Salvar configurações</Button>
          </CardContent>
        </Card>
      </div>

      {/* Fila */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Fila de disparo</CardTitle>
              <CardDescription>Atualiza a cada 20s. Enviados viram cards no Pipeline automaticamente.</CardDescription>
            </div>
            {stats.sent > 0 && (
              <Button size="sm" variant="outline" onClick={clearSent}>
                Limpar enviados ({stats.sent})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-auto space-y-1">
            {queue.length === 0 && <p className="text-xs text-muted-foreground">Fila vazia.</p>}
            {queue.map((q: any) => (
              <div key={q.id} className={`text-xs p-2 rounded border ${q.status === "failed" ? "border-destructive/40 bg-destructive/5" : "border-border"}`}>
                <div className="flex items-center gap-2">
                  <StatusBadge status={q.status} />
                  <div className="flex-1 truncate">
                    <span className="font-semibold">{q.nome_empresa || q.telefone}</span>
                    <span className="text-muted-foreground"> · {q.telefone}</span>
                    {q.send_as_audio && <Badge variant="outline" className="ml-2">áudio</Badge>}
                    {q.whatsapp_instance_id && chipMap[q.whatsapp_instance_id] && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        📱 {chipMap[q.whatsapp_instance_id]}
                      </Badge>
                    )}
                    {q.status === "failed" && q.attempts > 0 && (
                      <Badge variant="outline" className="ml-2 border-destructive/40 text-destructive">{q.attempts}× tentativas</Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground shrink-0">
                    {q.status === "sent"
                      ? formatEta(q.sent_at)
                      : formatEta(q.scheduled_at)}
                  </span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => removeQueueItem(q.id)} title="Remover da fila">
                    ×
                  </Button>
                </div>
                {q.last_error && q.status !== "sent" && (
                  <div className={`mt-1 ml-1 pl-2 border-l-2 text-[11px] font-mono break-words ${q.status === "failed" ? "border-destructive/40 text-destructive/90" : "border-amber-500/40 text-amber-700 dark:text-amber-300"}`}>
                    {String(q.last_error).slice(0, 240)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modal Prévia {agent} — anti-ceticismo: equipe vê e edita a mensagem antes de enfileirar */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Prévia {agent}: {previewLead?.nome_empresa || "Lead manual"}
            </DialogTitle>
            <DialogDescription>
              Veja exatamente o que a {agent} vai dizer. Edite as mensagens, regenere se quiser, e só envie pra fila quando estiver satisfeito.
            </DialogDescription>
          </DialogHeader>

          {previewLoading ? (
            <div className="py-12 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary mb-3" />
              <p className="text-sm">{previewGrounding ? "Pesquisando empresa no Google + gerando mensagem…" : "Gerando mensagem…"}</p>
            </div>
          ) : previewResult ? (
            <div className="space-y-4">
              {previewResult.used_fallback && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs flex gap-2 items-start">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong>Mensagem em fallback</strong> (IA falhou, {agent} usou template genérico).
                    {previewResult.fallback_reason && (
                      <div className="text-[11px] mt-0.5 font-mono opacity-80">{previewResult.fallback_reason}</div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs">Mensagens que serão enviadas (em sequência, com delay humanizado):</Label>
                {previewParts.map((p, i) => (
                  <div key={i} className="space-y-1">
                    <div className="text-[10px] text-muted-foreground">Parte {i + 1}</div>
                    <Textarea
                      value={p}
                      onChange={(e) => setPreviewParts((prev) => prev.map((m, j) => j === i ? e.target.value : m))}
                      rows={3}
                      className="font-mono text-xs"
                    />
                  </div>
                ))}
              </div>

              <Collapsible open={previewDetailsOpen} onOpenChange={setPreviewDetailsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs">
                    <ChevronDown className={`h-3 w-3 mr-1 transition-transform ${previewDetailsOpen ? "rotate-180" : ""}`} />
                    Detalhes técnicos
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 mt-2">
                  <div className="text-[11px] space-y-1 rounded-md border border-border/60 bg-muted/30 p-2 font-mono">
                    <div>🤖 Provedor: <strong>{previewResult.ia_provider}</strong></div>
                    <div>📋 Briefing {company}: {previewResult.briefing_loaded ? <span className="text-emerald-600">✓ carregado ({previewResult.briefing_chars} chars)</span> : <span className="text-amber-600">vazio</span>}</div>
                    {previewResult.researched_chars > 0 && (
                      <div>🌐 Pesquisa Google: <span className="text-emerald-600">✓ {previewResult.researched_chars} chars</span></div>
                    )}
                    {previewGrounding && previewResult.researched_chars === 0 && (
                      <div>🌐 Pesquisa Google: <span className="text-amber-600">solicitada mas falhou</span></div>
                    )}
                  </div>
                  {previewResult.researched_preview && (
                    <details className="text-[11px]">
                      <summary className="cursor-pointer text-muted-foreground">Resumo da pesquisa (Google grounding)</summary>
                      <pre className="mt-1 whitespace-pre-wrap font-mono bg-muted/30 p-2 rounded">{previewResult.researched_preview}</pre>
                    </details>
                  )}
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-muted-foreground">System prompt completo enviado à IA ({previewResult.system_prompt_preview?.length ?? 0} chars)</summary>
                    <pre className="mt-1 whitespace-pre-wrap font-mono bg-muted/30 p-2 rounded max-h-64 overflow-auto">{previewResult.system_prompt_preview}</pre>
                  </details>
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-muted-foreground">Dados do lead usados no prompt</summary>
                    <pre className="mt-1 whitespace-pre-wrap font-mono bg-muted/30 p-2 rounded">{JSON.stringify(previewResult.lead_context_used, null, 2)}</pre>
                  </details>
                </CollapsibleContent>
              </Collapsible>

              <div className="flex items-center gap-2 text-xs">
                <Switch checked={previewGrounding} onCheckedChange={setPreviewGrounding} />
                <Label className="text-xs">Pesquisar empresa no Google (Gemini Grounding, +~20s)</Label>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setPreviewOpen(false)}>Fechar</Button>
            <Button variant="outline" onClick={regeneratePreview} disabled={previewLoading}>
              <RefreshCw className="h-4 w-4 mr-2" /> Regerar
            </Button>
            <Button onClick={enqueueFromPreview} disabled={previewLoading || !previewParts.length || !waConnected}>
              <Rocket className="h-4 w-4 mr-2" /> Aprovar e enfileirar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatBox({ label, value, icon, highlight }: { label: string; value: number; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-amber-500/50 bg-amber-500/5" : undefined}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className={`text-2xl font-bold mt-1 ${highlight ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

/** Formata um timestamp ISO como ETA legível em pt-BR:
 *  - hoje 14:32
 *  - amanhã 09:15
 *  - 27/05 09:15
 *  - 27/05/2026 09:15 (se for ano diferente)
 */
function formatEta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);
  const dayAfterStart = new Date(tomorrowStart.getTime() + 86400000);

  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (d >= todayStart && d < tomorrowStart) {
    // Pending futuro: mostra "em Xmin" se dentro de 2h
    const diffMin = Math.round((d.getTime() - now.getTime()) / 60000);
    if (diffMin > 0 && diffMin < 120) return `hoje ${time} (em ${diffMin}min)`;
    return `hoje ${time}`;
  }
  if (d >= tomorrowStart && d < dayAfterStart) return `amanhã ${time}`;

  const sameYear = d.getFullYear() === now.getFullYear();
  const datePart = sameYear
    ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${datePart} ${time}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "pendente", cls: "bg-muted text-muted-foreground" },
    running: { label: "enviando", cls: "bg-blue-500/20 text-blue-400" },
    sent: { label: "enviado", cls: "bg-green-500/20 text-green-400" },
    failed: { label: "falhou", cls: "bg-destructive/20 text-destructive" },
    cancelled: { label: "cancelado", cls: "bg-muted text-muted-foreground" },
  };
  const m = map[status] ?? map.pending;
  return <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${m.cls}`}>{m.label}</span>;
}