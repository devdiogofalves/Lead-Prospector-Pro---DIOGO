import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STORAGE_KEY = "lb_hide_operational_banner_v1";

export function OperationalBanner() {
  const [hidden, setHidden] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1",
  );

  if (hidden) return null;

  return (
    <Card className="border-success/40 bg-gradient-to-r from-success/10 via-primary/5 to-transparent">
      <CardContent className="py-3 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-start md:items-center gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-md bg-success/20 shrink-0">
            <CheckCircle2 className="h-5 w-5 text-success" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Painel 100% operacional
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Todos os módulos (Prospecção, Disparo, Qualificação IA, CRM e Postagem) estão liberados.
              Envie sugestões e melhorias em <span className="text-foreground font-medium">Falar com Suporte</span>.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild size="sm" variant="secondary">
            <Link to="/suporte">
              <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
              Falar com Suporte
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              localStorage.setItem(STORAGE_KEY, "1");
              setHidden(true);
            }}
            className="h-8 w-8"
            aria-label="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
