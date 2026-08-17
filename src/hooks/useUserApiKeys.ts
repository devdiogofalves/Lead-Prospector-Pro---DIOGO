import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface UserApiKey {
  id: string;
  provider: string;
  /** NUNCA populado no front — o valor secreto não sai mais do banco. */
  api_key?: never;
  extra: any;
  updated_at: string;
  is_admin_shared?: boolean;
}

export function useUserApiKeys() {
  const qc = useQueryClient();

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["user_api_keys"],
    queryFn: async () => {
      // Segurança: NUNCA selecionar `api_key`. Só metadados de presença/estado.
      const { data, error } = await supabase
        .from("user_api_keys")
        .select("id, provider, extra, updated_at, is_admin_shared")
        .order("provider");
      if (error) throw error;
      return (data ?? []) as unknown as UserApiKey[];
    },
  });

  const upsert = useMutation({
    mutationFn: async ({ provider, api_key, extra, skipValidation }: { provider: string; api_key?: string; extra?: any; skipValidation?: boolean }) => {
      const { data: userData } = await supabase.auth.getUser();
      const user_id = userData.user?.id;
      if (!user_id) throw new Error("Não autenticado");

      // P0 item 6: valida chave real contra o provider antes de salvar.
      // Se inválida, joga erro com detalhe pro toast — nada de falha silenciosa.
      // skipValidation=true permite o botão "salvar mesmo assim" para casos raros
      // de provider instável.
      if (api_key && api_key.length > 0 && !skipValidation) {
        const { data: check, error: checkErr } = await supabase.functions.invoke("test-ai-key", {
          body: { provider, api_key },
        });
        if (checkErr) throw new Error(`Validação falhou: ${checkErr.message}`);
        if (check && check.valid === false) {
          const detail = check.detail || check.error || "Chave inválida";
          const err: any = new Error(`Chave rejeitada pelo ${provider}: ${detail}`);
          err.canSkip = true;
          throw err;
        }
      }

      if (api_key && api_key.length > 0) {
        const payload: any = { user_id, provider, api_key };
        if (extra !== undefined) payload.extra = extra;
        const { error } = await supabase
          .from("user_api_keys")
          .upsert(payload, { onConflict: "user_id,provider" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_api_keys")
          .update({ extra: extra ?? null } as any)
          .eq("user_id", user_id)
          .eq("provider", provider);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_api_keys"] });
      toast({ title: "Salvo", description: "Configuração atualizada." });
    },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (provider: string) => {
      const { error } = await supabase.from("user_api_keys").delete().eq("provider", provider);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_api_keys"] });
      toast({ title: "Chave removida" });
    },
  });

  const get = (provider: string) => keys.find((k) => k.provider === provider);

  return { keys, isLoading, get, upsert, remove: remove.mutate };
}

export function useUserIntegrations() {
  const qc = useQueryClient();

  const { data: integration, isLoading } = useQuery({
    queryKey: ["user_integrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_integrations")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (patch: {
      evolution_instance?: string | null;
      linkedin_cadence_enabled?: boolean;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const user_id = userData.user?.id;
      if (!user_id) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("user_integrations")
        .upsert({ user_id, ...patch }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_integrations"] });
      toast({ title: "Integração salva" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return { integration, isLoading, save: save.mutate };
}