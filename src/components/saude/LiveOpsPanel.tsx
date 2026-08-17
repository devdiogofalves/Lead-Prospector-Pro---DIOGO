// LiveOpsPanel — métricas em tempo real dos workers (dispatch / qualification / linkedin).
// Consome a RPC `get_worker_metrics` (security definer, escopo por auth.uid()).
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Activity, RefreshCw, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

type Metrics = {
  generated_at: string;
  dispatch: {
    pending: number; overdue: number; running: number; stuck_running: number;
    failed_recent: number; dead_letters: number; sent_24h: number;
    oldest_pending_minutes: number;
  };
  latency: { sample_size: number; p50_seconds: number; p95_seconds: number };
  qualification: { pending_user_msgs: number; oldest_pending_minutes: number; assistant_replies_24h: number };
  linkedin: { active: number; due_now: number; attempts_24h: number };
};

function Stat({ label, value, tone = "default", hint }: { label: string; value: number | string; tone?: "default" | "ok" | "warn" | "bad"; hint?: string }) {
  const cls =
    tone === "ok" ? "text-emerald-500"
    : tone === "warn" ? "text-amber-500"
    : tone === "bad" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="rounded-md border border-border/50 bg-card/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${cls}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function fmtAge(min: number) {
  if (!min || min < 1) return "—";
  if (min < 60) return `${Math.round(min)}min`;
  return `${(min / 60).toFixed(1)}h`;
}

export function LiveOpsPanel() {
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data, error } = await supabase.rpc("get_worker_metrics" as any);
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setM(data as unknown as Metrics);
    } catch (e: any) {
      setErr(e?.message ?? "Erro");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // refresh a cada 15s
    return () => clearInterval(t);
  }, [load]);

  const health: "ok" | "warn" | "bad" = !m ? "ok"
    : m.dispatch.stuck_running > 0 || m.dispatch.dead_letters > 5 || m.qualification.oldest_pending_minutes > 10 ? "bad"
    : m.dispatch.overdue > 0 || m.dispatch.failed_recent > 0 || m.qualification.pending_user_msgs > 0 ? "warn"
    : "ok";

  return (
    <Card className={
      health === "bad" ? "border-destructive/40"
      : health === "warn" ? "border-amber-500/40"
      : "border-emerald-500/30"
    }>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Operação ao vivo
            {health === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
            {health !== "ok" && <AlertTriangle className={`h-3.5 w-3.5 ${health === "bad" ? "text-destructive" : "text-amber-500"}`} />}
            <Badge variant="outline" className="ml-2 text-[10px]">auto-refresh 15s</Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-7">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {err && <div className="text-xs text-destructive">{err}</div>}
        {!m && !err && <div className="text-xs text-muted-foreground">Carregando métricas…</div>}
        {m && (
          <>
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">Disparo WhatsApp</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat label="Pendentes" value={m.dispatch.pending} tone={m.dispatch.pending > 100 ? "warn" : "default"} />
                <Stat label="Atrasados >5min" value={m.dispatch.overdue} tone={m.dispatch.overdue > 0 ? "warn" : "ok"} />
                <Stat label="Em execução" value={m.dispatch.running} hint={m.dispatch.stuck_running ? `${m.dispatch.stuck_running} travados >10min` : undefined} tone={m.dispatch.stuck_running > 0 ? "bad" : "default"} />
                <Stat label="Dead letters" value={m.dispatch.dead_letters} tone={m.dispatch.dead_letters > 0 ? "bad" : "ok"} />
                <Stat label="Enviados 24h" value={m.dispatch.sent_24h} tone="ok" />
                <Stat label="Falhas 24h" value={m.dispatch.failed_recent} tone={m.dispatch.failed_recent > 0 ? "warn" : "ok"} />
                <Stat label="Mais antigo pendente" value={fmtAge(m.dispatch.oldest_pending_minutes)} />
                <Stat
                  label="Latência (p50/p95)"
                  value={m.latency.sample_size ? `${m.latency.p50_seconds}s / ${m.latency.p95_seconds}s` : "—"}
                  hint={m.latency.sample_size ? `${m.latency.sample_size} amostras 60min` : "sem envios recentes"}
                />
              </div>
            </div>

            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">Qualificação IA</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <Stat label="Mensagens pendentes" value={m.qualification.pending_user_msgs} tone={m.qualification.pending_user_msgs > 0 ? "warn" : "ok"} />
                <Stat label="Atraso máximo" value={fmtAge(m.qualification.oldest_pending_minutes)} tone={m.qualification.oldest_pending_minutes > 10 ? "bad" : m.qualification.oldest_pending_minutes > 3 ? "warn" : "ok"} />
                <Stat label="Respostas IA 24h" value={m.qualification.assistant_replies_24h} tone="ok" />
              </div>
            </div>

            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">LinkedIn cadência</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <Stat label="Contatos ativos" value={m.linkedin.active} />
                <Stat label="Prontos agora" value={m.linkedin.due_now} tone={m.linkedin.due_now > 0 ? "warn" : "default"} />
                <Stat label="Tentativas 24h" value={m.linkedin.attempts_24h} hint="limite anti-ban 20/dia" tone={m.linkedin.attempts_24h >= 20 ? "warn" : "default"} />
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground text-right">
              atualizado {new Date(m.generated_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
