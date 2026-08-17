import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Download, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

type Group = { jid: string; name: string; size: number | null; selected?: boolean };

export default function WhatsAppGruposPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const { data: leads, refetch: refetchLeads } = useQuery({
    queryKey: ["wa-group-leads"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_group_leads")
        .select("id, group_name, member_jid, phone, pushname, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

  async function listGroups() {
    setLoadingList(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-group-scrape", {
        body: { action: "list-groups" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setGroups((data?.groups ?? []).map((g: any) => ({ ...g, selected: false })));
      toast({ title: `${data?.groups?.length ?? 0} grupos encontrados` });
    } catch (e: any) {
      toast({ title: "Erro ao listar grupos", description: String(e?.message ?? e), variant: "destructive" });
    } finally { setLoadingList(false); }
  }

  async function scrapeSelected() {
    const jids = groups.filter((g) => g.selected).map((g) => g.jid);
    if (jids.length === 0) return toast({ title: "Selecione ao menos 1 grupo", variant: "destructive" });
    setScraping(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-group-scrape", {
        body: { action: "scrape", group_jids: jids },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLastResult(data);
      toast({
        title: `${data?.saved ?? 0} leads importados`,
        description: `${data?.saved_phone ?? 0} com telefone · ${data?.saved_private ?? 0} privados`,
      });
      refetchLeads();
    } catch (e: any) {
      toast({ title: "Erro ao raspar grupos", description: String(e?.message ?? e), variant: "destructive" });
    } finally { setScraping(false); }
  }

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" /> Captação por Grupos WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">
          Lista os grupos do seu chip ativo e importa os membros como leads. Se o WhatsApp ocultar o telefone, salva o ID privado.
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          O WhatsApp só permite listar TODOS os participantes em grupos onde seu chip é <b>admin</b>.
          Em outros grupos, normalmente vêm apenas os admins. Use chips quentes e respeite intervalos
          de disparo pra não derrubar a conta.
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Listar grupos do chip ativo</CardTitle>
          <CardDescription>Sincroniza a lista de grupos via Mandrack.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={listGroups} disabled={loadingList} variant="outline">
            {loadingList ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Carregar grupos
          </Button>

          {groups.length > 0 && (
            <div className="border rounded-md divide-y max-h-[400px] overflow-auto">
              <div className="p-3 bg-muted/40 flex items-center gap-2 text-xs font-medium">
                <Checkbox
                  checked={groups.every((g) => g.selected)}
                  onCheckedChange={(v) => setGroups((p) => p.map((g) => ({ ...g, selected: !!v })))}
                />
                <span>Selecionar todos ({groups.length})</span>
              </div>
              {groups.map((g) => (
                <div key={g.jid} className="p-3 flex items-center gap-3 text-sm hover:bg-muted/30">
                  <Checkbox
                    checked={!!g.selected}
                    onCheckedChange={() => setGroups((p) => p.map((x) => x.jid === g.jid ? { ...x, selected: !x.selected } : x))}
                  />
                  <span className="flex-1 truncate">{g.name || "(sem nome)"}</span>
                  {g.size != null && <Badge variant="outline" className="text-xs">{g.size} membros</Badge>}
                </div>
              ))}
            </div>
          )}

          <Button onClick={scrapeSelected} disabled={scraping || groups.filter((g) => g.selected).length === 0}>
            {scraping ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Importar membros dos selecionados
          </Button>

          {lastResult && (
            <div className="text-xs rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-300">
              ✓ {lastResult.saved} leads salvos · {lastResult.saved_phone ?? 0} com telefone · {lastResult.saved_private ?? 0} privados · {lastResult.members} membros vistos
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leads capturados ({leads?.length ?? 0})</CardTitle>
          <CardDescription>Últimos 500 membros importados. Leads sem telefone aparecem com o ID privado do WhatsApp.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md divide-y max-h-[500px] overflow-auto">
            {(leads ?? []).length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">Nenhum lead ainda.</div>
            )}
            {(leads ?? []).map((l: any) => (
              <div key={l.id} className="p-3 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{l.pushname || l.phone || "Participante privado"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {l.phone || l.member_jid || "sem identificador"} · {l.group_name || "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
