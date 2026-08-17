import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Zap } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const PROVIDERS: { key: string; label: string }[] = [
  { key: "unipile",       label: "Unipile (LinkedIn / E-mail / IG / Telegram)" },
  { key: "google_places", label: "Google Places (busca Maps)" },
  { key: "elevenlabs",    label: "ElevenLabs (voz IA)" },
  { key: "dados4u",       label: "Dados4U (enriquecimento)" },
  { key: "openai",        label: "OpenAI" },
  { key: "gemini",        label: "Google Gemini" },
  { key: "kie_ai",        label: "Kie.ai (imagem / video)" },
  { key: "apify",         label: "Apify (Instagram)" },
  { key: "serpapi",       label: "SerpAPI" },
];

interface UnipileAccount { id: string; slot_number: number; label: string; clients_linked: number; max_profiles: number; active: boolean; }

export function SharedApisPanel({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [shared, setShared] = useState<Record<string, { enabled: boolean; unipile_account_id: string | null }>>({});
  const [adminProviders, setAdminProviders] = useState<string[]>([]);
  const [unipileAccounts, setUnipileAccounts] = useState<UnipileAccount[]>([]);

  async function reload() {
    setLoading(true);
    try {
      const [{ data: sRes }, { data: uRes }] = await Promise.all([
        supabase.functions.invoke("admin-manage-client", { body: { action: "list_shared_apis", client_id: clientId } }),
        supabase.functions.invoke("admin-manage-client", { body: { action: "list_unipile_accounts", client_id: clientId } }),
      ]);
      const map: typeof shared = {};
      for (const row of sRes?.shared ?? []) map[row.provider] = { enabled: row.enabled, unipile_account_id: row.unipile_account_id };
      setShared(map);
      setAdminProviders(sRes?.admin_providers ?? []);
      setUnipileAccounts(uRes?.accounts ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [clientId]);

  async function toggle(provider: string, enabled: boolean, unipile_account_id?: string | null) {
    setBusy(provider);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-client", {
        body: { action: "set_shared_api", client_id: clientId, provider, enabled, unipile_account_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: enabled ? `✅ ${provider} compartilhado` : `${provider} desativado` });
      reload();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div>
        <p className="text-sm font-medium flex items-center gap-1.5"><Zap className="h-4 w-4 text-primary" /> APIs compartilhadas com este cliente</p>
        <p className="text-xs text-muted-foreground mt-0.5">Ligue por API. O cliente recebe a chave correspondente e usa como se fosse dele — sem precisar configurar.</p>
      </div>

      <div className="space-y-2">
        {PROVIDERS.map((p) => {
          const row = shared[p.key];
          const isOn = !!row?.enabled;
          const hasAdminKey = adminProviders.includes(p.key) || p.key === "unipile";
          const isUnipile = p.key === "unipile";
          const selectedSlot = row?.unipile_account_id ?? unipileAccounts.find((a) => a.active && a.clients_linked < a.max_profiles)?.id ?? "";

          return (
            <div key={p.key} className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 p-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{p.label}</p>
                {!hasAdminKey && <p className="text-[11px] text-amber-400">Você ainda não cadastrou essa chave nas suas próprias APIs.</p>}
                {isUnipile && isOn && row?.unipile_account_id && (
                  <p className="text-[11px] text-muted-foreground">
                    Vinculado a: {unipileAccounts.find((a) => a.id === row.unipile_account_id)?.label ?? "—"}
                  </p>
                )}
              </div>

              {isUnipile && (
                <Select
                  value={selectedSlot}
                  disabled={busy === p.key}
                  onValueChange={(v) => { if (isOn) toggle(p.key, true, v); else toggle(p.key, true, v); }}
                >
                  <SelectTrigger className="h-8 w-[210px] text-xs"><SelectValue placeholder="Escolher conta…" /></SelectTrigger>
                  <SelectContent>
                    {unipileAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} disabled={!a.active || (a.clients_linked >= a.max_profiles && row?.unipile_account_id !== a.id)}>
                        {a.label} ({a.clients_linked}/{a.max_profiles})
                      </SelectItem>
                    ))}
                    {unipileAccounts.length === 0 && <SelectItem value="__none" disabled>Nenhuma conta cadastrada</SelectItem>}
                  </SelectContent>
                </Select>
              )}

              <Switch
                checked={isOn}
                disabled={busy === p.key || (!isOn && (!hasAdminKey || (isUnipile && !selectedSlot)))}
                onCheckedChange={(checked) => toggle(p.key, checked, isUnipile ? selectedSlot : null)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
