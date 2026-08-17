import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useBranding } from "@/hooks/useBranding";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Compass,
  KeyRound,
  Smartphone,
  Search,
  Rocket,
  MessageSquareHeart,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Wand2,
  Trash2,
  Loader2,
} from "lucide-react";
import { InstantOnboardingHero } from "@/components/onboarding/InstantOnboardingHero";


export function useOnboardingSteps() {
  const { data, isLoading } = useQuery({
    queryKey: ["onboarding_status"],
    queryFn: async () => {
      const [keys, integ, leads, ig, ln, emp, dispatchCfg, qualCfg, brand] = await Promise.all([
        supabase.from("user_api_keys").select("provider"),
        supabase.from("user_integrations")
          .select("evolution_instance, mandrack_instance_id, mandrack_instance_token")
          .maybeSingle(),
        supabase.from("leads").select("id", { count: "exact", head: true }),
        supabase.from("instagram_contacts").select("id", { count: "exact", head: true }),
        supabase.from("linkedin_contacts").select("id", { count: "exact", head: true }),
        supabase.from("empresas_enriquecidas").select("id", { count: "exact", head: true }),
        supabase.from("dispatch_settings").select("paused").maybeSingle(),
        supabase.from("qualification_settings").select("paused").maybeSingle(),
        supabase.from("company_branding").select("company_name, agent_name").maybeSingle(),
      ]);
      const providers = new Set((keys.data ?? []).map((k: any) => k.provider));
      const totalLeads =
        (leads.count ?? 0) + (ig.count ?? 0) + (ln.count ?? 0) + (emp.count ?? 0);
      const whatsappConnected =
        !!integ.data?.mandrack_instance_token || !!integ.data?.evolution_instance;
      const brandConfigured =
        !!brand.data &&
        brand.data.company_name !== "Minha Empresa" &&
        !!brand.data.agent_name;
      return {
        branding: brandConfigured,
        apis: (providers.has("openai") || providers.has("gemini")) && ["apify", "google_places"].every((p) => providers.has(p)),
        whatsapp: whatsappConnected,
        leads: totalLeads > 0,
        dispatch: !!(dispatchCfg.data && dispatchCfg.data.paused === false),
        qualification: !!(qualCfg.data && qualCfg.data.paused === false),
      };
    },
  });

  const steps = [
    {
      key: "branding",
      title: "Personalize a identidade da sua empresa",
      description: "Defina o nome da empresa, o nome da sua agente IA, logo e cor primária.",
      icon: Sparkles,
      url: "/configuracoes/branding",
      cta: "Personalizar marca",
      done: !!data?.branding,
    },
    {
      key: "apis",
      title: "Conecte suas chaves de API",
      description: "Cole ao menos uma chave de IA (OpenAI ou Gemini) e as chaves operacionais como Apify, Google Places, Unipile e ElevenLabs.",
      icon: KeyRound,
      url: "/configuracoes",
      cta: "Configurar APIs",
      done: !!data?.apis,
    },
    {
      key: "whatsapp",
      title: "Conecte o WhatsApp",
      description: "Escaneie o QR Code ou use o código de pareamento para conectar o número que vai fazer os disparos.",
      icon: Smartphone,
      url: "/whatsapp",
      cta: "Conectar WhatsApp",
      done: !!data?.whatsapp,
    },
    {
      key: "leads",
      title: "Importe seus primeiros leads",
      description: "Use LinkedIn, Google Maps ou CNPJ para trazer leads qualificados para a plataforma.",
      icon: Search,
      url: "/buscas/linkedin",
      cta: "Buscar leads",
      done: !!data?.leads,
    },
    {
      key: "dispatch",
      title: "Configure o Disparo Humanizado",
      description: "Defina as configurações de disparo e ative a agente para enviar mensagens humanizadas automaticamente.",
      icon: Rocket,
      url: "/disparo-humanizado",
      cta: "Configurar Disparo",
      done: !!data?.dispatch,
    },
    {
      key: "qualification",
      title: "Ative a Qualificação Automática",
      description: "Sua agente responde leads no WhatsApp, qualifica com SPIN e envia os melhores para seu grupo.",
      icon: MessageSquareHeart,
      url: "/qualificacao-humanizada",
      cta: "Configurar Qualificação",
      done: !!data?.qualification,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const progress = Math.round((completed / steps.length) * 100);

  return { steps, completed, total: steps.length, progress, isLoading };
}

export default function ComeceAqui() {
  const { steps, completed, total, progress, isLoading } = useOnboardingSteps();
  const { branding } = useBranding();
  const { user } = useAuth();
  const isAdmin = user?.user_metadata?.is_admin === true;
  const qc = useQueryClient();
  const [demoBusy, setDemoBusy] = useState<"seed" | "clear" | null>(null);

  const nextStep = steps.find((s) => !s.done);

  async function runDemo(action: "seed" | "clear") {
    setDemoBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke("seed-demo-data", { body: { action } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if (action === "seed") {
        toast.success("Demo carregada!", {
          description: "20 leads, 5 conversas, 3 cards no Pipeline e 1 reunião agendada.",
        });
      } else {
        toast.success("Dados demo removidos.");
      }
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error("Erro no Modo Demo", { description: e?.message ?? String(e) });
    } finally {
      setDemoBusy(null);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/20">
          <Compass className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comece Aqui</h1>
          <p className="text-sm text-muted-foreground">
            Siga os passos abaixo para configurar o LeadsBooster e começar a captar leads com a {branding.agent_name}.
          </p>
        </div>
      </div>

      {/* Onboarding em 30s — Instagram @ */}
      <InstantOnboardingHero />

      {/* Progress + próximo passo */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progresso da configuração</span>
            <Badge variant={completed === total ? "default" : "secondary"}>
              {completed}/{total} concluídos
            </Badge>
          </div>
          <Progress value={progress} className="h-2" />
          {completed === total ? (
            <p className="text-xs text-primary mt-2 font-medium">
              ✅ Tudo configurado! {branding.agent_name} está pronto pra trabalhar.
            </p>
          ) : nextStep ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-primary/80 font-semibold">Próximo passo</p>
                <p className="text-sm truncate">{nextStep.title}</p>
              </div>
              <Link to={nextStep.url} className="shrink-0">
                <Button size="sm" className="gap-1">
                  {nextStep.cta}
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Modo Demo — apenas admin */}
      {isAdmin && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-amber-500" />
              Modo Demo (admin) — explore a plataforma com dados de exemplo
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Carregamos 20 leads, 5 conversas no WhatsApp (3 qualificadas), 3 cards no Pipeline e 1 reunião agendada. Útil para
              testar a navegação antes de prospectar de verdade.
            </p>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" onClick={() => runDemo("seed")} disabled={demoBusy !== null} className="gap-1">
                {demoBusy === "seed" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                Carregar demo
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runDemo("clear")}
                disabled={demoBusy !== null}
                className="gap-1"
              >
                {demoBusy === "clear" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Limpar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}


      {/* Steps */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="pt-4 h-20" />
              </Card>
            ))}
          </div>
        ) : (
          steps.map((step, index) => {
            
            return (
              <Card
                key={step.key}
                className={`transition-all ${step.done ? "border-primary/30 bg-primary/5" : "border-border"}`}
              >
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-base flex items-center gap-3">
                    <div
                      className={`flex items-center justify-center h-7 w-7 rounded-full border-2 shrink-0 ${
                        step.done
                          ? "border-primary bg-primary text-white"
                          : "border-muted-foreground/30 text-muted-foreground"
                      }`}
                    >
                      {step.done ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <span className="text-xs font-bold">{index + 1}</span>
                      )}
                    </div>
                    <span className={step.done ? "line-through text-muted-foreground" : ""}>
                      {step.title}
                    </span>
                    {step.done && (
                      <Badge variant="secondary" className="ml-auto text-[10px] bg-primary/20 text-primary">
                        Concluído
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                  {!step.done && (
                    <Link to={step.url} className="shrink-0">
                      <Button size="sm" variant="outline" className="gap-1">
                        {step.cta}
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Quick links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Atalhos rápidos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[
            { label: "Identidade da empresa", url: "/configuracoes/branding" },
            { label: "LinkedIn Leads", url: "/buscas/linkedin" },
            { label: "LinkedIn DM", url: "/buscas/linkedin-dm" },
            { label: "Google Maps", url: "/buscas/maps" },
            { label: "Enriquecimento", url: "/enriquecidos" },
            { label: "Disparo Humanizado", url: "/disparo-humanizado" },
            { label: "Pipeline CRM", url: "/pipeline" },
            { label: "Follow-ups", url: "/follow-ups" },
          ].map((l) => (
            <Link key={l.url} to={l.url}>
              <Button size="sm" variant="ghost" className="h-7 text-xs">
                {l.label}
              </Button>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
