import { lazy, Suspense } from "react";
import { Brain, Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useBranding } from "@/hooks/useBranding";
import { KnowledgeBaseSection } from "@/components/KnowledgeBaseSection";
const Assistente = lazy(() => import("./Assistente"));
const MaviAprendizado = lazy(() => import("./MaviAprendizado"));

function TabLoader() {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Carregando painel...
    </div>
  );
}

export default function TreinarMavi() {
  const { branding } = useBranding();
  const agent = branding.agent_name;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/20">
          <Brain className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Treinar {agent}</h1>
          <p className="text-sm text-muted-foreground">
            Configure o negócio, o briefing e acompanhe o que a {agent} aprendeu.
          </p>
        </div>
      </div>

      <Tabs defaultValue="negocio">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="negocio">🧭 Negócio</TabsTrigger>
          <TabsTrigger value="knowledge">📚 Knowledge Pack</TabsTrigger>
          <TabsTrigger value="insights">✨ O que aprendi</TabsTrigger>
        </TabsList>

        <TabsContent value="negocio" className="mt-4">
          <Suspense fallback={<TabLoader />}>
            <Assistente />
          </Suspense>
        </TabsContent>

        <TabsContent value="knowledge" className="mt-4 space-y-4">
          <KnowledgeBaseSection />
          <Suspense fallback={<TabLoader />}>
            <MaviAprendizado view="edit" />
          </Suspense>
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          <Suspense fallback={<TabLoader />}>
            <MaviAprendizado view="insights" />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
