import { LinkedInSearch } from "@/components/LinkedInSearch";

export default function LinkedInPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Busca LinkedIn</h1>
        <p className="text-sm text-muted-foreground">Encontrar perfis de tomadores de decisão.</p>
      </div>
      <LinkedInSearch />
    </div>
  );
}