import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";

export interface Lead {
  id: string;
  nome_empresa: string;
  telefone: string;
  endereco: string | null;
  site: string | null;
  rating: number | null;
  reviews: number | null;
  especialidades: string | null;
  disparo: string;
  data_disparo: string | null;
  mensagem: string | null;
  created_at: string;
  updated_at: string;
  cnpj: string | null;
  razao_social: string | null;
  porte: string | null;
  natureza_juridica: string | null;
  socios: string | null;
  cnpj_validado: boolean | null;
}

export type DisparoStatus = "all" | "sent" | "pending";

export function useLeads() {
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading, error } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Lead[];
    },
  });

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("leads-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leads",
        },
        (payload) => {
          console.log("Real-time update:", payload);
          queryClient.invalidateQueries({ queryKey: ["leads"] });
          
          if (payload.eventType === "INSERT") {
            toast({
              title: "Novo lead capturado!",
              description: `${(payload.new as Lead).nome_empresa}`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({
        title: "Lead removido",
        description: "O lead foi removido com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao remover lead",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearAllLeads = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("leads")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({
        title: "Leads removidos",
        description: "Todos os leads foram excluídos com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao limpar leads",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    leads,
    isLoading,
    error,
    deleteLead: deleteLead.mutate,
    clearAllLeads: clearAllLeads.mutate,
  };
}
