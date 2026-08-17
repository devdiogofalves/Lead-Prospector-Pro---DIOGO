import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Smartphone, QrCode, RefreshCw, LogOut, Users, CheckCircle2, AlertCircle, Plus, Pause, Play, Trash2, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateInvokeError } from "@/lib/friendlyError";

type State = "open" | "connecting" | "close" | "not_found" | "unknown" | string;

interface WppInstance {
  id: string;
  instance_name: string;
  daily_limit: number;
  active: boolean;
  paused: boolean;
  status: string;
  last_used_at: string | null;
}

export default function WhatsAppTab() {
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<State>("unknown");
  const [instance, setInstance] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string>("");
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [groups, setGroups] = useState<{ jid: string; name: string }[]>([]);
  const [groupJid, setGroupJid] = useState<string>("");
  const [groupName, setGroupName] = useState<string>("");
  const [savingGroup, setSavingGroup] = useState(false);
  // Chip atendente dedicado para qualificação (Fase 2)
  const [attendantInstanceId, setAttendantInstanceId] = useState<string>("");
  const [savingAttendant, setSavingAttendant] = useState(false);
  const [instances, setInstances] = useState<WppInstance[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newChipName, setNewChipName] = useState("");

  async function callForInstance(action: string, whatsappInstanceId: string | null, payload: any = {}) {
    const { data, error } = await supabase.functions.invoke("mandrack-manager", {
      body: { action, whatsappInstanceId, ...payload },
    });
    if (error) throw error;
    return data;
  }

  async function loadInstances() {
    try {
      const { data } = await supabase.functions.invoke("mandrack-manager", { body: { action: "list" } });
      const list: WppInstance[] = data?.instances ?? [];
      setInstances(list);
      if (list.length && !activeId) {
        // Evita mostrar "desconectado" só porque o chip mais antigo está fechado.
        // Em painel multi-chip, seleciona primeiro um chip realmente online.
        const preferred = list.find((i) => i.active && !i.paused && i.status === "open")
          ?? list.find((i) => i.active && i.status === "open")
          ?? list[0];
        setActiveId(preferred.id);
      }
    } catch (e: any) {
      console.warn("loadInstances:", e?.message);
    }
  }

  async function call(action: string, payload: any = {}) {
    return callForInstance(action, activeId, payload);
  }

  async function refreshStatus() {
    setLoading(true);
    try {
      const r = await call("status");
      setInstance(r.instance || null);
      setState(r.state ?? "unknown");
      if (r.state === "open") {
        setQr(null);
        setPairingCode(null);
      } else {
        setGroups([]);
        setGroupJid("");
        setGroupName("");
      }
      await loadInstances();
    } catch (e: any) {
      // silent on initial load — instance may not exist yet
      setState("not_found");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await loadInstances();

      // Load saved qualification settings (handoff group + attendant chip)
      const { data: qs } = await supabase
        .from("qualification_settings")
        .select("handoff_group_jid, handoff_group_name, attendant_instance_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (qs?.handoff_group_jid) {
        setGroupJid(qs.handoff_group_jid);
        setGroupName(qs.handoff_group_name || "");
      }
      if (qs?.attendant_instance_id) {
        setAttendantInstanceId(qs.attendant_instance_id);
      }

      await refreshStatus();
    })();

    const t = setInterval(() => {
      if (document.visibilityState === "visible") refreshStatus();
    }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  async function addNewChip() {
    const name = newChipName.trim();
    if (!/^[a-zA-Z0-9_-]{3,40}$/.test(name)) {
      toast({ title: "Nome inválido", description: "3–40 caracteres: letras, números, _ ou -", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const r = await callForInstance("create", null, { instanceName: name });
      toast({ title: "Chip criado", description: `Selecione abaixo e escaneie o QR.` });
      setNewChipName("");
      await loadInstances();
      if (r?.whatsappInstanceId) setActiveId(r.whatsappInstanceId);
    } catch (e: any) {
      toast({ title: "Erro ao criar chip", description: translateInvokeError(e, "Criar chip"), variant: "destructive" });
    } finally { setLoading(false); }
  }

  async function togglePause(inst: WppInstance) {
    try {
      await callForInstance("update", inst.id, { paused: !inst.paused });
      await loadInstances();
      toast({ title: inst.paused ? "Chip retomado" : "Chip pausado" });
    } catch (e: any) {
      toast({ title: "Erro", description: translateInvokeError(e, "Atualizar chip"), variant: "destructive" });
    }
  }

  async function updateLimit(inst: WppInstance, value: number) {
    try {
      await callForInstance("update", inst.id, { daily_limit: value });
      await loadInstances();
    } catch (e: any) {
      toast({ title: "Erro", description: translateInvokeError(e, "Atualizar limite"), variant: "destructive" });
    }
  }

  async function removeChip(inst: WppInstance) {
    if (!confirm(`Remover chip "${inst.instance_name}"? Conversas em andamento neste chip ficarão pausadas.`)) return;
    try {
      await callForInstance("delete", inst.id);
      if (activeId === inst.id) setActiveId(null);
      await loadInstances();
      toast({ title: "Chip removido" });
    } catch (e: any) {
      toast({ title: "Erro", description: translateInvokeError(e, "Remover chip"), variant: "destructive" });
    }
  }

  async function reconnectChip(inst: WppInstance) {
    try {
      toast({ title: "Reconectando…", description: inst.instance_name });
      const r = await callForInstance("auto_reconnect", inst.id);
      await loadInstances();
      if (r?.state === "open") toast({ title: "Chip reconectado" });
      else if (r?.needsQr) toast({ title: "Escaneie o QR", description: "Selecione o chip e gere um novo QR code.", variant: "destructive" });
      else toast({ title: "Chip ainda conectando", description: `Estado: ${r?.state ?? "?"}` });
    } catch (e: any) {
      toast({ title: "Erro", description: translateInvokeError(e, "Reconectar chip"), variant: "destructive" });
    }
  }

  async function testSendChip(inst: WppInstance) {
    const phone = window.prompt(`Testar envio pelo chip "${inst.instance_name}". Digite um número (DDI+DDD+NUM, só dígitos):`, "");
    if (!phone) return;
    try {
      const r = await callForInstance("test_send", inst.id, { phone });
      if (r?.ok) toast({ title: "Mensagem de teste enviada", description: `Chip ${inst.instance_name} → ${phone}` });
      else toast({ title: "Falha no teste", description: JSON.stringify(r?.response ?? r).slice(0, 200), variant: "destructive" });
    } catch (e: any) {
      toast({ title: "Erro", description: translateInvokeError(e, "Testar envio"), variant: "destructive" });
    }
  }


  async function createInstance() {
    const name = instanceName.trim();
    if (!name) {
      toast({ title: "Nome obrigatório", description: "Escolha um nome para sua instância antes de criar.", variant: "destructive" });
      return;
    }
    if (!/^[a-zA-Z0-9_-]{3,40}$/.test(name)) {
      toast({ title: "Nome inválido", description: "Use 3–40 caracteres: letras, números, _ ou -", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const r = await call("create", { instanceName: name });
      setInstance(r.instance ?? name);
      await getQr();
    } catch (e: any) {
      toast({ title: "Erro ao criar instância", description: translateInvokeError(e, "Criar instância WhatsApp"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function getQr() {
    setLoading(true);
    try {
      const r = await call("qr");
      setQr(r.base64 || r.qrcode?.base64 || null);
      setPairingCode(null);
    } catch (e: any) {
      toast({ title: "Erro ao gerar QR Code", description: translateInvokeError(e, "Gerar QR Code WhatsApp"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function getPairing() {
    if (!phone) {
      toast({ title: "Informe o número", description: "Com DDI (ex: 5511999999999)" });
      return;
    }
    setLoading(true);
    try {
      const r = await call("pairing", { phone });
      const pc = r.pairingCode || r.qrcode?.pairingCode || null;
      // Format as XXXX-XXXX if 8 continuous chars
      setPairingCode(pc && /^[A-Z0-9]{8}$/i.test(pc) ? `${pc.slice(0, 4)}-${pc.slice(4)}` : pc);
      setQr(null);
    } catch (e: any) {
      toast({ title: "Erro ao gerar código", description: translateInvokeError(e, "Pareamento por código WhatsApp"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    try {
      await call("delete");
      setQr(null);
      setPairingCode(null);
      setGroups([]);
      setGroupJid("");
      setGroupName("");
      setInstance(null);
      setState("not_found");
      toast({ title: "Desconectado", description: "Instância WhatsApp removida com sucesso." });
      await refreshStatus();
    } catch (e: any) {
      toast({ title: "Erro ao desconectar", description: translateInvokeError(e, "Desconectar WhatsApp"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function loadGroups() {
    setLoading(true);
    try {
      const r = await call("groups");
      setGroups(r.groups || []);
      if (!r.groups?.length) {
        toast({
          title: "Nenhum grupo encontrado",
          description: r.empty_reason || "Adicione este número a um grupo no WhatsApp e tente novamente em alguns segundos (a sincronização pode levar até 1 min).",
        });
      }
    } catch (e: any) {
      toast({ title: "Erro ao listar grupos", description: translateInvokeError(e, "Listar grupos WhatsApp"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function saveGroup() {
    const g = groups.find((x) => x.jid === groupJid);
    if (!g) return;
    setSavingGroup(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { error } = await supabase.from("qualification_settings").upsert(
        { user_id: user.id, handoff_group_jid: g.jid, handoff_group_name: g.name },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      setGroupName(g.name);
      toast({ title: "Grupo salvo", description: `Leads qualificados serão enviados para "${g.name}".` });
    } catch (e: any) {
      toast({ title: "Erro ao salvar grupo", description: translateInvokeError(e, "Salvar grupo handoff"), variant: "destructive" });
    } finally {
      setSavingGroup(false);
    }
  }

  async function clearGroup() {
    setSavingGroup(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { error } = await supabase.from("qualification_settings").upsert(
        { user_id: user.id, handoff_group_jid: null, handoff_group_name: null },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      setGroupJid("");
      setGroupName("");
      toast({ title: "Grupo desativado", description: "Leads qualificados não serão enviados a nenhum grupo." });
    } catch (e: any) {
      toast({ title: "Erro ao desativar grupo", description: translateInvokeError(e, "Desativar grupo handoff"), variant: "destructive" });
    } finally {
      setSavingGroup(false);
    }
  }

  async function saveAttendant(chipId: string | null) {
    setSavingAttendant(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { error } = await supabase.from("qualification_settings").upsert(
        { user_id: user.id, attendant_instance_id: chipId },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      setAttendantInstanceId(chipId ?? "");
      if (chipId) {
        const chip = instances.find((i) => i.id === chipId);
        toast({ title: "Chip atendente salvo", description: `Respostas da IA usarão "${chip?.instance_name ?? chipId}".` });
      } else {
        toast({ title: "Chip atendente removido", description: "Cada resposta usará o chip que enviou o disparo inicial." });
      }
    } catch (e: any) {
      toast({ title: "Erro ao salvar chip atendente", description: translateInvokeError(e, "Salvar chip atendente"), variant: "destructive" });
    } finally {
      setSavingAttendant(false);
    }
  }

  const connected = state === "open";
  const hasInstance = !!instance && state !== "not_found";

  return (
    <div className="space-y-4">
      {/* Lista de chips conectados (multi-instância) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" /> Chips WhatsApp ({instances.length})
          </CardTitle>
          <CardDescription>
            Conecte vários números para distribuir os disparos e reduzir risco de banimento. Cada chip respeita seu próprio limite diário. O lead sempre é respondido pelo chip que iniciou a conversa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {instances.map((inst) => {
            const isActive = activeId === inst.id;
            return (
              <div key={inst.id} className={`p-3 rounded-md border ${isActive ? "border-primary bg-primary/5" : "border-border"}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    {(() => {
                      const s = inst.status || "";
                      const label = inst.paused
                        ? "Pausado"
                        : s === "open" ? "Conectado"
                        : s === "connecting" ? "Reconectando"
                        : s === "close" ? "Desconectado"
                        : s || "—";
                      const variant: any = inst.paused
                        ? "destructive"
                        : s === "open" ? "default"
                        : s === "close" ? "destructive"
                        : "secondary";
                      return <Badge variant={variant}>{label}</Badge>;
                    })()}
                    <span className="font-mono text-sm truncate">{inst.instance_name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant={isActive ? "default" : "outline"} onClick={() => setActiveId(inst.id)}>
                      {isActive ? "Selecionado" : "Selecionar"}
                    </Button>
                    {inst.status !== "open" && !inst.paused && (
                      <Button size="sm" variant="outline" onClick={() => reconnectChip(inst)} title="Reconectar chip">
                        Reconectar
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => testSendChip(inst)} title="Enviar mensagem de teste">
                      Testar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => togglePause(inst)} title={inst.paused ? "Retomar" : "Pausar"}>
                      {inst.paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => removeChip(inst)} title="Remover">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Label className="text-xs">Limite/dia:</Label>
                  <Input
                    type="number" min={1} max={200}
                    className="h-7 w-20"
                    defaultValue={inst.daily_limit}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (v && v !== inst.daily_limit) updateLimit(inst, v);
                    }}
                  />
                  {inst.last_used_at && <span>Último uso: {new Date(inst.last_used_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>}
                </div>
              </div>
            );
          })}

          <div className="flex gap-2 pt-2 border-t border-border">
            <Input
              placeholder="nome-do-novo-chip"
              value={newChipName}
              onChange={(e) => setNewChipName(e.target.value.replace(/\s/g, "-").toLowerCase())}
              maxLength={40}
            />
            <Button onClick={addNewChip} disabled={loading || !newChipName.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Conectar novo chip
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            💡 Recomendado: limite 15/dia por chip nos primeiros 7 dias (warm-up). Com 4 chips conectados = 60 disparos/dia distribuídos aleatoriamente.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" /> Parear chip selecionado
          </CardTitle>
          <CardDescription>
            Use os botões abaixo para gerar QR code ou código de pareamento do chip selecionado acima.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status bar */}
          <div className="flex items-center justify-between p-3 rounded-md border border-border">
            <div className="flex items-center gap-3">
              {connected ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : (
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {connected
                    ? "Conectado"
                    : state === "connecting"
                      ? qr || pairingCode
                        ? "Conectando… escaneie o QR ou digite o código"
                        : "Aguardando pareamento"
                      : state === "close"
                        ? "Desconectado"
                        : state === "not_found"
                          ? "Sem instância criada"
                          : "Verificando…"}
                </p>
                <p className="text-xs text-muted-foreground font-mono">{instance || "—"}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={refreshStatus} disabled={loading}>
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              </Button>
              {connected && (
                <Button size="sm" variant="outline" onClick={logout} disabled={loading}>
                  <LogOut className="h-3 w-3 mr-1" /> Desconectar
                </Button>
              )}
            </div>
          </div>

          {/* Instance creation / connection */}
          {!connected && (
            <>
              {/* Instance name input — always shown so user can choose name before creating */}
              {!hasInstance && (
                <div className="space-y-2">
                  <Label htmlFor="instance-name">Nome da instância</Label>
                  <p className="text-xs text-muted-foreground">
                    Escolha um identificador único para seu WhatsApp (ex: minha-empresa). Use letras, números, _ ou -.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      id="instance-name"
                      placeholder="minha-empresa"
                      value={instanceName}
                      onChange={(e) => setInstanceName(e.target.value.replace(/\s/g, "-").toLowerCase())}
                      maxLength={40}
                    />
                    <Button onClick={createInstance} disabled={loading || !instanceName.trim()}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4 mr-2" />}
                      Criar
                    </Button>
                  </div>
                </div>
              )}

              {/* QR / Pairing — shown once instance exists */}
              {hasInstance && (
                <div className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Button variant="outline" onClick={getQr} disabled={loading}>
                      <QrCode className="h-4 w-4 mr-2" /> Gerar QR Code
                    </Button>
                    <div className="flex gap-2">
                      <Input
                        placeholder="5511999999999"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                      <Button variant="outline" onClick={getPairing} disabled={loading}>
                        Pareamento
                      </Button>
                    </div>
                  </div>

                  {qr && (
                    <div className="flex flex-col items-center gap-2 p-4 bg-white rounded-md border">
                      <img
                        src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                        alt="QR Code WhatsApp"
                        className="w-64 h-64"
                      />
                      <p className="text-xs text-black">Escaneie no WhatsApp → Aparelhos conectados → Conectar com QR</p>
                    </div>
                  )}

                  {pairingCode && (
                    <div className="text-center p-4 rounded-md border border-primary bg-primary/5">
                      <p className="text-xs text-muted-foreground mb-1">Código de pareamento</p>
                      <p className="text-3xl font-mono font-bold tracking-widest text-primary">{pairingCode}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        WhatsApp → Aparelhos conectados → Conectar com número de telefone
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Handoff group */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Grupo de Leads Qualificados
          </CardTitle>
          <CardDescription>
            Quando a IA detectar um lead qualificado, envia o resumo para esse grupo. Crie um grupo no WhatsApp da conta conectada e selecione abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {connected && groupName && (
            <div className="flex items-center justify-between p-2 rounded-md border border-primary/30 bg-primary/5">
              <span className="text-sm">Grupo atual:</span>
              <Badge variant="outline">{groupName}</Badge>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={clearGroup} disabled={savingGroup} className="w-full">
            Não usar grupo (apenas mensagem ao lead)
          </Button>
          <Button variant="outline" onClick={loadGroups} disabled={!connected || loading} className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" /> Carregar grupos do WhatsApp
          </Button>
          {groups.length > 0 && (
            <div className="space-y-2">
              <Label>Selecione o grupo</Label>
              <Select value={groupJid} onValueChange={setGroupJid}>
                <SelectTrigger><SelectValue placeholder="Escolha um grupo" /></SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.jid} value={g.jid}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={saveGroup} disabled={!groupJid || savingGroup} className="w-full">
                {savingGroup ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Salvar grupo
              </Button>
            </div>
          )}
          {!connected && (
            <p className="text-xs text-muted-foreground">Conecte o WhatsApp acima antes de carregar grupos.</p>
          )}
        </CardContent>
      </Card>

      {/* Chip atendente dedicado (Fase 2) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" /> Chip Atendente
          </CardTitle>
          <CardDescription>
            Chip dedicado para <strong>responder</strong> leads durante a qualificação. Quando configurado, todas as respostas da IA usam este chip — mesmo que o disparo inicial tenha saído por outro número.
            Deixe em branco para usar o mesmo chip do disparo (padrão).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {attendantInstanceId && (
            <div className="flex items-center justify-between p-2 rounded-md border border-primary/30 bg-primary/5">
              <span className="text-sm">Chip atual:</span>
              <Badge variant="outline">
                {instances.find((i) => i.id === attendantInstanceId)?.instance_name ?? attendantInstanceId}
              </Badge>
            </div>
          )}
          {instances.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum chip conectado. Adicione um chip acima primeiro.</p>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs">Selecionar chip atendente</Label>
              <Select
                value={attendantInstanceId || "__none__"}
                onValueChange={(v) => setAttendantInstanceId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Mesmo chip do disparo (padrão)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    Mesmo chip do disparo (padrão)
                  </SelectItem>
                  {instances.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.instance_name}
                      {inst.paused ? " (pausado)" : !inst.active ? " (inativo)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button
                  onClick={() => saveAttendant(attendantInstanceId || null)}
                  disabled={savingAttendant}
                  className="flex-1"
                >
                  {savingAttendant ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Salvar chip atendente
                </Button>
                {attendantInstanceId && (
                  <Button
                    variant="outline"
                    onClick={() => saveAttendant(null)}
                    disabled={savingAttendant}
                  >
                    Remover
                  </Button>
                )}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            💡 Use um chip dedicado à qualificação para proteger os chips de disparo de receber respostas (evita ban por pico de entrada + saída no mesmo número).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
