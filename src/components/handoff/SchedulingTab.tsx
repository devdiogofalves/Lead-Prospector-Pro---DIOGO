import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  ChevronLeft, ChevronRight, Loader2, CalendarPlus, Video, Send, Trash2, AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addDays, addMinutes, format, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useBranding } from "@/hooks/useBranding";

interface Props {
  conversationId: string;
  leadNome: string | null;
  leadTelefone: string;
  leadEmail?: string | null;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 8h–19h
const SLOT_MIN = 30;

type GEvent = { id: string; summary: string; start: string; end: string; meet?: string | null };
type Meeting = { id: string; start_at: string; end_at: string; titulo: string; meet_link: string | null; lead_nome: string | null; google_event_id: string | null };

export default function SchedulingTab({ conversationId, leadNome, leadTelefone, leadEmail }: Props) {
  const { branding } = useBranding();
  const company = branding.company_name;

  const [connected, setConnected] = useState<boolean | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [busy, setBusy] = useState<{ start: string; end: string }[]>([]);
  const [events, setEvents] = useState<GEvent[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [slotStart, setSlotStart] = useState<Date | null>(null);
  const [duration, setDuration] = useState(30);
  const [title, setTitle] = useState(`Reunião ${company} × ` + (leadNome ?? "Lead"));
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState(leadEmail ?? "");
  const [creating, setCreating] = useState(false);

  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => addDays(weekStart, i)), [weekStart]); // Seg-Sab

  useEffect(() => {
    setTitle(`Reunião ${company} × ${leadNome ?? "Lead"}`);
    setEmail(leadEmail ?? "");
  }, [company, leadNome, leadEmail]);

