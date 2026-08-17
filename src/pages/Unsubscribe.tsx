import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, MailX } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State =
  | { kind: "loading" }
  | { kind: "valid" }
  | { kind: "already" }
  | { kind: "invalid" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid" });
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } },
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.valid) setState({ kind: "valid" });
        else if (data.reason === "already_unsubscribed") setState({ kind: "already" });
        else setState({ kind: "invalid" });
      } catch {
        setState({ kind: "invalid" });
      }
    })();
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setState({ kind: "submitting" });
    try {
      const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });
      if (error) throw error;
      if (data?.success) setState({ kind: "success" });
      else if (data?.reason === "already_unsubscribed") setState({ kind: "already" });
      else setState({ kind: "error", message: "Não foi possível processar o descadastro." });
    } catch (e: any) {
      setState({ kind: "error", message: e?.message ?? "Erro inesperado" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        {state.kind === "loading" && (
          <>
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Validando link…</p>
          </>
        )}

        {state.kind === "valid" && (
          <>
            <MailX className="h-12 w-12 mx-auto text-primary" />
            <h1 className="text-2xl font-semibold">Descadastrar e-mails</h1>
            <p className="text-muted-foreground">
              Tem certeza de que deseja parar de receber e-mails do LeadsBooster?
            </p>
            <Button onClick={confirm} className="w-full">
              Confirmar descadastro
            </Button>
          </>
        )}

        {state.kind === "submitting" && (
          <>
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Processando…</p>
          </>
        )}

        {state.kind === "success" && (
          <>
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500" />
            <h1 className="text-2xl font-semibold">Pronto!</h1>
            <p className="text-muted-foreground">
              Você não receberá mais e-mails do LeadsBooster.
            </p>
          </>
        )}

        {state.kind === "already" && (
          <>
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500" />
            <h1 className="text-2xl font-semibold">Já descadastrado</h1>
            <p className="text-muted-foreground">
              Este e-mail já havia sido removido da lista.
            </p>
          </>
        )}

        {state.kind === "invalid" && (
          <>
            <XCircle className="h-12 w-12 mx-auto text-destructive" />
            <h1 className="text-2xl font-semibold">Link inválido</h1>
            <p className="text-muted-foreground">
              Este link de descadastro é inválido ou expirou.
            </p>
          </>
        )}

        {state.kind === "error" && (
          <>
            <XCircle className="h-12 w-12 mx-auto text-destructive" />
            <h1 className="text-2xl font-semibold">Algo deu errado</h1>
            <p className="text-muted-foreground">{state.message}</p>
          </>
        )}
      </Card>
    </div>
  );
}
