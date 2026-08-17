import { useState } from "react";
import { Search, MapPin, Loader2, CheckCircle, Phone, Star, ExternalLink, Send, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useBranding } from "@/hooks/useBranding";

type LeadRow = {
  nome_empresa?: string;
  telefone?: string;
  endereco?: string | null;
  site?: string | null;
  rating?: number | null;
  reviews?: number | null;
  especialidades?: string | null;
};

export function GoogleMapsSearch() {
  const { branding: __b } = useBranding(); const agent = __b.agent_name;

  const [searchQuery, setSearchQuery] = useState("");
  const [location, setLocation] = useState("");
  const [maxResults, setMaxResults] = useState(20);
  const webhookUrl = "";
  const [isSearching, setIsSearching] = useState(false);
  const [lastResult, setLastResult] = useState<{ total: number; saved: number } | null>(null);
  const [results, setResults] = useState<LeadRow[]>([]);
  const [sendToMavi, setSendToMavi] = useState(false);
  const [isEnqueuing, setIsEnqueuing] = useState(false);
  const [enqueueInfo, setEnqueueInfo] = useState<{ queued: number; eta?: string } | null>(null);
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Erro",
        description: "Digite uma busca (ex: dentistas, advogados)",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    setLastResult(null);
    setResults([]);
    setEnqueueInfo(null);

    try {
      const { data, error } = await supabase.functions.invoke("google-places-search", {
        body: {
          searchQuery: searchQuery.trim(),
          location: location.trim() || "São Paulo, Brasil",
          maxResults,
          webhookUrl: webhookUrl.trim() || undefined,
        },
      });

      if (error) throw error;

      if (data.success) {
        setLastResult({ total: data.total, saved: data.saved });
        setResults(Array.isArray(data.leads) ? data.leads : []);
        toast({
          title: "Busca concluída!",
          description: `${data.saved} leads salvos de ${data.total} encontrados`,
        });
        if (sendToMavi && Array.isArray(data.leads) && data.leads.length > 0) {
          await enqueueLeads(data.leads);
        }
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (error) {
      console.error("Search error:", error);
      toast({
        title: "Erro na busca",
        description: error instanceof Error ? error.message : "Falha ao buscar leads",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const enqueueLeads = async (leads: LeadRow[]) => {
    setIsEnqueuing(true);
    try {
      const payload = leads
        .filter((l) => l.telefone)
        .map((l) => ({
          source: "google_maps",
          nome_empresa: l.nome_empresa,
          telefone: l.telefone,
          site: l.site,
          especialidades: l.especialidades,
        }));
      if (!payload.length) {
        toast({ title: "Nada para disparar", description: "Nenhum lead com telefone válido.", variant: "destructive" });
        return;
      }
      const { data, error } = await supabase.functions.invoke("dispatch-enqueue", {
        body: { leads: payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setEnqueueInfo({ queued: data?.queued ?? 0, eta: data?.eta });
      toast({
        title: `Enviado para a ${agent}!`,
        description: `${data?.queued ?? 0} leads na fila. ETA do último: ${data?.eta ? new Date(data.eta).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}`,
      });
    } catch (e) {
      toast({
        title: "Erro ao enfileirar",
        description: e instanceof Error ? e.message : `Falha ao enviar para ${agent}`,
        variant: "destructive",
      });
    } finally {
      setIsEnqueuing(false);
    }
  };

  const handleSendNow = () => {
    if (results.length > 0) enqueueLeads(results);
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <Search className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Buscar no Google Maps</h3>
          <p className="text-sm text-muted-foreground">Encontre leads pela API oficial do Google Places</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="searchQuery">O que buscar?</Label>
          <Input
            id="searchQuery"
            placeholder="Ex: dentistas, advogados, restaurantes"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isSearching}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Localização</Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="location"
              className="pl-9"
              placeholder="Ex: São Paulo, Brasil"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={isSearching}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="maxResults">Máx. resultados</Label>
          <Input
            id="maxResults"
            type="number"
            min={5}
            max={100}
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            disabled={isSearching}
          />
        </div>
      </div>

      <div className="flex items-center gap-4 mt-6">
        <Button onClick={handleSearch} disabled={isSearching} className="gap-2">
          {isSearching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando...
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Buscar Leads
            </>
          )}
        </Button>

        {lastResult && (
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle className="h-4 w-4" />
            <span>
              {lastResult.saved} leads salvos de {lastResult.total} encontrados
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center gap-3">
          <Rocket className="h-4 w-4 text-primary" />
          <div>
            <Label htmlFor="sendMavi" className="cursor-pointer text-sm font-medium">
              Enviar direto pra {agent} após a busca
            </Label>
            <p className="text-xs text-muted-foreground">
              Enfileira automaticamente no Disparo {agent} (respeita horário comercial, delays adaptativos e warm-up).
            </p>
          </div>
        </div>
        <Switch id="sendMavi" checked={sendToMavi} onCheckedChange={setSendToMavi} />
        {results.length > 0 && !sendToMavi && (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSendNow}
            disabled={isEnqueuing}
            className="ml-auto gap-2"
          >
            {isEnqueuing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Enviar estes {results.length} pra {agent}
          </Button>
        )}
        {enqueueInfo && (
          <span className="ml-auto text-xs text-success">
            ✓ {enqueueInfo.queued} na fila • ETA: {enqueueInfo.eta ? new Date(enqueueInfo.eta).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}
          </span>
        )}
      </div>

      {isSearching && (
        <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border/50">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">Buscando leads no Google Maps...</p>
              <p className="text-xs text-muted-foreground">Isso pode levar até 2 minutos</p>
            </div>
          </div>
        </div>
      )}

      {!isSearching && results.length > 0 && (
        <div className="mt-6 rounded-lg border border-border/50 overflow-hidden">
          <div className="px-4 py-3 bg-muted/40 border-b border-border/50">
            <p className="text-sm font-medium">Resultados desta busca ({results.length})</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/20 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Empresa</th>
                  <th className="text-left px-4 py-2">Telefone</th>
                  <th className="text-left px-4 py-2">Endereço</th>
                  <th className="text-left px-4 py-2">Avaliação</th>
                  <th className="text-left px-4 py-2">Site</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">{r.nome_empresa}</td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {r.telefone}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground max-w-xs truncate">{r.endereco || "—"}</td>
                    <td className="px-4 py-2">
                      {r.rating ? (
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                          {r.rating} ({r.reviews || 0})
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {r.site ? (
                        <a
                          href={r.site}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Abrir <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
