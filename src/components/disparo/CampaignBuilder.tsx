import { useEffect, useState } from "react";
import { Campaign, CampaignStep, useCampaigns } from "@/hooks/useCampaigns";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Loader2, Rocket, Save, Send, TestTube2 } from "lucide-react";
import { SequenceEditor } from "./SequenceEditor";
import { toast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onClose: () => void;
  campaign: Campaign | null;
}

const SOURCES = [
  { key: "leads", label: "Google Maps" },
  { key: "instagram_contacts", label: "Instagram" },
  { key: "linkedin_contacts", label: "LinkedIn" },
  { key: "empresas_enriquecidas", label: "Enriquecidas" },
];

export function CampaignBuilder({ open, onClose, campaign }: Props) {
  const { create, update, launch } = useCampaigns();
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [sources, setSources] = useState<string[]>(["leads"]);
  const [limit, setLimit] = useState(50);
  const [chipsIds, setChipsIds] = useState<string[]>([]);
  const [ignoreBusinessHours, setIgnoreBusinessHours] = useState(false);
  const [sequence, setSequence] = useState<CampaignStep[]>([
    { ordem: 1, delay_hours: 0, mensagem: "", use_audio: false, media_type: "text", media_url: null },
  ]);
  const [saving, setSaving] = useState(false);

  // Estado do disparo de teste manual
  const [testNome, setTestNome] = useState("");
  const [testTelefone, setTestTelefone] = useState("");
  const [testMensagem, setTestMensagem] = useState("");
  const [testSending, setTestSending] = useState<"none" | "now" | "queue">("none");

  useEffect(() => {
    if (campaign) {
      setNome(campaign.nome);
      setDescricao(campaign.descricao ?? "");
      setSources(campaign.source_filters?.sources ?? ["leads"]);
      setLimit(Number(campaign.source_filters?.limit ?? 50));
      setChipsIds(campaign.chips_ids ?? []);
      setIgnoreBusinessHours(campaign.ignore_business_hours ?? false);
      setSequence(campaign.sequence?.length ? campaign.sequence : [
        { ordem: 1, delay_hours: 0, mensagem: "", use_audio: false, media_type: "text", media_url: null },
      ]);
    } else {
      setNome(""); setDescricao(""); setSources(["leads"]); setLimit(50); setChipsIds([]);
      setIgnoreBusinessHours(false);
      setSequence([{ ordem: 1, delay_hours: 0, mensagem: "", use_audio: false, media_type: "text", media_url: null }]);
    }
    setTestNome(""); setTestTelefone(""); setTestMensagem("");
  }, [campaign, open]);

  const { data: chips = [] } = useQuery({
    queryKey: ["wa_instances_for_campaign"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("id,instance_name,active,paused,daily_limit")
        .order("created_at", { ascending: true });
      return data ?? [];
    },
    enabled: open,
  });

  const { data: leadCount = 0 } = useQuery({
    queryKey: ["campaign_lead_count", sources, limit],
    queryFn: async () => {
      let total = 0;
      for (const src of sources) {
        const { count } = await supabase.from(src as any).select("id", { count: "exact", head: true })
          .or("disparo.is.null,disparo.eq.Não");
        total += count ?? 0;
      }
      return Math.min(total, limit);
    },
    enabled: open && sources.length > 0,
  });

  const toggleSource = (src: string) => {
    setSources((prev) => prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src]);
  };

  const buildPayload = (overrideStatus?: Campaign["status"]) => ({
    nome: nome.trim() || "Sem nome",
    descricao: descricao.trim() || null,
    status: overrideStatus ?? (campaign?.status ?? "draft"),
    source_filters: { sources, limit },
    chips_ids: chipsIds,
    sequence,
    ignore_business_hours: ignoreBusinessHours,
  });

  const toggleChip = (id: string) =>
    setChipsIds((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);

  const validate = () => {
    if (!nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return false; }
    if (sequence.length === 0) { toast({ title: "Adicione pelo menos 1 passo", variant: "destructive" }); return false; }
    if (sequence.some((s) => !s.mensagem.trim() && s.media_type !== "image" && s.media_type !== "audio")) {
      toast({ title: "Mensagem vazia em algum passo de texto", variant: "destructive" }); return false;
    }
    if (sources.length === 0) { toast({ title: "Selecione ao menos uma fonte de leads", variant: "destructive" }); return false; }
    return true;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (campaign) await update.mutateAsync({ id: campaign.id, ...buildPayload() } as any);
      else await create.mutateAsync(buildPayload() as any);
      toast({ title: "Campanha salva" });
      onClose();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const saveAndLaunch = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      let id = campaign?.id;
      if (campaign) {
        await update.mutateAsync({ id: campaign.id, ...buildPayload() } as any);
      } else {
        const created = await create.mutateAsync(buildPayload() as any);
        id = created.id;
      }
      if (!id) throw new Error("Sem ID da campanha");
      const result = await launch.mutateAsync(id);
      toast({
        title: `🚀 Campanha iniciada`,
        description: `${result.enqueued} envios na fila (${result.total_recipients} destinatários).`,
      });
      onClose();
    } catch (e: any) {
      toast({ title: "Erro ao disparar", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // Disparo manual de teste (nome+telefone+mensagem digitados)
  // Modo "now" = immediate:true e depois pinga o worker para processar já.
  // Modo "queue" = entra na fila normal com espaçamento aplicado.
  const runTestSend = async (mode: "now" | "queue") => {
    const phoneClean = testTelefone.replace(/\D/g, "");
    if (phoneClean.length < 10) {
      toast({ title: "Telefone inválido", description: "Use DDD + número (ex: 21987654321).", variant: "destructive" });
      return;
    }
    if (!testMensagem.trim()) {
      toast({ title: "Mensagem vazia", description: "Escreva o texto do teste antes de enviar.", variant: "destructive" });
      return;
    }
    setTestSending(mode);
    try {
      const lead = {
        source: "manual_test",
        nome_empresa: testNome.trim() || "Teste manual",
        telefone: phoneClean,
        mensagem: testMensagem.trim(),
      };
      const { data, error } = await supabase.functions.invoke("dispatch-enqueue", {
        body: { leads: [lead], immediate: mode === "now" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (mode === "now") {
        // Cutuca o worker imediatamente pra não esperar o tick de 1min do cron.
        try {
          await supabase.functions.invoke("dispatch-worker", { body: {} });
        } catch (_) { /* worker é público — se falhar, o cron pega no próximo tick */ }
        toast({ title: "🚀 Enviando agora", description: "Mensagem entrou no worker — deve chegar em segundos." });
      } else {
        toast({ title: "📥 Adicionado à fila", description: "Vai sair respeitando o espaçamento configurado." });
      }
      setTestMensagem("");
    } catch (e: any) {
      toast({ title: "Falha no teste", description: e.message ?? "erro desconhecido", variant: "destructive" });
    } finally {
      setTestSending("none");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{campaign ? "Editar campanha" : "Nova campanha"}</SheetTitle>
          <SheetDescription>
            Sequência de mensagens humanizadas usando seu prompt + Knowledge Pack. Mesma fila, mesmos chips, mesmo aprendizado.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-4">
          <div className="grid gap-3">
            <div>
              <Label>Nome da campanha</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Clínicas SP — Junho" />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
            </div>
          </div>

          <Card>
            <CardContent className="p-4 space-y-3">
              <Label className="text-sm font-semibold">Fontes de leads</Label>
              <div className="flex flex-wrap gap-3">
                {SOURCES.map((src) => (
                  <label key={src.key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={sources.includes(src.key)} onCheckedChange={() => toggleSource(src.key)} />
                    <span className="text-sm">{src.label}</span>
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs whitespace-nowrap">Limite de destinatários:</Label>
                <Input type="number" min={1} max={2000} value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))} className="w-24 h-8" />
                <Badge variant="secondary">~{leadCount} candidatos</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Chips WhatsApp</Label>
                <span className="text-xs text-muted-foreground">
                  {chipsIds.length === 0 ? "Auto-rotação (todos disponíveis)" : `${chipsIds.length} selecionado(s)`}
                </span>
              </div>
              {chips.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum chip cadastrado. Conecte em Integrações → WhatsApp.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {chips.map((c: any) => {
                    const sel = chipsIds.includes(c.id);
                    const disabled = !c.active || c.paused;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleChip(c.id)}
                        className={`px-3 py-1.5 rounded-full text-xs border transition ${
                          sel ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/40"
                        } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        {c.instance_name} <span className="opacity-60">· {c.daily_limit}/dia</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Sem seleção → o sistema escolhe automaticamente o melhor chip a cada envio.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm font-semibold">⏱️ Ignorar horário comercial nesta campanha</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Quando ligado, esta campanha pode disparar 24/7 mesmo se o "Respeitar horário comercial" estiver ativo nas configurações gerais. Útil para nichos que respondem à noite ou fim de semana (comércio, e-commerce, autônomos).
                  </p>
                </div>
                <Switch checked={ignoreBusinessHours} onCheckedChange={setIgnoreBusinessHours} />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Sequência de mensagens</Label>
            <SequenceEditor steps={sequence} onChange={setSequence} />
          </div>

          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <TestTube2 className="h-4 w-4 text-primary" />
                <Label className="text-sm font-semibold">Disparo manual de teste</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Envia uma única mensagem para o número informado — ignora fontes de leads e sequência. Use pra validar o chip, a mensagem e a entregabilidade sem gastar destinatários da campanha.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Nome (opcional)</Label>
                  <Input value={testNome} onChange={(e) => setTestNome(e.target.value)} placeholder="Ex: Maria Silva" />
                </div>
                <div>
                  <Label className="text-xs">Telefone (com DDD)</Label>
                  <Input value={testTelefone} onChange={(e) => setTestTelefone(e.target.value)} placeholder="21987654321" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Mensagem</Label>
                <Textarea value={testMensagem} onChange={(e) => setTestMensagem(e.target.value)} rows={3} placeholder="Oi Maria, tudo bem? Aqui é da equipe X..." />
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="default"
                  className="flex-1"
                  disabled={testSending !== "none"}
                  onClick={() => runTestSend("now")}
                >
                  {testSending === "now"
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando…</>
                    : <><Send className="h-4 w-4 mr-2" /> Enviar agora</>}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={testSending !== "none"}
                  onClick={() => runTestSend("queue")}
                >
                  {testSending === "queue"
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enfileirando…</>
                    : <>📥 Colocar na fila</>}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                "Enviar agora" cutuca o worker imediatamente. "Colocar na fila" respeita o delay configurado em Configurações → Disparo.
              </p>
            </CardContent>
          </Card>

          <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
            <Button variant="outline" onClick={save} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar rascunho
            </Button>
            <Button onClick={saveAndLaunch} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Rocket className="h-4 w-4 mr-2" />}
              Salvar e disparar agora
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
