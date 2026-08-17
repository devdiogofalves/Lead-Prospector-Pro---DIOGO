import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Instagram, Search, Loader2, CheckCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export function InstagramSearch() {
  const { toast } = useToast();

  const [targetAccount, setTargetAccount] = useState("");
  const [maxResults, setMaxResults] = useState(50);
  const [validateWa, setValidateWa] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    background?: boolean;
    message?: string;
    saved?: number;
    found?: number;
    withPhone?: number;
    validated?: number;
    validatedWhatsapp?: boolean;
  } | null>(null);

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("unipile-connect-link", {
        body: { provider: "INSTAGRAM" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("Unipile não retornou URL de conexão");
      window.open(data.url, "_blank", "noopener,noreferrer");
      toast({
        title: "Reconecte no Unipile",
        description: "Abrimos a janela do Unipile. Depois de reconectar, tente extrair novamente.",
      });
      setNeedsReconnect(false);
    } catch (e: any) {
      toast({ title: "Erro ao gerar link", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setReconnecting(false);
    }
  };

  const handleFollowersSearch = async () => {
    if (!targetAccount.trim()) {
      toast({
        title: "Conta alvo obrigatória",
        description: "Digite o @ do concorrente para extrair os seguidores",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    setLastResult(null);
    setNeedsReconnect(false);

    try {
      const { data, error } = await supabase.functions.invoke("unipile-instagram-scrape", {
        body: { mode: "followers", target: targetAccount.trim(), limit: maxResults, validateWhatsapp: validateWa },
      });

      if (error) throw error;
      if (!data?.success) {
        if (data?.needs_connection) setNeedsReconnect(true);
        throw new Error(data?.error || "Erro na busca");
      }

      if (data?.background) {
        setLastResult({
          background: true,
          message: data.message,
          validatedWhatsapp: validateWa,
        });
        toast({
          title: "Extração iniciada",
          description: "Os perfis serão salvos mesmo sem telefone e aparecerão na tabela conforme forem extraídos.",
        });
      } else {
        setLastResult({
          saved: data.saved ?? 0,
          found: data.found ?? 0,
          withPhone: data.withPhone ?? 0,
          validated: data.validated ?? 0,
          validatedWhatsapp: data.validatedWhatsapp,
        });
        toast({
          title: "Busca concluída!",
          description: validateWa
            ? `${data.saved ?? 0}/${data.found ?? 0} perfis salvos para DM · ${data.withPhone ?? 0} com telefone · ${data.validated ?? 0} WhatsApp validado`
            : `${data.saved ?? 0}/${data.found ?? 0} perfis salvos para DM · telefone não é obrigatório`,
        });
      }
    } catch (error: any) {
      console.error("Instagram search error:", error);
      toast({
        title: "Erro na busca",
        description: error.message || "Falha ao buscar seguidores",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };


  const showRateWarning = maxResults > 500;

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Instagram className="h-5 w-5 text-pink-500" />
          Seguidores do concorrente
        </CardTitle>
        <CardDescription>
          Extrai seguidores via <b>Unipile</b> (sua conta Instagram conectada). Salva bio, telefone, e-mail e site. Sem custo de Apify.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="targetAccount">Conta alvo (@ do concorrente)</Label>
            <Input
              id="targetAccount"
              placeholder="@concorrente_exemplo"
              value={targetAccount}
              onChange={(e) => setTargetAccount(e.target.value)}
              disabled={isSearching}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxResults">Máx. seguidores</Label>
            <Input
              id="maxResults"
              type="number"
              min={1}
              value={maxResults}
              onChange={(e) => setMaxResults(Math.max(1, Number(e.target.value) || 1))}
              disabled={isSearching}
            />
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="space-y-1">
            <Label htmlFor="validateWa" className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Validar WhatsApp via Mandrack
            </Label>
            <p className="text-xs text-muted-foreground">
              Confirma se o número da bio é WhatsApp ativo. <b>Desligado:</b> salva todos os números encontrados (mais rápido, sem consumir chip).
            </p>
          </div>
          <Switch
            id="validateWa"
            checked={validateWa}
            onCheckedChange={setValidateWa}
            disabled={isSearching}
          />
        </div>

        {showRateWarning && (
          <div className="flex items-start gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-300">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <b>Volume alto detectado.</b> O Instagram limita ~100 ações/dia por conta conectada.
              Buscar {maxResults} seguidores de uma vez pode travar sua conta Unipile por 24h+. Prossiga sob sua responsabilidade.
            </div>
          </div>
        )}

        {needsReconnect && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <b>Instagram desconectado no Unipile.</b> A sessão da sua conta caiu (é normal a cada semanas). Reconecte para voltar a extrair seguidores.
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReconnect}
              disabled={reconnecting}
              className="border-red-400/60 text-red-100 hover:bg-red-500/20"
            >
              {reconnecting ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Instagram className="mr-2 h-3 w-3" />}
              Reconectar Instagram no Unipile
            </Button>
          </div>
        )}

        <Button
          onClick={handleFollowersSearch}
          disabled={isSearching}
          className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
        >
          {isSearching ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Extraindo seguidores via Unipile...
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              Extrair seguidores
            </>
          )}
        </Button>

        {lastResult && (
          <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
            <CheckCircle className="h-4 w-4" />
            <span>
              {lastResult.background
                ? "Extração rodando em background — perfis com ou sem telefone serão salvos para DM."
                : `${lastResult.saved ?? 0} de ${lastResult.found ?? 0} perfis salvos para DM${lastResult.validatedWhatsapp ? ` · ${lastResult.withPhone ?? 0} com telefone · ${lastResult.validated ?? 0} WhatsApp validado` : " · telefone não obrigatório"}`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
