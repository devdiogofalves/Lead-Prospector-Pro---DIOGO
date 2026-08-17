import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarDays, Unlink, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function GoogleCalendarTab() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const { data } = await supabase.functions.invoke("google-calendar-api", { body: { action: "status" } });
    setConnected(!!data?.connected);
    setEmail(data?.email ?? null);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function connect() {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-oauth-start", { body: { returnTo: window.location.href } });
      if (error || !data?.url) throw new Error(error?.message || "Falha ao iniciar OAuth");
      const w = window.open(data.url, "google_oauth", "width=520,height=640");
      const t = setInterval(async () => {
        if (w?.closed) { clearInterval(t); await refresh(); setConnecting(false); }
      }, 1000);
    } catch (e: any) {
      toast.error(e.message);
      setConnecting(false);
    }
  }

  async function disconnect() {
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-api", { body: { action: "disconnect" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Conta Google desconectada");
      refresh();
    } catch (e: any) {
      toast.error("Erro ao desconectar: " + (e?.message ?? "tente novamente"));
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-5 w-5 text-primary" />
            Google Calendar
          </CardTitle>
          <CardDescription>
            Conecte sua conta Google para gerar links do Meet automaticamente e ler sua agenda na aba Agendamento das conversas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando…
            </div>
          ) : connected ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-success/5 border-success/30">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span>Conectado como</span>
                <Badge variant="secondary">{email ?? "—"}</Badge>
              </div>
              <Button variant="outline" size="sm" onClick={disconnect}>
                <Unlink className="h-3.5 w-3.5 mr-1" /> Desconectar
              </Button>
            </div>
          ) : (
            <Button onClick={connect} disabled={connecting}>
              {connecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CalendarDays className="h-4 w-4 mr-1" />}
              Conectar Google Calendar
            </Button>
          )}

          {!connected && (
            <p className="text-xs text-muted-foreground">
              Ao conectar, você autoriza o LeadsBooster a acessar seu Google Calendar e criar eventos com links do Meet automaticamente.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}