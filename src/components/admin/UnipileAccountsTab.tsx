import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2, KeyRound, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface UnipileAccount {
  id: string;
  slot_number: number;
  label: string;
  max_profiles: number;
  active: boolean;
  clients_linked: number;
  profiles_connected: number | null;
  channels_connected: number | null;
  profiles_by_provider: Record<string, number>;
}

export function UnipileAccountsTab() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<UnipileAccount[]>([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<UnipileAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<any | null>(null);

  // form fields
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [dsn, setDsn] = useState("");
  const [maxProfiles, setMaxProfiles] = useState(10);
  const [active, setActive] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-client", {
        body: { action: "list_unipile_accounts", client_id: "_" },
      });
      if (error) throw error;
      setAccounts(data?.accounts ?? []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar contas Unipile", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); }, []);

  function openNew() {
    setEditing(null);
    setLabel(""); setApiKey(""); setDsn(""); setMaxProfiles(10); setActive(true);
    setOpenCreate(true);
  }
  function openEdit(a: UnipileAccount) {
    setEditing(a);
    setLabel(a.label); setApiKey(""); setDsn(""); setMaxProfiles(a.max_profiles); setActive(a.active);
    setOpenCreate(true);
  }

  async function save() {
    setBusy(true);
    try {
      const action = editing ? "update_unipile_account" : "create_unipile_account";
      const body: any = editing
        ? { action, client_id: "_", unipile_account_id: editing.id, label, max_profiles: maxProfiles, active }
        : { action, client_id: "_", label, api_key: apiKey, dsn, max_profiles: maxProfiles };
      if (editing && apiKey) body.api_key = apiKey;
      if (editing && dsn) body.dsn = dsn;
      const { data, error } = await supabase.functions.invoke("admin-manage-client", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: editing ? "Conta atualizada" : "Conta criada" });
      setOpenCreate(false);
      reload();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: UnipileAccount) {
    if (a.clients_linked > 0) {
      toast({ title: "Não é possível remover", description: `${a.clients_linked} cliente(s) usam essa conta. Migre-os primeiro.`, variant: "destructive" });
      return;
    }
    if (!confirm(`Remover "${a.label}"?`)) return;
    const { data, error } = await supabase.functions.invoke("admin-manage-client", {
      body: { action: "delete_unipile_account", client_id: "_", unipile_account_id: a.id },
    });
    if (error || data?.error) {
      toast({ title: "Erro", description: error?.message ?? data?.error, variant: "destructive" });
      return;
    }
    toast({ title: "Conta removida" });
    reload();
  }

  async function syncSlot(a: UnipileAccount) {
    setSyncing(a.id);
    setSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-client", {
        body: { action: "sync_unipile_account", client_id: "_", unipile_account_id: a.id },
      });
      if (error || data?.error) throw new Error(error?.message ?? data?.error);
      setSyncResult(data);
    } catch (e: any) {
      toast({ title: "Erro ao sincronizar", description: e?.message, variant: "destructive" });
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Contas Unipile</CardTitle>
            <CardDescription>Cada conta comporta até 10 perfis conectados. Adicione uma nova quando seus slots estiverem cheios.</CardDescription>
          </div>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Adicionar conta</Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma conta cadastrada.</p>
          ) : (
            <div className="space-y-2">
              {accounts.map((a) => {
                // Conta REAL de perfis conectados (LinkedIn/Gmail/IG/TG) vs limite
                const usedProfiles = a.profiles_connected ?? a.clients_linked;
                const pct = Math.min(100, Math.round((usedProfiles / a.max_profiles) * 100));
                const full = usedProfiles >= a.max_profiles;
                const near = usedProfiles >= a.max_profiles - 1 && !full;
                const breakdown = Object.entries(a.profiles_by_provider ?? {})
                  .sort((x, y) => y[1] - x[1])
                  .map(([p, n]) => `${n} ${p.toLowerCase()}`)
                  .join(" · ");
                return (
                  <div key={a.id} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium flex items-center gap-2">
                          Slot #{a.slot_number} — {a.label}
                          {!a.active && <Badge variant="outline" className="text-amber-400 border-amber-400/40">inativa</Badge>}
                          {full && <Badge variant="outline" className="text-red-400 border-red-400/40">cheia — assine outra conta Unipile</Badge>}
                          {near && <Badge variant="outline" className="text-amber-400 border-amber-400/40">quase cheia</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.profiles_connected === null
                            ? <>Não foi possível consultar a Unipile. {a.clients_linked} cliente(s) vinculado(s).</>
                            : <><strong className="text-foreground">{usedProfiles}</strong> de {a.max_profiles} perfis · <span className="opacity-70">{a.channels_connected ?? 0} canais conectados {breakdown && `(${breakdown})`}</span> · {a.clients_linked} cliente(s) vinculado(s)</>
                          }
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" title="Validar conexões reais na Unipile" onClick={() => syncSlot(a)} disabled={syncing === a.id}>
                          {syncing === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                    <div className="h-2 rounded bg-muted overflow-hidden">
                      <div className={`h-full ${full ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar conta Unipile" : "Nova conta Unipile"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Rótulo</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Conta principal, Clientes premium…" />
            </div>
            <div className="space-y-1.5">
              <Label>API Key {editing && <span className="text-xs text-muted-foreground">(deixe vazio para manter)</span>}</Label>
              <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Unipile API Key" type="password" />
            </div>
            <div className="space-y-1.5">
              <Label>DSN {editing && <span className="text-xs text-muted-foreground">(deixe vazio para manter)</span>}</Label>
              <Input value={dsn} onChange={(e) => setDsn(e.target.value)} placeholder="https://apiXX.unipile.com:XXXXX" />
            </div>
            <div className="space-y-1.5">
              <Label>Limite de perfis</Label>
              <Input type="number" value={maxProfiles} onChange={(e) => setMaxProfiles(parseInt(e.target.value || "10", 10))} />
            </div>
            {editing && (
              <div className="flex items-center justify-between">
                <Label>Ativa</Label>
                <Switch checked={active} onCheckedChange={setActive} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenCreate(false)}>Cancelar</Button>
            <Button onClick={save} disabled={busy || (!editing && (!apiKey || !dsn))}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!syncResult} onOpenChange={(o) => !o && setSyncResult(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> Validação ao vivo — Slot #{syncResult?.slot?.slot_number} {syncResult?.slot?.label}
            </DialogTitle>
          </DialogHeader>
          {syncResult?.fetch_error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="inline h-4 w-4 mr-1" /> {syncResult.fetch_error}
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-auto">
              <p className="text-sm">
                <strong>{syncResult?.used}</strong> de <strong>{syncResult?.max}</strong> perfis usados
                {typeof syncResult?.channels_count === "number" && (
                  <span className="text-muted-foreground"> · {syncResult.channels_count} canais conectados no total</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Cada perfil Unipile pode conectar até 4 canais (LinkedIn, Gmail/Outlook, Instagram, Telegram). O limite de 10 é por perfil.
              </p>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Perfis</p>
                {(syncResult?.profiles ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum perfil conectado nessa conta.</p>
                ) : (
                  <div className="space-y-1.5">
                    {syncResult?.profiles?.map((p: any) => (
                      <div key={p.profile_key} className="rounded border border-border p-2 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium truncate">{p.matched_client_name ?? p.matched_client_email ?? p.display_name}</span>
                          {p.orphan
                            ? <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/40">órfão</Badge>
                            : <CheckCircle2 className="h-3 w-3 text-green-500" />}
                          <span className="ml-auto text-[10px] text-muted-foreground">{p.channels.length}/4 canais</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {p.channels.map((c: any) => (
                            <Badge key={c.account_id} variant="outline" className="text-[10px] font-mono">
                              {c.provider} · {c.status}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(syncResult?.ghost_clients ?? []).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-amber-500 mb-1">⚠️ Clientes com slot ativado mas que ainda NÃO conectaram nenhum perfil</p>
                  <div className="space-y-1">
                    {syncResult.ghost_clients.map((g: any) => (
                      <div key={g.client_id} className="text-xs rounded border border-amber-500/30 bg-amber-500/5 p-2">
                        {g.company_name ?? "(sem nome)"} · {g.email ?? g.client_id}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSyncResult(null); reload(); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
