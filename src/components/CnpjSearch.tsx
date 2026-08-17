import { useState } from "react";
import { Search, Loader2, CheckCircle, Users, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CnpjResult {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  porte: string;
  natureza_juridica: string;
  socios: string;
  endereco: string;
  telefone: string | null;
  email: string | null;
  situacao: string;
  atividade_principal: string;
}

export function CnpjSearch() {
  const [cnpj, setCnpj] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<CnpjResult | null>(null);
  const { toast } = useToast();

  const formatCnpjInput = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  };

  const handleSearch = async () => {
    const cleanCnpj = cnpj.replace(/\D/g, "");
    if (cleanCnpj.length !== 14) {
      toast({
        title: "CNPJ inválido",
        description: "O CNPJ deve ter 14 dígitos",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("cnpj-lookup", {
        body: { cnpj: cleanCnpj },
      });

      if (error) throw error;

      if (data.success) {
        setResult(data.data);
        const porte = data.data.porte?.toLowerCase() || "";
        const isMedium = porte.includes("médio") || porte.includes("medio");
        toast({
          title: "CNPJ encontrado!",
          description: isMedium
            ? `✅ Empresa de porte MÉDIO - ${data.data.razao_social}`
            : `Porte: ${data.data.porte} - ${data.data.razao_social}`,
        });
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (error) {
      console.error("CNPJ search error:", error);
      toast({
        title: "Erro na consulta",
        description: error instanceof Error ? error.message : "Falha ao consultar CNPJ",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const getPorteBadge = (porte: string) => {
    const p = porte.toLowerCase();
    if (p.includes("médio") || p.includes("medio")) return "success";
    if (p.includes("micro") || p.includes("mei")) return "pending";
    if (p.includes("pequeno")) return "outline";
    return "secondary";
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-amber-500/10">
          <FileText className="h-5 w-5 text-amber-500" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Consulta CNPJ</h3>
          <p className="text-sm text-muted-foreground">Busque dados da empresa direto da Receita Federal</p>
        </div>
      </div>

      <div className="flex gap-4 items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="cnpj">CNPJ</Label>
          <Input
            id="cnpj"
            placeholder="00.000.000/0000-00"
            value={cnpj}
            onChange={(e) => setCnpj(formatCnpjInput(e.target.value))}
            disabled={isSearching}
            maxLength={18}
          />
        </div>
        <Button onClick={handleSearch} disabled={isSearching} className="gap-2">
          {isSearching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Consultando...
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Consultar
            </>
          )}
        </Button>
      </div>

      {result && (
        <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              <h4 className="font-semibold">{result.nome_fantasia || result.razao_social}</h4>
            </div>
            <Badge variant={getPorteBadge(result.porte) as any}>
              {result.porte || "N/A"}
            </Badge>
          </div>

          <div className="grid gap-2 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground min-w-[120px]">Razão Social:</span>
              <span>{result.razao_social}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground min-w-[120px]">CNPJ:</span>
              <span className="font-mono">{formatCnpjInput(result.cnpj)}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground min-w-[120px]">Natureza:</span>
              <span>{result.natureza_juridica}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground min-w-[120px]">Atividade:</span>
              <span>{result.atividade_principal}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground min-w-[120px]">Situação:</span>
              <span>{result.situacao}</span>
            </div>
            {result.endereco && (
              <div className="flex gap-2">
                <span className="text-muted-foreground min-w-[120px]">Endereço:</span>
                <span>{result.endereco}</span>
              </div>
            )}
            {result.telefone && (
              <div className="flex gap-2">
                <span className="text-muted-foreground min-w-[120px]">Telefone:</span>
                <span className="font-mono">{result.telefone}</span>
              </div>
            )}
            {result.socios && (
              <div className="flex gap-2">
                <span className="text-muted-foreground min-w-[120px]">
                  <Users className="h-4 w-4 inline mr-1" />
                  Sócios:
                </span>
                <span>{result.socios}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
