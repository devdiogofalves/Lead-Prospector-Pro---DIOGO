import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

export type InstagramDisparoStatus = "Sim" | "Não";

export interface InstagramContact {
  id: string;
  username: string;
  nome: string | null;
  bio: string | null;
  email: string | null;
  seguidores: number | null;
  seguindo: number | null;
  posts: number | null;
  whatsapp: string | null;
  whatsapp_validado: boolean | null;
  profile_url: string | null;
  disparo: InstagramDisparoStatus | null;
  data_disparo: string | null;
  mensagem: string | null;
  created_at: string;
  updated_at: string;
}

export function useInstagramContacts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: contacts, isLoading, error } = useQuery({
    queryKey: ["instagram_contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_contacts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as InstagramContact[];
    },
  });

  // Set up realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("instagram_contacts_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "instagram_contacts",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["instagram_contacts"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("instagram_contacts")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram_contacts"] });
      toast({ title: "Contato excluído com sucesso" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir contato",
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
        .from("instagram_contacts")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram_contacts"] });
      toast({ title: "Todos os contatos foram excluídos" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao limpar contatos",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    contacts: contacts ?? [],
    isLoading,
    error,
    deleteContact: deleteContact.mutate,
    clearAllContacts: clearAllContacts.mutate,
  };
}
