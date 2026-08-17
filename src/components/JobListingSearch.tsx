import { useState } from "react";
import { Briefcase, MapPin, Loader2, CheckCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export function JobListingSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [location, setLocation] = useState("");
  const [source, setSource] = useState<"catho" | "infojobs">("catho");
  const [maxResults, setMaxResults] = useState(20);
  const [isSearching, setIsSearching] = useState(false);
  const [lastResult, setLastResult] = useState<{ total: number; saved: number } | null>(null);
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Erro",
        description: "Digite um termo de busca (ex: desenvolvedor, vendedor)",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    setLastResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("joblisting-scrape", {
        body: {
          searchQuery: searchQuery.trim(),
          location: location.trim() || "Brasil",
          source,
          maxResults,
        },
      });

      if (error) throw error;

      if (data.success) {
        setLastResult({ total: data.total, saved: data.saved });
        toast({
          title: "Busca concluída!",
          description: `${data.saved} vagas salvas de ${data.total} encontradas`,
        });
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (error) {
      console.error("Job listing search error:", error);
      toast({
        title: "Erro na busca",
        description: error instanceof Error ? error.message : "Falha ao buscar vagas",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const sourceConfig = {
    catho: {
      color: "#FF6B00",
      name: "Catho",
    },
    infojobs: {
      color: "#00A0DC",
      name: "Infojobs",
    },
  };

  const currentSource = sourceConfig[source];

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
      <div className="flex items-center gap-3 mb-6">
        <div 
          className="p-2 rounded-lg"
          style={{ backgroundColor: `${currentSource.color}20` }}
        >
          <Briefcase className="h-5 w-5" style={{ color: currentSource.color }} />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Buscar Vagas</h3>
          <p className="text-sm text-muted-foreground">Catho e Infojobs via Apify</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="jobSource">Plataforma</Label>
          <Select value={source} onValueChange={(v) => setSource(v as "catho" | "infojobs")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="catho">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#FF6B00]" />
                  Catho
                </span>
              </SelectItem>
              <SelectItem value="infojobs">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#00A0DC]" />
                  Infojobs
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="jobSearchQuery">Cargo ou palavra-chave</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="jobSearchQuery"
              className="pl-9"
              placeholder="Ex: Desenvolvedor, Vendedor"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={isSearching}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="jobLocation">Localização</Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="jobLocation"
              className="pl-9"
              placeholder="Ex: São Paulo"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={isSearching}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="jobMaxResults">Máx. resultados</Label>
          <Input
            id="jobMaxResults"
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
          className="gap-2"
          style={{ 
            backgroundColor: currentSource.color,
          }}
        >
          {isSearching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando...
            </>
          ) : (
            <>
              <Briefcase className="h-4 w-4" />
              Buscar Vagas
            </>
          )}
        </Button>

        {lastResult && (
          <div className="flex items-center gap-2 text-sm text-emerald-500">
            <CheckCircle className="h-4 w-4" />
            <span>
              {lastResult.saved} vagas salvas de {lastResult.total} encontradas
            </span>
          </div>
        )}
      </div>

      {isSearching && (
        <div 
          className="mt-4 p-4 rounded-lg border"
          style={{ 
            backgroundColor: `${currentSource.color}05`,
            borderColor: `${currentSource.color}20`
          }}
        >
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: currentSource.color }} />
            <div>
              <p className="text-sm font-medium">Buscando vagas no {currentSource.name}...</p>
              <p className="text-xs text-muted-foreground">Isso pode levar até 3 minutos</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
