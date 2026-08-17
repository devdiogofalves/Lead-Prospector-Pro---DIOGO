import { useState } from "react";
import { InstagramContact, InstagramDisparoStatus } from "@/hooks/useInstagramContacts";
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
  Instagram,
  Search,
  Trash2,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Sparkles,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ConfirmDeleteAllDialog } from "@/components/ConfirmDeleteAllDialog";

interface InstagramContactsTableProps {
  contacts: InstagramContact[];
  filter: string;
  onFilterChange: (value: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

type SortField = "username" | "seguidores" | "whatsapp_validado" | "disparo" | "created_at";
type SortDirection = "asc" | "desc";

export function InstagramContactsTable({
  contacts,
  filter,
  onFilterChange,
  onDelete,
  onClearAll,
}: InstagramContactsTableProps) {
  const { toast } = useToast();
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isVisible, setIsVisible] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [waFilter, setWaFilter] = useState<"all" | "with" | "without">("all");

  const handleEnrich = async () => {
    const targets = contacts.filter((c) => c.nome || c.username).slice(0, 50);
    if (targets.length === 0) {
      toast({ title: "Nenhum contato para enriquecer", variant: "destructive" });
      return;
    }
    setEnriching(true);
    let ok = 0, fail = 0;
    for (const c of targets) {
      try {
        const name = c.nome || c.username;
        const { error } = await supabase.functions.invoke("cnpj-search-by-name", { body: { name } });
        if (error) fail++; else ok++;
      } catch { fail++; }
      await new Promise((r) => setTimeout(r, 1100));
    }
    setEnriching(false);
    toast({ title: "Enriquecimento concluído", description: `${ok} sucesso · ${fail} falha` });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const filteredContacts = contacts.filter((contact) => {
    const searchLower = filter.toLowerCase();
    const hasWa = !!(contact.whatsapp && contact.whatsapp.trim().length > 0);
    if (waFilter === "with" && !hasWa) return false;
    if (waFilter === "without" && hasWa) return false;
    return (
      contact.username.toLowerCase().includes(searchLower) ||
      contact.nome?.toLowerCase().includes(searchLower) ||
      contact.bio?.toLowerCase().includes(searchLower) ||
      contact.whatsapp?.includes(searchLower)
    );
  });

  const sortedContacts = [...filteredContacts].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case "username":
        comparison = a.username.localeCompare(b.username);
        break;
      case "seguidores":
        comparison = (a.seguidores || 0) - (b.seguidores || 0);
        break;
      case "whatsapp_validado":
        comparison = (a.whatsapp_validado ? 1 : 0) - (b.whatsapp_validado ? 1 : 0);
        break;
      case "disparo":
        comparison = (a.disparo || "").localeCompare(b.disparo || "");
        break;
      case "created_at":
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
    }
    return sortDirection === "asc" ? comparison : -comparison;
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    try {
      return format(new Date(dateString), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return null;
    }
  };

  const getStatusBadge = (status: InstagramDisparoStatus | null) => {
    if (status === "Sim") {
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Enviado</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground">Pendente</Badge>;
  };

  const getValidatedBadge = (validated: boolean | null) => {
    if (validated) {
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          <CheckCircle className="h-3 w-3 mr-1" />
          Válido
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <XCircle className="h-3 w-3 mr-1" />
        Não validado
      </Badge>
    );
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="h-4 w-4" />
    ) : (
      <ChevronDown className="h-4 w-4" />
    );
  };

  const exportToExcel = () => {
    const source = filteredContacts;
    if (source.length === 0) {
      toast({
        title: "Nenhum contato para exportar",
        variant: "destructive",
      });
      return;
    }

    const data = source.map((contact) => ({
      Username: contact.username,
      Nome: contact.nome || "",
      Bio: contact.bio || "",
      Seguidores: contact.seguidores || "",
      Seguindo: contact.seguindo || "",
      Posts: contact.posts || "",
      Email: contact.email || "",
      WhatsApp: contact.whatsapp || "",
      "WhatsApp Validado": contact.whatsapp_validado ? "Sim" : "Não",
      Site: (contact as any).site || "",
      "Perfil URL": contact.profile_url || "",
      Status: contact.disparo === "Sim" ? "Enviado" : "Pendente",
      "Data Disparo": contact.data_disparo ? formatDate(contact.data_disparo) || "" : "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Instagram Contatos");

    XLSX.writeFile(workbook, `instagram_contacts_${format(new Date(), "yyyy-MM-dd_HH-mm")}.xlsx`);

    toast({
      title: "Exportação concluída",
      description: `${source.length} contatos exportados (filtro ativo respeitado)`,
    });
  };

  return (
    <div
      className="glass rounded-xl border border-border/50 animate-slide-up"
      style={{ animationDelay: "500ms" }}
    >
      {/* Header with action buttons */}
      <div className="p-6 border-b border-border/50">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#E4405F]/20">
              <Instagram className="h-5 w-5 text-[#E4405F]" />
            </div>
              <h2 className="text-lg font-semibold">Contatos Instagram para DM</h2>
            <Badge variant="outline">{contacts.length}</Badge>
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
                  Ver Contatos
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToExcel}
              disabled={contacts.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Baixar Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnrich}
              disabled={enriching || contacts.length === 0}
            >
              {enriching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Enriquecer CNPJ
            </Button>
            <ConfirmDeleteAllDialog
              count={contacts.length}
              itemLabel="contatos"
              onConfirm={onClearAll}
              trigger={
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={contacts.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Limpar Contatos
                </Button>
              }
            />
          </div>
        </div>
      </div>

      {/* Collapsible content */}
      {isVisible && (
        <>
          {/* Search */}
          <div className="p-6 border-b border-border/50 space-y-3">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por username, nome, bio ou WhatsApp..."
                value={filter}
                onChange={(e) => onFilterChange(e.target.value)}
                className="pl-10 bg-secondary/50 border-border/50 focus:border-primary/50"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={waFilter === "all" ? "default" : "outline"}
                onClick={() => setWaFilter("all")}
              >
                Todos ({contacts.length})
              </Button>
              <Button
                size="sm"
                variant={waFilter === "with" ? "default" : "outline"}
                onClick={() => setWaFilter("with")}
                className={waFilter === "with" ? "bg-green-600 hover:bg-green-700" : ""}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Com WhatsApp ({contacts.filter((c) => c.whatsapp && c.whatsapp.trim()).length})
              </Button>
              <Button
                size="sm"
                variant={waFilter === "without" ? "default" : "outline"}
                onClick={() => setWaFilter("without")}
                className={waFilter === "without" ? "bg-orange-600 hover:bg-orange-700" : ""}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Sem WhatsApp · aptos para DM ({contacts.filter((c) => !c.whatsapp || !c.whatsapp.trim()).length})
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort("username")}
                  >
                    <div className="flex items-center gap-1">
                      Username
                      <SortIcon field="username" />
                    </div>
                  </TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Bio</TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort("seguidores")}
                  >
                    <div className="flex items-center gap-1">
                      Seguidores
                      <SortIcon field="seguidores" />
                    </div>
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort("whatsapp_validado")}
                  >
                    <div className="flex items-center gap-1">
                      Validado
                      <SortIcon field="whatsapp_validado" />
                    </div>
                  </TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort("disparo")}
                  >
                    <div className="flex items-center gap-1">
                      Status
                      <SortIcon field="disparo" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedContacts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="h-32 text-center text-muted-foreground"
                    >
                      <Instagram className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      Nenhum contato encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedContacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">
                        <a
                          href={contact.profile_url || `https://instagram.com/${contact.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-pink-400 hover:text-pink-300"
                        >
                          @{contact.username}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                      <TableCell>{contact.nome || "-"}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={contact.bio || ""}>
                        {contact.bio || "-"}
                      </TableCell>
                      <TableCell>{contact.seguidores?.toLocaleString() || 0}</TableCell>
                      <TableCell className="text-sm">
                        {contact.email || "-"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {contact.whatsapp || "-"}
                      </TableCell>
                      <TableCell>{getValidatedBadge(contact.whatsapp_validado)}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm">
                        {(contact as any).site ? (
                          <a
                            href={(contact as any).site}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-pink-400 hover:text-pink-300"
                            title={(contact as any).site}
                          >
                            {(contact as any).site.replace(/^https?:\/\//, "").slice(0, 24)}
                          </a>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(contact.disparo)}</TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir @{contact.username}?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onDelete(contact.id)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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
              Exibindo {sortedContacts.length} de {contacts.length} contatos
            </p>
          </div>
        </>
      )}
    </div>
  );
}
