import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

export type JobBoardDisparoStatus = "all" | "sent" | "pending";

export interface JobBoardCompany {
  id: string;
  nome_empresa: string;
  segmento: string | null;
  porte: string | null;
  localizacao: string | null;
  descricao: string | null;
  site: string | null;
  telefone: string | null;
  email: string | null;
  vagas_abertas: number | null;
  fonte: string;
  url_perfil: string | null;
  disparo: string | null;
  data_disparo: string | null;
  mensagem: string | null;
  created_at: string;
  updated_at: string;
}

export function useJobBoardCompanies() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: companies, isLoading, error } = useQuery({
    queryKey: ["job_board_companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_board_companies")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as JobBoardCompany[];
    },
  });

  // Set up realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("job_board_companies_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_board_companies",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["job_board_companies"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const deleteCompany = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("job_board_companies")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job_board_companies"] });
      toast({ title: "Empresa excluída com sucesso" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir empresa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearAllCompanies = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("job_board_companies")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job_board_companies"] });
      toast({ title: "Todas as empresas foram excluídas" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao limpar empresas",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filter by source
  const cathoCompanies = companies?.filter(c => c.fonte === "catho") ?? [];
  const infojobsCompanies = companies?.filter(c => c.fonte === "infojobs") ?? [];

  return {
    companies: companies ?? [],
    cathoCompanies,
    infojobsCompanies,
    isLoading,
    error,
    deleteCompany: deleteCompany.mutate,
    clearAllCompanies: clearAllCompanies.mutate,
  };
}
