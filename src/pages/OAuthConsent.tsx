import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";

// Minimal typed wrapper: supabase.auth.oauth is currently beta and not in
// the generated types yet. Keep the surface local instead of grepping node_modules.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{
    data: {
      client?: { name?: string; client_uri?: string };
      redirect_url?: string;
      redirect_to?: string;
      scopes?: string[];
    } | null;
    error: { message: string } | null;
  }>;
  approveAuthorization: (id: string) => Promise<{
    data: { redirect_url?: string; redirect_to?: string } | null;
    error: { message: string } | null;
  }>;
  denyAuthorization: (id: string) => Promise<{
    data: { redirect_url?: string; redirect_to?: string } | null;
    error: { message: string } | null;
  }>;
};

function oauthClient(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const { user, loading: authLoading } = useAuth();
  const [details, setDetails] = useState<Awaited<
    ReturnType<OAuthApi["getAuthorizationDetails"]>
  >["data"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Parâmetro authorization_id ausente.");
        return;
      }
      if (authLoading) return;
      if (!user) {
        // Preserve the FULL consent URL so login returns us here.
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauthClient().getAuthorizationDetails(
        authorizationId,
      );
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId, user, authLoading]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauthClient().approveAuthorization(authorizationId)
      : await oauthClient().denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor de autorização não retornou uma URL de redirecionamento.");
      return;
    }
    window.location.href = target;
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md p-6 space-y-3">
          <h1 className="text-xl font-semibold">Não foi possível carregar</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      </main>
    );
  }

  if (authLoading || !details) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  const clientName = details.client?.name ?? "um aplicativo";

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/15">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">
              Conectar {clientName} à sua conta
            </h1>
            <p className="text-xs text-muted-foreground">
              Este aplicativo poderá usar o LeadsBooster em seu nome.
            </p>
          </div>
        </div>
        <div className="rounded-md border border-border/60 p-3 text-sm text-muted-foreground">
          Autorizações permitidas ao aplicativo:
          <ul className="list-disc list-inside mt-2 space-y-1 text-foreground">
            <li>Buscar seus leads (Google Maps, LinkedIn, Instagram)</li>
            <li>Ler seu pipeline CRM</li>
            <li>Criar novos cards no pipeline</li>
          </ul>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
            Recusar
          </Button>
          <Button disabled={busy} onClick={() => decide(true)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aprovar"}
          </Button>
        </div>
      </Card>
    </main>
  );
}
