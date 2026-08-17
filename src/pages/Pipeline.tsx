import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Phone, Mail, Calendar, GripVertical, KanbanSquare, Upload } from "lucide-react";
import ImportLeadsDialog from "@/components/leads/ImportLeadsDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PageGuide } from "@/components/PageGuide";
import { useBranding } from "@/hooks/useBranding";

type Stage = "novo_lead" | "primeiro_contato" | "qualificando" | "proposta_enviada" | "negociando" | "fechado" | "perdido";

// Mapeamento legado → UI. Workers (dispatch-worker:230,322) ainda criam cards
// com estagio "prospectado" (do enum DB original), e o enum em produção pode
// ter "follow_up_1/2/3" de antes. Sem este mapping, cards com estágios antigos
// sumiam do Kanban (grouped[c.estagio] undefined) e os totais davam NaN.
const LEGACY_STAGE_MAP: Record<string, Stage> = {
  prospectado: "novo_lead",
  follow_up_1: "primeiro_contato",
  follow_up_2: "qualificando",
  follow_up_3: "proposta_enviada",
};

const normalizeStage = (raw: string | null | undefined): Stage => {
  if (!raw) return "novo_lead";
  return (LEGACY_STAGE_MAP[raw] ?? raw) as Stage;
};

interface Card {
  id: string;
  nome_empresa: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  estagio: Stage;
  origem: string | null;
  valor_estimado: number | null;
  observacoes: string | null;
  proximo_followup_at: string | null;
  position: number;
}

