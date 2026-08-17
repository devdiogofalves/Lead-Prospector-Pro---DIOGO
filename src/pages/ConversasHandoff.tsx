
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search, MessageSquare, Loader2, Send, ArrowLeft,
  MoreVertical, CheckCheck, UserCheck, Bot, Trash2, Star,
  Instagram, Linkedin, Mail, RefreshCw,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useEffect, useRef, useCallback } from "react";
import { useConversations, useMessages, type ChannelFilter } from "@/hooks/useConversations";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ConversationSummary from "@/components/handoff/ConversationSummary";
import SchedulingTab from "@/components/handoff/SchedulingTab";
import { translateInvokeError } from "@/lib/friendlyError";
import { PageGuide } from "@/components/PageGuide";
import { useBranding } from "@/hooks/useBranding";
import { signStoredMediaUrl } from "@/lib/storageSign";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open:     { label: "Ativo",      variant: "default" },
  paused:   { label: "Pausado",    variant: "secondary" },
  closed:   { label: "Encerrado",  variant: "outline" },
  handoff:  { label: "Humano 👤",  variant: "destructive" },
};

const channelMeta: Record<string, { label: string; icon: any; color: string; emoji: string }> = {
  whatsapp:  { label: "WhatsApp",  icon: MessageSquare, color: "text-green-500",  emoji: "📱" },
  instagram: { label: "Instagram", icon: Instagram,     color: "text-pink-500",   emoji: "📷" },
  telegram:  { label: "Telegram",  icon: Send,          color: "text-sky-500",    emoji: "✈️" },
  linkedin:  { label: "LinkedIn",  icon: Linkedin,      color: "text-blue-500",   emoji: "💼" },
  messenger: { label: "Messenger", icon: MessageSquare, color: "text-blue-400",   emoji: "💬" },
  email:     { label: "E-mail",    icon: Mail,          color: "text-amber-500",  emoji: "✉️" },
};

function channelOf(conv: any): string {
  return (conv?.channel ?? "whatsapp") as string;
}

function formatConversationDate(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return "Ontem";
  return format(date, "dd/MM/yy");
}

function formatMessageTime(dateStr: string) {
  return format(new Date(dateStr), "HH:mm");
}

function getInitials(name: string) {
  return (name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function DateSeparator({ date }: { date: string }) {
  const d = new Date(date);
  const label = isToday(d) ? "Hoje" : isYesterday(d) ? "Ontem" : format(d, "dd 'de' MMMM", { locale: ptBR });
  return (
    <div className="flex items-center justify-center my-4">
      <span className="bg-muted text-muted-foreground text-[11px] px-3 py-1 rounded-full">{label}</span>
    </div>
  );
}

function MessageBubble({ msg, agentName }: { msg: any; agentName: string }) {
  const isUser  = msg.role === "user";
  const isAssistant = msg.role === "assistant";
  const hasAudio = !!msg.audio_url;
  const audioLabel = isUser
    ? (msg.transcribed ? "🎤 Áudio do lead — transcrição automática:" : "🎤 Áudio do lead:")
    : "🔊 Áudio enviado pela IA — texto de referência:";
  const [audioSrc, setAudioSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!hasAudio) { setAudioSrc(null); return; }
    signStoredMediaUrl(msg.audio_url).then((u) => { if (!cancelled) setAudioSrc(u); });
    return () => { cancelled = true; };
  }, [hasAudio, msg.audio_url]);

  return (
    <div className={cn("flex mb-2", isUser ? "justify-start" : "justify-end")}>
      <div className={cn(
        "relative max-w-[75%] rounded-xl px-3 py-2 shadow-sm text-sm",
        isUser
          ? "bg-card border rounded-tl-none"
          : isAssistant
          ? "bg-primary text-primary-foreground rounded-tr-none"
          : "bg-secondary text-secondary-foreground rounded-tr-none"
      )}>
        {isAssistant && (
          <p className="text-[10px] font-semibold opacity-70 mb-0.5">🤖 {agentName}</p>
        )}
        {hasAudio && audioSrc && (
          <div className="mb-2 space-y-1">
            <p className="text-[10px] font-semibold opacity-75">{audioLabel}</p>
            <audio controls preload="none" src={audioSrc} className="w-full h-8 max-w-[280px]" />
          </div>
        )}
        {(msg.content || !hasAudio) && (
          <p className={cn(
            "whitespace-pre-wrap break-words leading-relaxed",
            hasAudio && "text-[13px] italic opacity-90 border-l-2 border-current/40 pl-2"
          )}>
            {msg.content || "..."}
          </p>
        )}
        <div className="flex items-center justify-end gap-1 mt-1 opacity-60">
          <span className="text-[10px]">{formatMessageTime(msg.created_at)}</span>
          {!isUser && <CheckCheck className="h-3 w-3" />}
        </div>
      </div>
    </div>
  );
}

