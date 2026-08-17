import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  LifeBuoy, Loader2, Send, Search, Headset, User as UserIcon,
  Paperclip, FileText, X, Inbox,
} from "lucide-react";

type Attachment = { url: string; name: string; type: string; size: number };
type Msg = {
  id: string;
  user_id: string;
  sender_id: string;
  sender_role: "user" | "admin";
  content: string | null;
  attachments: Attachment[];
  created_at: string;
  read_by_admin: boolean;
  read_by_user: boolean;
};

interface ClientLite {
  id: string;
  email: string;
  company_name: string;
  agent_name?: string;
  plan?: string;
  status?: string;
}

interface ConversationCard {
  user_id: string;
  last_message: Msg;
  unread: number;
  total: number;
  client?: ClientLite;
}

interface Props {
  clients: ClientLite[];
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";
const MAX_MB = 10;

export function SuporteAdminTab({ clients }: Props) {
  const { user } = useAuth();
  const [allMessages, setAllMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  // Carrega todas as mensagens (admin tem RLS para ver tudo)
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .order("created_at", { ascending: true });
      if (!active) return;
      if (error) {
        toast({ title: "Erro ao carregar mensagens", description: error.message, variant: "destructive" });
      }
      setAllMessages((data as any) ?? []);
      setLoading(false);
    };
    load();

    const ch = supabase
      .channel("admin-support-all")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_messages" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setAllMessages((cur) => [...cur, payload.new as any]);
          } else if (payload.eventType === "UPDATE") {
            setAllMessages((cur) => cur.map((m) => (m.id === (payload.new as any).id ? (payload.new as any) : m)));
          } else if (payload.eventType === "DELETE") {
            setAllMessages((cur) => cur.filter((m) => m.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, []);

  const clientsById = useMemo(() => {
    const map = new Map<string, ClientLite>();
    for (const c of clients) map.set(c.id, c);
    return map;
  }, [clients]);

  // Agrupa mensagens por user_id
  const conversations: ConversationCard[] = useMemo(() => {
    const byUser = new Map<string, Msg[]>();
    for (const m of allMessages) {
      if (!byUser.has(m.user_id)) byUser.set(m.user_id, []);
      byUser.get(m.user_id)!.push(m);
    }
    const list: ConversationCard[] = [];
    for (const [uid, msgs] of byUser.entries()) {
      const last = msgs[msgs.length - 1];
      const unread = msgs.filter((m) => m.sender_role === "user" && !m.read_by_admin).length;
      list.push({
        user_id: uid,
        last_message: last,
        unread,
        total: msgs.length,
        client: clientsById.get(uid),
      });
    }
    // Ordena: não lidas primeiro, depois mais recente
    list.sort((a, b) => {
      if (a.unread !== b.unread) return b.unread - a.unread;
      return new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime();
    });
    return list;
  }, [allMessages, clientsById]);

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.client?.company_name ?? "").toLowerCase().includes(q) ||
      (c.client?.email ?? "").toLowerCase().includes(q) ||
      (c.last_message.content ?? "").toLowerCase().includes(q)
    );
  });

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

  const openMessages = openUserId
    ? allMessages.filter((m) => m.user_id === openUserId)
    : [];

  // Marca como lido ao abrir modal
  useEffect(() => {
    if (!openUserId) return;
    const ids = allMessages
      .filter((m) => m.user_id === openUserId && m.sender_role === "user" && !m.read_by_admin)
      .map((m) => m.id);
    if (ids.length > 0) {
      supabase.from("support_messages").update({ read_by_admin: true }).in("id", ids).then();
    }
  }, [openUserId, allMessages]);

  return (
    <div className="space-y-4 mt-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center">
            <Inbox className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Mensagens dos clientes</h2>
            <p className="text-xs text-muted-foreground">
              {conversations.length} conversa(s)
              {totalUnread > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-red-400 font-semibold">
                  • {totalUnread} não lida(s)
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar empresa, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : conversations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground space-y-2">
            <LifeBuoy className="h-8 w-8 mx-auto opacity-50" />
            <p>Nenhum cliente enviou mensagem ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((conv) => {
            const isUnread = conv.unread > 0;
            return (
              <Card
                key={conv.user_id}
                onClick={() => setOpenUserId(conv.user_id)}
                className={cn(
                  "cursor-pointer transition hover:border-primary/50 hover:shadow-md",
                  isUnread && "border-red-500/40 bg-red-500/5"
                )}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">
                          {conv.client?.company_name ?? "Cliente desconhecido"}
                        </span>
                        {isUnread && (
                          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                            {conv.unread}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {conv.client?.email ?? conv.user_id.slice(0, 8)}
                      </p>
                    </div>
                    {conv.client?.plan && (
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {conv.client.plan}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground flex items-start gap-1.5">
                    {conv.last_message.sender_role === "admin" ? (
                      <Headset className="h-3 w-3 shrink-0 mt-0.5 text-primary" />
                    ) : (
                      <UserIcon className="h-3 w-3 shrink-0 mt-0.5" />
                    )}
                    <span className="line-clamp-2">
                      {conv.last_message.content ?? (conv.last_message.attachments?.length ? `📎 ${conv.last_message.attachments.length} anexo(s)` : "(vazio)")}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/50 pt-2">
                    <span>{conv.total} msg(s)</span>
                    <span>
                      {new Date(conv.last_message.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de chat */}
      <ChatModal
        open={openUserId !== null}
        onClose={() => setOpenUserId(null)}
        userId={openUserId}
        messages={openMessages}
        client={openUserId ? clientsById.get(openUserId) : undefined}
        adminId={user?.id ?? ""}
      />
    </div>
  );
}

// ───────────────────────── Modal de Chat ─────────────────────────

interface ChatModalProps {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  messages: Msg[];
  client?: ClientLite;
  adminId: string;
}

function ChatModal({ open, onClose, userId, messages, client, adminId }: ChatModalProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [open, messages.length]);

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list).filter((f) => {
      if (f.size > MAX_MB * 1024 * 1024) {
        toast({ title: `Arquivo grande: ${f.name}`, description: `Máx ${MAX_MB}MB`, variant: "destructive" });
        return false;
      }
      return true;
    });
    setFiles((cur) => [...cur, ...arr].slice(0, 5));
  };

  const send = async () => {
    if (!userId || !adminId || sending) return;
    if (!text.trim() && files.length === 0) return;
    setSending(true);
    try {
      const uploaded: Attachment[] = [];
      for (const f of files) {
        const path = `${userId}/admin-${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage
          .from("support-attachments")
          .upload(path, f, { cacheControl: "3600", upsert: false, contentType: f.type });
        if (upErr) throw upErr;
        // Bucket privado: signed URL de 1 ano.
        const { data: signed, error: signErr } = await supabase.storage
          .from("support-attachments").createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signErr || !signed?.signedUrl) throw signErr ?? new Error("Falha ao assinar URL");
        uploaded.push({ url: signed.signedUrl, name: f.name, type: f.type, size: f.size });
      }
      const { error } = await supabase.from("support_messages").insert({
        user_id: userId,
        sender_id: adminId,
        sender_role: "admin",
        content: text.trim() || null,
        attachments: uploaded,
        read_by_admin: true,
      });
      if (error) throw error;
      setText("");
      setFiles([]);
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
              <UserIcon className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate">{client?.company_name ?? "Cliente"}</div>
              <div className="text-[11px] font-normal text-muted-foreground truncate">
                {client?.email}
                {client?.plan && <span className="ml-2 uppercase">· {client.plan}</span>}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="h-[440px] overflow-y-auto p-4 space-y-3 bg-muted/20">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 text-sm">
              <LifeBuoy className="h-8 w-8 opacity-50" />
              <p>Nenhuma mensagem nesta conversa.</p>
            </div>
          ) : (
            messages.map((m) => {
              const isAdmin = m.sender_role === "admin";
              return (
                <div key={m.id} className={cn("flex gap-2 items-end", isAdmin ? "justify-end" : "justify-start")}>
                  {!isAdmin && (
                    <div className="h-7 w-7 shrink-0 rounded-full bg-muted flex items-center justify-center">
                      <UserIcon className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-3 py-2 space-y-1.5 border text-sm",
                      isAdmin
                        ? "bg-primary text-primary-foreground rounded-br-sm border-primary"
                        : "bg-card rounded-bl-sm border-border"
                    )}
                  >
                    {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
                    {m.attachments?.length > 0 && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {m.attachments.map((a, i) =>
                          a.type.startsWith("image/") ? (
                            <a key={i} href={a.url} target="_blank" rel="noreferrer">
                              <img src={a.url} alt={a.name} className="rounded-md max-h-40 object-cover w-full" />
                            </a>
                          ) : (
                            <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-md bg-background/30 p-1.5 text-[11px] hover:bg-background/50">
                              <FileText className="h-3 w-3 shrink-0" /><span className="truncate">{a.name}</span>
                            </a>
                          )
                        )}
                      </div>
                    )}
                    <p className="text-[10px] opacity-60 text-right">
                      {new Date(m.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="h-7 w-7 shrink-0 rounded-full bg-primary/20 flex items-center justify-center">
                      <Headset className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t p-3 space-y-2">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                  <FileText className="h-3 w-3" />
                  <span className="max-w-[140px] truncate">{f.name}</span>
                  <button onClick={() => setFiles((c) => c.filter((_, idx) => idx !== i))} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden"
              onChange={(e) => { onPickFiles(e.target.files); e.target.value = ""; }}
            />
            <Button variant="outline" size="icon" onClick={() => fileRef.current?.click()} disabled={sending}>
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Responder como suporte… (Enter envia)"
              rows={2}
              className="resize-none"
              disabled={sending}
            />
            <Button onClick={send} disabled={sending || (!text.trim() && files.length === 0)}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
