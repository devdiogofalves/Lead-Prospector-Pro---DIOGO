import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBranding } from "@/hooks/useBranding";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Paperclip,
  Send,
  LifeBuoy,
  FileText,
  X,
  Loader2,
  User as UserIcon,
  Headset,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Attachment = { url: string; name: string; type: string; size: number };
type Msg = {
  id: string;
  user_id: string;
  sender_id: string;
  sender_role: "user" | "admin";
  content: string | null;
  attachments: Attachment[];
  created_at: string;
  read_by_user: boolean;
};

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";
const MAX_MB = 10;

export default function Suporte() {
  const { user } = useAuth();
  const { branding } = useBranding();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const load = async () => {
      const { data } = await supabase
        .from("support_messages")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (!active) return;
      setMessages((data as any) ?? []);
      setLoading(false);
      await supabase
        .from("support_messages")
        .update({ read_by_user: true })
        .eq("user_id", user.id)
        .eq("sender_role", "admin")
        .eq("read_by_user", false);
    };
    load();

    const ch = supabase
      .channel("support-thread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setMessages((cur) => [...cur, payload.new as any]);
          if ((payload.new as any).sender_role === "admin") {
            supabase
              .from("support_messages")
              .update({ read_by_user: true })
              .eq("id", (payload.new as any).id);
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list).filter((f) => {
      if (f.size > MAX_MB * 1024 * 1024) {
        toast({ title: `Arquivo grande demais: ${f.name}`, description: `Máx ${MAX_MB}MB`, variant: "destructive" });
        return false;
      }
      return true;
    });
    setFiles((cur) => [...cur, ...arr].slice(0, 5));
  };

  const removeFile = (i: number) => setFiles((cur) => cur.filter((_, idx) => idx !== i));

  const send = async () => {
    if (!user || sending) return;
    if (!text.trim() && files.length === 0) return;
    setSending(true);
    try {
      const uploaded: Attachment[] = [];
      for (const f of files) {
        const path = `${user.id}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
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
        user_id: user.id,
        sender_id: user.id,
        sender_role: "user",
        content: text.trim() || null,
        attachments: uploaded,
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

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imgs: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) imgs.push(f);
      }
    }
    if (imgs.length) {
      e.preventDefault();
      onPickFiles({ length: imgs.length, item: (i) => imgs[i], ...imgs } as any);
    }
  };

  const supportName = `Suporte ${branding.company_name}`;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg gradient-primary flex items-center justify-center">
          <LifeBuoy className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold">Suporte</h1>
          <p className="text-sm text-muted-foreground">
            Canal direto com o time de suporte. Envie prints, PDFs ou mensagens — respondemos por aqui.
          </p>
        </div>
      </div>

      <Card className="flex flex-col h-[calc(100vh-260px)] min-h-[480px]">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse-soft" />
            {supportName}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-2">
              <LifeBuoy className="h-8 w-8 opacity-50" />
              <p>Nenhuma mensagem ainda. Mande seu primeiro print ou dúvida.</p>
            </div>
          ) : (
            messages.map((m) => {
              const isMe = m.sender_role === "user";
              return (
                <div
                  key={m.id}
                  className={cn("flex gap-2 items-end", isMe ? "justify-end" : "justify-start")}
                >
                  {!isMe && (
                    <div className="h-8 w-8 shrink-0 rounded-full gradient-primary flex items-center justify-center ring-2 ring-primary/40">
                      <Headset className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-4 py-2 space-y-2 border",
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-sm border-primary"
                        : "bg-card text-foreground rounded-bl-sm border-primary/30 shadow-sm"
                    )}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide",
                        isMe ? "justify-end opacity-80" : "text-primary"
                      )}
                    >
                      {isMe ? (
                        <>
                          Você <UserIcon className="h-3 w-3" />
                        </>
                      ) : (
                        <>
                          <Headset className="h-3 w-3" /> {supportName}
                        </>
                      )}
                    </div>
                    {m.content && <p className="whitespace-pre-wrap text-sm">{m.content}</p>}
                    {m.attachments?.length > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        {m.attachments.map((a, i) =>
                          a.type.startsWith("image/") ? (
                            <a key={i} href={a.url} target="_blank" rel="noreferrer">
                              <img
                                src={a.url}
                                alt={a.name}
                                className="rounded-lg max-h-48 object-cover w-full hover:opacity-90 transition"
                              />
                            </a>
                          ) : (
                            <a
                              key={i}
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 rounded-lg bg-background/30 p-2 text-xs hover:bg-background/50"
                            >
                              <FileText className="h-4 w-4 shrink-0" />
                              <span className="truncate">{a.name}</span>
                            </a>
                          )
                        )}
                      </div>
                    )}
                    <p className="text-[10px] opacity-60 text-right">
                      {new Date(m.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit", })}
                    </p>
                  </div>
                  {isMe && (
                    <div className="h-8 w-8 shrink-0 rounded-full bg-primary/20 flex items-center justify-center ring-2 ring-primary/40">
                      <UserIcon className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </CardContent>

        <div className="border-t p-3 space-y-2">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs"
                >
                  <FileText className="h-3 w-3" />
                  <span className="max-w-[160px] truncate">{f.name}</span>
                  <button onClick={() => removeFile(i)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                onPickFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileRef.current?.click()}
              disabled={sending}
              title="Anexar"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Descreva sua dúvida ou cole um print (Enter envia, Shift+Enter quebra linha)…"
              rows={2}
              className="resize-none"
              disabled={sending}
            />
            <Button onClick={send} disabled={sending || (!text.trim() && files.length === 0)}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