  async function loadAll() {
    setLoading(true);
    try {
      const status = await supabase.functions.invoke("google-calendar-api", { body: { action: "status" } });
      const isConnected = !!status.data?.connected;
      setConnected(isConnected);

      const timeMin = weekStart.toISOString();
      const timeMax = addDays(weekStart, 7).toISOString();

      if (isConnected) {
        const [ev, fb] = await Promise.all([
          supabase.functions.invoke("google-calendar-api", { body: { action: "events", timeMin, timeMax } }),
          supabase.functions.invoke("google-calendar-api", { body: { action: "freebusy", timeMin, timeMax } }),
        ]);
        setEvents(ev.data?.events ?? []);
        setBusy(fb.data?.busy ?? []);
      } else {
        setEvents([]);
        setBusy([]);
      }

      const { data: meets, error: meetsError } = await supabase
        .from("scheduled_meetings")
        .select("id, start_at, end_at, titulo, meet_link, lead_nome, google_event_id")
        .gte("start_at", timeMin).lt("start_at", timeMax).order("start_at");
      if (meetsError) throw meetsError;
      setMeetings((meets ?? []) as Meeting[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [weekStart]);

  function isSlotBusy(slotStart: Date, slotEnd: Date) {
    const s = slotStart.getTime();
    const e = slotEnd.getTime();
    const overlap = (a: string, b: string) => {
      const ta = new Date(a).getTime();
      const tb = new Date(b).getTime();
      return ta < e && tb > s;
    };
    return busy.some(b => overlap(b.start, b.end))
      || events.some(ev => overlap(ev.start, ev.end))
      || meetings.some(m => overlap(m.start_at, m.end_at));
  }

  function openSlot(day: Date, hour: number, half: 0 | 1) {
    const start = new Date(day);
    start.setHours(hour, half === 1 ? 30 : 0, 0, 0);
    setSlotStart(start);
    setDuration(30);
    setDialogOpen(true);
  }

  async function createMeeting() {
    if (!slotStart) return;
    setCreating(true);
    try {
      const start = slotStart;
      const end = addMinutes(start, duration);

      if (isSlotBusy(start, end)) {
        throw new Error("Este horário acabou de ficar indisponível. Atualize a agenda e escolha outro slot.");
      }

      let meetLink: string | null = null;
      let googleEventId: string | null = null;

      if (connected) {
        const { data, error } = await supabase.functions.invoke("google-calendar-api", {
          body: {
            action: "create_event",
            title, description,
            startISO: start.toISOString(),
            endISO: end.toISOString(),
            attendeeEmail: email || undefined,
            withMeet: true,
          },
        });
        if (error || data?.error) throw new Error(data?.error || error?.message);
        meetLink = data.meet ?? null;
        googleEventId = data.id ?? null;
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error(userError?.message || "Sessão expirada");

      const { data: row, error: insErr } = await supabase.from("scheduled_meetings").insert({
        user_id: user.id,
        conversation_id: conversationId,
        lead_nome: leadNome,
        lead_telefone: leadTelefone,
        lead_email: email || null,
        titulo: title,
        descricao: description,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        meet_link: meetLink,
        google_event_id: googleEventId,
      }).select().single();
      if (insErr) throw insErr;
      if (!row) throw new Error("Agendamento criado sem retorno do banco");

      // Fase I: delega notificação do lead + grupo handoff + update pipeline
      // pra edge function meeting-handoff. Antes, este código tinha endpoint
      // Mandrack errado (/message/sendText/{instance} + apikey header — formato
      // Evolution antigo). Agora usa /chat/send/text + token, igual ao dispatch-worker.
      try {
        await supabase.functions.invoke("meeting-handoff", {
          body: { meeting_id: row.id, notify_lead: true, notify_group: true, update_pipeline: true },
        });
      } catch (e: any) {
        console.warn("meeting-handoff falhou (não-bloqueante):", e?.message);
      }

      toast.success("Agendamento criado ✓");
      setDialogOpen(false);
      loadAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function notifyGroup(m: Meeting) {
    try {
      const { data, error } = await supabase.functions.invoke("meeting-handoff", {
        body: { meeting_id: m.id, notify_lead: false, notify_group: true, update_pipeline: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.summary?.group_notified) {
        toast.success("Grupo notificado ✓");
        loadAll();
      } else if (data?.summary?.group_notify_error) {
        toast.error(data.summary.group_notify_error);
      } else {
        toast.info("Grupo já tinha sido notificado.");
      }
    } catch (e: any) { toast.error(e.message); }
  }

  async function deleteMeeting(m: any) {
    try {
      if (m.google_event_id && connected) {
        await supabase.functions.invoke("google-calendar-api", { body: { action: "delete_event", eventId: m.google_event_id } });
      }
      await supabase.from("scheduled_meetings").delete().eq("id", m.id);
      toast.success("Agendamento removido");
      loadAll();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium">
            {format(weekStart, "dd 'de' MMM", { locale: ptBR })} – {format(addDays(weekStart, 5), "dd 'de' MMM", { locale: ptBR })}
          </span>
          <Button size="icon" variant="ghost" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Hoje</Button>
        </div>
        <div className="flex items-center gap-2">
          {connected === false && (
            <Badge variant="outline" className="text-amber-500 border-amber-500/50 gap-1">
              <AlertCircle className="h-3 w-3" />
              Google não conectado
            </Badge>
          )}
          {connected === true && <Badge variant="secondary" className="gap-1"><Video className="h-3 w-3" /> Calendar OK</Badge>}
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-[720px]">
          {/* Header dias */}
          <div className="grid grid-cols-[60px_repeat(6,1fr)] sticky top-0 bg-card z-10 border-b">
            <div></div>
            {days.map(d => (
              <div key={d.toISOString()} className="px-2 py-2 text-center border-l">
                <div className="text-[10px] uppercase text-muted-foreground">{format(d, "EEE", { locale: ptBR })}</div>
                <div className={cn("text-sm font-semibold", format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") && "text-primary")}>
                  {format(d, "dd/MM")}
                </div>
              </div>
            ))}
          </div>

          {HOURS.map(h => (
            <div key={h} className="grid grid-cols-[60px_repeat(6,1fr)] border-b">
              <div className="px-2 py-1 text-[11px] text-muted-foreground text-right border-r">{String(h).padStart(2, "0")}:00</div>
              {days.map(day => {
                return (
                  <div key={day.toISOString() + h} className="border-l flex flex-col">
                    {[0, 1].map(half => {
                      const s = new Date(day); s.setHours(h, half === 1 ? 30 : 0, 0, 0);
                      const e = addMinutes(s, SLOT_MIN);
                      const occupied = isSlotBusy(s, e);
                      const meeting = meetings.find(m => new Date(m.start_at).getTime() === s.getTime());
                      const past = s.getTime() < Date.now();
                      return (
                        <button
                          key={half}
                          disabled={past}
                          onClick={() => !meeting && !occupied && openSlot(day, h, half as 0 | 1)}
                          className={cn(
                            "h-7 text-[10px] transition border-b border-border/30 last:border-b-0 px-1 truncate text-left",
                            past && "opacity-30 cursor-not-allowed",
                            !past && !occupied && "hover:bg-primary/10 hover:text-primary",
                            occupied && !meeting && "bg-muted-foreground/20 text-muted-foreground cursor-not-allowed",
                            meeting && "bg-primary text-primary-foreground font-medium",
                          )}
                        >
                          {meeting ? "● " + (meeting.lead_nome?.split(" ")[0] || "Reunião") : occupied ? "ocupado" : ""}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Próximos agendamentos desta conversa */}
      <div className="border-t p-3 max-h-48 overflow-auto bg-muted/10">
        <p className="text-xs font-semibold mb-2">Agendamentos com este lead</p>
        {meetings.filter(m => m.lead_nome === leadNome).length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum nesta semana.</p>
        )}
        <div className="space-y-2">
          {meetings.filter(m => m.lead_nome === leadNome).map(m => (
            <Card key={m.id}>
              <CardContent className="p-2 flex items-center gap-3 text-xs">
                <div className="flex-1">
                  <p className="font-medium">{m.titulo}</p>
                  <p className="text-muted-foreground">{format(new Date(m.start_at), "EEE dd/MM HH:mm", { locale: ptBR })}</p>
                </div>
                {m.meet_link && (
                  <a href={m.meet_link} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                    <Video className="h-3 w-3" /> Meet
                  </a>
                )}
                <Button size="sm" variant="outline" onClick={() => notifyGroup(m)}><Send className="h-3 w-3 mr-1" /> Grupo</Button>
                <Button size="icon" variant="ghost" onClick={() => deleteMeeting(m)}><Trash2 className="h-3 w-3" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo agendamento</DialogTitle>
            <DialogDescription>
              {slotStart && format(slotStart, "EEEE, dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
              {connected ? " • Cria evento no Google Calendar com link Meet automático" : " • Modo manual (Google não conectado)"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Título</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Duração (min)</Label>
                <Input type="number" min={15} step={15} value={duration} onChange={e => setDuration(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Email do lead (convidado)</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="opcional" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Pauta da reunião…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={createMeeting} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CalendarPlus className="h-4 w-4 mr-1" />}
              Agendar e notificar lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}