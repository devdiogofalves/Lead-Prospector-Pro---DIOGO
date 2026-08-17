import { JobListingSearch } from "@/components/JobListingSearch";

export default function VagasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vagas Catho/Infojobs</h1>
        <p className="text-sm text-muted-foreground">Listagens individuais de vagas com extração de contatos.</p>
      </div>
      <JobListingSearch />
    </div>
  );
}