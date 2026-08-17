import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AlertTriangle, Copy, ExternalLink, FileSearch, Loader2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp (disparo/campanha)",
  email: "E-mail",
  instagram: "Instagram DM",
  telegram: "Telegram",
  linkedin: "LinkedIn DM",
  campaign: "Campanha multicanal",
  followup: "Follow-up",
};

type Layer = {
  id: string;
  label: string;
  source: string;
  editable: boolean;
  edit_route?: string;
  preview: string;
};

type PreviewData = {
  tenant: {
    agent_name: string;
    company_name: string;
    has_training: boolean;
    has_calendar: boolean;
    flow_mode: string;
  };
  dispatch: Record<string, { prompt: string; length: number }>;
  attendance_layers: Layer[];
  warnings: string[];
};

export default function PromptPreview() {
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<string>("whatsapp");

  async function load() {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("prompt-preview", { body: {} });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      setData(res as PreviewData);
    } catch (e: any) {
      toast.error(`Falha ao carregar: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function copyText(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copiado");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return null;

  const dispatchPrompt = data.dispatch[selectedChannel]?.prompt ?? "";
  const dispatchLen = data.dispatch[selectedChannel]?.length ?? 0;

  return (
    <div className="animate-fade-in space-y-4 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <FileSearch className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Prompt Preview</h1>
            <p className="text-sm text-muted-foreground">
              Veja EXATAMENTE o system prompt que cada canal está usando agora — antes de disparar/atender.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-1.5" /> Atualizar
        </Button>
      </div>

      {/* Tenant info */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3 items-center text-sm">
          <Badge variant="secondary">Agente: <b className="ml-1">{data.tenant.agent_name}</b></Badge>
          <Badge variant="secondary">Empresa: <b className="ml-1">{data.tenant.company_name}</b></Badge>
          <Badge variant={data.tenant.has_training ? "default" : "destructive"}>
            {data.tenant.has_training ? "✓ Treinar IA preenchido" : "✗ Treinar IA vazio"}
          </Badge>
          <Badge variant={data.tenant.has_calendar ? "default" : "outline"}>
            {data.tenant.has_calendar ? "✓ Calendar conectado" : "Calendar não conectado"}
          </Badge>
          <Badge variant={data.tenant.flow_mode === "simple" ? "destructive" : "default"}>
            Fluxo: {data.tenant.flow_mode === "simple" ? "SIMPLES (SPIN OFF)" : "SPIN"}
          </Badge>
        </CardContent>
      </Card>

      {/* Warnings */}
      {data.warnings.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc pl-4 space-y-1">
              {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="dispatch">
        <TabsList>
          <TabsTrigger value="dispatch">📤 Disparo (abertura)</TabsTrigger>
          <TabsTrigger value="attendance">💬 Atendimento (qualificação)</TabsTrigger>
        </TabsList>

        {/* DISPATCH */}
        <TabsContent value="dispatch" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">System prompt de abertura por canal</CardTitle>
              <p className="text-xs text-muted-foreground">
                Estes prompts são montados via <code>buildSpinSystem</code> em <code>_shared/spin-prompt.ts</code>.
                Vale pra e-mail, IG DM, Telegram, LinkedIn e campanha. WhatsApp (disparo humanizado) usa uma variação própria
                que também injeta o system_prompt do Treinar IA.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {Object.keys(data.dispatch).map((ch) => (
                  <Button
                    key={ch}
                    size="sm"
                    variant={selectedChannel === ch ? "default" : "outline"}
                    onClick={() => setSelectedChannel(ch)}
                  >
                    {CHANNEL_LABELS[ch] ?? ch}
                  </Button>
                ))}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{dispatchLen.toLocaleString()} caracteres</span>
                <Button variant="ghost" size="sm" onClick={() => copyText(dispatchPrompt)}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                </Button>
              </div>

              <pre className="text-[11px] whitespace-pre-wrap bg-muted p-3 rounded border max-h-[500px] overflow-auto font-mono">
                {dispatchPrompt}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ATTENDANCE */}
        <TabsContent value="attendance" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Camadas do prompt de atendimento (qualification-worker)</CardTitle>
              <p className="text-xs text-muted-foreground">
                O prompt real é a concatenação destas camadas na ordem exibida. Vale para respostas em WhatsApp, IG DM,
                Telegram, LinkedIn e E-mail (inbound). Clique em cada camada pra ver o conteúdo.
              </p>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                {data.attendance_layers.map((layer) => (
                  <AccordionItem key={layer.id} value={layer.id}>
                    <AccordionTrigger className="text-left hover:no-underline">
                      <div className="flex-1 flex items-center justify-between gap-2 pr-4">
                        <span className="text-sm font-medium">{layer.label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-[10px]">
                            {layer.source}
                          </Badge>
                          {layer.editable && layer.edit_route && (
                            <Badge variant="secondary" className="text-[10px]">
                              Editável
                            </Badge>
                          )}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2">
                        <pre className="text-[11px] whitespace-pre-wrap bg-muted p-3 rounded border max-h-[300px] overflow-auto font-mono">
                          {layer.preview}
                        </pre>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => copyText(layer.preview)}>
                            <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                          </Button>
                          {layer.edit_route && (
                            <Button variant="ghost" size="sm" asChild>
                              <Link to={layer.edit_route}>
                                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Editar
                              </Link>
                            </Button>
                          )}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
