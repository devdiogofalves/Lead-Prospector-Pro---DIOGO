import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";

export interface LinkedInContact {
  id: string;
  nome: string;
  cargo: string | null;
  empresa: string | null;
  localizacao: string | null;
  linkedin_url: string | null;
  email: string | null;
  telefone: string | null;
  sobre: string | null;
  conexoes: number | null;
  disparo: string;
  data_disparo: string | null;
  mensagem: string | null;
  created_at: string;
  updated_at: string;
  // Cadência LinkedIn DM (Fase B) — pode ser undefined antes da migration
  cadencia_status?: "none" | "active" | "paused" | "completed" | "replied" | "failed";
  etapa_atual?: string | null;
  data_prox_disparo?: string | null;
  cadencia_last_error?: string | null;
  cadencia_attempts?: number;
  ultima_falha?: string | null;
  cadencia_falhas?: number;
  mensagens_enviadas?: Array<{ etapa: string; sent_at: string; message_preview: string; used_fallback: boolean }>;
}

export type LinkedInDisparoStatus = "all" | "sent" | "pending";

export function useLinkedInContacts() {
  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading, error } = useQuery({
    queryKey: ["linkedin_contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("linkedin_contacts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        ...row,
        cadencia_last_error: row.cadencia_last_error ?? row.ultima_falha ?? null,
        cadencia_attempts: row.cadencia_attempts ?? row.cadencia_falhas ?? 0,
      })) as LinkedInContact[];
    },
  });

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("linkedin-contacts-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "linkedin_contacts",
        },
        (payload) => {
          console.log("Real-time update LinkedIn:", payload);
          queryClient.invalidateQueries({ queryKey: ["linkedin_contacts"] });
          
          if (payload.eventType === "INSERT") {
            toast({
              title: "Novo contato LinkedIn!",
              description: `${(payload.new as LinkedInContact).nome}`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("linkedin_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linkedin_contacts"] });
      toast({
        title: "Contato removido",
        description: "O contato foi removido com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao remover contato",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearAllContacts = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("linkedin_contacts")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linkedin_contacts"] });
      toast({
        title: "Contatos removidos",
        description: "Todos os contatos LinkedIn foram excluídos.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao limpar contatos",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    contacts,
    isLoading,
    error,
    deleteContact: deleteContact.mutate,
    clearAllContacts: clearAllContacts.mutate,
  };
}
