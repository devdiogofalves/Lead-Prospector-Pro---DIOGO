import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Instagram, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function InstantOnboardingHero() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const qc = useQueryClient();

  async function analyze() {
    const clean = handle.replace(/^@/, "").trim();
    if (!clean) return toast.error("Digite seu @ do Instagram");
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("instagram-instant-onboarding", {
        body: { handle: clean },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data);
      toast.success("Perfil analisado! Marca, tom e cores foram preenchidos automaticamente.");
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error("Não consegui analisar", { description: e?.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.15),transparent_60%)] pointer-events-none" />
      <CardContent className="pt-6 pb-6 relative">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Onboarding em 30 segundos</h2>
            <p className="text-xs text-muted-foreground">Digite seu @ e a IA analisa seu perfil, extrai cores, fontes, tom de voz e nicho.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="seuperfil"
              className="pl-9"
              disabled={loading}
              onKeyDown={(e) => e.key === "Enter" && analyze()}
            />
          </div>
          <Button onClick={analyze} disabled={loading || !handle.trim()} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Analisando…" : "Analisar meu perfil"}
          </Button>
        </div>

        {result?.brand && (
          <div className="mt-4 rounded-lg border border-primary/20 bg-background/50 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-primary font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Marca detectada: <span className="font-bold">{result.brand.company_name}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><span className="text-muted-foreground">Nicho:</span><br /><b>{result.brand.niche ?? "—"}</b></div>
              <div><span className="text-muted-foreground">Tom:</span><br /><b>{result.brand.voice_tone ?? "—"}</b></div>
              <div><span className="text-muted-foreground">Mood:</span><br /><b>{result.brand.visual_mood ?? "—"}</b></div>
              <div><span className="text-muted-foreground">Fontes:</span><br /><b>{result.brand.font_pair?.heading} + {result.brand.font_pair?.body}</b></div>
            </div>
            {Array.isArray(result.brand.color_palette) && result.brand.color_palette.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground">Paleta:</span>
                <div className="flex gap-1">
                  {result.brand.color_palette.map((c: string, i: number) => (
                    <div key={i} className="h-6 w-6 rounded-md border border-border" style={{ backgroundColor: c }} title={c} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
