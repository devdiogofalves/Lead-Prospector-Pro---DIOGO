// Chip Health Panel — inspirado no painel "Saúde dos Chips · Anti-ban" do AGREGA.
// Mostra por chip: idade, aquecimento, envios/falhas hoje, capacidade restante,
// risco (baixo/médio/alto) com motivo textual, e projeção mensal vs meta.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Activity, TrendingUp, AlertTriangle, ShieldCheck } from "lucide-react";

interface ChipRow {
  id: string;
  instance_name: string;
  active: boolean;
  paused: boolean;
  status: string | null;
  daily_limit: number;
  age_days: number;
  warmup_cap: number;
  effective_cap: number;
  sent_today: number;
  failed_today: number;
  fail_ratio_pct: number;
  remaining_today: number;
  risk: "baixo" | "medio" | "alto";
  reason: string;
}

interface HealthPayload {
  chips: ChipRow[];
  monthly_target: number;
  monthly_projection: number;
  meets_target: boolean;
}

const riskBadge = (risk: string) => {
  if (risk === "alto") return <Badge variant="destructive">Alto</Badge>;
  if (risk === "medio") return <Badge className="bg-amber-500 hover:bg-amber-500/90">Médio</Badge>;
  return <Badge className="bg-emerald-500 hover:bg-emerald-500/90">Baixo</Badge>;
};

export function ChipHealthPanel() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data: res, error } = await supabase.rpc("get_chip_health_metrics" as any);
    if (!error && res) setData(res as unknown as HealthPayload);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  if (loading && !data) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">Carregando saúde dos chips…</CardContent></Card>;
  }
  if (!data) return null;

  const pct = Math.min(100, Math.round((data.monthly_projection / Math.max(1, data.monthly_target)) * 100));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Saúde dos chips — Anti-ban
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Aquecimento gradual + backoff automático por qualidade. Chips com muitas falhas hoje têm o teto reduzido para evitar banimento.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="w-4 h-4" />
              Projeção mensal
            </div>
            {data.meets_target
              ? <Badge className="bg-emerald-500 hover:bg-emerald-500/90"><ShieldCheck className="w-3 h-3 mr-1" />Atinge meta</Badge>
              : <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Abaixo da meta</Badge>}
          </div>
          <div className="text-2xl font-semibold">
            {data.monthly_projection.toLocaleString("pt-BR")}
            <span className="text-sm text-muted-foreground font-normal"> / {data.monthly_target.toLocaleString("pt-BR")} envios/mês</span>
          </div>
          <Progress value={pct} className="h-2" />
          {!data.meets_target && (
            <p className="text-xs text-muted-foreground">
              Sugestão: aqueça mais os chips existentes ou adicione um novo chip para bater a meta.
            </p>
          )}
        </div>

        {data.chips.length === 0 ? (
          <div className="text-center text-muted-foreground py-6">Nenhum chip WhatsApp cadastrado ainda.</div>
        ) : (
          <div className="space-y-3">
            {data.chips.map((c) => {
              const capPct = Math.min(100, Math.round((c.sent_today / Math.max(1, c.effective_cap)) * 100));
              return (
                <div key={c.id} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.instance_name || "(sem nome)"}</span>
                      {riskBadge(c.risk)}
                    </div>
                    <div className="text-xs text-muted-foreground">{c.reason}</div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                    <div><div className="text-muted-foreground">Idade</div><div className="font-medium">{c.age_days}d</div></div>
                    <div><div className="text-muted-foreground">Teto aquec.</div><div className="font-medium">{c.warmup_cap}</div></div>
                    <div><div className="text-muted-foreground">Teto efetivo</div><div className="font-medium">{c.effective_cap}</div></div>
                    <div><div className="text-muted-foreground">Enviados hoje</div><div className="font-medium">{c.sent_today}</div></div>
                    <div><div className="text-muted-foreground">Falhas hoje</div><div className={`font-medium ${c.fail_ratio_pct >= 15 ? "text-destructive" : ""}`}>{c.failed_today} ({c.fail_ratio_pct}%)</div></div>
                  </div>
                  <Progress value={capPct} className="h-1.5" />
                  <div className="text-xs text-muted-foreground">Capacidade restante hoje: <b>{c.remaining_today}</b></div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