const STAGES: { key: Stage; label: string; color: string }[] = [
  { key: "novo_lead", label: "🎯 Novo Lead", color: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  { key: "primeiro_contato", label: "📨 1º Contato", color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  { key: "qualificando", label: "🤖 Qualificando", color: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  { key: "proposta_enviada", label: "📋 Proposta Enviada", color: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  { key: "negociando", label: "Negociando", color: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { key: "fechado", label: "Fechado", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { key: "perdido", label: "Perdido", color: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
];

const EMPTY: Partial<Card> = {
  nome_empresa: "", contato: "", telefone: "", email: "", origem: "manual",
  valor_estimado: null, observacoes: "", estagio: "novo_lead",
};

export default function Pipeline() {
  const { branding: __b } = useBranding(); const agent = __b.agent_name;

  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Card>>(EMPTY);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pipeline_cards")
      .select("*")
      .order("position", { ascending: true });
    if (error) toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    setCards((data ?? []) as Card[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      channel = supabase
        .channel(`pipeline_cards_realtime_${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "pipeline_cards", filter: `user_id=eq.${user.id}` },
          () => load(),
        )
        .subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  const grouped = useMemo(() => {
    const map: Record<Stage, Card[]> = {
      novo_lead: [], primeiro_contato: [], qualificando: [], proposta_enviada: [],
      negociando: [], fechado: [], perdido: [],
    };
    cards.forEach((c) => {
      const key = normalizeStage(c.estagio);
      if (map[key]) map[key].push(c);
    });
    return map;
  }, [cards]);

  const totals = useMemo(() => {
    const m: Record<Stage, number> = {
      novo_lead: 0, primeiro_contato: 0, qualificando: 0, proposta_enviada: 0,
      negociando: 0, fechado: 0, perdido: 0,
    };
    cards.forEach((c) => {
      const key = normalizeStage(c.estagio);
      if (key in m) m[key] += Number(c.valor_estimado || 0);
    });
    return m;
  }, [cards]);

  const onSave = async () => {
    if (!editing.nome_empresa && !editing.contato) {
      toast({ title: "Informe nome ou contato", variant: "destructive" });
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (editing.id) {
      const { error } = await supabase.from("pipeline_cards").update({
        nome_empresa: editing.nome_empresa, contato: editing.contato,
        telefone: editing.telefone, email: editing.email, origem: editing.origem,
        valor_estimado: editing.valor_estimado, observacoes: editing.observacoes,
        proximo_followup_at: editing.proximo_followup_at, estagio: editing.estagio as any,
      } as any).eq("id", editing.id);
      if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      const { error } = await supabase.from("pipeline_cards").insert({
        user_id: user.id,
        nome_empresa: editing.nome_empresa, contato: editing.contato,
        telefone: editing.telefone, email: editing.email, origem: editing.origem || "manual",
        valor_estimado: editing.valor_estimado, observacoes: editing.observacoes,
        estagio: (editing.estagio || "prospectado") as any,
      } as any);
      if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
    setDialogOpen(false);
    setEditing(EMPTY);
    toast({ title: "Salvo com sucesso" });
  };

  const onDelete = async (id: string) => {
    if (!confirm("Excluir este card?")) return;
    const { error } = await supabase.from("pipeline_cards").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Card excluído" });
  };

  const moveTo = async (cardId: string, toStage: Stage) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.estagio === toStage) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Nova posição = max(position) da coluna destino + 1 (evita embaralhar cards).
    const destCards = cards.filter((c) => normalizeStage(c.estagio) === toStage);
    const nextPos = destCards.length
      ? Math.max(...destCards.map((c) => Number(c.position) || 0)) + 1
      : 1;
    const prevStage = card.estagio;
    // Update otimista.
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, estagio: toStage, position: nextPos } : c)));
    const { error } = await supabase
      .from("pipeline_cards")
      .update({ estagio: toStage as any, position: nextPos } as any)
      .eq("id", cardId);
    if (error) {
      // rollback
      setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, estagio: prevStage, position: card.position } : c)));
      return toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
    await supabase.from("pipeline_history").insert({
      user_id: user.id, card_id: cardId, from_stage: prevStage as any, to_stage: toStage as any,
    } as any);
  };

  const openEdit = (card: Card) => {
    setEditing({ ...card });
    setDialogOpen(true);
  };

  const openNew = (stage?: Stage) => {
    setEditing({ ...EMPTY, estagio: stage || "novo_lead" });
    setDialogOpen(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/15 border border-primary/30">
            <KanbanSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Pipeline de Follow Up</h1>
            <p className="text-xs text-muted-foreground">
              {cards.length} cards · arraste entre colunas para mover
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" /> Importar contatos
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openNew()}>
                <Plus className="h-4 w-4" />
                Novo Card
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing.id ? "Editar Card" : "Novo Card"}</DialogTitle>
              <DialogDescription>Preencha os dados do prospect</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Empresa</Label>
                  <Input value={editing.nome_empresa ?? ""} onChange={(e) => setEditing({ ...editing, nome_empresa: e.target.value })} />
                </div>
                <div>
                  <Label>Contato</Label>
                  <Input value={editing.contato ?? ""} onChange={(e) => setEditing({ ...editing, contato: e.target.value })} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={editing.telefone ?? ""} onChange={(e) => setEditing({ ...editing, telefone: e.target.value })} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
                </div>
                <div>
                  <Label>Valor estimado (R$)</Label>
                  <Input type="number" value={editing.valor_estimado ?? ""} onChange={(e) => setEditing({ ...editing, valor_estimado: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <Label>Estágio</Label>
                  <Select value={editing.estagio} onValueChange={(v) => setEditing({ ...editing, estagio: v as Stage })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea rows={3} value={editing.observacoes ?? ""} onChange={(e) => setEditing({ ...editing, observacoes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={onSave}>Salvar</Button>
            </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <ImportLeadsDialog open={importOpen} onOpenChange={setImportOpen} defaultPipeline onDone={load} />

      <PageGuide
        storageKey="guide_pipeline"
        title="Pipeline CRM"
        what={`Kanban de leads. A ${agent} move automaticamente para 'Negociando' quando o lead aceita reunião. Você pode arrastar entre colunas, editar valor estimado, anotações e próximo follow-up.`}
        steps={[
          { text: "Arraste cards entre colunas para mudar de estágio" },
          { text: "Clique num card para editar valor, anotações ou próximo follow-up" },
          { text: "Use 'Novo Card' (ou + de cada coluna) para inserir manualmente" },
        ]}
        troubleshoot="Card sumiu? Pode ter sido movido para 'Fechado' ou 'Perdido' — role o kanban para a direita."
      />

      <div className="grid grid-flow-col auto-cols-[280px] gap-3 overflow-x-auto pb-3">
        {STAGES.map((stage) => {
          const items = grouped[stage.key] || [];
          const total = totals[stage.key];
          return (
            <div
              key={stage.key}
              className="flex flex-col bg-muted/20 rounded-lg border border-border min-h-[400px]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingId) moveTo(draggingId, stage.key);
                setDraggingId(null);
              }}
            >
              <div className={`px-3 py-2 border-b border-border flex items-center justify-between rounded-t-lg ${stage.color}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{stage.label}</span>
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{items.length}</Badge>
                </div>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openNew(stage.key)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {total > 0 && (
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border">
                  R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
              )}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {loading && <p className="text-xs text-muted-foreground p-2">Carregando…</p>}
                {!loading && items.length === 0 && (
                  <p className="text-xs text-muted-foreground p-3 text-center">Sem cards</p>
                )}
                {items.map((c) => (
                  <Card
                    key={c.id}
                    draggable
                    onDragStart={() => setDraggingId(c.id)}
                    onDragEnd={() => setDraggingId(null)}
                    className="cursor-grab hover:border-primary/40 transition-colors active:cursor-grabbing"
                    onClick={() => openEdit(c)}
                  >
                    <CardContent className="p-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{c.nome_empresa || c.contato || "—"}</p>
                          {c.contato && c.nome_empresa && (
                            <p className="text-[11px] text-muted-foreground truncate">{c.contato}</p>
                          )}
                        </div>
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </div>
                      {c.telefone && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Phone className="h-3 w-3" /> {c.telefone}
                        </div>
                      )}
                      {c.email && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                          <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{c.email}</span>
                        </div>
                      )}
                      {c.proximo_followup_at && (
                        <div className="flex items-center gap-1 text-[11px] text-amber-300">
                          <Calendar className="h-3 w-3" /> {new Date(c.proximo_followup_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        {c.valor_estimado ? (
                          <span className="text-[11px] font-semibold text-emerald-400">
                            R$ {Number(c.valor_estimado).toLocaleString("pt-BR")}
                          </span>
                        ) : <span />}
                        <Button
                          size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}