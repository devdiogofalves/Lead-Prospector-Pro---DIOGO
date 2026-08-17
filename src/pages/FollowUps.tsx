import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { translateInvokeError } from "@/lib/friendlyError";
import { PageGuide } from "@/components/PageGuide";
import { useBranding } from "@/hooks/useBranding";
import {
  Clock,
  Send,
  Archive,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Users,
  TrendingUp,
  MessageSquare,
  Zap,
  Filter,
  Phone,
  Building2,
  Calendar,
} from "lucide-react";

// ─── types ────────────────────────────────────────────────────────────────────

type CadenceStage = "aguardando" | "followup1" | "followup2" | "encerramento" | "concluido";

interface FollowUpLead {
  id: string;
  source: "dispatch" | "conversation";
  nome: string;
  telefone: string;
  empresa?: string;
  cargo?: string;
  lastContactAt: string;
  daysSinceContact: number;
  stage: CadenceStage;
  followupsSent: number;
  conversationId?: string;
  status?: string;
}

// ─── WhatsApp resolution via whatsapp_instances (Mandrack multi-chip) ────────

interface WAConfig {
  url: string;
  token: string;
  instance: string;
}

const MANDRACK_URL = "https://api.mandrackstudio.ia.br";

async function resolveWA(userId: string): Promise<WAConfig | null> {
  const { data: instances } = await supabase
    .from("whatsapp_instances")
    .select("instance_name, mandrack_instance_token")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("paused", false)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .limit(1);
  const inst = (instances as any)?.[0];
  if (!inst?.mandrack_instance_token) return null;
  return { url: MANDRACK_URL, token: inst.mandrack_instance_token, instance: inst.instance_name };
}

