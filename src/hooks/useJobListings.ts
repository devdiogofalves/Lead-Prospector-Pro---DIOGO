import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

export type JobListingDisparoStatus = "all" | "sent" | "pending";

export interface JobListing {
  id: string;
  titulo_vaga: string;
  empresa: string | null;
  email: string | null;
  telefone: string | null;
  localizacao: string | null;
  salario: string | null;
  descricao: string | null;
  requisitos: string | null;
  fonte: string;
  url_vaga: string | null;
  site_empresa: string | null;
  setor: string | null;
  disparo: string | null;
  data_disparo: string | null;
  mensagem: string | null;
  created_at: string;
  updated_at: string;
}

export function useJobListings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: listings, isLoading, error } = useQuery({
    queryKey: ["job_listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_listings")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as JobListing[];
    },
  });

  // Set up realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("job_listings_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_listings",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["job_listings"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const deleteListing = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("job_listings")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job_listings"] });
      toast({ title: "Vaga excluída com sucesso" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir vaga",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearAllListings = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("job_listings")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job_listings"] });
      toast({ title: "Todas as vagas foram excluídas" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao limpar vagas",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filter by source
  const cathoListings = listings?.filter(l => l.fonte === "catho") ?? [];
  const infojobsListings = listings?.filter(l => l.fonte === "infojobs") ?? [];

  return {
    listings: listings ?? [],
    cathoListings,
    infojobsListings,
    isLoading,
    error,
    deleteListing: deleteListing.mutate,
    clearAllListings: clearAllListings.mutate,
  };
}
