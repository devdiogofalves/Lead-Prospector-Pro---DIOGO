import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LinkedInContact } from "@/hooks/useLinkedInContacts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Copy,
  Mail,
  MessageCircle,
  ExternalLink,
  Briefcase,
  Building2,
  MapPin,
  Users,
  Phone,
  Linkedin,
  KanbanSquare,
  Send,
  Loader2,
} from "lucide-react";

interface Props {
  contact: LinkedInContact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function onlyDigits(s: string | null | undefined) {
  return (s || "").replace(/\D+/g, "");
}

export function LinkedInContactDrawer({ contact, open, onOpenChange }: Props) {
  const [addingPipeline, setAddingPipeline] = useState(false);
  const [enqueuing, setEnqueuing] = useState(false);

  if (!contact) return null;

  const phoneDigits = onlyDigits(contact.telefone);
  const hasWhatsapp = phoneDigits.length >= 10;

  const copy = async (value: string | null | undefined, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const openMailto = () => {
    if (!contact.email) return;
    const subject = encodeURIComponent(
      contact.empresa ? `Contato — ${contact.empresa}` : "Contato"
    );
    const body = encodeURIComponent(
      `Olá ${contact.nome?.split(" ")[0] || ""},\n\n`
    );
    window.open(`mailto:${contact.email}?subject=${subject}&body=${body}`, "_blank");
  };

  const openWhatsapp = () => {
    if (!hasWhatsapp) return;
    const text = encodeURIComponent(`Olá ${contact.nome?.split(" ")[0] || ""}, tudo bem?`);
    window.open(`https://wa.me/${phoneDigits}?text=${text}`, "_blank");
  };

  const addToPipeline = async () => {
    setAddingPipeline(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) throw new Error("Sessão expirada");

      const { error } = await supabase.from("pipeline_cards").insert({
        user_id: uid,
        nome_empresa: contact.empresa || contact.nome,
        contato: contact.nome,
        email: contact.email,
        telefone: contact.telefone,
        estagio: "prospectado",
        origem: "linkedin",
        source_table: "linkedin_contacts",
        source_id: contact.id,
        observacoes: contact.cargo ? `Cargo: ${contact.cargo}` : null,
      });
      if (error) throw error;
      toast.success("Adicionado ao Pipeline");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao adicionar ao Pipeline");
    } finally {
      setAddingPipeline(false);
    }
  };

  const enqueueDispatch = async () => {
    if (!hasWhatsapp) return;
    setEnqueuing(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) throw new Error("Sessão expirada");

      const { error } = await supabase.from("dispatch_queue").insert({
        user_id: uid,
        source: "linkedin_contacts",
        source_id: contact.id,
        nome_empresa: contact.empresa || contact.nome,
        nome_contato: contact.nome,
        cargo: contact.cargo,
        telefone: phoneDigits,
        linkedin_url: contact.linkedin_url,
        status: "pending",
      });
      if (error) throw error;
      toast.success("Lead enfileirado para disparo IA");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enfileirar");
    } finally {
      setEnqueuing(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#0A66C2]/20">
              <Linkedin className="h-5 w-5 text-[#0A66C2]" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="truncate">{contact.nome}</SheetTitle>
              <SheetDescription>
                <Badge variant={contact.disparo === "Sim" ? "success" : "pending"}>
                  {contact.disparo === "Sim" ? "Já contatado" : "Pendente"}
                </Badge>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Identificação */}
          <div className="space-y-2">
            {contact.cargo && (
              <div className="flex items-start gap-2 text-sm">
                <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span>{contact.cargo}</span>
              </div>
            )}
            {contact.empresa && (
              <div className="flex items-start gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span>{contact.empresa}</span>
              </div>
            )}
            {contact.localizacao && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span>{contact.localizacao}</span>
              </div>
            )}
            {contact.conexoes != null && (
              <div className="flex items-start gap-2 text-sm">
                <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span>{contact.conexoes.toLocaleString()} conexões</span>
              </div>
            )}
          </div>

          {contact.sobre && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">SOBRE</p>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{contact.sobre}</p>
              </div>
            </>
          )}

          <Separator />

          {/* Contatos com copy */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">CONTATOS</p>

            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-mono truncate">
                  {contact.telefone || <span className="text-muted-foreground italic">sem telefone</span>}
                </span>
              </div>
              {contact.telefone && (
                <Button size="sm" variant="ghost" onClick={() => copy(contact.telefone, "Telefone")}>
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">
                  {contact.email || <span className="text-muted-foreground italic">sem email</span>}
                </span>
              </div>
              {contact.email && (
                <Button size="sm" variant="ghost" onClick={() => copy(contact.email, "Email")}>
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>

            {contact.linkedin_url && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Linkedin className="h-4 w-4 text-[#0A66C2] shrink-0" />
                  <span className="text-sm truncate">{contact.linkedin_url}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => copy(contact.linkedin_url, "URL")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* Ações */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">AÇÕES</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={openMailto} disabled={!contact.email}>
                <Mail className="h-4 w-4 mr-2" />
                Enviar email
              </Button>
              <Button variant="outline" onClick={openWhatsapp} disabled={!hasWhatsapp}>
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp
              </Button>
              {contact.linkedin_url && (
                <Button
                  variant="outline"
                  onClick={() => window.open(contact.linkedin_url!, "_blank")}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver no LinkedIn
                </Button>
              )}
              <Button variant="outline" onClick={addToPipeline} disabled={addingPipeline}>
                {addingPipeline ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <KanbanSquare className="h-4 w-4 mr-2" />
                )}
                Pipeline CRM
              </Button>
            </div>

            {hasWhatsapp && (
              <Button
                className="w-full bg-gradient-to-r from-primary to-primary/80"
                onClick={enqueueDispatch}
                disabled={enqueuing}
              >
                {enqueuing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Disparar IA agora
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}