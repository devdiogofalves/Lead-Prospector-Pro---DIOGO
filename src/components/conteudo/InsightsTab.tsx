import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { TrendingUp, TrendingDown, Clock, Flame, Sparkles, RefreshCw, Download, PenSquare, Minus } from "lucide-react";

type Cell = { day: string; bucket: string; avg: number; count: number };
type BestTime = { day: string; bucket: string; avg: number; count: number };
type TopPost = { caption: string; format: string; likes: number; comments: number; leads: number; published_at?: string };
type Totals = { posts: number; likes: number; comments: number; dms: number; leads: number };
type InsightsResp = {
  success: boolean;
  channel?: string;
  totals: Totals;
  totals_prev?: Totals;
  deltas?: { posts: number; likes: number; comments: number; dms: number; leads: number };
  heatmap: Cell[][];
  best_times: BestTime[];
  top_posts: TopPost[];
  ai_summary: string;
  generated_at: string;
};

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const BUCKETS = ["0-4h", "4-8h", "8-12h", "12-16h", "16-20h", "20-24h"];

function heatColor(avg: number, max: number) {
  if (max <= 0 || avg <= 0) return "bg-muted/40";
  const r = avg / max;
  if (r > 0.85) return "bg-primary text-primary-foreground";
  if (r > 0.6) return "bg-primary/70 text-primary-foreground";
  if (r > 0.35) return "bg-primary/45";
  if (r > 0.15) return "bg-primary/25";
  return "bg-primary/10";
}

function DeltaBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) return null;
  if (value === 0) return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Minus className="h-3 w-3" />0%</span>;
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const cls = up ? "text-emerald-500" : "text-rose-500";
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${cls}`}><Icon className="h-3 w-3" />{up ? "+" : ""}{value}%</span>;
}

export default function InsightsTab() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [channel, setChannel] = useState<"all" | "instagram" | "linkedin">("all");
  const [data, setData] = useState<InsightsResp | null>(null);

  async function syncMetrics(silent = false) {
    setSyncing(true);
    try {
      const { data: r, error } = await supabase.functions.invoke("social-metrics-sync", { body: {} });
      if (error) throw error;
      if (!silent) {
        const ig = (r as any)?.instagram;
        const li = (r as any)?.linkedin;
        const igMsg = ig?.skipped ? `Instagram: ${ig.skipped}` : `Instagram: ${ig?.inserted ?? 0} novos, ${ig?.updated ?? 0} atualizados`;
        const liMsg = li?.skipped ? `LinkedIn: ${li.skipped}` : `LinkedIn: ${li?.inserted ?? 0} novos, ${li?.updated ?? 0} atualizados`;
        toast({ title: "Métricas sincronizadas", description: `${igMsg} • ${liMsg}` });
      }
    } catch (e: unknown) {
      if (!silent) {
        const msg = e instanceof Error ? e.message : String(e);
        toast({ title: "Erro ao sincronizar", description: msg, variant: "destructive" });
      }
    } finally {
      setSyncing(false);
    }
  }

  async function load(ch: "all" | "instagram" | "linkedin" = channel) {
    setLoading(true);
    try {
      await syncMetrics(true);
      const { data: r, error } = await supabase.functions.invoke("social-weekly-insights", { body: { channel: ch } });
      if (error) throw error;
      const d = r as InsightsResp & { error?: string };
      if (!d?.success) throw new Error(d?.error ?? "Falha");
      setData(d);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro ao analisar", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function exportCSV() {
    if (!data) return;
    const rows: string[] = [];
    rows.push("secao,metrica,valor,delta_pct");
    const t = data.totals; const dl = data.deltas ?? {} as any;
    (["posts","likes","comments","dms","leads"] as const).forEach((k) => {
      rows.push(`totais,${k},${(t as any)[k]},${dl?.[k] ?? ""}`);
    });
    rows.push("");
    rows.push("top_post,posicao,formato,curtidas,comentarios,leads,publicado,caption");
    data.top_posts.forEach((p, i) => {
      const cap = (p.caption || "").replace(/"/g, '""');
      rows.push(`top,${i + 1},${p.format ?? ""},${p.likes},${p.comments},${p.leads},${p.published_at ?? ""},"${cap}"`);
    });
    rows.push("");
    rows.push("heatmap,dia,horario,media,posts");
    data.heatmap.flat().forEach((c) => {
      rows.push(`heatmap,${c.day},${c.bucket},${c.avg},${c.count}`);
    });
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `insights-${data.channel ?? "all"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function inspireFromTop() {
    const top = data?.top_posts?.[0];
    if (!top) return;
    const seed = encodeURIComponent(top.caption || "");
    navigate(`/conteudo?tab=criar&seed=${seed}`);
  }

  const maxAvg = data ? Math.max(1, ...data.heatmap.flat().map((c) => c.avg)) : 1;

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Análise Semanal IA</CardTitle>
          <p className="text-sm text-muted-foreground">
            IA compara os últimos 30 dias com os 30 anteriores, mostra tendências por canal e sugere ações.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={channel} onValueChange={(v) => { const ch = v as any; setChannel(ch); if (data) load(ch); }}>
              <TabsList>
                <TabsTrigger value="all">Todos</TabsTrigger>
                <TabsTrigger value="instagram">Instagram</TabsTrigger>
                <TabsTrigger value="linkedin">LinkedIn</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button onClick={() => load()} disabled={loading || syncing}>
              {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {loading ? "Analisando..." : data ? "Atualizar" : "Gerar análise"}
            </Button>
            <Button variant="outline" onClick={() => syncMetrics(false)} disabled={loading || syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar métricas"}
            </Button>
            {data && (
              <>
                <Button variant="outline" onClick={exportCSV}>
                  <Download className="h-4 w-4 mr-2" /> Exportar CSV
                </Button>
                {data.top_posts.length > 0 && (
                  <Button variant="secondary" onClick={inspireFromTop}>
                    <PenSquare className="h-4 w-4 mr-2" /> Criar post baseado no top
                  </Button>
                )}
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Comparação: últimos 30 dias vs. 30 dias anteriores. Fonte: Meta Graph API (Instagram) e Unipile (LinkedIn).
          </p>
          {data && (
            <p className="text-xs text-muted-foreground">
              Gerado {new Date(data.generated_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} • {data.totals.posts} posts analisados
            </p>
          )}
        </CardContent>
      </Card>

      {data && (
        <>
          {/* Totais + delta */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {([
              { key: "posts", label: "Posts", v: data.totals.posts },
              { key: "likes", label: "Curtidas", v: data.totals.likes },
              { key: "comments", label: "Comentários", v: data.totals.comments },
              { key: "dms", label: "DMs enviadas", v: data.totals.dms },
              { key: "leads", label: "Leads gerados", v: data.totals.leads },
            ] as const).map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                  <div className="text-2xl font-bold">{s.v.toLocaleString("pt-BR")}</div>
                  <div className="mt-1"><DeltaBadge value={data.deltas?.[s.key]} /></div>
                </CardContent>
              </Card>
            ))}
          </div>


          {/* Análise IA */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Resumo & recomendações</CardTitle>
            </CardHeader>
            <CardContent>
              {data.ai_summary ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{data.ai_summary}</div>
              ) : (
                <p className="text-sm text-muted-foreground">Sem dados suficientes pra IA analisar.</p>
              )}
            </CardContent>
          </Card>

          {/* Best times */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Melhores horários (engajamento médio)</CardTitle>
            </CardHeader>
            <CardContent>
              {data.best_times.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {data.best_times.map((b, i) => (
                    <Badge key={i} variant={i === 0 ? "default" : "secondary"} className="text-sm py-2 px-3">
                      {i === 0 && <Flame className="h-3 w-3 mr-1" />}
                      {b.day} • {b.bucket} <span className="opacity-70 ml-1">({b.avg} eng · {b.count}x)</span>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sem dados.</p>
              )}
            </CardContent>
          </Card>

          {/* Heatmap */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">🗺️ Heatmap por dia × horário (Brasília)</CardTitle>
              <p className="text-xs text-muted-foreground">Cor = engajamento médio (likes + 3×comentários + 5×DMs + 10×leads). Número = média.</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="text-xs w-full border-separate border-spacing-1">
                  <thead>
                    <tr>
                      <th className="text-left text-muted-foreground font-medium w-12"></th>
                      {BUCKETS.map((b) => (
                        <th key={b} className="text-muted-foreground font-medium text-center">{b}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.heatmap.map((row, di) => (
                      <tr key={di}>
                        <td className="text-muted-foreground font-medium pr-2">{DAYS[di]}</td>
                        {row.map((c, bi) => (
                          <td key={bi} className={`text-center p-2 rounded ${heatColor(c.avg, maxAvg)}`} title={`${c.count} post(s)`}>
                            {c.count > 0 ? c.avg : "·"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Top posts */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">🏆 Top 5 posts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.top_posts.length === 0 && <p className="text-sm text-muted-foreground">Sem posts publicados.</p>}
              {data.top_posts.map((p, i) => (
                <div key={i} className="border rounded p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline">{i + 1}º</Badge>
                    <Badge variant="secondary">{p.format}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {p.published_at ? new Date(p.published_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : ""}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-muted-foreground mb-1">{p.caption || "(sem legenda)"}</p>
                  <div className="flex gap-3 text-xs">
                    <span>❤️ {p.likes}</span>
                    <span>💬 {p.comments}</span>
                    <span>🎯 {p.leads} leads</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
