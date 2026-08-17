import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Compass, ArrowRight, X } from "lucide-react";
import { useOnboardingSteps } from "@/pages/ComeceAqui";
import { useState } from "react";

export function OnboardingBanner() {
  const { steps, completed, total, progress: percent, isLoading } = useOnboardingSteps();
  const [hidden, setHidden] = useState(
    () => sessionStorage.getItem("lb_hide_onboarding_banner") === "1",
  );

  if (isLoading || completed === total || hidden) return null;
  const next = steps.find((s) => !s.done);

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent">
      <CardContent className="py-4 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-md bg-primary/20 shrink-0">
            <Compass className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Configure seu painel</span>
              <span className="text-xs text-muted-foreground">
                {completed}/{total} concluído
              </span>
            </div>
            <Progress value={percent} className="h-1.5 mt-1.5" />
            {next && (
              <p className="text-xs text-muted-foreground mt-1.5 truncate">
                Próximo passo: <span className="text-foreground">{next.title}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild size="sm">
            <Link to="/">
              Continuar <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              sessionStorage.setItem("lb_hide_onboarding_banner", "1");
              setHidden(true);
            }}
            className="h-8 w-8"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}