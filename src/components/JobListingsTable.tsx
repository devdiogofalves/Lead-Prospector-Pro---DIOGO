import { useState } from "react";
import { JobListing, JobListingDisparoStatus } from "@/hooks/useJobListings";
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
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Filter,
  Trash2,
  Loader2,
  Briefcase,
  Building2,
  Eye,
  EyeOff,
  Download,
  Trash,
  DollarSign,
  Globe,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

interface JobListingsTableProps {
  listings: JobListing[];
  filter: JobListingDisparoStatus;
  onFilterChange: (filter: JobListingDisparoStatus) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  isLoading: boolean;
  source: "catho" | "infojobs";
}

const sourceConfig = {
  catho: {
    color: "#FF6B00",
    name: "Catho",
    bgClass: "bg-[#FF6B00]/20",
    textClass: "text-[#FF6B00]",
  },
  infojobs: {
    color: "#00A0DC",
    name: "Infojobs",
    bgClass: "bg-[#00A0DC]/20",
    textClass: "text-[#00A0DC]",
  },
};

export function JobListingsTable({
  listings,
  filter,
  onFilterChange,
  onDelete,
  onClearAll,
  isLoading,
  source,
}: JobListingsTableProps) {
  const [search, setSearch] = useState("");
  const [isVisible, setIsVisible] = useState(false);

  const config = sourceConfig[source];

  const filteredListings = listings.filter((listing) => {
    const matchesSearch =
      listing.titulo_vaga.toLowerCase().includes(search.toLowerCase()) ||
      (listing.empresa?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (listing.localizacao?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (listing.email?.toLowerCase().includes(search.toLowerCase()) ?? false);

    const matchesFilter =
      filter === "all" ||
      (filter === "sent" && listing.disparo === "Sim") ||
      (filter === "pending" && listing.disparo === "Não");

    return matchesSearch && matchesFilter;
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const exportToExcel = () => {
    if (listings.length === 0) {
      toast({
        title: "Nenhuma vaga para exportar",
        description: "Capture algumas vagas antes de exportar.",
        variant: "destructive",
      });
      return;
    }

    const data = listings.map((listing) => ({
      "Título da Vaga": listing.titulo_vaga,
      Empresa: listing.empresa || "",
      Email: listing.email || "",
      Telefone: listing.telefone || "",
      "Site Empresa": listing.site_empresa || "",
      Setor: listing.setor || "",
      Localização: listing.localizacao || "",
      Salário: listing.salario || "",
      Fonte: listing.fonte,
      "URL Vaga": listing.url_vaga || "",
      Status: listing.disparo === "Sim" ? "Enviado" : "Pendente",
      "Data Disparo": listing.data_disparo ? formatDate(listing.data_disparo) || "" : "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `${config.name} Vagas`);
    
    XLSX.writeFile(workbook, `${source}_vagas_${format(new Date(), "yyyy-MM-dd_HH-mm")}.xlsx`);

    toast({
      title: "Exportação concluída",
      description: `${listings.length} vagas exportadas com sucesso.`,
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
      style={{ animationDelay: "400ms" }}
    >
      {/* Header with action buttons */}
      <div className="p-6 border-b border-border/50">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg", config.bgClass)}>
              <Briefcase className={cn("h-5 w-5", config.textClass)} />
            </div>
            <h2 className="text-lg font-semibold">Vagas {config.name}</h2>
            <Badge variant="outline">{listings.length}</Badge>
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
                  Ver Vagas
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToExcel}
              disabled={listings.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Baixar Excel
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={listings.length === 0}
                >
                  <Trash className="h-4 w-4 mr-2" />
                  Limpar Vagas
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar todas as vagas?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. Todas as {listings.length} vagas serão excluídas permanentemente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={onClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Excluir Todas
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Collapsible content */}
      {isVisible && (
        <>
          {/* Search and filters */}
          <div className="p-6 border-b border-border/50">
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar vaga, empresa ou localização..."
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
                    Vaga
                  </TableHead>
                  <TableHead className="text-muted-foreground font-semibold">
                    Empresa
                  </TableHead>
                  <TableHead className="text-muted-foreground font-semibold">
                    Contato
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
                {filteredListings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <p className="text-muted-foreground">
                        {listings.length === 0
                          ? `Nenhuma vaga do ${config.name} capturada ainda. Use a busca acima para começar!`
                          : "Nenhuma vaga encontrada com os filtros atuais."}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredListings.map((listing, index) => (
                    <TableRow
                      key={listing.id}
                      className="border-border/30 hover:bg-secondary/30 transition-colors"
                      style={{ animationDelay: `${500 + index * 50}ms` }}
                    >
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{listing.titulo_vaga}</p>
                          {listing.localizacao && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate max-w-[180px]">
                                {listing.localizacao}
                              </span>
                            </div>
                          )}
                          {listing.salario && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <DollarSign className="h-3 w-3" />
                              <span>{listing.salario}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {listing.empresa && (
                            <div className="flex items-center gap-2">
                              <Building2 className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm truncate max-w-[180px]">
                                {listing.empresa}
                              </span>
                            </div>
                          )}
                          {listing.setor && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Tag className="h-3 w-3" />
                              <span className="capitalize">{listing.setor}</span>
                            </div>
                          )}
                          {listing.site_empresa && (
                            <a
                              href={listing.site_empresa.startsWith('http') ? listing.site_empresa : `https://${listing.site_empresa}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <Globe className="h-3 w-3" />
                              <span className="truncate max-w-[150px]">{listing.site_empresa.replace(/^https?:\/\//, '')}</span>
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {listing.email && (
                            <div className="flex items-center gap-2">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm truncate max-w-[150px]">
                                {listing.email}
                              </span>
                            </div>
                          )}
                          {listing.telefone && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm font-mono">
                                {listing.telefone}
                              </span>
                            </div>
                          )}
                          {listing.url_vaga && (
                            <a
                              href={listing.url_vaga}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn("flex items-center gap-1 text-xs hover:underline", config.textClass)}
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span>Ver vaga</span>
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge
                            variant={listing.disparo === "Sim" ? "success" : "pending"}
                          >
                            {listing.disparo === "Sim" ? "Enviado" : "Pendente"}
                          </Badge>
                          {listing.data_disparo && (
                            <p className="text-xs text-muted-foreground">
                              {formatDate(listing.data_disparo)}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(listing.id)}
                          className="hover:bg-destructive/20 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
              Exibindo {filteredListings.length} de {listings.length} vagas
            </p>
          </div>
        </>
      )}
    </div>
  );
}
