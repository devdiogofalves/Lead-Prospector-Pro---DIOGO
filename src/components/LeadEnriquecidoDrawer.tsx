import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LeadEnriquecido } from "@/hooks/useLeadsEnriquecidos";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Copy,
  Mail,
  MessageCircle,
  ExternalLink,
  Building2,
  MapPin,
  Phone,
  Linkedin,
  Instagram,
  KanbanSquare,
  Send,
  Loader2,
  Gem,
  IdCard,
  Star,
} from "lucide-react";

interface Props {
  lead: LeadEnriquecido | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function onlyDigits(s: string | null | undefined) {
  return (s || "").replace(/\D+/g, "");
}

function scoreColor(score: number) {
  if (score >= 85) return "bg-success/15 text-success border-success/30";
  if (score >= 60) return "bg-primary/15 text-primary border-primary/30";
  if (score >= 35) return "bg-warning/15 text-warning border-warning/30";
  return "bg-muted text-muted-foreground border-border";
}

export function LeadEnriquecidoDrawer({ lead, open, onOpenChange }: Props) {
  const [addingPipeline, setAddingPipeline] = useState(false);
  const [enqueuing, setEnqueuing] = useState(false);

  if (!lead) return null;

  const bestPhone = lead.telefoneMaps || lead.linkedinTelefone || lead.instagramWhatsapp || "";
  const phoneDigits = onlyDigits(bestPhone);
  const hasWhatsapp = phoneDigits.length >= 10;
  const bestEmail = lead.emailEmpresa || lead.linkedinEmail || "";

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
    if (!bestEmail) return;
    const subject = encodeURIComponent(`Contato — ${lead.empresa}`);
    const body = encodeURIComponent(`Olá,\n\n`);
    window.open(`mailto:${bestEmail}?subject=${subject}&body=${body}`, "_blank");
  };

  const openWhatsapp = () => {
    if (!hasWhatsapp) return;
    const text = encodeURIComponent(`Olá, tudo bem?`);
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
        nome_empresa: lead.empresa,
        contato: lead.linkedinNome,
        email: bestEmail || null,
        telefone: bestPhone || null,
        estagio: "prospectado",
        origem: "enriquecido",
        observacoes: [
          lead.cnpj ? `CNPJ: ${lead.cnpj}` : null,
          lead.socios ? `Sócios: ${lead.socios}` : null,
          `Score: ${lead.score}%`,
        ].filter(Boolean).join("\n") || null,
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
        source: "enriquecidos",
        nome_empresa: lead.empresa,
        nome_contato: lead.linkedinNome,
        cargo: lead.linkedinCargo,
        telefone: phoneDigits,
        linkedin_url: lead.linkedinUrl,
        instagram_url: lead.instagramUrl,
        status: "pending",
      });
      if (error) throw error;
      toast.success("Lead enfileirado para disparo");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enfileirar");
    } finally {
      setEnqueuing(false);
    }
  };

  const ContactRow = ({
    icon,
    value,
    label,
  }: { icon: React.ReactNode; value: string | null; label: string }) => (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <span className="text-sm truncate">
          {value || <span className="text-muted-foreground italic">sem {label.toLowerCase()}</span>}
        </span>
      </div>
      {value && (
        <Button size="sm" variant="ghost" onClick={() => copy(value, label)}>
          <Copy className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/15">
              <Gem className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="truncate">{lead.empresa}</SheetTitle>
              <SheetDescription className="flex items-center gap-2">
                <Badge variant="outline" className={scoreColor(lead.score)}>
                  Score {lead.score}%
                </Badge>
                {lead.ratingMaps != null && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="h-3 w-3" /> {lead.ratingMaps}
                  </span>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Identificação */}
          <div className="space-y-2">
            {lead.razaoSocial && lead.razaoSocial !== lead.empresa && (
              <div className="flex items-start gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span>{lead.razaoSocial}</span>
              </div>
            )}
            {lead.cnpj && (
              <div className="flex items-start gap-2 text-sm">
                <IdCard className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span className="font-mono text-xs">{lead.cnpj}</span>
                <Button size="sm" variant="ghost" className="h-6 px-2 ml-auto" onClick={() => copy(lead.cnpj, "CNPJ")}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
            {lead.porte && (
              <div className="text-xs text-muted-foreground">Porte: {lead.porte}</div>
            )}
            {lead.enderecoMaps && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span className="text-xs">{lead.enderecoMaps}</span>
              </div>
            )}
          </div>

          {lead.socios && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">SÓCIOS</p>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{lead.socios}</p>
              </div>
            </>
          )}

          {(lead.linkedinNome || lead.linkedinCargo) && (
            <>
              <Separator />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">CONTATO LINKEDIN</p>
                {lead.linkedinNome && <p className="text-sm font-medium">{lead.linkedinNome}</p>}
                {lead.linkedinCargo && <p className="text-xs text-muted-foreground">{lead.linkedinCargo}</p>}
              </div>
            </>
          )}

          <Separator />

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">CONTATOS</p>
            <ContactRow
              icon={<Phone className="h-4 w-4 text-muted-foreground shrink-0" />}
              value={bestPhone || null}
              label="Telefone"
            />
            <ContactRow
              icon={<Mail className="h-4 w-4 text-muted-foreground shrink-0" />}
              value={bestEmail || null}
              label="Email"
            />
            {lead.linkedinUrl && (
              <ContactRow
                icon={<Linkedin className="h-4 w-4 text-[#0A66C2] shrink-0" />}
                value={lead.linkedinUrl}
                label="LinkedIn"
              />
            )}
            {lead.instagramUsername && (
              <ContactRow
                icon={<Instagram className="h-4 w-4 text-accent shrink-0" />}
                value={lead.instagramUrl ?? `https://instagram.com/${lead.instagramUsername}`}
                label="Instagram"
              />
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">AÇÕES</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={openMailto} disabled={!bestEmail}>
                <Mail className="h-4 w-4 mr-2" />
                Enviar email
              </Button>
              <Button variant="outline" onClick={openWhatsapp} disabled={!hasWhatsapp}>
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp
              </Button>
              {lead.linkedinUrl && (
                <Button variant="outline" onClick={() => window.open(lead.linkedinUrl!, "_blank")}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  LinkedIn
                </Button>
              )}
              {lead.instagramUsername && (
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(
                      lead.instagramUrl ?? `https://instagram.com/${lead.instagramUsername}`,
                      "_blank"
                    )
                  }
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Instagram
                </Button>
              )}
              <Button
                variant="outline"
                onClick={addToPipeline}
                disabled={addingPipeline}
                className="col-span-2"
              >
                {addingPipeline ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <KanbanSquare className="h-4 w-4 mr-2" />
                )}
                Adicionar ao Pipeline CRM
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