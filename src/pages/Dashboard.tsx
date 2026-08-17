import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import {
  Users, Rocket, MessageSquare, Kanban,
  Search, TrendingUp, CheckCircle2,
  ArrowRight, Bot
} from "lucide-react";
import { useBranding } from "@/hooks/useBranding";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function Dashboard() {
  const navigate = useNavigate();
  const { branding } = useBranding();
  const agent = branding.agent_name;
  const company = branding.company_name;

  // Métricas reais (RLS escopa por tenant automaticamente).
  // Usa count exact + head:true para não baixar linhas (PostgREST corta select("*") em ~1000).
  const { data: metrics } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: async () => {
      const [leadsC, linkedinC, instagramC, disparosWa, disparosEmail, qualificados, negociando] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }),
        supabase.from("linkedin_contacts").select("id", { count: "exact", head: true }),
        supabase.from("instagram_contacts").select("id", { count: "exact", head: true }),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("disparo", "Sim"),
        supabase.from("dispatch_queue").select("id", { count: "exact", head: true }).eq("channel", "email").eq("status", "sent"),
        supabase.from("qualification_conversations").select("id", { count: "exact", head: true }).eq("qualified", true),
        supabase.from("pipeline_cards").select("id", { count: "exact", head: true }).eq("estagio", "negociando"),
      ]);
      return {
        totalLeads: (leadsC.count ?? 0) + (linkedinC.count ?? 0) + (instagramC.count ?? 0),
        disparos: (disparosWa.count ?? 0) + (disparosEmail.count ?? 0),
        qualificados: qualificados.count ?? 0,
        negociando: negociando.count ?? 0,
      };
    },
  });

  const totalLeads = metrics?.totalLeads ?? 0;
  const leadsDisparados = metrics?.disparos ?? 0;
  const leadsQualificados = metrics?.qualificados ?? 0;
  const emNegociacao = metrics?.negociando ?? 0;

  const stats = [
    { label: "Total de Leads", value: totalLeads, icon: Users, color: "text-primary", bg: "bg-primary/10" },
    { label: "Disparos Enviados", value: leadsDisparados, icon: Rocket, color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "Leads Qualificados", value: leadsQualificados, icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
    { label: "Em Negociação", value: emNegociacao, icon: TrendingUp, color: "text-warning", bg: "bg-warning/10" },
  ];

  const quickActions = [
    { label: "Buscar Leads LinkedIn", desc: "Encontre decisores por cargo e setor", url: "/buscas/linkedin", icon: Search, color: "gradient-primary" },
    { label: `Disparar com ${agent}`, desc: "Enviar sequência humanizada de 3 mensagens", url: "/disparo-humanizado", icon: Rocket, color: "bg-blue-600" },
    { label: "Ver Conversas", desc: "Acompanhar respostas e assumir handoff", url: "/qualificacao-humanizada", icon: MessageSquare, color: "bg-indigo-600" },
    { label: "Pipeline CRM", desc: "Leads qualificados avançando no funil", url: "/pipeline", icon: Kanban, color: "bg-purple-600" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Olá, {company} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            {agent} pronto pra prospectar. Veja o resumo do seu pipeline.
          </p>
        </div>
        <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1.5">
          <Bot className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium">{agent} Online</span>
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="shadow-card border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.bg}`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <p className={`text-2xl font-display font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Ações Rápidas
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((a) => (
            <Card
              key={a.label}
              className="shadow-card border-border/50 cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => navigate(a.url)}
            >
              <CardContent className="p-4 flex flex-col gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${a.color}`}>
                  <a.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{a.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.desc}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-primary mt-auto">
                  Acessar <ArrowRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Funil */}
      <Card className="shadow-card border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Fluxo de Prospecção {company}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {[
              { step: "1. Buscar LinkedIn", color: "bg-primary/20 text-primary border-primary/30" },
              { step: "2. Importar Leads", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
              { step: `3. Disparo ${agent}`, color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" },
              { step: "4. Conversa & Qualificação", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
              { step: "5. Handoff Humano", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
              { step: "6. Pipeline → Fechamento", color: "bg-success/20 text-success border-success/30" },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <Badge variant="outline" className={`${s.color} text-xs font-medium`}>{s.step}</Badge>
                {i < 5 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {agent} cuida do disparo e da qualificação automaticamente. Seu time assume quando o lead demonstra interesse real.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
