import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, Sparkles, Send, Loader2, AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useBranding } from "@/hooks/useBranding";
import ImportLeadsDialog from "@/components/leads/ImportLeadsDialog";

type LeadRow = {
  id: string;
  source: "leads" | "instagram_contacts" | "linkedin_contacts" | "empresas_enriquecidas";
  nome_empresa: string;
  nome_contato?: string | null;
  cargo?: string | null;
  email: string;
  especialidades?: string | null;
  site?: string | null;
  email_disparo?: string;
  preview_subject?: string;
  preview_html?: string;
  preview_text?: string;
  selected?: boolean;
  status?: "idle" | "sending" | "sent" | "failed";
  error?: string;
};

const TABLE_MAP = [
  { key: "leads" as const, label: "Maps" },
  { key: "instagram_contacts" as const, label: "Instagram" },
  { key: "linkedin_contacts" as const, label: "LinkedIn" },
  { key: "empresas_enriquecidas" as const, label: "Empresas" },
];

async function loadLeadsWithEmail(): Promise<LeadRow[]> {
  const rows: LeadRow[] = [];
  for (const t of TABLE_MAP) {
    let q: any;
    if (t.key === "leads") {
      q = supabase.from("leads").select("id,nome_empresa,email,especialidades,site,email_disparo").not("email", "is", null).neq("email", "");
    } else if (t.key === "instagram_contacts") {
      q = supabase.from("instagram_contacts").select("id,nome,username,email,bio,site,email_disparo").not("email", "is", null).neq("email", "");
    } else if (t.key === "linkedin_contacts") {
      q = supabase.from("linkedin_contacts").select("id,nome,empresa,cargo,email,sobre,linkedin_url,email_disparo").not("email", "is", null).neq("email", "");
    } else {
      q = supabase.from("empresas_enriquecidas").select("id,nome_empresa,email,atividade_principal,email_disparo").not("email", "is", null).neq("email", "");
    }
    const { data } = await q.limit(200);
    for (const r of data ?? []) {
      if (t.key === "leads") rows.push({ id: r.id, source: "leads", nome_empresa: r.nome_empresa, email: r.email, especialidades: r.especialidades, site: r.site, email_disparo: r.email_disparo });
      else if (t.key === "instagram_contacts") rows.push({ id: r.id, source: "instagram_contacts", nome_empresa: r.nome ?? r.username, email: r.email, especialidades: r.bio, site: r.site, email_disparo: r.email_disparo });
      else if (t.key === "linkedin_contacts") rows.push({ id: r.id, source: "linkedin_contacts", nome_empresa: r.empresa ?? "(sem empresa)", nome_contato: r.nome, cargo: r.cargo, email: r.email, especialidades: r.sobre, site: r.linkedin_url, email_disparo: r.email_disparo });
      else rows.push({ id: r.id, source: "empresas_enriquecidas", nome_empresa: r.nome_empresa, email: r.email, especialidades: r.atividade_principal, email_disparo: r.email_disparo });
    }
  }
  return rows;
}

