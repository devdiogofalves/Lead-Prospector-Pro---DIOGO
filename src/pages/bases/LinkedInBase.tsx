import { useState } from "react";
import { LinkedInContactsTable } from "@/components/LinkedInContactsTable";
import { useLinkedInContacts, LinkedInDisparoStatus } from "@/hooks/useLinkedInContacts";

export default function LinkedInBase() {
  const [filter, setFilter] = useState<LinkedInDisparoStatus>("all");
  const { contacts, isLoading, deleteContact, clearAllContacts } = useLinkedInContacts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contatos LinkedIn</h1>
        <p className="text-sm text-muted-foreground">Perfis e contatos extraídos do LinkedIn.</p>
      </div>
      <LinkedInContactsTable
        contacts={contacts}
        filter={filter}
        onFilterChange={setFilter}
        onDelete={deleteContact}
        onClearAll={clearAllContacts}
        isLoading={isLoading}
      />
    </div>
  );
}