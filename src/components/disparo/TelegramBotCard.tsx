import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, Save, Send, Plus, Trash2, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Btn = { text: string; url?: string; callback_data?: string };

export function TelegramBotCard() {
  const [connected, setConnected] = useState<null | boolean>(null);
  const [botInfo, setBotInfo] = useState<any>(null);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [chatId, setChatId] = useState("");
  const [text, setText] = useState("Olá! Posso te mostrar como aumentamos resposta de cold outreach?");
  const [rows, setRows] = useState<Btn[][]>([[{ text: "👍 Tenho interesse", url: "https://leadsbooster.com.br" }, { text: "🙅 Agora não", callback_data: "no" }]]);
  const [sending, setSending] = useState(false);
  const [chats, setChats] = useState<any[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);

  async function refreshStatus() {
    const { data } = await supabase.functions.invoke("telegram-bot-send", { body: { action: "get_status" } });
    setConnected(!!data?.connected);
    setBotInfo(data?.bot ?? null);
  }
  useEffect(() => { refreshStatus(); }, []);

  async function save() {
    if (!token.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("telegram-bot-send", { body: { action: "save_token", bot_token: token.trim() } });
    setSaving(false);
    if (error || !data?.success) {
      toast({ title: "Token inválido", description: data?.error ?? error?.message ?? "", variant: "destructive" });
      return;
    }
    toast({ title: "Bot conectado", description: `@${data.bot?.username}` });
    setToken("");
    refreshStatus();
  }

  async function loadChats() {
    setLoadingChats(true);
    const { data, error } = await supabase.functions.invoke("telegram-bot-send", { body: { action: "list_updates" } });
    setLoadingChats(false);
    if (error || !data?.success) {
      toast({ title: "Erro", description: data?.error ?? error?.message ?? "", variant: "destructive" });
      return;
    }
    setChats(data.chats ?? []);
    if ((data.chats ?? []).length === 0) toast({ title: "Nenhuma conversa", description: "Peça pra alguém mandar /start pro seu bot primeiro." });
  }

  async function send() {
    if (!chatId.trim() || !text.trim()) {
      toast({ title: "Preencha chat_id e mensagem", variant: "destructive" });
      return;
    }
    setSending(true);
    const buttons = rows
      .map((r) => r.filter((b) => b.text.trim() && (b.url?.trim() || b.callback_data?.trim())))
      .filter((r) => r.length > 0);
    const { data, error } = await supabase.functions.invoke("telegram-bot-send", {
      body: { action: "send", chat_id: chatId.trim(), text: text.trim(), buttons },
    });
    setSending(false);
    if (error || !data?.success) {
      toast({ title: "Falha", description: data?.error ?? error?.message ?? "", variant: "destructive" });
      return;
    }
    toast({ title: "Enviado!", description: `message_id ${data.message_id}` });
  }

  function updateBtn(ri: number, bi: number, patch: Partial<Btn>) {
    setRows((p) => p.map((row, i) => i !== ri ? row : row.map((b, j) => j !== bi ? b : { ...b, ...patch })));
  }
  function addBtn(ri: number) { setRows((p) => p.map((r, i) => i !== ri ? r : [...r, { text: "", url: "" }])); }
  function delBtn(ri: number, bi: number) { setRows((p) => p.map((r, i) => i !== ri ? r : r.filter((_, j) => j !== bi))); }
  function addRow() { setRows((p) => [...p, [{ text: "", url: "" }]]); }
  function delRow(ri: number) { setRows((p) => p.filter((_, i) => i !== ri)); }

  return (
    <Card className="border-cyan-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-cyan-400" /> Bot do Telegram (com botões inline)
          {connected && <Badge variant="outline" className="text-xs text-emerald-400"><CheckCircle2 className="h-3 w-3 mr-1" /> @{botInfo?.username}</Badge>}
        </CardTitle>
        <CardDescription>
          Botões inline só funcionam via Bot API. Crie um bot no <b>@BotFather</b>, cole o token aqui, e envie pra quem já deu /start nele.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!connected && (
          <div className="space-y-2">
            <Label>Token do bot (BotFather)</Label>
            <div className="flex gap-2">
              <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AAH..." />
              <Button onClick={save} disabled={saving || !token.trim()}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Conectar
              </Button>
            </div>
          </div>
        )}

        {connected && (
          <>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label>chat_id (numérico)</Label>
                <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="Ex: 123456789 ou -1002000000000 (grupo)" />
              </div>
              <Button variant="outline" onClick={loadChats} disabled={loadingChats}>
                {loadingChats ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />} Quem deu /start
              </Button>
            </div>

            {chats.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {chats.map((c) => (
                  <Button key={c.chat_id} size="sm" variant="outline" onClick={() => setChatId(String(c.chat_id))}>
                    {c.title || c.username || c.chat_id} <span className="ml-2 text-muted-foreground text-xs">{c.chat_id}</span>
                  </Button>
                ))}
              </div>
            )}

            <div>
              <Label>Mensagem</Label>
              <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Botões inline (cada linha = uma fileira)</Label>
                <Button size="sm" variant="ghost" onClick={addRow}><Plus className="h-4 w-4 mr-1" /> Nova fileira</Button>
              </div>
              {rows.map((row, ri) => (
                <div key={ri} className="border rounded-md p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Fileira {ri + 1}</span>
                    <Button size="sm" variant="ghost" onClick={() => delRow(ri)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                  {row.map((b, bi) => (
                    <div key={bi} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2">
                      <Input placeholder="Texto" value={b.text} onChange={(e) => updateBtn(ri, bi, { text: e.target.value })} />
                      <Input
                        placeholder="https://link.com   (ou callback:meu_id)"
                        value={b.url ?? (b.callback_data ? `callback:${b.callback_data}` : "")}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v.startsWith("callback:")) updateBtn(ri, bi, { url: undefined, callback_data: v.slice(9) });
                          else updateBtn(ri, bi, { url: v, callback_data: undefined });
                        }}
                      />
                      <Button size="sm" variant="ghost" onClick={() => delBtn(ri, bi)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => addBtn(ri)}><Plus className="h-3 w-3 mr-1" /> + botão na fileira</Button>
                </div>
              ))}
            </div>

            <Button onClick={send} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Enviar com botões
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
