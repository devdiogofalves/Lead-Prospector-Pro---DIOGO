import { useState } from "react";
import { LeadsTable } from "@/components/LeadsTable";
import { useLeads, DisparoStatus } from "@/hooks/useLeads";

export default function MapsBase() {
  const [filter, setFilter] = useState<DisparoStatus>("all");
  const { leads, isLoading, deleteLead, clearAllLeads } = useLeads();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leads Google Maps</h1>
        <p className="text-sm text-muted-foreground">Empresas locais capturadas via Places API.</p>
      </div>
      <LeadsTable
        leads={leads}
        filter={filter}
        onFilterChange={setFilter}
        onDelete={deleteLead}
        onClearAll={clearAllLeads}
        isLoading={isLoading}
      />
    </div>
  );
}