import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Send, Loader2, AlertTriangle, CheckCircle2, Plus, Sparkles, Users, Download, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { TelegramBotCard } from "@/components/disparo/TelegramBotCard";

type Row = {
  id: string;
  identifier: string;
  display_name: string | null;
  last_message: string | null;
  status: string;
  last_error: string | null;
  preview?: string;
  selected?: boolean;
  ui_status?: "idle" | "sending" | "sent" | "failed";
};

async function loadRecipients(): Promise<Row[]> {
  const { data } = await supabase
    .from("telegram_recipients")
    .select("id,identifier,display_name,last_message,status,last_error")
    .order("created_at", { ascending: false });
  return (data ?? []) as any;
}

export default function DisparoTelegram() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [delaySec, setDelaySec] = useState(30);
  const [bulk, setBulk] = useState("");
  const [genCtx, setGenCtx] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [tgConnected, setTgConnected] = useState<boolean | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSel, setMemberSel] = useState<Record<string, boolean>>({});
  const [importing, setImporting] = useState(false);

  async function loadGroups() {
    setLoadingGroups(true);
    try {
      const { data, error } = await supabase.functions.invoke("unipile-telegram-groups", { body: { action: "list_chats" } });
      if (error || !data?.success) throw new Error(error?.message ?? data?.error ?? "Falha");
      setGroups(data.items ?? []);
      if ((data.items ?? []).length === 0) toast({ title: "Nenhum grupo/canal encontrado" });
    } catch (e: any) {
      toast({ title: "Erro ao listar grupos", description: String(e?.message ?? e), variant: "destructive" });
    } finally { setLoadingGroups(false); }
  }

  async function loadMembers(chatId: string) {
    setActiveGroupId(chatId);
    setMembers([]);
    setMemberSel({});
    setLoadingMembers(true);
    try {
      const { data, error } = await supabase.functions.invoke("unipile-telegram-groups", { body: { action: "list_members", chat_id: chatId } });
      if (error || !data?.success) throw new Error(error?.message ?? data?.error ?? "Falha");
      setMembers(data.items ?? []);
      const sel: Record<string, boolean> = {};
      (data.items ?? []).forEach((m: any) => { sel[m.provider_id] = true; });
      setMemberSel(sel);
    } catch (e: any) {
      toast({ title: "Erro ao listar membros", description: String(e?.message ?? e), variant: "destructive" });
    } finally { setLoadingMembers(false); }
  }

  async function importSelected() {
    const chosen = members.filter((m) => memberSel[m.provider_id]);
    if (chosen.length === 0) return toast({ title: "Selecione ao menos 1 membro", variant: "destructive" });
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("unipile-telegram-groups", {
        body: { action: "import_members", chat_id: activeGroupId, members: chosen },
      });
      if (error || !data?.success) throw new Error(error?.message ?? data?.error ?? "Falha");
      toast({ title: `${data.imported} destinatários importados` });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro ao importar", description: String(e?.message ?? e), variant: "destructive" });
    } finally { setImporting(false); }
  }

  const { data, refetch, isFetching } = useQuery({ queryKey: ["tg-recipients"], queryFn: loadRecipients });
  useEffect(() => { if (data) setRows(data.map((r) => ({ ...r, selected: false, ui_status: "idle" }))); }, [data]);
  useEffect(() => {
    (async () => {
      const { data: row } = await supabase
        .from("user_api_keys").select("extra").eq("provider", "unipile").maybeSingle();
      const extra = (row?.extra ?? {}) as any;
      setTgConnected(!!extra.account_id_telegram);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.identifier + " " + (r.display_name ?? "")).toLowerCase().includes(q));
  }, [rows, filter]);
  const selected = filtered.filter((r) => r.selected);

  async function addBulk() {
    const lines = bulk.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const rows = lines.map((identifier) => ({ identifier, user_id: userId }));
    const { error } = await supabase.from("telegram_recipients").upsert(rows, { onConflict: "user_id,identifier" });
    if (error) toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
    else { toast({ title: `${lines.length} destinatários adicionados` }); setBulk(""); refetch(); }
  }

  async function generate() {
    if (selected.length === 0) return toast({ title: "Selecione pelo menos 1", variant: "destructive" });
    setGenerating(true);
    try {
      const batch = selected.slice(0, 20).map((l) => ({
        id: l.id,
        handle: l.identifier,
        nome_empresa: l.display_name ?? l.identifier,
        bio: genCtx || undefined,
      }));
      const { data, error } = await supabase.functions.invoke("dm-ai-message", {
        body: { channel: "telegram", leads: batch },
      });
      if (error) throw error;
      const items: any[] = data?.items ?? [];
      setRows((p) => p.map((r) => {
        const it = items.find((i) => i.id === r.id);
        return it && !it.error ? { ...r, preview: it.text } : r;
      }));
      toast({ title: `Prévia gerada para ${items.length}` });
    } catch (e: any) {
      toast({ title: "Erro IA", description: String(e?.message ?? e), variant: "destructive" });
    } finally { setGenerating(false); }
  }

  async function sendAll() {
    const ready = selected.filter((l) => l.preview);
    if (ready.length === 0) return toast({ title: "Gere a prévia antes", variant: "destructive" });
    setSending(true);
    let ok = 0, fail = 0;
    const userId = (await supabase.auth.getUser()).data.user?.id;
    for (const lead of ready) {
      setRows((p) => p.map((r) => (r.id === lead.id ? { ...r, ui_status: "sending" } : r)));
      try {
        const { data, error } = await supabase.functions.invoke("unipile-send", {
          body: {
            channel: "telegram",
            attendees_ids: [lead.identifier],
            text: lead.preview,
            recipient_name: lead.display_name ?? lead.identifier,
            source: "telegram_recipients",
            source_id: lead.id,
          },
        });
        if (error || !data?.success) throw new Error(error?.message ?? data?.error ?? "Falha");
        await supabase.from("dispatch_queue").insert({
          user_id: userId, source: "telegram_recipients", source_id: lead.id, channel: "telegram",
          nome_empresa: lead.display_name ?? lead.identifier, mensagem: lead.preview,
          status: "sent", sent_at: new Date().toISOString(),
          provider_message_id: data?.message_id ?? null,
        });
        await supabase.from("telegram_recipients").update({
          status: "sent", last_message: lead.preview, last_error: null,
          provider_chat_id: data?.chat_id ?? null,
        }).eq("id", lead.id);
        setRows((p) => p.map((r) => (r.id === lead.id ? { ...r, ui_status: "sent", status: "sent" } : r)));
        ok++;
      } catch (e: any) {
        const msg = String(e?.message ?? e).slice(0, 200);
        await supabase.from("telegram_recipients").update({ status: "failed", last_error: msg }).eq("id", lead.id);
        setRows((p) => p.map((r) => (r.id === lead.id ? { ...r, ui_status: "failed", last_error: msg } : r)));
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
          <h1 className="text-3xl font-bold flex items-center gap-2"><Send className="h-7 w-7 text-primary" /> Disparo Telegram</h1>
          <p className="text-muted-foreground">Envia DMs no Telegram via Unipile (sua conta pessoal, sem bot).</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Recarregar"}
        </Button>
      </div>

      {tgConnected === false && (
        <Card>
          <CardHeader>
            <CardTitle>Pré-requisitos</CardTitle>
            <CardDescription>Conecte uma conta <b>Telegram</b> no dashboard do Unipile (QR Code). Os destinatários podem ser @username ou telefone com DDI (+5511…).</CardDescription>
          </CardHeader>
        </Card>
      )}
      {tgConnected === true && (
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Conta Telegram conectada via Unipile.
        </div>
      )}

      <TelegramBotCard />

      <Card>
        <CardHeader>
          <CardTitle>Adicionar destinatários</CardTitle>
          <CardDescription>Cole 1 por linha. Aceita @username ou telefone (+55…).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea rows={4} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="@fulano&#10;+5511999999999&#10;@beltrano" />
          <Button onClick={addBulk}><Plus className="h-4 w-4 mr-2" /> Adicionar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Grupos & Canais</CardTitle>
              <CardDescription>Liste os grupos/canais da sua conta Telegram e importe membros como destinatários.</CardDescription>
            </div>
            <Button variant="outline" onClick={loadGroups} disabled={loadingGroups || tgConnected !== true}>
              {loadingGroups ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Buscar grupos
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {groups.length === 0 && !loadingGroups && (
            <p className="text-sm text-muted-foreground">Nenhum grupo carregado. Clique em "Buscar grupos".</p>
          )}
          {groups.length > 0 && (
            <div className="grid md:grid-cols-2 gap-2 max-h-[300px] overflow-auto">
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => loadMembers(g.id)}
                  className={`text-left border rounded-md p-3 hover:bg-muted/40 transition ${activeGroupId === g.id ? "border-primary bg-muted/30" : ""}`}
                >
                  <div className="font-medium text-sm truncate">{g.name}</div>
                  <div className="text-xs text-muted-foreground flex gap-2 mt-1">
                    {g.attendees_count != null && <span>{g.attendees_count} membros</span>}
                    {g.unread > 0 && <Badge variant="secondary" className="text-xs">{g.unread} não lidas</Badge>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {activeGroupId && (
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm font-medium">
                  Membros {loadingMembers ? "(carregando…)" : `(${members.length})`}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => {
                    const all = members.every((m) => memberSel[m.provider_id]);
                    const next: Record<string, boolean> = {};
                    members.forEach((m) => { next[m.provider_id] = !all; });
                    setMemberSel(next);
                  }}>
                    {members.every((m) => memberSel[m.provider_id]) ? "Desmarcar todos" : "Marcar todos"}
                  </Button>
                  <Button size="sm" onClick={importSelected} disabled={importing || members.length === 0}>
                    {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                    Importar selecionados
                  </Button>
                </div>
              </div>
              <div className="border rounded-md divide-y max-h-[320px] overflow-auto">
                {members.map((m) => (
                  <label key={m.provider_id} className="flex items-center gap-3 p-2 hover:bg-muted/30 cursor-pointer">
                    <Checkbox
                      checked={!!memberSel[m.provider_id]}
                      onCheckedChange={(v) => setMemberSel((p) => ({ ...p, [m.provider_id]: !!v }))}
                    />
                    <div className="flex-1 min-w-0 text-sm">
                      <span className="font-medium">{m.name ?? "(sem nome)"}</span>
                      {m.username && <span className="text-muted-foreground ml-2">@{m.username}</span>}
                    </div>
                  </label>
                ))}
                {!loadingMembers && members.length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground text-center">Nenhum membro retornado.</div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Dica: o Telegram só permite DM direto para quem tem @username público. Membros sem username podem falhar no envio.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Destinatários ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <Label>Buscar</Label>
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="username, nome…" />
            </div>
            <div className="w-32">
              <Label>Delay (s)</Label>
              <Input type="number" min={0} max={600} value={delaySec} onChange={(e) => setDelaySec(Number(e.target.value) || 0)} />
            </div>
            <div className="flex-1 min-w-[260px]">
              <Label>Contexto p/ IA (opcional)</Label>
              <Input value={genCtx} onChange={(e) => setGenCtx(e.target.value)} placeholder="Ex: prospect de academias…" />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setRows((p) => p.map((r) => filtered.find((f) => f.id === r.id) ? { ...r, selected: true } : r))}>Selecionar todos</Button>
            <Button variant="ghost" onClick={() => setRows((p) => p.map((r) => ({ ...r, selected: false })))}>Limpar</Button>
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
            {filtered.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhum destinatário.</div>}
            {filtered.map((lead) => (
              <div key={lead.id} className="p-3 flex gap-3 items-start hover:bg-muted/30">
                <Checkbox checked={!!lead.selected} onCheckedChange={() => setRows((p) => p.map((r) => r.id === lead.id ? { ...r, selected: !r.selected } : r))} className="mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{lead.identifier}</span>
                    {lead.display_name && <span className="text-sm text-muted-foreground">· {lead.display_name}</span>}
                    {lead.status === "sent" && <Badge variant="outline" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" /> enviado</Badge>}
                    {lead.ui_status === "sending" && <Badge variant="outline" className="text-xs"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> enviando</Badge>}
                    {lead.ui_status === "failed" && <Badge variant="destructive" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" /> erro</Badge>}
                  </div>
                  {lead.preview && (
                    <Textarea
                      value={lead.preview}
                      onChange={(e) => setRows((p) => p.map((r) => r.id === lead.id ? { ...r, preview: e.target.value } : r))}
                      rows={4}
                      className="mt-2 text-xs"
                    />
                  )}
                  {lead.last_error && <div className="text-xs text-destructive mt-1">{lead.last_error}</div>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
