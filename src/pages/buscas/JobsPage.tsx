import { JobBoardSearch } from "@/components/JobBoardSearch";

export default function JobsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Empresas em Job Boards</h1>
        <p className="text-sm text-muted-foreground">Catho e Infojobs — empresas com vagas abertas.</p>
      </div>
      <JobBoardSearch />
    </div>
  );
}