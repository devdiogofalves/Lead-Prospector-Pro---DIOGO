import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Plus, Power, Trash2, Download, ShieldCheck } from "lucide-react";

type License = {
  id: string;
  license_key: string;
  user_id: string;
  device_id: string | null;
  active: boolean;
  notes: string | null;
  activated_at: string | null;
  last_used_at: string | null;
  usage_count: number;
  created_at: string;
};

function genKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "MPL-";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function ExtensaoMaps() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientUserId, setClientUserId] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
      await load();
      await ensureOwnKey();
    })();
  }, [user]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("extension_licenses")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setLicenses((data as License[]) ?? []);
    setLoading(false);
  }

  async function ensureOwnKey() {
    if (!user) return;
    const { data: existing } = await supabase
      .from("extension_licenses")
      .select("id")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();
    if (existing) return;
    const key = genKey();
    const { error } = await supabase.from("extension_licenses").insert({
      license_key: key,
      user_id: user.id,
      notes: "Auto-gerada no primeiro acesso",
    });
    if (!error) {
      toast.success(`Sua chave foi criada: ${key}`);
      load();
    }
  }

  async function generate() {
    if (!clientUserId.trim()) {
      toast.error("Informe o user_id do cliente");
      return;
    }
    const key = genKey();
    const { error } = await supabase.from("extension_licenses").insert({
      license_key: key,
      user_id: clientUserId.trim(),
      notes: notes.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success(`Chave criada: ${key}`);
    setClientUserId("");
    setNotes("");
    load();
  }

  async function toggleActive(lic: License) {
    const { error } = await supabase
      .from("extension_licenses")
      .update({ active: !lic.active })
      .eq("id", lic.id);
    if (error) return toast.error(error.message);
    load();
  }

  async function resetDevice(lic: License) {
    const { error } = await supabase
      .from("extension_licenses")
      .update({ device_id: null, device_info: null, activated_at: null })
      .eq("id", lic.id);
    if (error) return toast.error(error.message);
    toast.success("Device resetado");
    load();
  }

  async function remove(lic: License) {
    if (!confirm(`Excluir chave ${lic.license_key}?`)) return;
    const { error } = await supabase.from("extension_licenses").delete().eq("id", lic.id);
    if (error) return toast.error(error.message);
    load();
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copiado");
  }

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-primary" />
            Extensão Maps Lead Pro
          </h1>
          <p className="text-muted-foreground">
            {isAdmin ? "Gere e gerencie chaves de licença dos clientes." : "Suas chaves de licença."}
          </p>
        </div>
        <Button variant="outline" onClick={() => {
          fetch("/maps-lead-pro.zip")
            .then(r => { if (!r.ok) throw new Error(`Erro ${r.status}`); return r.blob(); })
            .then(blob => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "maps-lead-pro.zip";
              a.click();
              URL.revokeObjectURL(a.href);
            })
            .catch(e => toast.error(e.message));
        }}>
          <Download className="h-4 w-4 mr-2" /> Baixar Extensão
        </Button>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Gerar nova chave</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2 flex-wrap">
            <Input
              placeholder="user_id do cliente (UUID)"
              value={clientUserId}
              onChange={(e) => setClientUserId(e.target.value)}
              className="flex-1 min-w-[280px]"
            />
            <Input
              placeholder="Notas (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex-1 min-w-[200px]"
            />
            <Button onClick={generate}>
              <Plus className="h-4 w-4 mr-2" /> Gerar MPL
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Licenças ({licenses.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : licenses.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma chave ainda.</p>
          ) : (
            <div className="space-y-2">
              {licenses.map((lic) => (
                <div
                  key={lic.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="font-mono text-sm font-bold text-primary">
                        {lic.license_key}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => copy(lic.license_key)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Badge variant={lic.active ? "default" : "destructive"}>
                        {lic.active ? "Ativa" : "Revogada"}
                      </Badge>
                      {lic.device_id && <Badge variant="outline">Vinculada</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground space-x-3">
                      <span>user: {lic.user_id.slice(0, 8)}…</span>
                      <span>usos: {lic.usage_count}</span>
                      {lic.last_used_at && (
                        <span>último: {new Date(lic.last_used_at).toLocaleString()}</span>
                      )}
                      {lic.notes && <span>· {lic.notes}</span>}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      {lic.device_id && (
                        <Button size="sm" variant="outline" onClick={() => resetDevice(lic)}>
                          Resetar device
                        </Button>
                      )}
                      <Button size="icon" variant="outline" onClick={() => toggleActive(lic)}>
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" onClick={() => remove(lic)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}