import { Dados4uSearch } from "@/components/Dados4uSearch";

export default function Dados4uPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">DadosBooster</h1>
        <p className="text-sm text-muted-foreground">Consulta direta de CPF/CNPJ/Nome/Telefone/Email.</p>
      </div>
      <Dados4uSearch />
    </div>
  );
}