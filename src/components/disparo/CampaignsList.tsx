import { useState } from "react";
import { Campaign, useCampaigns } from "@/hooks/useCampaigns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Plus, Rocket, Pencil, Trash2, Megaphone, CheckCircle2, Loader2, Upload } from "lucide-react";
import { CampaignBuilder } from "./CampaignBuilder";
import ImportLeadsDialog from "@/components/leads/ImportLeadsDialog";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_STYLES: Record<Campaign["status"], { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-muted text-muted-foreground" },
  scheduled: { label: "Agendada", cls: "bg-yellow-500/20 text-yellow-400" },
  sending: { label: "Enviando", cls: "bg-blue-500/20 text-blue-400" },
  paused: { label: "Pausada", cls: "bg-orange-500/20 text-orange-400" },
  completed: { label: "Concluída", cls: "bg-green-500/20 text-green-400" },
};

export function CampaignsList() {
  const { list, remove, launch } = useCampaigns();
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const qc = useQueryClient();

  const launching = launch.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Campanhas
          </h2>
          <p className="text-sm text-muted-foreground">
            Sequências de mensagens humanizadas com IA — usa seu prompt, Knowledge Pack e chips.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Importar planilha/TXT
          </Button>
          <Button onClick={() => { setEditing(null); setCreating(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Nova campanha
          </Button>
        </div>
      </div>

      <ImportLeadsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["leads"] });
          qc.invalidateQueries({ queryKey: ["campaigns"] });
          qc.invalidateQueries({ queryKey: ["dispatch_queue"] });
        }}
      />

      {list.isLoading && (
        <Card><CardContent className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></CardContent></Card>
      )}

      {!list.isLoading && (list.data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="p-10 text-center space-y-3">
            <Megaphone className="h-10 w-10 text-muted-foreground mx-auto" />
            <div>
              <p className="font-medium">Nenhuma campanha ainda</p>
              <p className="text-sm text-muted-foreground">Crie sua primeira sequência de mensagens.</p>
            </div>
            <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" /> Criar agora</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {(list.data ?? []).map((c) => {
          const total = c.total_recipients || 0;
          const progress = total ? Math.round(((c.sent_count + c.failed_count) / total) * 100) : 0;
          const status = STATUS_STYLES[c.status] ?? STATUS_STYLES.draft;
          return (
            <Card key={c.id} className="hover:border-primary/40 transition">
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{c.nome}</h3>
                      <Badge className={status.cls}>{status.label}</Badge>
                      <Badge variant="outline" className="text-xs">{c.sequence?.length ?? 0} passos</Badge>
                    </div>
                    {c.descricao && <p className="text-xs text-muted-foreground mt-1">{c.descricao}</p>}
                  </div>
                  <div className="flex gap-1">
                    {(c.status === "draft" || c.status === "paused" || c.status === "completed") && (
                      <Button size="sm" onClick={async () => {
                        try {
                          const r = await launch.mutateAsync(c.id);
                          toast({ title: c.status === "completed" ? "🔁 Relançada" : "🚀 Disparada", description: `${r.enqueued} envios na fila` });
                        } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
                      }} disabled={launching}>
                        <Rocket className="h-3.5 w-3.5 mr-1" /> {c.status === "completed" ? "Relançar" : "Disparar"}
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setCreating(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={async () => {
                      if (!confirm(`Excluir "${c.nome}"? Os envios na fila NÃO serão cancelados.`)) return;
                      await remove.mutateAsync(c.id);
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {total > 0 && (
                  <>
                    <Progress value={progress} className="h-1.5" />
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span className="text-muted-foreground">Total: <strong className="text-foreground">{total}</strong></span>
                      <span className="text-blue-400">Enviados: <strong>{c.sent_count}</strong></span>
                      <span className="text-red-400">Falhas: <strong>{c.failed_count}</strong></span>
                      <span className="text-amber-400">Respostas: <strong>{c.replied_count}</strong></span>
                      <span className="text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Qualificados: <strong>{c.qualified_count}</strong>
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <CampaignBuilder
        open={creating}
        onClose={() => { setCreating(false); setEditing(null); }}
        campaign={editing}
      />
    </div>
  );
}
