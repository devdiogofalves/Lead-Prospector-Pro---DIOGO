import { useState } from "react";
import { EmpresaEnriquecida } from "@/hooks/useEmpresasEnriquecidas";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Search, ExternalLink, Phone, MapPin, Trash2, Loader2, Eye, EyeOff,
  Download, Trash, Building2, RefreshCw, Mail, Briefcase,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { ConfirmDeleteAllDialog } from "@/components/ConfirmDeleteAllDialog";

interface Props {
  empresas: EmpresaEnriquecida[];
  isLoading: boolean;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onBatchLookup: () => void;
  isBatchLoading: boolean;
}

export function EmpresasEnriquecidasTable({
  empresas, isLoading, onDelete, onClearAll, onBatchLookup, isBatchLoading,
}: Props) {
  const [search, setSearch] = useState("");
  const [isVisible, setIsVisible] = useState(false);

  const filtered = empresas.filter((e) => {
    const q = search.toLowerCase();
    return (
      e.nome_empresa.toLowerCase().includes(q) ||
      (e.razao_social?.toLowerCase().includes(q) ?? false) ||
      (e.cnpj?.includes(search) ?? false) ||
      (e.atividade_principal?.toLowerCase().includes(q) ?? false)
    );
  });

  const exportToExcel = () => {
    if (empresas.length === 0) {
      toast({ title: "Nenhuma empresa para exportar", variant: "destructive" });
      return;
    }
    const data = empresas.map((e) => ({
      "Nome Fantasia": e.nome_fantasia || e.nome_empresa,
      "Razão Social": e.razao_social || "",
      CNPJ: e.cnpj,
      Porte: e.porte || "",
      "Natureza Jurídica": e.natureza_juridica || "",
      "Atividade Principal": e.atividade_principal || "",
      Situação: e.situacao || "",
      Sócios: e.socios || "",
      Telefone: e.telefone || "",
      Email: e.email || "",
      Endereço: e.endereco || "",
      Site: e.site || "",
      Avaliação: e.rating || "",
      Reviews: e.reviews || "",
      Fonte: e.fonte,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Empresas Enriquecidas");
    XLSX.writeFile(wb, `empresas_enriquecidas_${format(new Date(), "yyyy-MM-dd_HH-mm")}.xlsx`);
    toast({ title: "Exportação concluída", description: `${empresas.length} empresas exportadas.` });
  };

  if (isLoading) {
    return (
      <div className="glass rounded-xl border border-border/50 p-12 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="glass rounded-xl border border-border/50 animate-slide-up" style={{ animationDelay: "350ms" }}>
      <div className="p-6 border-b border-border/50">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <Building2 className="h-5 w-5 text-emerald-500" />
            </div>
            <h2 className="text-lg font-semibold">Empresas Enriquecidas</h2>
            <Badge variant="outline">{empresas.length}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onBatchLookup}
              disabled={isBatchLoading}
            >
              {isBatchLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Enriquecer em Lote
            </Button>
            <Button variant={isVisible ? "secondary" : "default"} size="sm" onClick={() => setIsVisible(!isVisible)}>
              {isVisible ? <><EyeOff className="h-4 w-4 mr-2" />Esconder</> : <><Eye className="h-4 w-4 mr-2" />Ver Empresas</>}
            </Button>
            <Button variant="outline" size="sm" onClick={exportToExcel} disabled={empresas.length === 0}>
              <Download className="h-4 w-4 mr-2" />Baixar Excel
            </Button>
            <ConfirmDeleteAllDialog
              count={empresas.length}
              itemLabel="empresas"
              onConfirm={onClearAll}
              trigger={
                <Button variant="destructive" size="sm" disabled={empresas.length === 0}>
                  <Trash className="h-4 w-4 mr-2" />Limpar
                </Button>
              }
            />
          </div>
        </div>
      </div>

      {isVisible && (
        <>
          <div className="p-6 border-b border-border/50">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, CNPJ ou atividade..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-secondary/50 border-border/50 focus:border-primary/50"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-semibold">Empresa</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">CNPJ / Situação</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">Contato</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">Sócios</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <p className="text-muted-foreground">
                        {empresas.length === 0
                          ? "Nenhuma empresa enriquecida ainda. Clique em 'Enriquecer em Lote' para consultar CNPJs."
                          : "Nenhuma empresa encontrada com os filtros atuais."}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((emp) => (
                    <TableRow key={emp.id} className="border-border/30 hover:bg-secondary/30 transition-colors">
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{emp.nome_fantasia || emp.nome_empresa}</p>
                          {emp.razao_social && (
                            <p className="text-xs text-muted-foreground truncate max-w-[250px]">{emp.razao_social}</p>
                          )}
                          {emp.porte && <Badge variant="outline" className="text-xs">{emp.porte}</Badge>}
                          {emp.atividade_principal && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Briefcase className="h-3 w-3" />
                              <span className="truncate max-w-[200px]">{emp.atividade_principal}</span>
                            </div>
                          )}
                          {emp.endereco && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate max-w-[200px]">{emp.endereco}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-sm font-mono">{emp.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}</p>
                          {emp.situacao && (
                            <Badge variant={emp.situacao === "Ativa" ? "success" : "pending"} className="text-xs">
                              {emp.situacao}
                            </Badge>
                          )}
                          {emp.natureza_juridica && (
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{emp.natureza_juridica}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {emp.telefone && (
                            <div className="flex items-center gap-1 text-sm">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              <span className="font-mono">{emp.telefone}</span>
                            </div>
                          )}
                          {emp.email && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              <span className="truncate max-w-[180px]">{emp.email}</span>
                            </div>
                          )}
                          {emp.site && (
                            <a href={emp.site} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                              <ExternalLink className="h-3 w-3" />
                              <span className="truncate max-w-[150px]">{emp.site.replace(/^https?:\/\//, "")}</span>
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {emp.socios && (
                          <p className="text-xs text-muted-foreground truncate max-w-[250px]" title={emp.socios}>
                            👤 {emp.socios}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => onDelete(emp.id)} className="hover:bg-destructive/20 hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="p-4 border-t border-border/50">
            <p className="text-sm text-muted-foreground text-center">
              Exibindo {filtered.length} de {empresas.length} empresas enriquecidas
            </p>
          </div>
        </>
      )}
    </div>
  );
}
