import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Wand2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const VARIABLES = ["nome", "empresa", "cidade", "segmento", "cargo"];

interface Props {
  value: string;
  onChange: (v: string) => void;
  stepIndex: number;
  totalSteps: number;
  exampleLead?: any;
}

export function MessageEditorWithAI({ value, onChange, stepIndex, totalSteps, exampleLead }: Props) {
  const [loading, setLoading] = useState<null | "generate" | "optimize">(null);

  const insertVar = (v: string) => {
    onChange(`${value}${value && !value.endsWith(" ") ? " " : ""}{{${v}}}`);
  };

  const callAI = async (mode: "generate" | "optimize") => {
    if (mode === "optimize" && !value.trim()) {
      toast({ title: "Escreva algo primeiro", description: "Para otimizar precisa ter texto base.", variant: "destructive" });
      return;
    }
    setLoading(mode);
    try {
      const { data, error } = await supabase.functions.invoke("campaign-ai-message", {
        body: {
          mode, text: value, step_index: stepIndex, total_steps: totalSteps,
          example_lead: exampleLead, variables: VARIABLES,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      onChange(data.text);
      toast({ title: mode === "generate" ? "Mensagem gerada" : "Mensagem otimizada", description: "Usando seu prompt + Knowledge Pack." });
    } catch (e: any) {
      toast({ title: "Erro na IA", description: e?.message ?? "Falha desconhecida", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Variáveis:</span>
        {VARIABLES.map((v) => (
          <Badge
            key={v}
            variant="secondary"
            className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition"
            onClick={() => insertVar(v)}
          >
            {`{{${v}}}`}
          </Badge>
        ))}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => callAI("generate")} disabled={!!loading}>
            {loading === "generate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Gerar com IA</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => callAI("optimize")} disabled={!!loading}>
            {loading === "optimize" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Otimizar</span>
          </Button>
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Mensagem do passo ${stepIndex + 1}... Ex: Oi {{nome}}, vi que vocês atuam com {{segmento}}...`}
        rows={5}
      />
    </div>
  );
}
