import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";

export interface EmpresaEnriquecida {
  id: string;
  lead_id: string | null;
  fonte: string;
  nome_empresa: string;
  telefone: string | null;
  endereco: string | null;
  site: string | null;
  rating: number | null;
  reviews: number | null;
  cnpj: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  porte: string | null;
  natureza_juridica: string | null;
  socios: string | null;
  atividade_principal: string | null;
  email: string | null;
  situacao: string | null;
  cnpj_validado: boolean;
  created_at: string;
  updated_at: string;
}

export function useEmpresasEnriquecidas() {
  const queryClient = useQueryClient();

  const { data: empresas = [], isLoading } = useQuery({
    queryKey: ["empresas_enriquecidas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas_enriquecidas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as EmpresaEnriquecida[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("empresas-enriquecidas-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "empresas_enriquecidas" }, () => {
        queryClient.invalidateQueries({ queryKey: ["empresas_enriquecidas"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const deleteEmpresa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("empresas_enriquecidas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empresas_enriquecidas"] });
      toast({ title: "Empresa removida" });
    },
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("empresas_enriquecidas")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empresas_enriquecidas"] });
      toast({ title: "Todas as empresas enriquecidas foram removidas" });
    },
  });

  const batchLookup = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("cnpj-batch-lookup", { body: {} });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro no processamento");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["empresas_enriquecidas"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({
        title: "Consulta em lote concluída",
        description: `${data.processed} de ${data.total} CNPJs processados.${data.errors ? ` ${data.errors.length} erros.` : ""}`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Erro na consulta em lote", description: err.message, variant: "destructive" });
    },
  });

  return {
    empresas,
    isLoading,
    deleteEmpresa: deleteEmpresa.mutate,
    clearAll: clearAll.mutate,
    batchLookup: batchLookup.mutate,
    isBatchLoading: batchLookup.isPending,
  };
}
