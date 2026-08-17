import { Inbox } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useBranding } from "@/hooks/useBranding";
import ConversasHandoff from "./ConversasHandoff";
import QualificacaoHumanizada from "./QualificacaoHumanizada";
import MassDispatchSettings from "@/components/handoff/MassDispatchSettings";

export default function QualificacaoConversas() {
  const { branding } = useBranding();
  const agent = branding.agent_name;

  return (
    <div className="animate-fade-in h-[calc(100vh-5rem)] flex flex-col">
      <div className="shrink-0 mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <Inbox className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Inbox Unificado</h1>
            <p className="text-sm text-muted-foreground">
              Todas as conversas da {agent} (WhatsApp, Instagram, Telegram, LinkedIn, E-mail) em um só lugar — assuma quando quiser.
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="conversas" className="flex flex-col flex-1 min-h-0">
        <TabsList className="w-full justify-start shrink-0">
          <TabsTrigger value="conversas">💬 Conversas ao vivo</TabsTrigger>
          <TabsTrigger value="disparo">🚀 Disparo Automático</TabsTrigger>
          <TabsTrigger value="configurar">⚙️ Configurar IA</TabsTrigger>
        </TabsList>

        <TabsContent value="conversas" className="flex flex-col flex-1 min-h-0 mt-3 data-[state=inactive]:hidden">
          <ConversasHandoff embedded />
        </TabsContent>

        <TabsContent value="disparo" className="flex-1 overflow-auto mt-3">
          <MassDispatchSettings />
        </TabsContent>

        <TabsContent value="configurar" className="flex-1 overflow-auto mt-3">
          <QualificacaoHumanizada />
        </TabsContent>
      </Tabs>
    </div>
  );
}
