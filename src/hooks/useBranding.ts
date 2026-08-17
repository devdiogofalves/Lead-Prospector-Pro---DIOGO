import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect } from "react";

export interface CompanyBranding {
  id: string;
  user_id: string;
  company_name: string;
  agent_name: string;
  agent_tagline: string;
  logo_url: string | null;
  primary_color: string | null;
  whatsapp_number: string | null;
  whatsapp_cta_label: string | null;
}

const DEFAULTS: Omit<CompanyBranding, "id" | "user_id"> = {
  company_name: "Minha Empresa",
  agent_name: "IA assistente",
  agent_tagline: "Sua agente de prospecção com IA",
  logo_url: null,
  primary_color: null,
  whatsapp_number: null,
  whatsapp_cta_label: null,
};

export function useBranding() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["company_branding"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;
      const { data, error } = await supabase
        .from("company_branding")
        .select("*")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (error) throw error;
      return data as CompanyBranding | null;
    },
  });

  const branding: Omit<CompanyBranding, "id" | "user_id"> = {
    company_name: data?.company_name ?? DEFAULTS.company_name,
    agent_name: data?.agent_name ?? DEFAULTS.agent_name,
    agent_tagline: data?.agent_tagline ?? DEFAULTS.agent_tagline,
    logo_url: data?.logo_url ?? null,
    primary_color: data?.primary_color ?? null,
    whatsapp_number: (data as any)?.whatsapp_number ?? null,
    whatsapp_cta_label: (data as any)?.whatsapp_cta_label ?? null,
  };

  // Inject primary color CSS variable when set
  useEffect(() => {
    if (branding.primary_color && /^#[0-9a-fA-F]{6}$/.test(branding.primary_color)) {
      document.documentElement.style.setProperty("--brand-primary", branding.primary_color);
    }
  }, [branding.primary_color]);

  const save = useMutation({
    mutationFn: async (patch: Partial<Omit<CompanyBranding, "id" | "user_id">>) => {
      const { data: userData } = await supabase.auth.getUser();
      const user_id = userData.user?.id;
      if (!user_id) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("company_branding")
        .upsert({ user_id, ...patch }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company_branding"] });
      toast.success("Identidade atualizada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { branding, isLoading, save: save.mutate, saving: save.isPending };
}

export function useOnboardingStep() {
  const qc = useQueryClient();
  const { data: step = 0 } = useQuery({
    queryKey: ["onboarding_step"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return 0;
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_step")
        .eq("user_id", u.user.id)
        .maybeSingle();
      return data?.onboarding_step ?? 0;
    },
  });

  const setStep = useMutation({
    mutationFn: async (newStep: number) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      await supabase
        .from("profiles")
        .update({ onboarding_step: newStep })
        .eq("user_id", u.user.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding_step"] }),
  });

  return { step: step as number, setStep: setStep.mutate };
}