export default function DisparoEmail() {
  const { branding } = useBranding();
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [filter, setFilter] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [delaySec, setDelaySec] = useState(20);
  const [onlyPending, setOnlyPending] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  const { data: loaded, refetch, isFetching } = useQuery({
    queryKey: ["leads-with-email"],
    queryFn: loadLeadsWithEmail,
  });

  const { data: emailCfg } = useQuery({
    queryKey: ["dispatch-settings-email"],
    queryFn: async () => {
      const { data } = await supabase
        .from("dispatch_settings")
        .select("email_reply_to,email_from_name")
        .maybeSingle();
      return data ?? null;
    },
  });

  useEffect(() => {
    if (loaded) setRows(loaded.map((r) => ({ ...r, selected: false, status: "idle" })));
  }, [loaded]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyPending && r.email_disparo === "Sim") return false;
      if (!q) return true;
      return (r.nome_empresa + " " + (r.nome_contato ?? "") + " " + r.email).toLowerCase().includes(q);
    });
  }, [rows, filter, onlyPending]);

  const selected = filtered.filter((r) => r.selected);

  const toggleAll = (v: boolean) =>
    setRows((prev) => prev.map((r) => (filtered.find((f) => f.id === r.id && f.source === r.source) ? { ...r, selected: v } : r)));

  const toggleOne = (id: string, source: string) =>
    setRows((prev) => prev.map((r) => (r.id === id && r.source === source ? { ...r, selected: !r.selected } : r)));

  async function generatePreviews() {
    if (selected.length === 0) return toast({ title: "Selecione pelo menos 1 lead", variant: "destructive" });
    setGenerating(true);
    try {
      const batch = selected.slice(0, 20).map((l) => ({
        id: `${l.source}:${l.id}`,
        source: l.source,
        nome_empresa: l.nome_empresa,
        nome_contato: l.nome_contato,
        cargo: l.cargo,
        especialidades: l.especialidades,
        site: l.site,
      }));
      const replyTo = emailCfg?.email_reply_to || undefined;
      const { data, error } = await supabase.functions.invoke("email-ai-message", { body: { leads: batch, reply_to: replyTo } });
      if (error) throw error;
      const items: any[] = data?.items ?? [];
      setRows((prev) =>
        prev.map((r) => {
          const it = items.find((i) => i.id === `${r.source}:${r.id}`);
          if (!it) return r;
          if (it.error) return { ...r, error: it.error };
          return { ...r, preview_subject: it.subject, preview_html: it.html, preview_text: it.text, error: undefined };
        }),
      );
      toast({ title: `Prévia gerada para ${items.length} leads` });
    } catch (e: any) {
      toast({ title: "Erro ao gerar prévia", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function sendAll() {
    const ready = selected.filter((l) => l.preview_subject && l.preview_html);
    if (ready.length === 0) return toast({ title: "Gere a prévia antes de enviar", variant: "destructive" });
    setSending(true);
    let ok = 0, fail = 0;
    for (const lead of ready) {
      setRows((prev) => prev.map((r) => (r.id === lead.id && r.source === lead.source ? { ...r, status: "sending" } : r)));
      const replyTo = emailCfg?.email_reply_to || undefined;
      let sentOk = false;
      let messageId: string | null = null;
      try {
        const { data, error } = await supabase.functions.invoke("unipile-send", {
          body: {
            channel: "email",
            to: lead.email,
            subject: lead.preview_subject,
            html: lead.preview_html,
            text: lead.preview_text,
            from_name: emailCfg?.email_from_name || branding.company_name,
            reply_to: replyTo,
            recipient_name: lead.nome_contato ?? lead.nome_empresa,
            source: lead.source,
            source_id: lead.id,
          },
        });
        if (error || !data?.success) throw new Error(error?.message ?? data?.error ?? "Falha desconhecida");
        sentOk = true;
        messageId = data?.message_id ?? null;
      } catch (e: any) {
        setRows((prev) => prev.map((r) => (r.id === lead.id && r.source === lead.source ? { ...r, status: "failed", error: String(e?.message ?? e).slice(0, 200) } : r)));
        fail++;
      }

      if (sentOk) {
        // Anti-duplicado: marca IMEDIATAMENTE o lead como disparado. Se as
        // gravações auxiliares (dispatch_queue) falharem, NÃO regride o status.
        try {
          await (supabase.from(lead.source) as any)
            .update({ email_disparo: "Sim", data_disparo: new Date().toISOString() })
            .eq("id", lead.id);
        } catch (e) {
          console.warn("update email_disparo falhou (não-bloqueante):", e);
        }
        try {
          const userId = (await supabase.auth.getUser()).data.user?.id;
          await supabase.from("dispatch_queue").insert({
            user_id: userId,
            source: lead.source,
            source_id: lead.id,
            channel: "email",
            nome_empresa: lead.nome_empresa,
            email: lead.email,
            subject: lead.preview_subject,
            html_body: lead.preview_html,
            mensagem: lead.preview_text ?? null,
            status: "sent",
            sent_at: new Date().toISOString(),
            provider_message_id: messageId,
          });
        } catch (e) {
          console.warn("dispatch_queue insert falhou (não-bloqueante):", e);
        }
        setRows((prev) => prev.map((r) => (r.id === lead.id && r.source === lead.source ? { ...r, status: "sent", email_disparo: "Sim" } : r)));
        ok++;
      }
      if (delaySec > 0) await new Promise((r) => setTimeout(r, delaySec * 1000));
    }
    setSending(false);
    toast({ title: `Envio concluído`, description: `${ok} enviados · ${fail} falhas` });
  }

  return (
    <div className="container max-w-7xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Mail className="h-7 w-7 text-primary" /> Disparo por E-mail</h1>
          <p className="text-muted-foreground">Cold email consultivo com IA, enviado da sua conta Gmail/Outlook via Unipile.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Importar planilha/TXT
          </Button>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Recarregar"}
          </Button>
        </div>
      </div>

      <ImportLeadsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onDone={() => refetch()}
      />

      <Card>
        <CardHeader>
          <CardTitle>Pré-requisitos</CardTitle>
          <CardDescription>Conecte uma conta de e-mail (Gmail/Outlook/IMAP) no dashboard do Unipile usando a mesma API Key configurada em Configurações → APIs.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3 flex-wrap text-sm text-muted-foreground">
          <Badge variant="outline">Provider: Unipile</Badge>
          <Badge variant="outline">Remetente: sua conta real</Badge>
          <Badge variant="outline">Limites: do próprio Gmail/Outlook</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leads com e-mail ({rows.length})</CardTitle>
          <CardDescription>Selecione os leads, gere a prévia personalizada e dispare em sequência humanizada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <Label>Buscar</Label>
              <Input placeholder="nome, empresa, e-mail…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
            <div className="w-32">
              <Label>Delay (s)</Label>
              <Input type="number" min={0} max={300} value={delaySec} onChange={(e) => setDelaySec(Number(e.target.value) || 0)} />
            </div>
            <label className="flex items-center gap-2 text-sm pb-2">
              <Checkbox checked={onlyPending} onCheckedChange={(v) => setOnlyPending(Boolean(v))} />
              Só não disparados
            </label>
            <Button variant="outline" onClick={() => toggleAll(true)}>Selecionar todos</Button>
            <Button variant="ghost" onClick={() => toggleAll(false)}>Limpar</Button>
            <Button onClick={generatePreviews} disabled={generating || selected.length === 0}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Gerar prévia ({selected.length})
            </Button>
            <Button onClick={sendAll} disabled={sending || selected.length === 0}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar selecionados
            </Button>
          </div>

          <div className="border rounded-md divide-y max-h-[600px] overflow-auto">
            {filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">Nenhum lead com e-mail encontrado.</div>
            )}
            {filtered.map((lead) => (
              <div key={`${lead.source}:${lead.id}`} className="p-3 flex gap-3 items-start hover:bg-muted/30">
                <Checkbox checked={!!lead.selected} onCheckedChange={() => toggleOne(lead.id, lead.source)} className="mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{lead.nome_contato ? `${lead.nome_contato} · ${lead.nome_empresa}` : lead.nome_empresa}</span>
                    <Badge variant="secondary" className="text-xs">{lead.source.replace("_", " ")}</Badge>
                    {lead.email_disparo === "Sim" && <Badge variant="outline" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" /> enviado</Badge>}
                    {lead.status === "sending" && <Badge variant="outline" className="text-xs"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> enviando</Badge>}
                    {lead.status === "sent" && <Badge className="text-xs">enviado agora</Badge>}
                    {lead.status === "failed" && <Badge variant="destructive" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" /> erro</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{lead.email}{lead.cargo ? ` · ${lead.cargo}` : ""}</div>
                  {lead.preview_subject && (
                    <div className="mt-2 space-y-1">
                      <Input
                        value={lead.preview_subject}
                        onChange={(e) => setRows((prev) => prev.map((r) => (r.id === lead.id && r.source === lead.source ? { ...r, preview_subject: e.target.value } : r)))}
                        className="text-sm font-medium"
                      />
                      <Textarea
                        value={lead.preview_html ?? ""}
                        onChange={(e) => setRows((prev) => prev.map((r) => (r.id === lead.id && r.source === lead.source ? { ...r, preview_html: e.target.value } : r)))}
                        rows={5}
                        className="text-xs font-mono"
                      />
                    </div>
                  )}
                  {lead.error && <div className="text-xs text-destructive mt-1">{lead.error}</div>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
