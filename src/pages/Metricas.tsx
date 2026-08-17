import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, CheckCircle2, Eye, XCircle, MessageSquare, Target } from "lucide-react";

type ChipRow = { chip: string; sent: number; delivered: number; read: number; failed: number; pending: number };
type SourceRow = { channel: string; source: string; sent: number; delivered: number; read: number; failed: number };
type Totals = { sent: number; delivered: number; read: number; failed: number; pending: number; replies: number; qualified: number };

function pct(n: number, d: number) {
  if (!d) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

function StatCard({ icon: Icon, label, value, hint }: any) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
          <div>
            <div className="text-2xl font-semibold leading-none">{value}</div>
            <div className="text-xs text-muted-foreground mt-1">{label}{hint ? ` · ${hint}` : ""}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Metricas() {
  const [days, setDays] = useState<number>(7);

  const { data, isLoading } = useQuery({
    queryKey: ["dispatch-metrics", days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dispatch_metrics", { _days: days });
      if (error) throw error;
      return data as { totals: Totals; by_chip: ChipRow[]; by_source: SourceRow[]; since: string };
    },
    refetchInterval: 60_000,
  });

  const totals = data?.totals;
  const chips = data?.by_chip ?? [];
  const sources = data?.by_source ?? [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Métricas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Desempenho real por chip WhatsApp e por canal/origem — entregas (ACK) e leituras vindas do webhook Mandrack.
          </p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Últimas 24h</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Activity} label="Enviadas" value={totals?.sent ?? 0} />
          <StatCard icon={CheckCircle2} label="Entregues" value={totals?.delivered ?? 0} hint={pct(totals?.delivered ?? 0, totals?.sent ?? 0)} />
          <StatCard icon={Eye} label="Lidas" value={totals?.read ?? 0} hint={pct(totals?.read ?? 0, totals?.delivered ?? 0)} />
          <StatCard icon={XCircle} label="Falhas" value={totals?.failed ?? 0} hint={pct(totals?.failed ?? 0, (totals?.sent ?? 0) + (totals?.failed ?? 0))} />
          <StatCard icon={MessageSquare} label="Leads que responderam" value={totals?.replies ?? 0} hint={`${pct(totals?.replies ?? 0, totals?.sent ?? 0)} de resposta`} />
          <StatCard icon={Target} label="Qualificados / avançados" value={totals?.qualified ?? 0} />
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Desempenho por chip WhatsApp</CardTitle></CardHeader>
        <CardContent>
          {chips.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem envios no período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chip</TableHead>
                  <TableHead className="text-right">Enviadas</TableHead>
                  <TableHead className="text-right">Entregues</TableHead>
                  <TableHead className="text-right">Lidas</TableHead>
                  <TableHead className="text-right">Falhas</TableHead>
                  <TableHead className="text-right">Taxa entrega</TableHead>
                  <TableHead className="text-right">Taxa leitura</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chips.map((c) => (
                  <TableRow key={c.chip + (c as any).chip_id}>
                    <TableCell className="font-medium">{c.chip}</TableCell>
                    <TableCell className="text-right">{c.sent}</TableCell>
                    <TableCell className="text-right">{c.delivered}</TableCell>
                    <TableCell className="text-right">{c.read}</TableCell>
                    <TableCell className="text-right text-destructive">{c.failed}</TableCell>
                    <TableCell className="text-right">{pct(c.delivered, c.sent)}</TableCell>
                    <TableCell className="text-right">{pct(c.read, c.delivered)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Desempenho por canal e origem</CardTitle></CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem envios no período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Enviadas</TableHead>
                  <TableHead className="text-right">Entregues</TableHead>
                  <TableHead className="text-right">Lidas</TableHead>
                  <TableHead className="text-right">Falhas</TableHead>
                  <TableHead className="text-right">Taxa entrega</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="capitalize">{r.channel}</TableCell>
                    <TableCell className="capitalize">{r.source}</TableCell>
                    <TableCell className="text-right">{r.sent}</TableCell>
                    <TableCell className="text-right">{r.delivered}</TableCell>
                    <TableCell className="text-right">{r.read}</TableCell>
                    <TableCell className="text-right text-destructive">{r.failed}</TableCell>
                    <TableCell className="text-right">{pct(r.delivered, r.sent)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
