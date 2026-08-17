import { EmpresasEnriquecidasTable } from "@/components/EmpresasEnriquecidasTable";
import { useEmpresasEnriquecidas } from "@/hooks/useEmpresasEnriquecidas";

export default function EmpresasBase() {
  const { empresas, isLoading, deleteEmpresa, clearAll, batchLookup, isBatchLoading } =
    useEmpresasEnriquecidas();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Empresas Enriquecidas (CNPJ)</h1>
        <p className="text-sm text-muted-foreground">Base unificada com dados da Receita Federal.</p>
      </div>
      <EmpresasEnriquecidasTable
        empresas={empresas}
        isLoading={isLoading}
        onDelete={deleteEmpresa}
        onClearAll={clearAll}
        onBatchLookup={batchLookup}
        isBatchLoading={isBatchLoading}
      />
    </div>
  );
}