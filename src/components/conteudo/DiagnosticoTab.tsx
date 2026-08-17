// DiagnosticoTab — auditoria E2E do canal Instagram.
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertTriangle, XCircle, Info, RefreshCw, Activity } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Check = { id: string; label: string; status: "ok" | "warn" | "fail" | "info"; detail?: string; hint?: string };
type Report = { ready: boolean; summary: { ok: number; warn: number; fail: number; info: number }; checks: Check[]; generated_at: string };

const ICON = {
  ok: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
  warn: <AlertTriangle className="h-5 w-5 text-amber-500" />,
  fail: <XCircle className="h-5 w-5 text-destructive" />,
  info: <Info className="h-5 w-5 text-muted-foreground" />,
};

export default function DiagnosticoTab() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  async function run() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("instagram-audit", { body: {} });
      if (error) throw error;
      const d = data as Report & { success?: boolean; error?: string };
      if (!(d as { success?: boolean }).success) throw new Error((d as { error?: string }).error ?? "Falha");
      setReport(d);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Auditoria E2E do Instagram
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Verifica brand kit, conta Unipile, conta Meta, regras de auto-engajamento, posts,
            interações capturadas e secrets dos webhooks. Rode antes de partir pra LinkedIn/TikTok.
          </p>
          <Button onClick={run} disabled={loading}>
            {loading ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Activity className="h-4 w-4 mr-1" />}
            {report ? "Rodar de novo" : "Rodar auditoria"}
          </Button>

          {report && (
            <div className="pt-2">
              <div className="flex items-center gap-2 text-sm mb-3">
                <Badge variant={report.ready ? "default" : "destructive"}>
                  {report.ready ? "✅ Pronto" : "⚠️ Bloqueios encontrados"}
                </Badge>
                <span className="text-emerald-500">✓ {report.summary.ok}</span>
                <span className="text-amber-500">⚠ {report.summary.warn}</span>
                <span className="text-destructive">✗ {report.summary.fail}</span>
                <span className="text-muted-foreground">ⓘ {report.summary.info}</span>
                <span className="text-[11px] text-muted-foreground ml-auto">
                  {new Date(report.generated_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </span>
              </div>
              <div className="space-y-2">
                {report.checks.map((c) => (
                  <div key={c.id} className="flex gap-3 rounded-md border bg-card/50 px-3 py-2">
                    <div className="pt-0.5">{ICON[c.status]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{c.label}</div>
                      {c.detail && <div className="text-xs text-muted-foreground mt-0.5">{c.detail}</div>}
                      {c.hint && <div className="text-xs text-primary mt-1">→ {c.hint}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
