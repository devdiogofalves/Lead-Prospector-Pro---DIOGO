import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Instagram, Sparkles, Send, Loader2, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

type Row = {
  id: string;
  username: string;
  provider_id: string | null;
  nome: string | null;
  bio: string | null;
  dm_disparo: string | null;
  preview?: string;
  selected?: boolean;
  status?: "idle" | "sending" | "sent" | "failed";
  error?: string;
};

async function loadContacts(): Promise<Row[]> {
  const { data } = await supabase
    .from("instagram_contacts")
    .select("id,username,provider_id,nome,bio,dm_disparo")
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []) as any;
}

export default function DisparoInstagram() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [onlyPending, setOnlyPending] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [delaySec, setDelaySec] = useState(45);
  const [igConnected, setIgConnected] = useState<boolean | null>(null);

  const { data, refetch, isFetching } = useQuery({ queryKey: ["ig-dm-leads"], queryFn: loadContacts });
  useEffect(() => { if (data) setRows(data.map((r) => ({ ...r, selected: false, status: "idle" }))); }, [data]);
  useEffect(() => {
    (async () => {
      const { data: row } = await supabase
        .from("user_api_keys").select("extra").eq("provider", "unipile").maybeSingle();
      const extra = (row?.extra ?? {}) as any;
      setIgConnected(!!extra.account_id_instagram);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyPending && r.dm_disparo === "Sim") return false;
      if (!q) return true;
      return (r.username + " " + (r.nome ?? "") + " " + (r.bio ?? "")).toLowerCase().includes(q);
    });
  }, [rows, filter, onlyPending]);
  const selected = filtered.filter((r) => r.selected);

  const toggleAll = (v: boolean) =>
    setRows((p) => p.map((r) => (filtered.find((f) => f.id === r.id) ? { ...r, selected: v } : r)));
  const toggleOne = (id: string) =>
    setRows((p) => p.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));

  async function connectInstagram() {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("unipile-connect-link", {
        body: { provider: "INSTAGRAM" },
      });
      if (error || !data?.url) throw new Error(data?.error || error?.message || "Falha ao gerar link");
      const w = window.open(data.url, "unipile_instagram", "width=520,height=720");
      if (!w) throw new Error("Popup bloqueado pelo navegador");
      const timer = window.setInterval(() => {
        if (w.closed) {
          window.clearInterval(timer);
          setConnecting(false);
          toast({ title: "Conexão finalizada", description: "Tente enviar novamente após a conta aparecer no Unipile." });
        }
      }, 800);
    } catch (e: any) {
      toast({ title: "Erro ao conectar Instagram", description: String(e?.message ?? e), variant: "destructive" });
      setConnecting(false);
    }
  }

  async function generate() {
    if (selected.length === 0) return toast({ title: "Selecione pelo menos 1 lead", variant: "destructive" });
    setGenerating(true);
    try {
      const batch = selected.slice(0, 20).map((l) => ({
        id: l.id,
        nome_empresa: l.nome ?? l.username,
        handle: l.username,
        bio: l.bio,
      }));
      const { data, error } = await supabase.functions.invoke("dm-ai-message", {
        body: { channel: "instagram", leads: batch },
      });
      if (error) throw error;
      const items: any[] = data?.items ?? [];
      setRows((p) => p.map((r) => {
        const it = items.find((i) => i.id === r.id);
        if (!it) return r;
        if (it.error) return { ...r, error: it.error };
        return { ...r, preview: it.text, error: undefined };
      }));
      toast({ title: `Prévia gerada para ${items.length} contatos` });
    } catch (e: any) {
      toast({ title: "Erro ao gerar", description: String(e?.message ?? e), variant: "destructive" });
    } finally { setGenerating(false); }
  }

  async function sendAll() {
    const ready = selected.filter((l) => l.preview);
    if (ready.length === 0) return toast({ title: "Gere a prévia antes", variant: "destructive" });
    setSending(true);
    let ok = 0, fail = 0;
    const userId = (await supabase.auth.getUser()).data.user?.id;
    for (const lead of ready) {
      setRows((p) => p.map((r) => (r.id === lead.id ? { ...r, status: "sending" } : r)));
      try {
        const { data, error } = await supabase.functions.invoke("unipile-send", {
          body: {
            channel: "instagram",
            attendees_ids: [lead.provider_id || lead.username],
            text: lead.preview,
            recipient_name: lead.nome ?? lead.username,
            source: "instagram_contacts",
            source_id: lead.id,
          },
        });
        if (data?.needs_connection) {
          const msg = String(data.error ?? "Conecte uma conta Instagram no Unipile.");
          setRows((p) => p.map((r) => (r.id === lead.id ? { ...r, status: "failed", error: msg } : r)));
          toast({ title: "Instagram não conectado", description: msg, variant: "destructive" });
          setSending(false);
          return;
        }
        if (error || !data?.success) {
          const errMsg = String(error?.message ?? data?.error ?? "Falha");
          if (/user_unreachable|Recipient unreachable|does not allow incoming/i.test(errMsg)) {
            const msg = "Não encontrei a thread existente; sincronize o inbox ou aguarde uma nova DM do lead.";
            setRows((p) => p.map((r) => (r.id === lead.id ? { ...r, status: "failed", error: msg } : r)));
            fail++;
            if (delaySec > 0) await new Promise((r) => setTimeout(r, delaySec * 1000));
            continue;
          }
          throw new Error(errMsg);
        }
        await supabase.from("dispatch_queue").insert({
          user_id: userId, source: "instagram_contacts", source_id: lead.id, channel: "instagram",
          nome_empresa: lead.nome ?? lead.username, mensagem: lead.preview,
          status: "sent", sent_at: new Date().toISOString(),
          provider_message_id: data?.message_id ?? null,
          chat_id: data?.chat_id ?? null,
          unipile_chat_id: data?.chat_id ?? null,
        });
        await supabase.from("instagram_contacts").update({
          dm_disparo: "Sim", dm_data_disparo: new Date().toISOString(),
        }).eq("id", lead.id);
        setRows((p) => p.map((r) => (r.id === lead.id ? { ...r, status: "sent", dm_disparo: "Sim" } : r)));
        ok++;
      } catch (e: any) {
        setRows((p) => p.map((r) => (r.id === lead.id ? { ...r, status: "failed", error: String(e?.message ?? e).slice(0, 200) } : r)));
        fail++;
      }
      if (delaySec > 0) await new Promise((r) => setTimeout(r, delaySec * 1000));
    }
    setSending(false);
    toast({ title: "Envio concluído", description: `${ok} enviados · ${fail} falhas` });
  }

  return (
    <div className="container max-w-7xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Instagram className="h-7 w-7 text-primary" /> Disparo Instagram DM</h1>
          <p className="text-muted-foreground">DM personalizada via Unipile. Leads sem telefone também entram aqui normalmente.</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Recarregar"}
        </Button>
      </div>

      {igConnected === false && (
        <Card>
          <CardHeader>
            <CardTitle>Pré-requisitos</CardTitle>
            <CardDescription>Conecte uma conta <b>Instagram</b> no Unipile usando a mesma API Key configurada em Configurações → APIs. Use delay alto (≥45s) para não disparar limites.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={connectInstagram} disabled={connecting}>
              {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
              Conectar Instagram
            </Button>
          </CardContent>
        </Card>
      )}
      {igConnected === true && (
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Conta Instagram conectada via Unipile.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Contatos Instagram ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <Label>Buscar</Label>
              <Input placeholder="username, nome, bio…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
            <div className="w-32">
              <Label>Delay (s)</Label>
              <Input type="number" min={0} max={600} value={delaySec} onChange={(e) => setDelaySec(Number(e.target.value) || 0)} />
            </div>
            <label className="flex items-center gap-2 text-sm pb-2">
              <Checkbox checked={onlyPending} onCheckedChange={(v) => setOnlyPending(Boolean(v))} /> Só não disparados
            </label>
            <Button variant="outline" onClick={() => toggleAll(true)}>Selecionar todos</Button>
            <Button variant="ghost" onClick={() => toggleAll(false)}>Limpar</Button>
            <Button onClick={generate} disabled={generating || selected.length === 0}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Gerar prévia ({selected.length})
            </Button>
            <Button onClick={sendAll} disabled={sending || selected.length === 0}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar selecionados
            </Button>
          </div>

          <div className="border rounded-md divide-y max-h-[600px] overflow-auto">
            {filtered.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhum contato.</div>}
            {filtered.map((lead) => (
              <div key={lead.id} className="p-3 flex gap-3 items-start hover:bg-muted/30">
                <Checkbox checked={!!lead.selected} onCheckedChange={() => toggleOne(lead.id)} className="mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">@{lead.username}</span>
                    {lead.nome && <span className="text-sm text-muted-foreground truncate">· {lead.nome}</span>}
                    {!lead.provider_id && <Badge variant="outline" className="text-xs">resolver por username</Badge>}
                    {lead.dm_disparo === "Sim" && <Badge variant="outline" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" /> enviado</Badge>}
                    {lead.status === "sending" && <Badge variant="outline" className="text-xs"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> enviando</Badge>}
                    {lead.status === "sent" && <Badge className="text-xs">enviado agora</Badge>}
                    {lead.status === "failed" && <Badge variant="destructive" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" /> erro</Badge>}
                  </div>
                  {lead.bio && <div className="text-xs text-muted-foreground line-clamp-1">{lead.bio}</div>}
                  {lead.preview && (
                    <Textarea
                      value={lead.preview}
                      onChange={(e) => setRows((p) => p.map((r) => (r.id === lead.id ? { ...r, preview: e.target.value } : r)))}
                      rows={4}
                      className="mt-2 text-xs"
                    />
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
