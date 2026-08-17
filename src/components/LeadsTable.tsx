import { useState } from "react";
import { Lead, DisparoStatus } from "@/hooks/useLeads";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Star,
  ExternalLink,
  Phone,
  MapPin,
  Filter,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  Download,
  FileSearch,
  Trash,
  Map,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { translateInvokeError } from "@/lib/friendlyError";
import { ConfirmDeleteAllDialog } from "@/components/ConfirmDeleteAllDialog";

interface LeadsTableProps {
  leads: Lead[];
  filter: DisparoStatus;
  onFilterChange: (filter: DisparoStatus) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  isLoading: boolean;
}

export function LeadsTable({
  leads,
  filter,
  onFilterChange,
  onDelete,
  onClearAll,
  isLoading,
}: LeadsTableProps) {
  const [search, setSearch] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [loadingCnpj, setLoadingCnpj] = useState<string | null>(null);

  const handleCnpjLookup = async (lead: Lead) => {
    if (!lead.cnpj) {
      toast({
        title: "CNPJ não informado",
        description: "Este lead não possui CNPJ cadastrado. Informe o CNPJ manualmente.",
        variant: "destructive",
      });
      // Prompt for CNPJ
      const cnpj = window.prompt("Informe o CNPJ (somente números):");
      if (!cnpj) return;
      setLoadingCnpj(lead.id);
      try {
        const { data, error } = await supabase.functions.invoke("cnpj-lookup", {
          body: { cnpj: cnpj.trim(), leadId: lead.id },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Erro na consulta");
        toast({ title: "CNPJ consultado!", description: `Dados de ${data.data.razao_social} atualizados.` });
      } catch (err: any) {
        toast({ title: "Erro ao consultar CNPJ", description: translateInvokeError(err, "Consulta CNPJ"), variant: "destructive" });
      } finally {
        setLoadingCnpj(null);
      }
      return;
    }

    setLoadingCnpj(lead.id);
    try {
      const { data, error } = await supabase.functions.invoke("cnpj-lookup", {
        body: { cnpj: lead.cnpj, leadId: lead.id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro na consulta");
      toast({ title: "CNPJ consultado!", description: `Dados de ${data.data.razao_social} atualizados.` });
    } catch (err: any) {
      toast({ title: "Erro ao consultar CNPJ", description: translateInvokeError(err, "Consulta CNPJ"), variant: "destructive" });
    } finally {
      setLoadingCnpj(null);
    }
  };

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.nome_empresa.toLowerCase().includes(search.toLowerCase()) ||
      lead.telefone.includes(search) ||
      (lead.endereco?.toLowerCase().includes(search.toLowerCase()) ?? false);

    const matchesFilter =
      filter === "all" ||
      (filter === "sent" && lead.disparo === "Sim") ||
      (filter === "pending" && lead.disparo === "Não");

    return matchesSearch && matchesFilter;
  });

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 13) {
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    if (cleaned.length === 12) {
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
    }
    return phone;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const exportToExcel = () => {
    if (leads.length === 0) {
      toast({
        title: "Nenhum lead para exportar",
        description: "Capture alguns leads antes de exportar.",
        variant: "destructive",
      });
      return;
    }

    const data = leads.map((lead) => ({
      Empresa: lead.nome_empresa,
      Telefone: lead.telefone,
      Endereço: lead.endereco || "",
      Site: lead.site || "",
      Avaliação: lead.rating || "",
      Reviews: lead.reviews || "",
      Especialidades: lead.especialidades || "",
      CNPJ: lead.cnpj || "",
      "Razão Social": lead.razao_social || "",
      Porte: lead.porte || "",
      Sócios: lead.socios || "",
      Status: lead.disparo === "Sim" ? "Enviado" : "Pendente",
      "Data Disparo": lead.data_disparo ? formatDate(lead.data_disparo) || "" : "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
    
    XLSX.writeFile(workbook, `leads_${format(new Date(), "yyyy-MM-dd_HH-mm")}.xlsx`);

    toast({
      title: "Exportação concluída",
      description: `${leads.length} leads exportados com sucesso.`,
    });
  };

  if (isLoading) {
    return (
      <div className="glass rounded-xl border border-border/50 p-12 animate-slide-up flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      className="glass rounded-xl border border-border/50 animate-slide-up"
      style={{ animationDelay: "300ms" }}
    >
      {/* Header with action buttons */}
      <div className="p-3 sm:p-6 border-b border-border/50">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#34A853]/20">
              <Map className="h-5 w-5 text-[#34A853]" />
            </div>
            <h2 className="text-lg font-semibold">Leads Google Maps</h2>
            <Badge variant="outline">{leads.length}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={isVisible ? "secondary" : "default"}
              size="sm"
              onClick={() => setIsVisible(!isVisible)}
            >
              {isVisible ? (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Esconder
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Ver Leads
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToExcel}
              disabled={leads.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Baixar Excel
            </Button>
            <ConfirmDeleteAllDialog
              count={leads.length}
              itemLabel="leads"
              onConfirm={onClearAll}
              trigger={
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={leads.length === 0}
                >
                  <Trash className="h-4 w-4 mr-2" />
                  Limpar Leads
                </Button>
              }
            />
          </div>
        </div>
      </div>

      {/* Collapsible content */}
      {isVisible && (
        <>
          {/* Search and filters */}
          <div className="p-3 sm:p-6 border-b border-border/50">
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar empresa, telefone ou endereço..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 bg-secondary/50 border-border/50 focus:border-primary/50"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <div className="flex rounded-lg bg-secondary/50 p-1">
                  {[
                    { value: "all" as const, label: "Todos" },
                    { value: "sent" as const, label: "Enviados" },
                    { value: "pending" as const, label: "Pendentes" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => onFilterChange(option.value)}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                        filter === option.value
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-semibold">
                    Empresa
                  </TableHead>
                  <TableHead className="text-muted-foreground font-semibold">
                    Contato
                  </TableHead>
                  <TableHead className="text-muted-foreground font-semibold">
                    Avaliação
                  </TableHead>
                  <TableHead className="text-muted-foreground font-semibold">
                    Status
                  </TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-right">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <p className="text-muted-foreground">
                        {leads.length === 0
                          ? "Nenhum lead capturado ainda. Use as buscas (Maps, LinkedIn, Instagram) para começar."
                          : "Nenhum lead encontrado com os filtros atuais."}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeads.map((lead, index) => (
                    <TableRow
                      key={lead.id}
                      className="border-border/30 hover:bg-secondary/30 transition-colors"
                      style={{ animationDelay: `${400 + index * 50}ms` }}
                    >
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{lead.nome_empresa}</p>
                          {lead.porte && (
                            <Badge variant="outline" className="text-xs">
                              {lead.porte}
                            </Badge>
                          )}
                          {lead.socios && (
                            <p className="text-xs text-muted-foreground truncate max-w-[250px]" title={lead.socios}>
                              👤 {lead.socios}
                            </p>
                          )}
                          {lead.endereco && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate max-w-[200px]">
                                {lead.endereco}
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm font-mono">
                              {formatPhone(lead.telefone)}
                            </span>
                          </div>
                          {lead.site && (
                            <a
                              href={lead.site}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span className="truncate max-w-[150px]">
                                {lead.site.replace(/^https?:\/\//, "")}
                              </span>
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 fill-warning text-warning" />
                            <span className="font-semibold">
                              {lead.rating ?? "-"}
                            </span>
                          </div>
                          {lead.reviews && (
                            <span className="text-xs text-muted-foreground">
                              ({lead.reviews} reviews)
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge
                            variant={lead.disparo === "Sim" ? "success" : "pending"}
                          >
                            {lead.disparo === "Sim" ? "Enviado" : "Pendente"}
                          </Badge>
                          {lead.data_disparo && (
                            <p className="text-xs text-muted-foreground">
                              {formatDate(lead.data_disparo)}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCnpjLookup(lead)}
                            disabled={loadingCnpj === lead.id || lead.cnpj_validado === true}
                            className="hover:bg-primary/20 hover:text-primary"
                            title={lead.cnpj_validado ? "CNPJ já validado" : "Consultar CNPJ"}
                          >
                            {loadingCnpj === lead.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FileSearch className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDelete(lead.id)}
                            className="hover:bg-destructive/20 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border/50">
            <p className="text-sm text-muted-foreground text-center">
              Exibindo {filteredLeads.length} de {leads.length} leads
            </p>
          </div>
        </>
      )}
    </div>
  );
}
