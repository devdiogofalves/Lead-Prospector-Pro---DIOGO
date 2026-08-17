import { useState } from "react";
import { LinkedInContact, LinkedInDisparoStatus } from "@/hooks/useLinkedInContacts";
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
  Users,
  Linkedin,
  Eye,
  EyeOff,
  Download,
  Trash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";
import { ConfirmDeleteAllDialog } from "@/components/ConfirmDeleteAllDialog";
import { LinkedInContactDrawer } from "@/components/LinkedInContactDrawer";

interface LinkedInContactsTableProps {
  contacts: LinkedInContact[];
  filter: LinkedInDisparoStatus;
  onFilterChange: (filter: LinkedInDisparoStatus) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  isLoading: boolean;
}

export function LinkedInContactsTable({
  contacts,
  filter,
  onFilterChange,
  onDelete,
  onClearAll,
  isLoading,
}: LinkedInContactsTableProps) {
  const [search, setSearch] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{ done: number; total: number } | null>(null);
  const [selectedContact, setSelectedContact] = useState<LinkedInContact | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleEnrich = async () => {
    const pending = contacts.filter((c) => !c.telefone).length;
    if (pending === 0) {
      toast({ title: "Nada para enriquecer", description: "Todos os contatos já têm telefone." });
      return;
    }
    setIsEnriching(true);
    setEnrichProgress({ done: 0, total: pending });
    const BATCH = 10;
    const WAIT_MS = 90_000; // ~90s entre lotes para o background terminar
    try {
      let done = 0;
      let consecutiveErrors = 0;
      while (done < pending) {
        let data: any = null;
        let error: any = null;
        try {
          const res = await supabase.functions.invoke("linkedin-contact-enrich", {
            body: { limit: BATCH, onlyWithoutPhone: true },
          });
          data = res.data;
          error = res.error;
        } catch (e) {
          error = e;
        }
        if (error || !data?.success) {
          consecutiveErrors++;
          if (consecutiveErrors >= 3) {
            throw new Error("Servidor ocupado. Tente novamente em alguns minutos.");
          }
          // Backoff: espera mais e tenta de novo, sem assustar o usuário
          await new Promise((r) => setTimeout(r, 60_000));
          continue;
        }
        consecutiveErrors = 0;
        const queued = Number(data?.queued) || 0;
        if (queued === 0) break;
        done += queued;
        setEnrichProgress({ done: Math.min(done, pending), total: pending });
        if (done >= pending) break;
        // Aguarda o background processar antes de pedir o próximo lote
        await new Promise((r) => setTimeout(r, WAIT_MS));
      }
      toast({
        title: "Enriquecimento concluído",
        description: `${done} contatos processados em segundo plano.`,
      });
    } catch (e: any) {
      toast({
        title: "Erro ao enriquecer",
        description: e?.message || "Falha desconhecida",
        variant: "destructive",
      });
    } finally {
      setIsEnriching(false);
      setEnrichProgress(null);
    }
  };

  const filteredContacts = contacts.filter((contact) => {
    const matchesSearch =
      contact.nome.toLowerCase().includes(search.toLowerCase()) ||
      (contact.cargo?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (contact.empresa?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (contact.email?.toLowerCase().includes(search.toLowerCase()) ?? false);

    const matchesFilter =
      filter === "all" ||
      (filter === "sent" && contact.disparo === "Sim") ||
      (filter === "pending" && contact.disparo === "Não");

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
    if (contacts.length === 0) {
      toast({
        title: "Nenhum contato para exportar",
        description: "Capture alguns contatos antes de exportar.",
        variant: "destructive",
      });
      return;
    }

    const data = contacts.map((contact) => ({
      Nome: contact.nome,
      Cargo: contact.cargo || "",
      Empresa: contact.empresa || "",
      Localização: contact.localizacao || "",
      Email: contact.email || "",
      Telefone: contact.telefone || "",
      "LinkedIn URL": contact.linkedin_url || "",
      Conexões: contact.conexoes || "",
      Status: contact.disparo === "Sim" ? "Enviado" : "Pendente",
      "Data Disparo": contact.data_disparo ? formatDate(contact.data_disparo) || "" : "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "LinkedIn Contatos");
    
    XLSX.writeFile(workbook, `linkedin_contacts_${format(new Date(), "yyyy-MM-dd_HH-mm")}.xlsx`);

    toast({
      title: "Exportação concluída",
      description: `${contacts.length} contatos exportados com sucesso.`,
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
            <div className="p-2 rounded-lg bg-[#0A66C2]/20">
              <Linkedin className="h-5 w-5 text-[#0A66C2]" />
            </div>
            <h2 className="text-lg font-semibold">Contatos LinkedIn</h2>
            <Badge variant="outline">{contacts.length}</Badge>
            <span className="hidden md:inline text-xs text-muted-foreground ml-2">
              · clique em um contato para abrir ações
            </span>
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
              variant="default"
              size="sm"
              onClick={handleEnrich}
              disabled={contacts.length === 0 || isEnriching}
              className="bg-gradient-to-r from-primary to-primary/80"
            >
              {isEnriching ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enriquecendo {enrichProgress ? `${enrichProgress.done}/${enrichProgress.total}` : "..."}
                </>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" />Enriquecer Contatos</>
              )}
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
                  <Trash className="h-4 w-4 mr-2" />
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
          {/* Search and filters */}
          <div className="p-6 border-b border-border/50">
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar nome, cargo, empresa ou email..."
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
                    Contato
                  </TableHead>
                  <TableHead className="text-muted-foreground font-semibold">
                    Cargo / Empresa
                  </TableHead>
                  <TableHead className="text-muted-foreground font-semibold">
                    Informações
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
                {filteredContacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <p className="text-muted-foreground">
                        {contacts.length === 0
                          ? "Nenhum contato LinkedIn capturado ainda. Use a busca acima para começar!"
                          : "Nenhum contato encontrado com os filtros atuais."}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContacts.map((contact, index) => (
                    <TableRow
                      key={contact.id}
                      className="border-border/30 hover:bg-secondary/40 transition-colors cursor-pointer"
                      style={{ animationDelay: `${500 + index * 50}ms` }}
                      onClick={() => {
                        setSelectedContact(contact);
                        setDrawerOpen(true);
                      }}
                    >
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{contact.nome}</p>
                          {contact.localizacao && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate max-w-[180px]">
                                {contact.localizacao}
                              </span>
                            </div>
                          )}
                          {contact.conexoes && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="h-3 w-3" />
                              <span>{contact.conexoes.toLocaleString()} conexões</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {contact.cargo && (
                            <div className="flex items-center gap-2">
                              <Briefcase className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm truncate max-w-[180px]">
                                {contact.cargo}
                              </span>
                            </div>
                          )}
                          {contact.empresa && (
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                              {contact.empresa}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {contact.email && (
                            <div className="flex items-center gap-2">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm truncate max-w-[150px]">
                                {contact.email}
                              </span>
                            </div>
                          )}
                          {contact.telefone && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm font-mono">
                                {contact.telefone}
                              </span>
                            </div>
                          )}
                          {contact.linkedin_url && (
                            <a
                              href={contact.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 text-xs text-[#0A66C2] hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span>Ver perfil</span>
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge
                            variant={contact.disparo === "Sim" ? "success" : "pending"}
                          >
                            {contact.disparo === "Sim" ? "Enviado" : "Pendente"}
                          </Badge>
                          {contact.data_disparo && (
                            <p className="text-xs text-muted-foreground">
                              {formatDate(contact.data_disparo)}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(contact.id);
                          }}
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
              Exibindo {filteredContacts.length} de {contacts.length} contatos
            </p>
          </div>
        </>
      )}
      <LinkedInContactDrawer
        contact={selectedContact}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