function normalizeBR(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return digits;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// Estágio ATUAL do lead na cadência. Depende de:
//   - dias desde o primeiro contato (não muda quando envia follow-up)
//   - quantos follow-ups já foram enviados (contador persistido)
// Regras: após followupsSent=3, o lead sai da lista (stage 'concluido').
function getStage(days: number, followupsSent: number): CadenceStage {
  if (followupsSent >= 3) return "concluido";
  if (days >= 21 && followupsSent < 3) return "encerramento";
  if (days >= 14 && followupsSent < 2) return "followup2";
  if (days >= 7 && followupsSent < 1) return "followup1";
  return "aguardando";
}

function stageLabel(stage: CadenceStage) {
  switch (stage) {
    case "aguardando":
      return { text: "Aguardando", color: "bg-muted text-muted-foreground", icon: Clock };
    case "followup1":
      return { text: "Follow-up 1 (D+7)", color: "bg-yellow-500/15 text-yellow-600", icon: AlertTriangle };
    case "followup2":
      return { text: "Follow-up 2 (D+14)", color: "bg-orange-500/15 text-orange-600", icon: AlertTriangle };
    case "encerramento":
      return { text: "Encerramento (D+21)", color: "bg-red-500/15 text-red-600", icon: XCircle };
    case "concluido":
      return { text: "Cadência concluída", color: "bg-green-500/15 text-green-600", icon: CheckCircle2 };
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Follow-up message templates ──────────────────────────────────────────────
// Genéricos e agnósticos de vertical — o system prompt do agente treina o tom;
// aqui só reengajamos o contato sem prometer nada específico. Cliente pode
// editar depois via um editor no /assistente (planejado).

function buildTemplates(
  agentName: string,
  companyName: string,
): Record<Exclude<CadenceStage, "concluido">, (nome: string) => string> {
  const empresa = companyName || "nós";
  return {
    aguardando: (nome) =>
      `Oi ${nome}! Só passando aqui pra confirmar se recebeu minha mensagem. Consegue trocar uma ideia rápida hoje ou amanhã?`,
    followup1: (nome) =>
      `Oi ${nome}, tudo bem? Aqui é ${agentName} — não quero atrapalhar, mas achei que fazia sentido dar um toque.\n\nSe fizer sentido a gente conversar, me responde só com um "sim" que eu marco 15 min contigo. Se não for prioridade agora, sem problema — só me avisa que paro de te chamar.`,
    followup2: (nome) =>
      `Oi ${nome}! Última tentativa antes de arquivar por aqui.\n\nPosso te enviar um material curto sobre o que ${empresa} faz — sem ligação, sem call. Você lê no seu tempo e me diz se faz sentido continuar.\n\nPode ser?`,
    encerramento: (nome) =>
      `Oi ${nome}, entendi que agora não é o momento — sem problema nenhum. 🙂\n\nDeixo o contato aberto: se em algum momento quiser retomar, é só me chamar aqui mesmo. Sucesso pra você e pro time!`,
  };
}


// ─── Component ────────────────────────────────────────────────────────────────

export default function FollowUps() {
  const { branding: __b } = useBranding(); const agent = __b.agent_name;
  const company = __b.company_name;

  const { user } = useAuth();
  

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<CadenceStage | "all">("all");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<FollowUpLead | null>(null);
  const [previewLead, setPreviewLead] = useState<FollowUpLead | null>(null);

  // ── Data: dispatch_queue (sent, no reply) ──────────────────────────────────
  const { data: dispatchSent = [], refetch: refetchDispatch, isFetching: fetchingDispatch } = useQuery({
    queryKey: ["followups_dispatch", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatch_queue")
        .select("id, nome_empresa, telefone, sent_at, status, created_at, followups_sent, last_followup_stage, last_followup_at")
        .eq("user_id", user!.id)
        .eq("status", "sent")
        .lt("followups_sent", 3)
        .order("sent_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  // ── Data: conversations (open, lead went quiet) ────────────────────────────
  const { data: stalledConvs = [], refetch: refetchConvs, isFetching: fetchingConvs } = useQuery({
    queryKey: ["followups_conversations", user?.id],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("qualification_conversations")
        .select("id, nome, telefone, last_message_at, status, qualified, followups_sent, last_followup_stage, last_followup_at, created_at")
        .eq("user_id", user!.id)
        .in("status", ["open", "paused"])
        .eq("qualified", false)
        .lt("followups_sent", 3)
        .lt("last_message_at", cutoff)
        .order("last_message_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const refetchAll = () => {
    refetchDispatch();
    refetchConvs();
  };

  // ── Merge & normalize ──────────────────────────────────────────────────────
  const allLeads: FollowUpLead[] = useMemo(() => {
    const fromDispatch: FollowUpLead[] = dispatchSent.map((d: any) => {
      // Contagem SEMPRE a partir do primeiro contato (sent_at / created_at),
      // nunca do último follow-up — senão a cadência trava no D+7 pra sempre.
      const contactAt = d.sent_at ?? d.created_at;
      const days = daysSince(contactAt);
      const followupsSent = Number(d.followups_sent ?? 0);
      return {
        id: `dispatch-${d.id}`,
        source: "dispatch" as const,
        nome: d.nome_empresa ?? "Lead",
        telefone: d.telefone ?? "",
        lastContactAt: contactAt,
        daysSinceContact: days,
        stage: getStage(days, followupsSent),
        followupsSent,
        status: d.status,
      };
    });

    const fromConvs: FollowUpLead[] = stalledConvs.map((c: any) => {
      // Base de contagem: created_at da conversa (primeiro contato). Se ausente,
      // cai pra last_message_at — mas atenção: quando IA responde, last_message_at
      // atualiza; usar apenas ele faria a cadência ficar zerando sozinha.
      const contactAt = c.created_at ?? c.last_message_at;
      const days = daysSince(contactAt);
      const followupsSent = Number(c.followups_sent ?? 0);
      return {
        id: `conv-${c.id}`,
        source: "conversation" as const,
        nome: c.nome ?? "Lead",
        telefone: c.telefone ?? "",
        lastContactAt: c.last_message_at,
        daysSinceContact: days,
        stage: getStage(days, followupsSent),
        followupsSent,
        conversationId: c.id,
        status: c.status,
      };
    });

    // Só mostra leads cuja próxima cadência já venceu — 'aguardando' fica de fora
    // da lista visível pra não poluir (o card de stats ainda contabiliza).
    return [...fromConvs, ...fromDispatch].sort(
      (a, b) => b.daysSinceContact - a.daysSinceContact
    );

  }, [dispatchSent, stalledConvs]);

  // ── Filtered ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = allLeads;
    if (stageFilter !== "all") list = list.filter((l) => l.stage === stageFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.nome.toLowerCase().includes(q) ||
          l.telefone.includes(q) ||
          (l.empresa ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [allLeads, stageFilter, search]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = allLeads.length;
    const urgent = allLeads.filter((l) => l.stage !== "aguardando").length;
    const encerramento = allLeads.filter((l) => l.stage === "encerramento").length;
    const aguardando = allLeads.filter((l) => l.stage === "aguardando").length;
    return { total, urgent, encerramento, aguardando };
  }, [allLeads]);

  // ── Send follow-up via Mandrack (ou Evolution como fallback) ───────────────
  async function sendFollowUp(lead: FollowUpLead) {
    if (!lead.telefone) {
      toast({ title: "Sem telefone", description: "Este lead não tem telefone cadastrado.", variant: "destructive" });
      return;
    }

    setSendingId(lead.id);
    try {
      const wa = await resolveWA(user!.id);
      if (!wa) {
        toast({
          title: "WhatsApp não configurado",
          description: "Conecte um número em Configurações → WhatsApp.",
          variant: "destructive",
        });
        return;
      }

      // Templates dinâmicos com branding do cliente (nunca hardcode de vertical).
      if (lead.stage === "aguardando" || lead.stage === "concluido") {
        toast({ title: "Sem ação de follow-up", description: "Este lead ainda está no período de espera ou já concluiu a cadência.", variant: "destructive" });
        return;
      }
      const templates = buildTemplates(agent, company);
      const message = templates[lead.stage](lead.nome.split(" ")[0]);
      const phone = normalizeBR(lead.telefone);
      const base = wa.url.replace(/\/$/, "");

      // Delay natural antes do envio (indicador "digitando..." requer admin token
      // Mandrack — expuemos só via workers no servidor; aqui pulamos.)
      const typingMs = Math.min(10000, Math.max(2000, message.length * 40));
      await new Promise((r) => setTimeout(r, typingMs));

      // Envia mensagem (Mandrack)
      const res = await fetch(`${base}/chat/send/text`, {
        method: "POST",
        headers: { token: wa.token, "Content-Type": "application/json" },
        body: JSON.stringify({ phone, body: message }),
      });
      if (!res.ok) throw new Error(`WhatsApp API: ${res.status}`);

      // Registra no banco conforme origem.
      // IMPORTANTE: NÃO resetamos `sent_at` / `last_message_at` — isso zerava a
      // contagem de dias e o lead ficava preso em "followup1" pra sempre.
      // Apenas incrementamos followups_sent + logamos qual estágio foi enviado.
      const nowIso = new Date().toISOString();
      if (lead.conversationId) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("qualification_messages").insert({
          user_id: user!.id,
          conversation_id: lead.conversationId,
          telefone: lead.telefone,
          role: "assistant",
          content: message,
          created_at: nowIso,
        } as any);
        await supabase
          .from("qualification_conversations")
          .update({
            followups_sent: lead.followupsSent + 1,
            last_followup_stage: lead.stage,
            last_followup_at: nowIso,
          } as any)
          .eq("id", lead.conversationId);
      }

      if (lead.source === "dispatch") {
        const rawId = lead.id.replace("dispatch-", "");
        await supabase
          .from("dispatch_queue")
          .update({
            followups_sent: lead.followupsSent + 1,
            last_followup_stage: lead.stage,
            last_followup_at: nowIso,
          } as any)
          .eq("id", rawId);
      }


      toast({
        title: "Follow-up enviado! ✅",
        description: `Mensagem de ${stageLabel(lead.stage).text} enviada para ${lead.nome}.`,
      });

      refetchAll();
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: translateInvokeError(err, "Enviar follow-up"), variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  }

  // ── Archive ────────────────────────────────────────────────────────────────
  async function archiveLead(lead: FollowUpLead) {
    setArchivingId(lead.id);
    try {
      if (lead.source === "conversation" && lead.conversationId) {
        await supabase
          .from("qualification_conversations")
          .update({ status: "closed" })
          .eq("id", lead.conversationId);
      } else if (lead.source === "dispatch") {
        const rawId = lead.id.replace("dispatch-", "");
        await supabase
          .from("dispatch_queue")
          .update({ status: "archived" })
          .eq("id", rawId);
      }
      toast({ title: "Arquivado", description: `${lead.nome} removido da fila de follow-ups.` });
      refetchAll();
    } catch (err: any) {
      toast({ title: "Erro ao arquivar", description: translateInvokeError(err, "Arquivar follow-up"), variant: "destructive" });
    } finally {
      setArchivingId(null);
      setConfirmArchive(null);
    }
  }

  const isLoading = fetchingDispatch || fetchingConvs;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="w-6 h-6 text-primary" />
            Follow-ups
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Leads sem resposta — cadência D+7, D+14, D+21
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetchAll} disabled={isLoading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <PageGuide
        storageKey="guide_followups"
        title="Follow-ups WhatsApp"
        what={`Lista de leads que não responderam ao primeiro disparo da ${agent}. Cada lead aqui está esperando próximo toque de cadência (D+7, D+14, D+21).`}
        steps={[
          { text: "Lista mostra leads cuja próxima cadência venceu" },
          { text: `Clique 'Enviar' em cada lead — ${agent} gera mensagem nova` },
          { text: "Use 'Arquivar' para tirar da lista sem disparar (lead respondeu fora ou desinteressado)" },
        ]}
        troubleshoot="Sem follow-ups na lista? Significa que ninguém venceu ainda. Você pode adicionar 'proximo_followup_at' editando cards no Pipeline."
        troubleshootRoute="/pipeline"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total sem resposta", value: stats.total, icon: <Users className="w-4 h-4 text-primary" />, bg: "bg-primary/10" },
          { label: "Precisam de ação", value: stats.urgent, icon: <AlertTriangle className="w-4 h-4 text-yellow-600" />, bg: "bg-yellow-500/10" },
          { label: "Aguardando (<7d)", value: stats.aguardando, icon: <Clock className="w-4 h-4 text-muted-foreground" />, bg: "bg-muted" },
          { label: "Encerramento (21d+)", value: stats.encerramento, icon: <XCircle className="w-4 h-4 text-red-600" />, bg: "bg-red-500/10" },
        ].map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${s.bg}`}>{s.icon}</div>
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as any)}>
          <SelectTrigger className="w-full sm:w-52">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estágios</SelectItem>
            <SelectItem value="aguardando">⏳ Aguardando</SelectItem>
            <SelectItem value="followup1">🟡 Follow-up 1 (D+7)</SelectItem>
            <SelectItem value="followup2">🟠 Follow-up 2 (D+14)</SelectItem>
            <SelectItem value="encerramento">🔴 Encerramento (D+21)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lead list */}
      {filtered.length === 0 ? (
        <Card className="border-dashed border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500/50" />
            <p className="font-semibold text-lg">Tudo em dia!</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              {search || stageFilter !== "all"
                ? "Nenhum lead encontrado com esses filtros."
                : `Nenhum lead aguardando follow-up no momento. ${agent} está fazendo um ótimo trabalho! 🤖`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((lead) => {
            const stage = stageLabel(lead.stage);
            const StageIcon = stage.icon;
            const isSending = sendingId === lead.id;
            const isArchiving = archivingId === lead.id;

            return (
              <Card key={lead.id} className="border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{lead.nome}</span>
                        <Badge variant="secondary" className={`text-xs shrink-0 ${stage.color}`}>
                          <StageIcon className="w-3 h-3 mr-1" />
                          {stage.text}
                        </Badge>
                        {lead.source === "conversation" && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            <MessageSquare className="w-3 h-3 mr-1" />
                            Em conversa
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
                        {lead.telefone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />{lead.telefone}
                          </span>
                        )}
                        {lead.empresa && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />{lead.empresa}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Último contato: {formatDate(lead.lastContactAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className={`text-center px-3 py-1.5 rounded-lg text-sm font-semibold ${
                        lead.daysSinceContact >= 21 ? "bg-red-500/15 text-red-600"
                          : lead.daysSinceContact >= 14 ? "bg-orange-500/15 text-orange-600"
                          : lead.daysSinceContact >= 7 ? "bg-yellow-500/15 text-yellow-600"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {lead.daysSinceContact}d
                      </div>
                      <Button
                        size="sm" variant="outline" className="gap-1.5 text-xs"
                        onClick={() => setPreviewLead(lead)} disabled={isSending}
                      >
                        <Send className="w-3.5 h-3.5" />
                        {lead.stage === "encerramento" ? "Encerrar" : "Enviar"}
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setConfirmArchive(lead)} disabled={isArchiving}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Preview & Send Dialog */}
      <AlertDialog open={!!previewLead} onOpenChange={(o) => !o && setPreviewLead(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              Enviar Follow-up
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {previewLead && (
                  <>
                    <p className="text-sm">
                      Mensagem para{" "}
                      <span className="font-semibold text-foreground">{previewLead.nome}</span>{" "}
                      — estágio:{" "}
                      <span className="font-semibold text-foreground">
                        {stageLabel(previewLead.stage).text}
                      </span>
                    </p>
                    <div className="bg-muted rounded-lg p-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed border border-border/50">
                      {(previewLead.stage === "aguardando" || previewLead.stage === "concluido")
                        ? "Sem mensagem para este estágio."
                        : buildTemplates(agent, company)[previewLead.stage](previewLead.nome.split(" ")[0])}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enviado via Mandrack Studio para {previewLead.telefone || "o número cadastrado"}.
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (previewLead) {
                  await sendFollowUp(previewLead);
                  setPreviewLead(null);
                }
              }}
              disabled={sendingId === previewLead?.id}
              className="gap-2"
            >
              <Zap className="w-3.5 h-3.5" />
              Enviar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive confirm dialog */}
      <AlertDialog open={!!confirmArchive} onOpenChange={(o) => !o && setConfirmArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar lead?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{confirmArchive?.nome}</strong> será removido da fila de follow-ups.
              {confirmArchive?.source === "conversation"
                ? " A conversa será marcada como encerrada."
                : " O disparo será arquivado."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmArchive && archiveLead(confirmArchive)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cadence guide */}
      <Card className="border-border/30 bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Guia de Cadência {agent}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {(
              [
                { stage: "aguardando", days: "D+0 a D+6", action: "Aguardar resposta espontânea" },
                { stage: "followup1", days: "D+7", action: "1º follow-up — novo ângulo ou dado do setor" },
                { stage: "followup2", days: "D+14", action: "2º follow-up — oferecer diagnóstico gratuito" },
                { stage: "encerramento", days: "D+21+", action: "Encerramento gentil — manter na base" },
              ] as { stage: CadenceStage; days: string; action: string }[]
            ).map((item) => {
              const s = stageLabel(item.stage);
              const Icon = s.icon;
              return (
                <div key={item.stage} className={`rounded-lg p-3 flex flex-col gap-1 ${s.color} border border-current/10`}>
                  <div className="flex items-center gap-1 font-semibold">
                    <Icon className="w-3 h-3" />
                    {item.days}
                  </div>
                  <p className="opacity-80 leading-relaxed">{item.action}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
