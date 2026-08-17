import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, Crown, Users, Plus, Pause, Play, RefreshCw, Building2, Mail, Bot,
} from "lucide-react";

export default function Reseller() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newAgent, setNewAgent] = useState("");
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Verifica se o usuário tem reseller_enabled
  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["my_subscription"],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_subscriptions")
        .select("reseller_enabled, plan, status")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Busca clientes do reseller
  const { data: resellerData, isLoading: clientsLoading, refetch } = useQuery({
    queryKey: ["reseller_clients"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("reseller-create-client", {
        body: { action: "list" },
      });
      if (error) throw error;
      return data as { clients: any[] };
    },
    enabled: !!subscription?.reseller_enabled,
    refetchInterval: 30000,
  });

  if (loading || subLoading)
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  if (!user || !subscription?.reseller_enabled) {
    return <Navigate to="/dashboard" replace />;
  }

  const clients = resellerData?.clients ?? [];
  const activeCount = clients.filter((c) => c.status === "active").length;
  const pausedCount = clients.filter((c) => c.status === "paused").length;

  async function createClient() {
    if (!newEmail.trim()) {
      toast({ title: "E-mail obrigatório", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("reseller-create-client", {
        body: {
          action: "create",
          email: newEmail.trim().toLowerCase(),
          company_name: newCompany.trim() || undefined,
          agent_name: newAgent.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "✅ Convite enviado!", description: `${newEmail} receberá um e-mail para criar a senha.` });
      setNewEmail(""); setNewCompany(""); setNewAgent("");
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["reseller_clients"] });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function toggleClient(clientId: string, currentStatus: string) {
    const action = currentStatus === "active" ? "pause" : "resume";
    setActionLoading(clientId);
    try {
      const { data, error } = await supabase.functions.invoke("reseller-create-client", {
        body: { action, client_id: clientId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: action === "pause" ? "⏸ Cliente pausado" : "▶ Cliente reativado" });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Crown className="h-6 w-6 text-amber-400" />
            Painel WhiteLabel
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie seus clientes e crie novas contas para revenda
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={clientsLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${clientsLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Novo cliente
          </Button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Users className="h-4 w-4" /> Total de clientes
            </div>
            <div className="text-2xl font-bold">{clients.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" /> Ativos
            </div>
            <div className="text-2xl font-bold text-emerald-400">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> Pausados
            </div>
            <div className="text-2xl font-bold text-amber-400">{pausedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Como funciona */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-semibold text-amber-400 flex items-center gap-2">
            <Crown className="h-4 w-4" /> Plano WhiteLabel ativo
          </p>
          <p>Crie contas para seus clientes — cada um acessa a plataforma com e-mail e senha próprios.</p>
          <p>Seus clientes recebem o plano <strong>Agency</strong> (chips e disparos ilimitados, todos os canais) sem poder criar sub-contas.</p>
          <p>Você controla o acesso: pause ou retome qualquer cliente a qualquer momento.</p>
        </CardContent>
      </Card>

      {/* Tabela de clientes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Seus clientes</CardTitle>
          <CardDescription>
            {clients.length === 0
              ? "Nenhum cliente criado ainda. Clique em \"Novo cliente\" para começar."
              : `${clients.length} cliente${clients.length !== 1 ? "s" : ""} cadastrado${clients.length !== 1 ? "s" : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {clientsLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum cliente ainda</p>
              <p className="text-xs mt-1">Crie o primeiro clicando no botão "Novo cliente"</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left p-3">Empresa</th>
                    <th className="text-left p-3">E-mail</th>
                    <th className="text-center p-3">Status</th>
                    <th className="text-left p-3">Cadastro</th>
                    <th className="text-left p-3">Último acesso</th>
                    <th className="text-right p-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {clients.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-44">{c.company_name || c.email}</span>
                        </div>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground truncate max-w-40">{c.email}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          c.status === "active"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-amber-500/15 text-amber-400"
                        }`}>
                          {c.status === "active" ? "ativo" : "pausado"}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {c.last_sign_in ? new Date(c.last_sign_in).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Nunca acessou"}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={actionLoading === c.id}
                          onClick={() => toggleClient(c.id, c.status)}
                        >
                          {actionLoading === c.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : c.status === "active" ? (
                            <><Pause className="h-3 w-3 mr-1" />Pausar</>
                          ) : (
                            <><Play className="h-3 w-3 mr-1" />Retomar</>
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal: criar novo cliente */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> Novo cliente WhiteLabel
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="r-email" className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> E-mail do cliente *
              </Label>
              <Input
                id="r-email"
                type="email"
                placeholder="cliente@empresa.com.br"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                O cliente receberá um e-mail para criar a senha de acesso.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-company" className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Nome da empresa
              </Label>
              <Input
                id="r-company"
                placeholder="Ex: Empresa XPTO Ltda"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-agent" className="flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5" /> Nome do agente IA
              </Label>
              <Input
                id="r-agent"
                placeholder="Ex: Max, Marina, Aria..."
                value={newAgent}
                onChange={(e) => setNewAgent(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Pode ser alterado pelo cliente nas configurações de branding.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={createClient} disabled={creating || !newEmail.trim()}>
              {creating ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Criando...</>
              ) : (
                <><Plus className="h-4 w-4 mr-1.5" />Criar e enviar convite</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
