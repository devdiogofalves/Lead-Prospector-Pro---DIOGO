import { useState } from "react";
import { JobBoardCompaniesTable } from "@/components/JobBoardCompaniesTable";
import { useJobBoardCompanies, JobBoardDisparoStatus } from "@/hooks/useJobBoardCompanies";

export default function JobCompaniesBase() {
  const [cathoFilter, setCathoFilter] = useState<JobBoardDisparoStatus>("all");
  const [infojobsFilter, setInfojobsFilter] = useState<JobBoardDisparoStatus>("all");
  const {
    cathoCompanies,
    infojobsCompanies,
    isLoading,
    deleteCompany,
    clearAllCompanies,
  } = useJobBoardCompanies();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Empresas Job Boards</h1>
        <p className="text-sm text-muted-foreground">Catho e Infojobs separados por origem.</p>
      </div>
      <JobBoardCompaniesTable
        companies={cathoCompanies}
        filter={cathoFilter}
        onFilterChange={setCathoFilter}
        onDelete={deleteCompany}
        onClearAll={clearAllCompanies}
        isLoading={isLoading}
        source="catho"
      />
      <JobBoardCompaniesTable
        companies={infojobsCompanies}
        filter={infojobsFilter}
        onFilterChange={setInfojobsFilter}
        onDelete={deleteCompany}
        onClearAll={clearAllCompanies}
        isLoading={isLoading}
        source="infojobs"
      />
    </div>
  );
}