export default function ConversasHandoff({ embedded = false }: { embedded?: boolean }) {
  const { branding } = useBranding();
  const agentName = branding.agent_name;
  const companyName = branding.company_name;
  const [search, setSearch]         = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending]       = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [resetOpen, setResetOpen]   = useState(false);
  const [resetting, setResetting]   = useState(false);

  const { data: conversations, isLoading } = useConversations(search, channelFilter);
  const { data: messages, isLoading: loadingMessages } = useMessages(selectedId);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const selected = conversations?.find((c: any) => c.id === selectedId);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (messages?.length) setTimeout(scrollToBottom, 100);
  }, [messages, scrollToBottom]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("agrega-conversations-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "qualification_messages" }, () => {
        if (selectedId) queryClient.invalidateQueries({ queryKey: ["qualification_messages", selectedId] });
        queryClient.invalidateQueries({ queryKey: ["qualification_conversations"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "qualification_conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["qualification_conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedId, queryClient]);

  // Group messages by date
  const groupedMessages = messages?.reduce((groups: any[], msg: any) => {
    const dateKey = format(new Date(msg.created_at), "yyyy-MM-dd");
    const last = groups[groups.length - 1];
    if (last && last.date === dateKey) last.messages.push(msg);
    else groups.push({ date: dateKey, dateStr: msg.created_at, messages: [msg] });
    return groups;
  }, []);

  const handleSend = async () => {
    if (!messageText.trim() || !selected) return;
    setSending(true);
    const ch = channelOf(selected);
    try {
      if (ch === "whatsapp") {
        const { data, error } = await supabase.functions.invoke("mandrack-manager", {
          body: { action: "send-text", phone: selected.telefone, text: messageText },
        });
        if (error || !data?.ok) throw new Error(error?.message || data?.response?.error || "Falha ao enviar via Mandrack");
      } else if (ch === "email") {
        const { data, error } = await supabase.functions.invoke("unipile-send", {
          body: {
            channel: "email",
            to: selected.unipile_reply_to,
            subject: selected.unipile_subject ?? "Re:",
            text: messageText,
            html: `<p>${messageText.replace(/\n/g, "<br/>")}</p>`,
          },
        });
        if (error || data?.success === false) throw new Error(error?.message || data?.error || "Falha ao enviar e-mail");
      } else {
        // instagram | telegram | linkedin | messenger
        const { data, error } = await supabase.functions.invoke("unipile-send", {
          body: {
            channel: ch,
            chat_id: selected.unipile_chat_id,
            text: messageText,
          },
        });
        if (error || data?.success === false) throw new Error(error?.message || data?.error || `Falha ao enviar via ${ch}`);
      }

      // Save to qualification_messages
      await supabase.from("qualification_messages").insert({
        conversation_id: selectedId,
        user_id: user!.id,
        telefone: selected.telefone,
        channel: ch,
        role: "assistant",
        content: messageText,
        processed: true,
      });

      // Update conversation timestamp
      await supabase
        .from("qualification_conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", selectedId);

      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["qualification_messages", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["qualification_conversations"] });
    } catch (err: any) {
      toast.error(translateInvokeError(err, `Enviar mensagem ${channelMeta[ch]?.label ?? ch}`));
    } finally {
      setSending(false);
    }
  };

  const handleTakeover = async () => {
    if (!selectedId) return;
    setTakingOver(true);
    try {
      const isHandoff = selected?.status === "handoff";
      await supabase
        .from("qualification_conversations")
        .update({ status: isHandoff ? "open" : "handoff" })
        .eq("id", selectedId);
      toast.success(isHandoff ? `${agentName} reativada nesta conversa` : `Você assumiu — ${agentName} pausada nesta conversa`);
      queryClient.invalidateQueries({ queryKey: ["qualification_conversations"] });
    } catch (err: any) {
      toast.error(translateInvokeError(err, "Assumir conversa"));
    } finally {
      setTakingOver(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    setDeleting(true);
    try {
      await supabase.from("qualification_messages").delete().eq("conversation_id", selectedId);
      await supabase.from("qualification_conversations").delete().eq("id", selectedId);
      toast.success("Conversa excluída.");
      setSelectedId(null);
      setDeleteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["qualification_conversations"] });
    } catch (err: any) {
      toast.error(translateInvokeError(err, "Excluir conversa"));
    } finally {
      setDeleting(false);
    }
  };

  const handleReset = async () => {
    if (!selectedId) return;
    setResetting(true);
    try {
      const { error: delErr } = await supabase.from("qualification_messages").delete().eq("conversation_id", selectedId);
      if (delErr) throw delErr;
      const { error: updErr } = await supabase.from("qualification_conversations").update({
        status: "open",
        qualified: false,
        qualified_at: null,
        fase_spin: null,
        summary: null,
        followups_sent: 0,
        last_followup_stage: null,
        last_followup_at: null,
        last_message_at: new Date().toISOString(),
      } as any).eq("id", selectedId);
      if (updErr) throw updErr;
      toast.success("Conversa resetada. A IA vai começar de novo.");
      setResetOpen(false);
      queryClient.invalidateQueries({ queryKey: ["qualification_conversations"] });
      queryClient.invalidateQueries({ queryKey: ["qualification_messages", selectedId] });
    } catch (err: any) {
      toast.error(translateInvokeError(err, "Resetar conversa"));
    } finally {
      setResetting(false);
    }
  };

  const showList = !isMobile || !selectedId;
  const showChat = !isMobile || !!selectedId;

  const handleSyncUnipile = async () => {
    setSyncing(true);
    try {
      const channel = channelFilter === "whatsapp" ? "all" : channelFilter;
      const { data, error } = await supabase.functions.invoke("unipile-inbox-sync", {
        body: { channel, limit: 50 },
      });
      if (error || data?.success === false) throw new Error(data?.error || error?.message || "Falha ao sincronizar canais");
      const totals = (Object.values(data?.results ?? {}) as any[]).reduce((acc, item) => {
        acc.messages += Number(item?.messages ?? 0);
        acc.conversations += Number(item?.conversations ?? 0);
        return acc;
      }, { messages: 0, conversations: 0 });
      toast.success(`Sincronização concluída: ${totals.messages} mensagens novas em ${totals.conversations} conversas.`);
      queryClient.invalidateQueries({ queryKey: ["qualification_conversations"] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ["qualification_messages", selectedId] });
    } catch (err: any) {
      toast.error(translateInvokeError(err, "Sincronizar canais Unipile"));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={embedded ? "flex flex-col flex-1 min-h-0" : "animate-fade-in h-[calc(100vh-5rem)] flex flex-col"}>
      {!embedded && (
        <div className="mb-4">
          <h1 className="text-2xl font-display font-bold tracking-tight">Conversas & Handoff</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Respostas da {agentName} em tempo real — assuma quando quiser
          </p>
        </div>
      )}

      <div className="mb-3">
        <PageGuide
          storageKey="guide_conversas"
          title="Conversas & Handoff"
          what={`Painel ao vivo das conversas que a ${agentName} está conduzindo no WhatsApp. Use para acompanhar, qualificar manualmente, ou assumir o controle quando o lead pedir.`}
          steps={[
            { text: "Lista da esquerda mostra conversas ativas em tempo real" },
            { text: `Clique numa conversa para ler todo o histórico (lead + ${agentName})` },
            { text: `Botão 'Assumir' pausa a ${agentName} naquela conversa e libera você para responder` },
          ]}
          troubleshoot={`${agentName} não está respondendo? Confira que os workers estão ativos.`}
          troubleshootRoute="/saude"
        />
      </div>

      <div className="flex-1 flex gap-0 rounded-xl border bg-card overflow-hidden shadow-card min-h-0">
        {/* Lista de Conversas */}
        {showList && (
          <div className={cn("flex flex-col border-r", isMobile ? "w-full" : "w-[320px] min-w-[260px]")}>
            <div className="p-3 border-b bg-muted/30 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar nome, telefone ou e-mail..."
                  className="pl-9 bg-background/80 h-9 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {(["all","whatsapp","instagram","telegram","linkedin","email"] as ChannelFilter[]).map((f) => {
                  const isAll = f === "all";
                  const meta = !isAll ? channelMeta[f] : null;
                  const active = channelFilter === f;
                  return (
                    <button
                      key={f}
                      onClick={() => setChannelFilter(f)}
                      className={cn(
                        "text-[10px] px-2 py-1 rounded-full border transition-colors",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background/60 hover:bg-muted border-border"
                      )}
                    >
                      {isAll ? "Todos" : `${meta?.emoji} ${meta?.label}`}
                    </button>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs"
                onClick={handleSyncUnipile}
                disabled={syncing}
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                Sincronizar IG · TG · LinkedIn · E-mail
              </Button>
            </div>
            <ScrollArea className="flex-1">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))
              ) : !conversations?.length ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">Nenhuma conversa ainda</p>
                  <p className="text-xs mt-1 text-center px-6">Clique em sincronizar para puxar DMs/e-mails recentes ou aguarde novas respostas entrarem pelo webhook</p>
                </div>
              ) : (
                conversations.map((conv: any) => {
                  const name = conv.nome ?? conv.telefone ?? conv.unipile_reply_to ?? "Desconhecido";
                  const isSelected = selectedId === conv.id;
                  const cfg = statusConfig[conv.status] ?? statusConfig.open;
                  const ch = channelOf(conv);
                  const meta = channelMeta[ch] ?? channelMeta.whatsapp;
                  const subline = conv.telefone ?? conv.unipile_reply_to ?? conv.unipile_subject ?? "—";
                  return (
                    <div
                      key={conv.id}
                      onClick={() => setSelectedId(conv.id)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 cursor-pointer transition-all border-b border-border/30",
                        isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/50"
                      )}
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                            {getInitials(name)}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-4 w-4 bg-card border rounded-full flex items-center justify-center text-[9px]"
                          title={meta.label}
                        >
                          {meta.emoji}
                        </span>
                        {conv.qualified && (
                          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-success rounded-full flex items-center justify-center">
                            <Star className="h-2.5 w-2.5 text-white" />
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold truncate">{name}</p>
                          {conv.last_message_at && (
                            <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                              {formatConversationDate(conv.last_message_at)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-0.5 gap-1">
                          <p className="text-xs text-muted-foreground truncate">{subline}</p>
                          <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0 h-4 shrink-0 ml-1">
                            {cfg.label}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </ScrollArea>
          </div>
        )}

        {/* Chat Panel */}
        {showChat && (
          <div className="flex-1 flex flex-col min-w-0">
            {selected ? (
              <>
                {/* Header */}
                <div className="h-[60px] flex items-center gap-3 px-4 border-b bg-muted/30 shrink-0">
                  {isMobile && (
                    <Button variant="ghost" size="icon" className="-ml-2" onClick={() => setSelectedId(null)}>
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                  )}
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                      {getInitials(selected.nome ?? selected.telefone ?? "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {selected.nome ?? "Lead"}{selected.qualified && " ⭐"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {(channelMeta[channelOf(selected)]?.emoji ?? "📱")} {channelMeta[channelOf(selected)]?.label ?? "WhatsApp"} · {selected.telefone ?? selected.unipile_reply_to ?? selected.unipile_chat_id ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={(statusConfig[selected.status] ?? statusConfig.open).variant}>
                      {(statusConfig[selected.status] ?? statusConfig.open).label}
                    </Badge>
                    {selected.status === "handoff" ? (
                      <Button variant="outline" size="sm" disabled={takingOver} onClick={handleTakeover}>
                        {takingOver ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Bot className="h-3.5 w-3.5 mr-1" />}
                        Devolver à {agentName}
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" disabled={takingOver} onClick={handleTakeover}>
                        {takingOver ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <UserCheck className="h-3.5 w-3.5 mr-1" />}
                        Assumir
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={async () => {
                          const { error } = await supabase.from("qualification_conversations").update({ qualified: !selected.qualified }).eq("id", selectedId);
                          if (error) {
                            toast.error("Erro ao atualizar qualificação: " + error.message);
                            return;
                          }
                          toast.success(selected.qualified ? "Marcado como não qualificado" : "Marcado como qualificado ⭐");
                          queryClient.invalidateQueries({ queryKey: ["qualification_conversations"] });
                        }}>
                          <Star className="h-4 w-4 mr-2" />
                          {selected.qualified ? "Remover qualificação" : "Marcar como qualificado"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setResetOpen(true)}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Resetar conversa
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir conversa
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <Tabs defaultValue="mavi" className="flex-1 flex flex-col min-h-0">
                  <TabsList className="rounded-none border-b bg-muted/20 justify-start h-9 px-2 shrink-0">
                    <TabsTrigger value="mavi" className="text-xs">💬 {agentName}</TabsTrigger>
                    <TabsTrigger value="resumo" className="text-xs">📋 Resumo</TabsTrigger>
                    <TabsTrigger value="agenda" className="text-xs">📅 Agendamento</TabsTrigger>
                  </TabsList>

                  <TabsContent value="mavi" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
                {/* Handoff banner */}
                {selected.status === "handoff" && (
                  <div className="bg-primary/10 border-b border-primary/30 px-4 py-2 flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium text-primary">
                      Você está no controle — {agentName} pausada nesta conversa. Escreva abaixo para responder.
                    </span>
                  </div>
                )}

                {/* Qualified banner */}
                {selected.qualified && (
                  <div className="bg-success/10 border-b border-success/30 px-4 py-2 flex items-center gap-2">
                    <Star className="h-4 w-4 text-success" />
                    <span className="text-xs font-medium text-success">
                      Lead qualificado pela {agentName} — encaminhe para o pipeline de vendas
                    </span>
                  </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-hidden relative">
                  <div className="absolute inset-0 bg-muted/10" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%234B6CB7' fill-opacity='0.04'%3E%3Cpath d='M20 20c0-5.5-4.5-10-10-10s-10 4.5-10 10 4.5 10 10 10 10-4.5 10-10zm10 0c0-5.5-4.5-10-10-10s-10 4.5-10 10 4.5 10 10 10 10-4.5 10-10z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                  }} />
                  <ScrollArea className="h-full relative">
                    <div className="px-4 py-2 min-h-full flex flex-col justify-end">
                      {loadingMessages ? (
                        <div className="flex items-center justify-center py-16">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : !messages?.length ? (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                          <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
                          <p className="text-sm">Nenhuma mensagem ainda</p>
                        </div>
                      ) : (
                        groupedMessages?.map((group: any) => (
                          <div key={group.date}>
                            <DateSeparator date={group.dateStr} />
                            {group.messages.map((msg: any) => (
                              <MessageBubble key={msg.id} msg={msg} agentName={agentName} />
                            ))}
                          </div>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                </div>

                {/* Input */}
                <div className="border-t bg-muted/30 p-3 shrink-0">
                  {selected.status !== "handoff" && (
                    <p className="text-xs text-muted-foreground mb-2 text-center">
                      A {agentName} está respondendo automaticamente. Clique em <strong>Assumir</strong> para tomar o controle.
                    </p>
                  )}
                  <div className="flex gap-2 items-end">
                    <Input
                      placeholder={selected.status === "handoff" ? "Digite sua mensagem como humano..." : `Modo ${agentName} ativo — clique em Assumir para escrever`}
                      className="flex-1 bg-background/80"
                      value={messageText}
                      disabled={selected.status !== "handoff"}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                      }}
                    />
                    <Button
                      onClick={handleSend}
                      disabled={sending || !messageText.trim() || selected.status !== "handoff"}
                      size="icon"
                      className="shrink-0 h-10 w-10 rounded-full"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                  </TabsContent>

                  <TabsContent value="resumo" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
                    <ConversationSummary
                      conversationId={selected.id}
                      initialSummary={selected.summary}
                      leadNome={selected.nome}
                      leadTelefone={selected.telefone}
                      onUpdated={() => queryClient.invalidateQueries({ queryKey: ["qualification_conversations"] })}
                    />
                  </TabsContent>

                  <TabsContent value="agenda" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
                    <SchedulingTab
                      conversationId={selected.id}
                      leadNome={selected.nome}
                      leadTelefone={selected.telefone}
                    />
                  </TabsContent>
                </Tabs>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-muted/10">
                <div className="text-center text-muted-foreground">
                  <div className="h-20 w-20 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-10 w-10 text-primary opacity-60" />
                  </div>
                  <p className="text-lg font-semibold">{companyName}</p>
                  <p className="text-sm mt-1">Selecione uma conversa para acompanhar a {agentName}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as mensagens serão permanentemente excluídas. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as mensagens serão apagadas e a IA vai recomeçar do zero com este lead. O contato e o telefone permanecem. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} disabled={resetting}>
              {resetting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Resetar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
