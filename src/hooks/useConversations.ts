import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ChannelFilter = "all" | "whatsapp" | "instagram" | "telegram" | "linkedin" | "messenger" | "email";

export function useConversations(search?: string, channel: ChannelFilter = "all") {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["qualification_conversations", user?.id, search, channel],
    queryFn: async () => {
      let q = supabase
        .from("qualification_conversations")
        .select("*")
        .eq("user_id", user!.id)
        .order("last_message_at", { ascending: false });

      if (channel !== "all") {
        if (channel === "whatsapp") {
          // Conversas antigas podem não ter channel preenchido — tratar como WA
          q = q.or("channel.eq.whatsapp,channel.is.null");
        } else {
          q = q.eq("channel", channel);
        }
      }

      const { data, error } = await q;
      if (error) throw error;

      if (search) {
        const s = search.toLowerCase();
        return data.filter(
          (c: any) =>
            c.nome?.toLowerCase().includes(s) ||
            c.telefone?.includes(search) ||
            c.unipile_reply_to?.toLowerCase().includes(s)
        );
      }
      return data;
    },
    enabled: !!user,
    refetchInterval: 5000,
  });
}

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["qualification_messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("qualification_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!conversationId,
    refetchInterval: 3000,
  });
}

export function useConversationStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["conversation-stats", user?.id],
    queryFn: async () => {
      const { count: activeCount } = await supabase
        .from("qualification_conversations")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("status", "open");

      const { count: qualifiedCount } = await supabase
        .from("qualification_conversations")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("qualified", true);

      return { active: activeCount ?? 0, qualified: qualifiedCount ?? 0 };
    },
    enabled: !!user,
  });
}
