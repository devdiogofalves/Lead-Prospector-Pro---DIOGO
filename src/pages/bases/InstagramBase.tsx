import { useState } from "react";
import { InstagramContactsTable } from "@/components/InstagramContactsTable";
import { useInstagramContacts } from "@/hooks/useInstagramContacts";

export default function InstagramBase() {
  const [filter, setFilter] = useState("");
  const { contacts, deleteContact, clearAllContacts } = useInstagramContacts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contatos Instagram</h1>
        <p className="text-sm text-muted-foreground">Perfis com bio, WhatsApp e dados de contato.</p>
      </div>
      <InstagramContactsTable
        contacts={contacts}
        filter={filter}
        onFilterChange={setFilter}
        onDelete={deleteContact}
        onClearAll={clearAllContacts}
      />
    </div>
  );
}