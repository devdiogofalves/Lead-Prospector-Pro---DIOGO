import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { translateInvokeError } from "@/lib/friendlyError";
import {
  IdCard,
  User,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";

type TipoConsulta = "cpf_cnpj" | "nome" | "telefone" | "email";

interface Consulta {
  id: string;
  tipo_consulta: string;
  valor_consultado: string;
  nome: string | null;
  cpf: string | null;
  cnpj: string | null;
  nascimento: string | null;
  sexo: string | null;
  nome_mae: string | null;
  situacao: string | null;
  ocupacao: string | null;
  renda: string | null;
  risco: string | null;
  celulares: any[];
  fixos: any[];
  emails: any[];
  enderecos: any[];
  sociedades: any[];
  tokens_gastos: number | null;
  created_at: string;
}

const tipoLabels: Record<TipoConsulta, string> = {
  cpf_cnpj: "CPF / CNPJ",
  nome: "Nome",
  telefone: "Telefone",
  email: "E-mail",
};

export function Dados4uSearch() {
  const [tipo, setTipo] = useState<TipoConsulta>("cpf_cnpj");
  const [valor, setValor] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<Consulta | null>(null);
  const [historico, setHistorico] = useState<Consulta[]>([]);

  const loadHistorico = async () => {
    const { data } = await supabase
      .from("dados4u_consultas")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setHistorico((data as Consulta[]) || []);
  };

  useEffect(() => {
    loadHistorico();
  }, []);

  const handleSearch = async () => {
    if (!valor.trim()) {
      toast({ title: "Informe um valor para consulta", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResultado(null);
    try {
      const { data, error } = await supabase.functions.invoke("dados4u-query-v2", {
        body: { tipo, valor: valor.trim() },
      });
      if (error?.message?.includes("Erro Dados4U 404") || data?.notFound) {
        toast({
          title: "Nenhum dado encontrado",
          description: data?.error || "O DadosBooster não encontrou registros para esse termo.",
        });
        return;
      }
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Erro na consulta");

      setResultado(data.consulta);
      toast({
        title: "✅ Consulta realizada",
        description: data.consulta?.nome
          ? `Encontrado: ${data.consulta.nome}`
          : "Resultado salvo no histórico",
      });
      loadHistorico();
    } catch (err: any) {
      toast({
        title: "Erro na consulta",
        description: translateInvokeError(err, "Consulta DadosBooster"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("dados4u_consultas").delete().eq("id", id);
    if (resultado?.id === id) setResultado(null);
    loadHistorico();
  };

  const renderResultado = (r: Consulta) => (
    <div className="space-y-4">
      {/* Identificação */}
      <div className="rounded-lg border border-border bg-card/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <User className="h-4 w-4 text-primary" />
          <h4 className="font-semibold">Identificação</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Field label="Nome" value={r.nome} />
          <Field label="CPF" value={r.cpf} />
          <Field label="CNPJ" value={r.cnpj} />
          <Field label="Nascimento" value={r.nascimento} />
          <Field label="Sexo" value={r.sexo} />
          <Field label="Nome da Mãe" value={r.nome_mae} />
          <Field label="Situação" value={r.situacao} />
        </div>
      </div>

      {/* Financeiro */}
      {(r.ocupacao || r.renda || r.risco) && (
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="h-4 w-4 text-primary" />
            <h4 className="font-semibold">Dados Financeiros</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <Field label="Ocupação" value={r.ocupacao} />
            <Field label="Renda" value={r.renda} />
            <Field label="Risco" value={r.risco} />
          </div>
        </div>
      )}

      {/* Telefones */}
      {(r.celulares?.length > 0 || r.fixos?.length > 0) && (
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Phone className="h-4 w-4 text-primary" />
            <h4 className="font-semibold">Telefones</h4>
          </div>
          <div className="space-y-2 text-sm">
            {r.celulares?.map((c: any, i: number) => (
              <div key={`cel-${i}`} className="flex items-center justify-between border-b border-border/50 py-1">
                <span className="font-mono">📱 {c.numero || c.telefone || JSON.stringify(c)}</span>
                <span className="text-muted-foreground text-xs">{c.situacao || ""}</span>
              </div>
            ))}
            {r.fixos?.map((c: any, i: number) => (
              <div key={`fix-${i}`} className="flex items-center justify-between border-b border-border/50 py-1">
                <span className="font-mono">📞 {c.numero || c.telefone || JSON.stringify(c)}</span>
                <span className="text-muted-foreground text-xs">{c.situacao || ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emails */}
      {r.emails?.length > 0 && (
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="h-4 w-4 text-primary" />
            <h4 className="font-semibold">E-mails</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {r.emails.map((e: any, i: number) => (
              <Badge key={i} variant="secondary" className="font-mono">
                {typeof e === "string" ? e : e.email || JSON.stringify(e)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Endereços */}
      {r.enderecos?.length > 0 && (
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-4 w-4 text-primary" />
            <h4 className="font-semibold">Endereços</h4>
          </div>
          <div className="space-y-2 text-sm">
            {r.enderecos.map((e: any, i: number) => (
              <div key={i} className="border-b border-border/50 py-1">
                {typeof e === "string"
                  ? e
                  : [
                      e.endereco_rua || e.rua || e.logradouro,
                      e.numero,
                      e.bairro,
                      e.cidade,
                      e.estado || e.uf,
                      e.cep,
                      e.tipo ? `(${e.tipo})` : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sociedade */}
      {r.sociedades?.length > 0 && (
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="h-4 w-4 text-primary" />
            <h4 className="font-semibold">Sociedade</h4>
          </div>
          <div className="space-y-2 text-sm">
            {r.sociedades.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between border-b border-border/50 py-1">
                <span>{s.razao_social || s.nome || JSON.stringify(s)}</span>
                <span className="text-muted-foreground text-xs font-mono">
                  {s.cnpj} {s.participacao ? `· ${s.participacao}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Card className="p-6 border-primary/20">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
          <IdCard className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">DADOSBOOSTER</h2>
          <p className="text-sm text-muted-foreground">
            Consulta direta de CPF/CNPJ, nome, telefone e e-mail
          </p>
        </div>
      </div>

      {/* Search form */}
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-3 mb-6">
        <div>
          <Label className="text-xs">Tipo</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoConsulta)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(tipoLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Valor</Label>
          <Input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={
              tipo === "cpf_cnpj"
                ? "000.000.000-00 ou CNPJ"
                : tipo === "telefone"
                ? "(11) 99999-9999"
                : tipo === "email"
                ? "exemplo@email.com"
                : "Nome completo"
            }
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <div className="flex items-end">
          <Button onClick={handleSearch} disabled={loading} className="w-full md:w-auto">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Consultar
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Resultado atual */}
      {resultado && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-primary">Resultado da Consulta</h3>
            {resultado.tokens_gastos != null && (
              <Badge variant="outline">{resultado.tokens_gastos} tokens</Badge>
            )}
          </div>
          {renderResultado(resultado)}
        </div>
      )}

      {/* Histórico */}
      {historico.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 text-sm text-muted-foreground">
            Histórico ({historico.length})
          </h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {historico.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between p-2 rounded border border-border/50 hover:bg-card/50 cursor-pointer text-sm"
                onClick={() => setResultado(h)}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Badge variant="outline" className="text-xs shrink-0">
                    {tipoLabels[h.tipo_consulta as TipoConsulta] || h.tipo_consulta}
                  </Badge>
                  <span className="font-medium truncate">
                    {h.nome || h.valor_consultado}
                  </span>
                  <span className="text-muted-foreground text-xs truncate">
                    {h.valor_consultado}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(h.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}