import { useState } from "react";
import { JobListingsTable } from "@/components/JobListingsTable";
import { useJobListings, JobListingDisparoStatus } from "@/hooks/useJobListings";

export default function VagasBase() {
  const [cathoFilter, setCathoFilter] = useState<JobListingDisparoStatus>("all");
  const [infojobsFilter, setInfojobsFilter] = useState<JobListingDisparoStatus>("all");
  const {
    cathoListings,
    infojobsListings,
    isLoading,
    deleteListing,
    clearAllListings,
  } = useJobListings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vagas Catho/Infojobs</h1>
        <p className="text-sm text-muted-foreground">Listagens com regex de email/telefone/site.</p>
      </div>
      <JobListingsTable
        listings={cathoListings}
        filter={cathoFilter}
        onFilterChange={setCathoFilter}
        onDelete={deleteListing}
        onClearAll={clearAllListings}
        isLoading={isLoading}
        source="catho"
      />
      <JobListingsTable
        listings={infojobsListings}
        filter={infojobsFilter}
        onFilterChange={setInfojobsFilter}
        onDelete={deleteListing}
        onClearAll={clearAllListings}
        isLoading={isLoading}
        source="infojobs"
      />
    </div>
  );
}