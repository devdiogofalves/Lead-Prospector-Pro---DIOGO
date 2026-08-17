import { CnpjSearch } from "@/components/CnpjSearch";

export default function CnpjPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Consulta CNPJ</h1>
        <p className="text-sm text-muted-foreground">Enriquecer dados da Receita Federal via CNPJ.ws.</p>
      </div>
      <CnpjSearch />
    </div>
  );
}