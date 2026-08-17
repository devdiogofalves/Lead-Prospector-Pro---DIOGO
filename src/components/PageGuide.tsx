import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Lightbulb, ArrowRight, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Banner colapsável no topo das telas. Dona da AGREGA chega numa tela nova e
// vê 3 coisas: o que faz, como começar (passos clicáveis), o que olhar se der
// erro. Default ABERTO na primeira visita (localStorage marca como visto), e
// depois aparece fechado — não enche o saco quem já sabe usar.
//
// Uso:
//   <PageGuide
//     storageKey="guide_disparo"
//     title="Disparo MAVI"
//     what="A MAVI envia mensagens humanizadas no WhatsApp para os leads que você selecionar."
//     steps={[
//       { text: "WhatsApp pareado em Configurações → WhatsApp", route: "/whatsapp" },
//       { text: "Selecione leads ou cole manualmente", route: null },
//       { text: "Pré-visualizar → Aprovar e enfileirar", route: null },
//     ]}
//     troubleshoot="Se aparecer erro, abra a tela Saúde do Sistema para diagnóstico."
//     troubleshootRoute="/saude"
//   />

export interface GuideStep {
  text: string;
  route?: string | null;
}

interface PageGuideProps {
  storageKey: string;
  title: string;
  what: string;
  steps: GuideStep[];
  troubleshoot?: string;
  troubleshootRoute?: string;
}

export function PageGuide({
  storageKey,
  title,
  what,
  steps,
  troubleshoot,
  troubleshootRoute,
}: PageGuideProps) {
  const [open, setOpen] = useState(false);
  // Primeira visita: abre default. Depois: fica fechado a menos que o user
  // clique explicitamente. Operadora não fica vendo o mesmo texto toda hora.
  useEffect(() => {
    const seen = localStorage.getItem(`pgseen_${storageKey}`) === "1";
    setOpen(!seen);
    if (!seen) {
      // Marca como visto após render — próxima visita já vem fechado.
      localStorage.setItem(`pgseen_${storageKey}`, "1");
    }
  }, [storageKey]);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 text-left"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Lightbulb className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-sm font-semibold truncate">
              Como usar: {title}
            </span>
          </div>
          {open
            ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
        </button>
        {open && (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-muted-foreground">{what}</p>
            {steps.length > 0 && (
              <ol className="space-y-1.5">
                {steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-[11px] font-bold">
                      {i + 1}
                    </span>
                    <span className="flex-1">
                      {s.text}
                      {s.route && (
                        <Button asChild size="sm" variant="link" className="h-auto p-0 ml-1 text-xs">
                          <Link to={s.route}>
                            ir <ArrowRight className="h-3 w-3 ml-0.5" />
                          </Link>
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {troubleshoot && (
              <div className="flex items-start gap-2 pt-2 border-t border-primary/20">
                <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  {troubleshoot}
                  {troubleshootRoute && (
                    <Button asChild size="sm" variant="link" className="h-auto p-0 ml-1 text-xs">
                      <Link to={troubleshootRoute}>
                        abrir <ArrowRight className="h-3 w-3 ml-0.5" />
                      </Link>
                    </Button>
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
