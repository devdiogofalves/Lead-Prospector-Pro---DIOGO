import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StepMediaType = "text" | "audio" | "image";

export type CampaignStep = {
  ordem: number;
  delay_hours: number;
  mensagem: string;
  use_audio: boolean; // legado (TTS via ElevenLabs) — mantido p/ compat
  media_type?: StepMediaType;
  media_url?: string | null;
  gerado_por_ia?: boolean;
};

export type Campaign = {
  id: string;
  user_id: string;
  nome: string;
  descricao: string | null;
  status: "draft" | "scheduled" | "sending" | "paused" | "completed";
  source_filters: any;
  chips_ids: string[];
  sequence: CampaignStep[];
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  replied_count: number;
  qualified_count: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  ignore_business_hours: boolean;
  created_at: string;
  updated_at: string;
};

export function useCampaigns() {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Campaign[];
    },
    refetchInterval: 15000,
  });

  const create = useMutation({
    mutationFn: async (input: Partial<Campaign>) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const { data, error } = await supabase
        .from("campaigns" as any)
        .insert({
          user_id: u.user.id,
          nome: input.nome ?? "Nova campanha",
          descricao: input.descricao ?? null,
          status: input.status ?? "draft",
          source_filters: input.source_filters ?? {},
          chips_ids: input.chips_ids ?? [],
          sequence: input.sequence ?? [],
          ignore_business_hours: input.ignore_business_hours ?? false,
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as Campaign;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Campaign> & { id: string }) => {
      const { error } = await supabase
        .from("campaigns" as any)
        .update(patch as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campaigns" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  const launch = useMutation({
    mutationFn: async (campaign_id: string) => {
      const { data, error } = await supabase.functions.invoke("campaign-enqueue", {
        body: { campaign_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { ok: boolean; enqueued: number; total_recipients: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  return { list, create, update, remove, launch };
}
