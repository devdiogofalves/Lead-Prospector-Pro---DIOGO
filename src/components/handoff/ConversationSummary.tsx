import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Wand2, Send, RefreshCw, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { useBranding } from "@/hooks/useBranding";

interface Props {
  conversationId: string;
  initialSummary: string | null;
  leadNome: string | null;
  leadTelefone: string;
  onUpdated?: () => void;
}

export default function ConversationSummary({ conversationId, initialSummary, leadNome, leadTelefone, onUpdated }: Props) {
  const { branding: __b2 } = useBranding(); const company = __b2.company_name;

  const [summary, setSummary] = useState(initialSummary ?? "");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasGroup, setHasGroup] = useState(false);

  useEffect(() => { setSummary(initialSummary ?? ""); }, [conversationId, initialSummary]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("qualification_settings").select("handoff_group_jid").maybeSingle();
      setHasGroup(!!data?.handoff_group_jid);
    })();
  }, []);

  async function generate() {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("conversation-summary", { body: { conversationId } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setSummary(data.summary);
      toast.success("Resumo gerado");
      onUpdated?.();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function sendToGroup() {
    if (!summary.trim()) { toast.error("Gere o resumo primeiro"); return; }
    setSending(true);
    try {
      const { data: settings } = await supabase.from("qualification_settings").select("handoff_group_jid").maybeSingle();
      if (!settings?.handoff_group_jid) throw new Error("Configure o grupo de handoff em WhatsApp > Grupo");

      const phoneDigits = leadTelefone.replace(/\D/g, "");
      const caption = `📋 *RESUMO DA CONVERSA — ${company}*\n\n👤 ${leadNome || "Lead"}\n📱 ${leadTelefone}\n💬 wa.me/${phoneDigits}\n\n${summary}`;

      const { data, error } = await supabase.functions.invoke("mandrack-manager", {
        body: {
          action: "send-handoff",
          target: settings.handoff_group_jid,
          leadPhone: phoneDigits,
          caption,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Falha ao enviar pro grupo");
      toast.success(data?.withPhoto ? "Resumo + foto enviados pro grupo ✓" : "Resumo enviado pro grupo (sem foto disponível) ✓");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full p-4 gap-3 overflow-auto">
      <div className="flex flex-wrap gap-2">
        <Button onClick={generate} disabled={generating} size="sm">
          {generating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : summary ? <RefreshCw className="h-3.5 w-3.5 mr-1" /> : <Wand2 className="h-3.5 w-3.5 mr-1" />}
          {summary ? "Regenerar com IA" : "Gerar resumo com IA"}
        </Button>
        <Button onClick={sendToGroup} disabled={sending || !summary.trim()} size="sm" variant="secondary">
          {sending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
          Enviar pro grupo {!hasGroup && "(configure)"}
        </Button>
      </div>

      <Card className="flex-1">
        <CardContent className="p-4 prose prose-sm dark:prose-invert max-w-none">
          {summary ? (
            <ReactMarkdown>{summary}</ReactMarkdown>
          ) : (
            <div className="text-center text-muted-foreground py-12">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Sem resumo ainda. Clique em <b>Gerar resumo com IA</b> para analisar a conversa com o Gemini.</p>
              <p className="text-xs mt-2 opacity-70">Usa sua chave Gemini configurada em Configurações &gt; APIs.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}