import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Loader2, Users, Rocket, MessageSquare, DollarSign, ShieldCheck, Pause, Play, Settings, RefreshCw, Search, Crown, Plus, Mail, Building2, Bot, Lock, Send, Pencil, Trash2, KeyRound, Phone, MessageCircle, Zap, Check, X, CreditCard, LifeBuoy, LogIn } from "lucide-react";
import { FinanceiroTab } from "@/components/admin/FinanceiroTab";
import { SuporteAdminTab } from "@/components/admin/SuporteAdminTab";
import { UnipileAccountsTab } from "@/components/admin/UnipileAccountsTab";
import { SharedApisPanel } from "@/components/admin/SharedApisPanel";
import { useAdminSupportUnread } from "@/hooks/useAdminSupportUnread";

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  trial:      { label: "Trial",            color: "bg-muted text-muted-foreground" },
  free:       { label: "Free (BYO APIs)",  color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  mensal:     { label: "Mensal",           color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  semestral:  { label: "Semestral",        color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  anual:      { label: "Anual",            color: "bg-primary/15 text-primary border-primary/30" },
  whitelabel: { label: "WhiteLabel",       color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  // legados
  starter:    { label: "Starter (legado)", color: "bg-muted text-muted-foreground" },
  pro:        { label: "Pro (legado)",     color: "bg-muted text-muted-foreground" },
  agency:     { label: "Agency (legado)",  color: "bg-muted text-muted-foreground" },
};

const PLAN_MRR: Record<string, number> = {
  trial: 0, free: 0,
  mensal: 697, semestral: 497, anual: 397, whitelabel: 300,
  starter: 197, pro: 397, agency: 697,
};


interface PlanDetail {
  name: string;
  price: number;
  setupFee?: number;
  period: string;
  badge?: string;
  chips: string;
  dispatches: string;
  features: { label: string; included: boolean }[];
  highlight?: boolean;
  color: string;
}

const PLAN_DETAILS: PlanDetail[] = [
  {
    name: "Trial",
    price: 0,
    period: "7 dias",
    chips: "1 chip",
    dispatches: "20/dia",
    features: [
      { label: "WhatsApp disparo", included: true },
      { label: "Qualificação IA", included: true },
      { label: "Pipeline CRM", included: true },
      { label: "LinkedIn", included: false },
      { label: "Instagram", included: false },
      { label: "E-mail dispatch", included: false },
      { label: "Revenda / WhiteLabel", included: false },
    ],
    color: "border-muted/50 bg-muted/5",
  },
  {
    name: "Free",
    price: 0,
    period: "BYO APIs",
    chips: "Ilimitado",
    dispatches: "Ilimitado",
    features: [
      { label: "WhatsApp disparo", included: true },
      { label: "Qualificação IA", included: true },
      { label: "Pipeline CRM", included: true },
      { label: "LinkedIn", included: true },
      { label: "Instagram", included: true },
      { label: "E-mail dispatch", included: true },
      { label: "Revenda / WhiteLabel", included: false },
    ],
    color: "border-emerald-500/30 bg-emerald-500/5",
  },
  {
    name: "Mensal",
    price: 697,
    period: "/mês",
    chips: "Ilimitado",
    dispatches: "Ilimitado",
    features: [
      { label: "WhatsApp disparo", included: true },
      { label: "Qualificação IA", included: true },
      { label: "Pipeline CRM", included: true },
      { label: "LinkedIn", included: true },
      { label: "Instagram", included: true },
      { label: "E-mail dispatch", included: true },
      { label: "Revenda / WhiteLabel", included: false },
    ],
    color: "border-blue-500/30 bg-blue-500/5",
  },
  {
    name: "Semestral",
    price: 497,
    period: "/mês · 6x",
    badge: "Economia 29%",
    chips: "Ilimitado",
    dispatches: "Ilimitado",
    features: [
      { label: "WhatsApp disparo", included: true },
      { label: "Qualificação IA", included: true },
      { label: "Pipeline CRM", included: true },
      { label: "LinkedIn", included: true },
      { label: "Instagram", included: true },
      { label: "E-mail dispatch", included: true },
      { label: "Revenda / WhiteLabel", included: false },
    ],
    highlight: true,
    color: "border-cyan-500/30 bg-cyan-500/5",
  },
  {
    name: "Anual",
    price: 397,
    period: "/mês · 12x",
    badge: "Melhor custo",
    chips: "Ilimitado",
    dispatches: "Ilimitado",
    features: [
      { label: "WhatsApp disparo", included: true },
      { label: "Qualificação IA", included: true },
      { label: "Pipeline CRM", included: true },
      { label: "LinkedIn", included: true },
      { label: "Instagram", included: true },
      { label: "E-mail dispatch", included: true },
      { label: "Revenda / WhiteLabel", included: false },
    ],
    color: "border-primary/30 bg-primary/5",
  },
  {
    name: "WhiteLabel",
    price: 300,
    setupFee: 5500,
    period: "/mês + setup",
    badge: "Revenda",
    chips: "Ilimitado",
    dispatches: "Ilimitado",
    features: [
      { label: "WhatsApp disparo", included: true },
      { label: "Qualificação IA", included: true },
      { label: "Pipeline CRM", included: true },
      { label: "LinkedIn", included: true },
      { label: "Instagram", included: true },
      { label: "E-mail dispatch", included: true },
      { label: "Revenda / Sub-contas", included: true },
    ],
    color: "border-amber-500/30 bg-amber-500/5",
  },
];

export default function Admin() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [actionClient, setActionClient] = useState<any>(null);
  const [actionType, setActionType] = useState<"plan" | "note" | null>(null);
  const [newPlan, setNewPlan] = useState("");
  const [noteText, setNoteText] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Editar cliente
  const [editOpen, setEditOpen] = useState(false);
  const [editClient, setEditClient] = useState<any>(null);
  const [editCompany, setEditCompany] = useState("");
  const [editAgent, setEditAgent] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Deletar cliente
  const [deleteClient, setDeleteClient] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // WhatsApp boas-vindas
  const [waClient, setWaClient] = useState<any>(null);
  const [waPhone, setWaPhone] = useState("");
  const [waMessage, setWaMessage] = useState("");
  const [waSending, setWaSending] = useState(false);

  // Criar cliente manualmente
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createCompany, setCreateCompany] = useState("");
  const [createAgent, setCreateAgent] = useState("");
  const [createPlan, setCreatePlan] = useState("trial");
  const [createPassword, setCreatePassword] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createSharedCreds, setCreateSharedCreds] = useState(false);
  const [creating, setCreating] = useState(false);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  // Verifica flag is_admin no metadata — sem expor o email no bundle JS.
  // O backend (admin-manage-client / admin-metrics) faz a validação real por email.
  if (!user || !user.user_metadata?.is_admin) return <Navigate to="/dashboard" replace />;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin_metrics"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-metrics");
      if (error) throw error;
      return data as { overview: any; clients: any[] };
    },
    refetchInterval: 60000,
  });

  const clients = data?.clients ?? [];
  const overview = data?.overview ?? {};
  const supportUnread = useAdminSupportUnread();

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (filterPlan !== "all" && c.plan !== filterPlan) return false;
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!c.company_name?.toLowerCase().includes(s) && !c.email?.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [clients, filterPlan, filterStatus, search]);

  async function manage(action: string, clientId: string, extra?: any) {
    setActionLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("admin-manage-client", {
        body: { action, client_id: clientId, ...extra },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);
      toast({ title: `✅ Ação "${action}" aplicada com sucesso` });
      qc.invalidateQueries({ queryKey: ["admin_metrics"] });
      setActionClient(null);
      setActionType(null);
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  const StatCard = ({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: any; sub?: string }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">{icon}{label}</div>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Admin LeadsBooster
          </h1>
          <p className="text-sm text-muted-foreground">Visão completa de todos os clientes e métricas da plataforma</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Criar cliente
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />}      label="Clientes"      value={overview.total_clients ?? 0} />
        <StatCard icon={<ShieldCheck className="h-4 w-4 text-emerald-500" />} label="Ativos" value={overview.active_clients ?? 0} />
        <StatCard icon={<Rocket className="h-4 w-4 text-blue-400" />}  label="Ativos hoje"  value={overview.active_today ?? 0} />
        <StatCard icon={<Rocket className="h-4 w-4 text-primary" />}   label="Disparos/sem" value={overview.dispatches_week ?? 0} />
        <StatCard icon={<MessageSquare className="h-4 w-4 text-purple-400" />} label="Qualif./sem" value={overview.qualified_week ?? 0} />
        <StatCard icon={<DollarSign className="h-4 w-4 text-amber-400" />} label="MRR estimado" value={`R$${(overview.mrr_estimate ?? 0).toLocaleString("pt-BR")}`} />
        <StatCard icon={<Crown className="h-4 w-4 text-amber-500" />}  label="WhiteLabel"   value={(overview.plan_counts?.whitelabel ?? 0)} sub="revendedores" />
      </div>

      {/* Distribuição de planos */}
      {overview.plan_counts && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(overview.plan_counts as Record<string, number>).map(([plan, count]) => (
            <div key={plan} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${PLAN_LABELS[plan]?.color ?? "bg-muted"}`}>
              {PLAN_LABELS[plan]?.label ?? plan} <span className="font-bold">{count}</span>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue={supportUnread > 0 ? "suporte" : "clients"}>
        <TabsList>
          <TabsTrigger value="clients">Clientes ({clients.length})</TabsTrigger>
          <TabsTrigger value="suporte" className="relative">
            <LifeBuoy className="h-3.5 w-3.5 mr-1.5" /> Suporte
            {supportUnread > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold animate-pulse">
                {supportUnread}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="revenue">Receita</TabsTrigger>
          <TabsTrigger value="planos">Planos</TabsTrigger>
          <TabsTrigger value="unipile">Contas Unipile</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="space-y-3 mt-3">
          {/* Filtros */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar empresa ou e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={filterPlan} onValueChange={setFilterPlan}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Plano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os planos</SelectItem>
                {Object.keys(PLAN_LABELS).map((p) => (
                  <SelectItem key={p} value={p}>{PLAN_LABELS[p].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="paused">Pausados</SelectItem>
                <SelectItem value="canceled">Cancelados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tabela de clientes */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">Nenhum cliente encontrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border">
                      <tr className="text-xs text-muted-foreground">
                        <th className="text-left p-3">Empresa</th>
                        <th className="text-left p-3">E-mail</th>
                        <th className="text-center p-3">Plano</th>
                        <th className="text-center p-3">Status</th>
                        <th className="text-center p-3">Chips</th>
                        <th className="text-center p-3">Disp./sem</th>
                        <th className="text-center p-3">Hoje</th>
                        <th className="text-left p-3">Último acesso</th>
                        <th className="text-right p-3">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map((c) => (
                        <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-medium max-w-48 truncate">
                            <div className="flex items-center gap-1.5">
                              {c.reseller_enabled && <Crown className="h-3 w-3 text-amber-400 shrink-0" />}
                              <span className="truncate">{c.company_name}</span>
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs truncate max-w-40">{c.email}</td>
                          <td className="p-3 text-center">
                            <Badge variant="outline" className={`text-[10px] ${PLAN_LABELS[c.plan]?.color}`}>
                              {PLAN_LABELS[c.plan]?.label ?? c.plan}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              c.status === "active" ? "bg-emerald-500/15 text-emerald-400" :
                              c.status === "paused" ? "bg-amber-500/15 text-amber-400" :
                              "bg-destructive/15 text-destructive"
                            }`}>
                              {c.status}
                            </span>
                          </td>
                          <td className="p-3 text-center text-xs">{c.chips_active}</td>
                          <td className="p-3 text-center text-xs">{c.dispatches_sent_week}</td>
                          <td className="p-3 text-center">
                            {c.active_today && <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" title="Ativo hoje" />}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {c.last_sign_in ? new Date(c.last_sign_in).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {c.status === "active" ? (
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => manage("pause", c.id)}>
                                  <Pause className="h-3 w-3 mr-1" />Pausar
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => manage("resume", c.id)}>
                                  <Play className="h-3 w-3 mr-1" />Retomar
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" title="Alterar plano" onClick={() => { setActionClient(c); setNewPlan(c.plan); setActionType("plan"); }}>
                                <Settings className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" title="Editar dados" onClick={() => { setEditClient(c); setEditCompany(c.company_name ?? ""); setEditAgent(c.agent_name ?? ""); setEditOpen(true); }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm" variant="ghost" className="h-7 px-2 text-xs text-blue-400 hover:text-blue-300"
                                title="Acessar painel deste cliente (impersonate)"
                                onClick={async () => {
                                  try {
                                    const { data: res, error } = await supabase.functions.invoke("admin-manage-client", {
                                      body: { action: "impersonate", client_id: c.id },
                                    });
                                    if (error) throw error;
                                    if (res?.error) throw new Error(res.error);
                                    if (res.action_link) {
                                      window.open(res.action_link, "_blank");
                                      toast({ title: "🔓 Painel aberto", description: `Logado como ${res.email} em nova aba.` });
                                    }
                                  } catch (e: any) {
                                    toast({ title: "Erro ao acessar painel", description: e?.message, variant: "destructive" });
                                  }
                                }}
                              >
                                <LogIn className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm" variant="ghost" className="h-7 px-2 text-xs text-emerald-500 hover:text-emerald-400"
                                title="Enviar boas-vindas WhatsApp"
                                onClick={() => {
                                  setWaClient(c);
                                  setWaPhone(c.contact_phone ?? "");
                                  setWaMessage(`Olá! 👋 Bem-vindo(a) à plataforma LeadsBooster!\n\nSeu acesso foi criado:\n📧 E-mail: ${c.email}\n\nAcesse agora: https://leadsbooster.com.br\n\nQualquer dúvida, é só me chamar aqui. 🚀`);
                                }}
                              >
                                <MessageCircle className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" title="Deletar cliente" onClick={() => setDeleteClient(c)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="mt-3">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">MRR por Plano</CardTitle>
                <CardDescription>Receita mensal recorrente estimada (clientes ativos)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(PLAN_LABELS).map(([plan, { label }]) => {
                  const count = clients.filter((c) => c.plan === plan && c.status === "active").length;
                  const mrr = count * (PLAN_MRR[plan] ?? 0);
                  return (
                    <div key={plan} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${PLAN_LABELS[plan].color}`}>{label}</Badge>
                        <span className="text-sm text-muted-foreground">{count} cliente{count !== 1 ? "s" : ""}</span>
                      </div>
                      <span className="font-semibold text-sm">R$ {mrr.toLocaleString("pt-BR")}</span>
                    </div>
                  );
                })}
                <div className="border-t border-border pt-3 flex items-center justify-between font-bold">
                  <span>Total MRR</span>
                  <span className="text-primary">R$ {(overview.mrr_estimate ?? 0).toLocaleString("pt-BR")}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resumo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Total de clientes</span><span>{overview.total_clients}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Ativos</span><span className="text-emerald-400">{overview.active_clients}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Pausados</span><span className="text-amber-400">{overview.paused_clients}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Trial (sem receita)</span><span>{overview.trial_clients}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Revendedores WhiteLabel</span><span className="text-amber-400">{overview.plan_counts?.whitelabel ?? 0}</span></div>
                <div className="flex justify-between font-bold pt-2 border-t border-border"><span>MRR estimado</span><span className="text-primary">R$ {(overview.mrr_estimate ?? 0).toLocaleString("pt-BR")}</span></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="suporte">
          <SuporteAdminTab clients={clients} />
        </TabsContent>

        <TabsContent value="financeiro">
          <FinanceiroTab mrr={overview.mrr_estimate ?? 0} />
        </TabsContent>

        <TabsContent value="planos" className="mt-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {PLAN_DETAILS.map((plan) => {
              const planKey = plan.name.toLowerCase();
              const count = (overview.plan_counts as Record<string, number> | undefined)?.[planKey] ?? 0;
              return (
              <Card key={plan.name} className={`relative overflow-hidden border ${plan.color}`}>
                {plan.highlight && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-2.5 py-1 rounded-bl-lg">
                    POPULAR
                  </div>
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {plan.name}
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                        <Users className="h-2.5 w-2.5" /> {count}
                      </span>
                    </CardTitle>
                    {plan.badge && (
                      <Badge variant="outline" className="text-[10px]">{plan.badge}</Badge>
                    )}
                  </div>
                  <CardDescription>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl font-bold text-foreground">
                        {plan.price === 0 ? "Grátis" : `R$ ${plan.price.toLocaleString("pt-BR")}`}
                      </span>
                      {plan.price > 0 && <span className="text-xs text-muted-foreground">{plan.period}</span>}
                    </div>
                    {plan.setupFee && (
                      <div className="text-xs text-amber-400 mt-0.5">
                        + R$ {plan.setupFee.toLocaleString("pt-BR")} setup
                      </div>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground">
                      <CreditCard className="h-3 w-3" /> {plan.chips}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground">
                      <MessageSquare className="h-3 w-3" /> {plan.dispatches}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {plan.features.map((f) => (
                      <div key={f.label} className="flex items-center gap-2 text-xs">
                        {f.included ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                        )}
                        <span className={f.included ? "text-foreground" : "text-muted-foreground/60 line-through"}>
                          {f.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );})}
          </div>

          {/* Cards dos planos legados */}
          <div className="mt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Planos legados (mantidos para contas antigas)</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { name: "Starter", price: 197, chips: "1 chip", dispatches: "50/dia", color: "border-muted/30 bg-muted/5" },
                { name: "Pro", price: 397, chips: "3 chips", dispatches: "200/dia", color: "border-muted/30 bg-muted/5" },
                { name: "Agency", price: 697, chips: "Ilimitado", dispatches: "Ilimitado", color: "border-muted/30 bg-muted/5" },
              ].map((p) => {
                const legacyCount = (overview.plan_counts as Record<string, number> | undefined)?.[p.name.toLowerCase()] ?? 0;
                return (
                <Card key={p.name} className={`border ${p.color} opacity-80`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-muted-foreground flex items-center gap-2">
                      {p.name} (legado)
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                        <Users className="h-2.5 w-2.5" /> {legacyCount}
                      </span>
                    </CardTitle>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xl font-bold text-muted-foreground">R$ {p.price.toLocaleString("pt-BR")}</span>
                      <span className="text-xs text-muted-foreground">/mês</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center gap-1.5"><CreditCard className="h-3 w-3" /> {p.chips}</div>
                    <div className="flex items-center gap-1.5"><MessageSquare className="h-3 w-3" /> {p.dispatches}</div>
                  </CardContent>
                </Card>
              );})}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="unipile" className="mt-3">
          <UnipileAccountsTab />
        </TabsContent>
      </Tabs>

      {/* Modal: criar cliente */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> Criar novo cliente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-email" className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> E-mail *
              </Label>
              <Input
                id="c-email"
                type="email"
                placeholder="cliente@empresa.com.br"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">O cliente receberá um convite por e-mail para criar a senha.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-company" className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Nome da empresa
              </Label>
              <Input
                id="c-company"
                placeholder="Ex: Agência XPTO"
                value={createCompany}
                onChange={(e) => setCreateCompany(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-agent" className="flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5" /> Nome do agente IA
              </Label>
              <Input
                id="c-agent"
                placeholder="Ex: Max, Marina, Aria..."
                value={createAgent}
                onChange={(e) => setCreateAgent(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Plano inicial</Label>
              <Select value={createPlan} onValueChange={setCreatePlan}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PLAN_LABELS).map(([p, { label }]) => (
                    <SelectItem key={p} value={p}>
                      {label}{PLAN_MRR[p] ? ` — R$ ${PLAN_MRR[p]}/mês` : " — Gratuito"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-password" className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> Senha (opcional)
              </Label>
              <Input
                id="c-password"
                type="password"
                placeholder="Deixe vazio para enviar convite por e-mail"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {createPassword.trim().length > 0 && createPassword.trim().length < 6
                  ? "⚠️ Mínimo 6 caracteres"
                  : createPassword.trim().length >= 6
                  ? "✅ Acesso imediato — cliente entra com e-mail + essa senha"
                  : "Se vazio, envia e-mail de convite para o cliente criar a própria senha"}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone" className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> WhatsApp do cliente (opcional)
              </Label>
              <Input
                id="c-phone"
                placeholder="11999999999 (para enviar boas-vindas)"
                value={createPhone}
                onChange={(e) => setCreatePhone(e.target.value)}
              />
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-primary" /> Usar minhas credenciais API
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cliente usa suas APIs (Gemini, Google Places, etc.) sem precisar configurar as próprias
                  </p>
                </div>
                <Switch checked={createSharedCreds} onCheckedChange={setCreateSharedCreds} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>Cancelar</Button>
            <Button
              disabled={creating || !createEmail.trim() || (createPassword.trim().length > 0 && createPassword.trim().length < 6)}
              onClick={async () => {
                setCreating(true);
                try {
                  const { data: res, error } = await supabase.functions.invoke("admin-manage-client", {
                    body: {
                      action: "create_client",
                      email: createEmail.trim().toLowerCase(),
                      company_name: createCompany.trim() || undefined,
                      agent_name: createAgent.trim() || undefined,
                      plan: createPlan,
                      password: createPassword.trim() || undefined,
                    },
                  });
                  if (error) throw error;
                  if (res?.error) throw new Error(res.error);
                  const newUserId = res?.user_id;
                  const method = res?.method;

                  // Se toggle de credenciais ativado, copia as chaves do admin para o novo cliente
                  if (createSharedCreds && newUserId) {
                    await supabase.functions.invoke("admin-manage-client", {
                      body: {
                        action: "toggle_admin_creds",
                        client_id: newUserId,
                        enable: true,
                        contact_phone: createPhone.replace(/\D/g, "") || undefined,
                      },
                    });
                  } else if (createPhone && newUserId) {
                    await supabase.functions.invoke("admin-manage-client", {
                      body: { action: "toggle_admin_creds", client_id: newUserId, enable: false, contact_phone: createPhone.replace(/\D/g, "") },
                    });
                  }

                  toast({
                    title: method === "direct" ? "✅ Cliente criado!" : "✅ Convite enviado!",
                    description: method === "direct"
                      ? `${createEmail} já pode fazer login com a senha definida.`
                      : `${createEmail} receberá o e-mail de acesso.`,
                  });
                  setCreateEmail(""); setCreateCompany(""); setCreateAgent(""); setCreatePlan("trial");
                  setCreatePassword(""); setCreatePhone(""); setCreateSharedCreds(false);
                  setCreateOpen(false);
                  qc.invalidateQueries({ queryKey: ["admin_metrics"] });
                } catch (e: any) {
                  toast({ title: "Erro", description: e?.message, variant: "destructive" });
                } finally {
                  setCreating(false);
                }
              }}
            >
              {creating
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Criando...</>
                : createPassword.trim().length >= 6
                  ? <><Lock className="h-4 w-4 mr-1.5" />Criar com senha</>
                  : <><Send className="h-4 w-4 mr-1.5" />Criar e enviar convite</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: boas-vindas WhatsApp */}
      <Dialog open={!!waClient} onOpenChange={(o) => { if (!o) { setWaClient(null); setWaPhone(""); setWaMessage(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-emerald-500" /> Boas-vindas WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/40 rounded p-3 text-xs text-muted-foreground">
              A mensagem será enviada via seu chip WhatsApp ativo (testecleo). O número é salvo para contatos futuros.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-phone" className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> WhatsApp do cliente *
              </Label>
              <Input
                id="wa-phone"
                placeholder="11999999999 (sem +55)"
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Digite só os números com DDD, sem espaços ou traços.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-msg">Mensagem</Label>
              <Textarea
                id="wa-msg"
                rows={7}
                value={waMessage}
                onChange={(e) => setWaMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setWaClient(null); setWaPhone(""); setWaMessage(""); }} disabled={waSending}>
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={waSending || !waPhone.replace(/\D/g, "").length || !waMessage.trim()}
              onClick={async () => {
                setWaSending(true);
                try {
                  const { data: res, error } = await supabase.functions.invoke("admin-manage-client", {
                    body: { action: "send_welcome_whatsapp", client_id: waClient?.id, phone: waPhone, message: waMessage },
                  });
                  if (error) throw error;
                  if (res?.error) throw new Error(res.error);
                  toast({ title: "✅ Mensagem enviada!", description: `WhatsApp enviado para ${waPhone}` });
                  qc.invalidateQueries({ queryKey: ["admin_metrics"] });
                  setWaClient(null); setWaPhone(""); setWaMessage("");
                } catch (e: any) {
                  toast({ title: "Erro ao enviar", description: e?.message, variant: "destructive" });
                } finally {
                  setWaSending(false);
                }
              }}
            >
              {waSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-1.5" />}
              Enviar WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: editar cliente */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) { setEditOpen(false); setEditClient(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" /> Editar cliente — {editClient?.email}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-4 overflow-y-auto flex-1">

            <div className="space-y-1.5">
              <Label htmlFor="e-company" className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Nome da empresa
              </Label>
              <Input
                id="e-company"
                placeholder="Ex: Agência XPTO"
                value={editCompany}
                onChange={(e) => setEditCompany(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-agent" className="flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5" /> Nome do agente IA
              </Label>
              <Input
                id="e-agent"
                placeholder="Ex: Max, Marina, Aria..."
                value={editAgent}
                onChange={(e) => setEditAgent(e.target.value)}
              />
            </div>
            {/* Compartilhamento granular por API */}
            {editClient?.id && <SharedApisPanel clientId={editClient.id} />}

            <div className="pt-1 border-t border-border space-y-2">
              <p className="text-xs text-muted-foreground mb-2">Acessos & administração:</p>

              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs justify-start"
                disabled={editLoading}
                onClick={async () => {
                  setEditLoading(true);
                  try {
                    const { data: res, error } = await supabase.functions.invoke("admin-manage-client", {
                      body: { action: "reset_password", client_id: editClient.id },
                    });
                    if (error) throw error;
                    if (res?.error) throw new Error(res.error);
                    toast({ title: "✅ E-mail de redefinição enviado", description: editClient.email });
                  } catch (e: any) {
                    toast({ title: "Erro", description: e?.message, variant: "destructive" });
                  } finally {
                    setEditLoading(false);
                  }
                }}
              >
                <KeyRound className="h-3.5 w-3.5 mr-1.5" /> Enviar reset de senha por e-mail
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs justify-start"
                disabled={editLoading}
                onClick={async () => {
                  const novoEmail = window.prompt(`Novo e-mail para ${editClient.email}:`, editClient.email);
                  if (!novoEmail || novoEmail === editClient.email) return;
                  setEditLoading(true);
                  try {
                    const { data: res, error } = await supabase.functions.invoke("admin-manage-client", {
                      body: { action: "change_email", client_id: editClient.id, email: novoEmail.trim().toLowerCase() },
                    });
                    if (error) throw error;
                    if (res?.error) throw new Error(res.error);
                    toast({ title: "✅ E-mail alterado", description: `Agora: ${res.email}` });
                    qc.invalidateQueries({ queryKey: ["admin_metrics"] });
                    setEditClient({ ...editClient, email: res.email });
                  } catch (e: any) {
                    toast({ title: "Erro", description: e?.message, variant: "destructive" });
                  } finally {
                    setEditLoading(false);
                  }
                }}
              >
                <Mail className="h-3.5 w-3.5 mr-1.5" /> Trocar e-mail de login
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs justify-start"
                disabled={editLoading}
                onClick={async () => {
                  setEditLoading(true);
                  try {
                    const { data: res, error } = await supabase.functions.invoke("admin-manage-client", {
                      body: { action: "impersonate", client_id: editClient.id },
                    });
                    if (error) throw error;
                    if (res?.error) throw new Error(res.error);
                    if (res.action_link) {
                      window.open(res.action_link, "_blank");
                      toast({ title: "🔓 Link de acesso aberto", description: `Você foi logado como ${res.email} em outra aba.` });
                    }
                  } catch (e: any) {
                    toast({ title: "Erro", description: e?.message, variant: "destructive" });
                  } finally {
                    setEditLoading(false);
                  }
                }}
              >
                <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Entrar como este cliente
              </Button>

              <Button
                variant="outline"
                size="sm"
                className={`w-full text-xs justify-start ${editClient?.is_admin ? "text-amber-500 border-amber-500/40" : ""}`}
                disabled={editLoading}
                onClick={async () => {
                  const promoting = !editClient?.is_admin;
                  if (promoting && !window.confirm(`Promover ${editClient.email} a ADMIN? Ele terá acesso total ao painel admin.`)) return;
                  if (!promoting && !window.confirm(`Remover privilégio admin de ${editClient.email}?`)) return;
                  setEditLoading(true);
                  try {
                    const { data: res, error } = await supabase.functions.invoke("admin-manage-client", {
                      body: { action: "toggle_admin", client_id: editClient.id, enable: promoting },
                    });
                    if (error) throw error;
                    if (res?.error) throw new Error(res.error);
                    toast({ title: promoting ? "👑 Promovido a admin" : "Rebaixado a cliente comum", description: editClient.email });
                    setEditClient({ ...editClient, is_admin: promoting });
                    qc.invalidateQueries({ queryKey: ["admin_metrics"] });
                  } catch (e: any) {
                    toast({ title: "Erro", description: e?.message, variant: "destructive" });
                  } finally {
                    setEditLoading(false);
                  }
                }}
              >
                <Crown className="h-3.5 w-3.5 mr-1.5" />
                {editClient?.is_admin ? "Remover privilégio admin" : "Promover a admin"}
              </Button>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">

            <Button variant="ghost" onClick={() => { setEditOpen(false); setEditClient(null); }} disabled={editLoading}>
              Cancelar
            </Button>
            <Button
              disabled={editLoading || (!editCompany.trim() && !editAgent.trim())}
              onClick={async () => {
                setEditLoading(true);
                try {
                  const { data: res, error } = await supabase.functions.invoke("admin-manage-client", {
                    body: {
                      action: "edit_client",
                      client_id: editClient.id,
                      company_name: editCompany.trim() || undefined,
                      agent_name: editAgent.trim() || undefined,
                    },
                  });
                  if (error) throw error;
                  if (res?.error) throw new Error(res.error);
                  toast({ title: "✅ Dados atualizados com sucesso" });
                  qc.invalidateQueries({ queryKey: ["admin_metrics"] });
                  setEditOpen(false);
                  setEditClient(null);
                } catch (e: any) {
                  toast({ title: "Erro", description: e?.message, variant: "destructive" });
                } finally {
                  setEditLoading(false);
                }
              }}
            >
              {editLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação: deletar cliente */}
      <AlertDialog open={!!deleteClient} onOpenChange={(o) => { if (!o) setDeleteClient(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Deletar cliente permanentemente?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Você está prestes a deletar:</p>
              <p className="font-semibold text-foreground">{deleteClient?.company_name} — {deleteClient?.email}</p>
              <p className="text-destructive font-medium">⚠️ Esta ação é irreversível. Todos os dados do cliente (leads, conversas, chips, configurações) serão apagados permanentemente.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteLoading}
              onClick={async () => {
                setDeleteLoading(true);
                try {
                  const { data: res, error } = await supabase.functions.invoke("admin-manage-client", {
                    body: { action: "delete_client", client_id: deleteClient.id },
                  });
                  if (error) throw error;
                  if (res?.error) throw new Error(res.error);
                  toast({ title: "✅ Cliente deletado", description: `${deleteClient.email} removido permanentemente.` });
                  qc.invalidateQueries({ queryKey: ["admin_metrics"] });
                  setDeleteClient(null);
                } catch (e: any) {
                  toast({ title: "Erro ao deletar", description: e?.message, variant: "destructive" });
                } finally {
                  setDeleteLoading(false);
                }
              }}
            >
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sim, deletar permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal: alterar plano */}
      <Dialog open={actionType === "plan" && !!actionClient} onOpenChange={() => setActionType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar plano — {actionClient?.company_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={newPlan} onValueChange={setNewPlan}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PLAN_LABELS).map(([p, { label }]) => (
                  <SelectItem key={p} value={p}>
                    {label} — R$ {PLAN_MRR[p] ?? 0}/mês
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2 space-y-1">
              <p><strong>free</strong>: ilimitado, todos os canais — cliente usa próprias APIs (Unipile, OpenAI, Gemini, ElevenLabs, Dados4U). Sem custo.</p>
              <p><strong>mensal</strong> R$ 697/mês: ilimitado, todos os canais, admin paga todas as APIs.</p>
              <p><strong>semestral</strong> 6x R$ 497 (R$ 2.982): mesmo do mensal, cobrança semestral.</p>
              <p><strong>anual</strong> 12x R$ 397 (R$ 4.764): mesmo do mensal, cobrança anual.</p>
              <p><strong>whitelabel</strong> R$ 300/mês + R$ 5.500 setup (3 rebuilds inclusos): revanda usa as próprias APIs, só paga pelo painel e revende com sub-contas.</p>
              <p className="pt-1 border-t border-border/40"><strong>Add-on Coex+ChatWoot</strong> +R$ 480/mês: até 2.000 disparos sem risco de ban (gerenciar via toggle no card do cliente).</p>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-3 py-2">
              <div className="text-xs">
                <div className="font-semibold">Add-on Coex+ChatWoot</div>
                <div className="text-muted-foreground">+R$ 480/mês — até 2.000 disparos sem ban</div>
              </div>
              <Switch
                checked={!!actionClient?.coex_chatwoot_enabled}
                onCheckedChange={async (v) => {
                  await manage("toggle_coex", actionClient.id, { enable: v });
                }}
              />
            </div>
            <Textarea
              placeholder="Nota interna (opcional)"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionType(null)}>Cancelar</Button>
            <Button
              disabled={actionLoading}
              onClick={async () => {
                if (noteText) await manage("add_note", actionClient.id, { notes: noteText });
                await manage("change_plan", actionClient.id, { plan: newPlan });
              }}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
