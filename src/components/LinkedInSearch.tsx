import { useState } from "react";
import { Linkedin, MapPin, Loader2, CheckCircle, Users, ExternalLink, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Sparkles, Send, ArrowRight } from "lucide-react";

type ContactRow = {
  nome?: string;
  cargo?: string | null;
  empresa?: string | null;
  localizacao?: string | null;
  linkedin_url?: string | null;
  email?: string | null;
  telefone?: string | null;
  conexoes?: number | null;
};

export function LinkedInSearch() {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [maxResults, setMaxResults] = useState(20);
  const [isSearching, setIsSearching] = useState(false);
  const [lastResult, setLastResult] = useState<{ total: number; saved: number } | null>(null);
  const [results, setResults] = useState<ContactRow[]>([]);
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!searchKeyword.trim()) {
      toast({
        title: "Erro",
        description: "Digite uma busca (ex: CEO, Marketing Manager)",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    setLastResult(null);
    setResults([]);

    try {
      // Busca via Unipile (usa sessão LinkedIn conectada do usuário)
      const { data: searchData, error: searchErr } = await supabase.functions.invoke("linkedin-dm", {
        body: { action: "search", keywords: searchKeyword.trim(), location: location.trim(), limit: maxResults },
      });
      if (searchErr) throw searchErr;
      if (!searchData?.success) throw new Error(searchData?.error || "Erro na busca Unipile");

      const profiles: ContactRow[] = searchData.profiles ?? [];
      if (!profiles.length) {
        setLastResult({ total: 0, saved: 0 });
        toast({ title: "Nenhum perfil encontrado", description: "Tente outros termos ou verifique se sua conta LinkedIn está conectada no Unipile.", variant: "destructive" });
        return;
      }

      // Persiste perfis encontrados em linkedin_contacts
      const { data: saveData, error: saveErr } = await supabase.functions.invoke("linkedin-dm", {
        body: { action: "save", profiles },
      });
      if (saveErr) throw saveErr;

      const inserted = saveData?.inserted ?? profiles.length;
      const total = searchData.raw_count ?? profiles.length;
      setLastResult({ total, saved: inserted });
      setResults(profiles);
      toast({
        title: "Busca concluída!",
        description: `${inserted} novo(s) contato(s) salvo(s) de ${total} encontrado(s)`,
      });
    } catch (error: any) {
      console.error("LinkedIn search error:", error);
      const raw = error?.context?.body || error?.message || "";
      const isNoAccount = /account_id/i.test(typeof raw === "string" ? raw : JSON.stringify(raw));
      toast({
        title: isNoAccount ? "Conecte sua conta LinkedIn" : "Erro na busca",
        description: isNoAccount
          ? "Vá em Configurações → APIs → Unipile e clique em 'Conectar LinkedIn' para autorizar sua conta."
          : (error instanceof Error ? error.message : "Falha ao buscar perfis"),
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-[#0A66C2]/10">
          <Linkedin className="h-5 w-5 text-[#0A66C2]" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Buscar no LinkedIn</h3>
          <p className="text-sm text-muted-foreground">Encontre decisores via Unipile — usa sua conta LinkedIn conectada</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="searchKeyword">Cargo ou palavra-chave</Label>
          <div className="relative">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="searchKeyword"
              className="pl-9"
              placeholder='Ex: CFO, "Diretor Financeiro", CEO'
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              disabled={isSearching}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linkedinLocation">Localização</Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="linkedinLocation"
              className="pl-9"
              placeholder="Ex: São Paulo, Brazil"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={isSearching}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linkedinMaxResults">Máx. resultados</Label>
          <Input
            id="linkedinMaxResults"
            type="number"
            min={5}
            max={50}
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            disabled={isSearching}
          />
        </div>
      </div>

      <div className="flex items-center gap-4 mt-6">
        <Button 
          onClick={handleSearch} 
          disabled={isSearching} 
          className="gap-2 bg-[#0A66C2] hover:bg-[#004182]"
        >
          {isSearching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando...
            </>
          ) : (
            <>
              <Linkedin className="h-4 w-4" />
              Buscar Perfis
            </>
          )}
        </Button>

        {lastResult && (
          <div className="flex items-center gap-2 text-sm text-emerald-500">
            <CheckCircle className="h-4 w-4" />
            <span>
              {lastResult.saved} contatos salvos de {lastResult.total} encontrados
            </span>
          </div>
        )}
      </div>

      {lastResult && lastResult.saved > 0 && (
        <div className="mt-4 rounded-lg border border-[#0A66C2]/30 bg-[#0A66C2]/5 p-4">
          <p className="text-sm font-medium mb-3 flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-[#0A66C2]" />
            Próximos passos com esses {lastResult.saved} leads:
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="gap-2">
              <Link to="/buscas/linkedin-dm">
                <Sparkles className="h-4 w-4" />
                1. Revisar & Iniciar Cadência DM
              </Link>
            </Button>
            <Button asChild size="sm" className="gap-2 bg-[#0A66C2] hover:bg-[#004182]">
              <Link to="/buscas/linkedin-dm">
                <Send className="h-4 w-4" />
                2. Enviar DM via Unipile
              </Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Os leads já estão em <strong>Leads LinkedIn</strong> e disponíveis em <strong>LinkedIn DM</strong>.
          </p>
        </div>
      )}

      {isSearching && (
        <div className="mt-4 p-4 rounded-lg bg-[#0A66C2]/5 border border-[#0A66C2]/20">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-[#0A66C2]" />
            <div>
              <p className="text-sm font-medium">Buscando perfis no LinkedIn...</p>
              <p className="text-xs text-muted-foreground">Buscando via Unipile com sua sessão LinkedIn...</p>
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
                  <th className="text-left px-4 py-2">Nome</th>
                  <th className="text-left px-4 py-2">Cargo</th>
                  <th className="text-left px-4 py-2">Empresa</th>
                  <th className="text-left px-4 py-2">Localização</th>
                  <th className="text-left px-4 py-2">Contato</th>
                  <th className="text-left px-4 py-2">Perfil</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">{r.nome}</td>
                    <td className="px-4 py-2 text-muted-foreground max-w-xs truncate">{r.cargo || "—"}</td>
                    <td className="px-4 py-2">{r.empresa || "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.localizacao || "—"}</td>
                    <td className="px-4 py-2 space-y-1">
                      {r.email && (
                        <div className="inline-flex items-center gap-1 text-xs">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {r.email}
                        </div>
                      )}
                      {r.telefone && (
                        <div className="inline-flex items-center gap-1 text-xs">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {r.telefone}
                        </div>
                      )}
                      {!r.email && !r.telefone && "—"}
                    </td>
                    <td className="px-4 py-2">
                      {r.linkedin_url ? (
                        <a
                          href={r.linkedin_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[#0A66C2] hover:underline"
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
