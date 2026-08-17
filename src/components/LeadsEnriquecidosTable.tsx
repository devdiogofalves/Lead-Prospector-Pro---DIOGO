import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Phone,
  Mail,
  MessageCircle,
  Linkedin as LinkedinIcon,
  Instagram as InstagramIcon,
  Search,
  Gem,
  Loader2,
  IdCard,
  Trash2,
  Trash,
} from "lucide-react";
import { LeadEnriquecido } from "@/hooks/useLeadsEnriquecidos";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { LeadEnriquecidoDrawer } from "@/components/LeadEnriquecidoDrawer";

interface Props {
  leads: LeadEnriquecido[];
  isLoading: boolean;
}

type Completeness = "all" | "100" | "75" | "50";

function scoreColor(score: number) {
  if (score >= 85) return "bg-success/15 text-success border-success/30";
  if (score >= 60) return "bg-primary/15 text-primary border-primary/30";
  if (score >= 35) return "bg-warning/15 text-warning border-warning/30";
  return "bg-muted text-muted-foreground border-border";
}

function extractFirstCpf(socios: string | null): string | null {
  if (!socios) return null;
  const m = socios.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
  return m ? m[0].replace(/\D/g, "") : null;
}

export function LeadsEnriquecidosTable({ leads, isLoading }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Completeness>("all");
  const [enriching, setEnriching] = useState<string | null>(null);
  const [purgeThreshold, setPurgeThreshold] = useState<string>("50");
  const [purging, setPurging] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [selectedLead, setSelectedLead] = useState<LeadEnriquecido | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["empresas_enriquecidas"] });
    queryClient.invalidateQueries({ queryKey: ["linkedin_contacts"] });
    queryClient.invalidateQueries({ queryKey: ["instagram_contacts"] });
  };

  const deleteOneEverywhere = async (lead: LeadEnriquecido) => {
    const name = lead.empresa;
    if (!name) return;
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return;
    await Promise.all([
      supabase.from("leads").delete().ilike("nome_empresa", name).eq("user_id", userId),
      supabase.from("empresas_enriquecidas").delete().ilike("nome_empresa", name).eq("user_id", userId),
      supabase.from("linkedin_contacts").delete().ilike("empresa", name).eq("user_id", userId),
      supabase.from("instagram_contacts").delete().or(`nome.ilike.${name},username.ilike.${name}`).eq("user_id", userId),
    ]);
  };

  const handleDeleteOne = async (lead: LeadEnriquecido) => {
    setDeletingKey(lead.key);
    try {
      await deleteOneEverywhere(lead);
      toast({ title: "Lead removido", description: lead.empresa });
      invalidateAll();
    } catch (e) {
      toast({ title: "Erro ao remover", description: e instanceof Error ? e.message : "Falha", variant: "destructive" });
    } finally {
      setDeletingKey(null);
    }
  };

  const handlePurgeBadLeads = async () => {
    const threshold = parseInt(purgeThreshold, 10);
    const targets = leads.filter((l) => l.score < threshold);
    if (targets.length === 0) {
      toast({ title: "Nada para limpar", description: `Nenhum lead com score < ${threshold}%.` });
      return;
    }
    setPurging(true);
    try {
      for (const t of targets) {
        await deleteOneEverywhere(t);
      }
      toast({ title: "Limpeza concluída", description: `${targets.length} leads ruins removidos.` });
      invalidateAll();
    } catch (e) {
      toast({ title: "Erro na limpeza", description: e instanceof Error ? e.message : "Falha", variant: "destructive" });
    } finally {
      setPurging(false);
    }
  };

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (filter === "100" && l.score < 100) return false;
      if (filter === "75" && l.score < 75) return false;
      if (filter === "50" && l.score < 50) return false;
      if (search) {
        const q = search.toLowerCase();
        const blob = `${l.empresa} ${l.cnpj ?? ""} ${l.razaoSocial ?? ""} ${l.linkedinNome ?? ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [leads, filter, search]);

  const handleDados4u = async (lead: LeadEnriquecido) => {
    const cpf = extractFirstCpf(lead.socios);
    const valor = cpf || lead.cnpj?.replace(/\D/g, "");
    if (!valor) {
      toast({
        title: "Sem CPF/CNPJ",
        description: "Não há CPF de sócio ou CNPJ identificado para esta linha.",
        variant: "destructive",
      });
      return;
    }
    setEnriching(lead.key);
    try {
      const { data, error } = await supabase.functions.invoke("dados4u-query-v2", {
        body: { tipo: "cpf_cnpj", valor },
      });
      if (error?.message?.includes("Erro Dados4U 404") || data?.notFound) {
        toast({
          title: "Nenhum dado encontrado no DadosBooster",
          description: data?.error || "Não há registros para esse CPF/CNPJ.",
        });
        return;
      }
      if (error) throw error;
      toast({
        title: "DadosBooster enriquecido!",
        description: `${data?.nome ?? valor} — ${data?.celulares?.length ?? 0} celulares, ${data?.emails?.length ?? 0} emails.`,
      });
    } catch (e) {
      toast({
        title: "Erro DadosBooster",
        description: e instanceof Error ? e.message : "Falha ao consultar.",
        variant: "destructive",
      });
    } finally {
      setEnriching(null);
    }
  };

  return (
    <Card className="glass border-border/50">
      <div className="p-4 border-b border-border/50 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-auto">
          <Gem className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Visão 360° — Cruzamento por Empresa</h2>
          <Badge variant="outline">{filtered.length} de {leads.length}</Badge>
          <span className="hidden md:inline text-xs text-muted-foreground ml-1">
            · clique na linha para abrir ações
          </span>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Empresa, CNPJ, sócio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Completeness)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Completude" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="50">≥ 50%</SelectItem>
            <SelectItem value="75">≥ 75%</SelectItem>
            <SelectItem value="100">Completos (100%)</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Select value={purgeThreshold} onValueChange={setPurgeThreshold}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">&lt; 25%</SelectItem>
              <SelectItem value="50">&lt; 50%</SelectItem>
              <SelectItem value="75">&lt; 75%</SelectItem>
            </SelectContent>
          </Select>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={purging}>
                {purging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash className="h-4 w-4" />}
                <span className="ml-1">Limpar ruins</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar leads ruins?</AlertDialogTitle>
                <AlertDialogDescription>
                  Serão removidos {leads.filter((l) => l.score < parseInt(purgeThreshold, 10)).length} leads com score abaixo de {purgeThreshold}% — em Maps, Empresas Enriquecidas, LinkedIn e Instagram.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handlePurgeBadLeads} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Remover
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Empresa</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Sócios</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>LinkedIn</TableHead>
              <TableHead>Instagram</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Score</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                  Nenhum lead enriquecido encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((l) => (
                <TableRow
                  key={l.key}
                  className="cursor-pointer hover:bg-secondary/40 transition-colors"
                  onClick={() => {
                    setSelectedLead(l);
                    setDrawerOpen(true);
                  }}
                >
                  <TableCell>
                    <div className="font-medium">{l.empresa}</div>
                    {l.razaoSocial && l.razaoSocial !== l.empresa && (
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {l.razaoSocial}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {l.cnpj || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="max-w-[180px]">
                    {l.socios ? (
                      <div className="text-xs truncate" title={l.socios}>{l.socios}</div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {l.telefoneMaps ? (
                      <div className="flex items-center gap-1 text-xs">
                        <Phone className="h-3 w-3 text-success" />
                        {l.telefoneMaps}
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {(l.emailEmpresa || l.linkedinEmail) ? (
                      <div className="flex items-center gap-1 text-xs">
                        <Mail className="h-3 w-3 text-primary" />
                        <span className="truncate max-w-[140px]">{l.emailEmpresa || l.linkedinEmail}</span>
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {l.linkedinUrl ? (
                      <a href={l.linkedinUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <LinkedinIcon className="h-3 w-3" />
                        {l.linkedinNome ?? "Perfil"}
                      </a>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {l.instagramUsername ? (
                      <a href={l.instagramUrl ?? `https://instagram.com/${l.instagramUsername}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                        <InstagramIcon className="h-3 w-3" />
                        @{l.instagramUsername}
                      </a>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {(l.linkedinTelefone || l.instagramWhatsapp) ? (
                      <div className="flex items-center gap-1 text-xs text-success">
                        <MessageCircle className="h-3 w-3" />
                        {l.linkedinTelefone || l.instagramWhatsapp}
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={scoreColor(l.score)}>
                      {l.score}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleDados4u(l); }}
                      disabled={enriching === l.key || (!l.socios && !l.cnpj)}
                      title="Enriquecer com DadosBooster"
                    >
                      {enriching === l.key ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <IdCard className="h-3 w-3" />
                      )}
                      <span className="ml-1 hidden lg:inline">DadosBooster</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleDeleteOne(l); }}
                      disabled={deletingKey === l.key}
                      title="Remover este lead de todas as bases"
                      className="hover:bg-destructive/20 hover:text-destructive"
                    >
                      {deletingKey === l.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <LeadEnriquecidoDrawer
        lead={selectedLead}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </Card>
  );
}