import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Copy, MessageSquareHeart, Pause, Play, Wand2, Loader2, Zap, Info, Brain, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
import { useBranding } from "@/hooks/useBranding";
import { Link } from "react-router-dom";

type Settings = {
  paused: boolean;
  use_audio: boolean;
  audio_ratio: number;
  buffer_seconds: number;
  opening_delay_seconds: number;
  voice_id: string | null;
  system_prompt: string | null;
  response_instructions: string | null;
  fixed_link: string | null;
  fixed_link_label: string | null;
  fixed_image_url: string | null;
  fixed_image_caption: string | null;
  fixed_video_url: string | null;
  fixed_video_caption: string | null;
  flow_mode: string | null;
  schedule_hour_start: number;
  schedule_hour_end: number;
  schedule_slot_minutes: number;
  schedule_block_sunday: boolean;
  schedule_block_monday: boolean;
  schedule_block_tuesday: boolean;
  schedule_block_wednesday: boolean;
  schedule_block_thursday: boolean;
  schedule_block_friday: boolean;
  schedule_block_saturday: boolean;
};


type Conversation = {
  id: string;
  telefone: string;
  nome: string | null;
  last_message_at: string;
  status: string;
};

const DEFAULTS: Settings = {
  paused: false,
  use_audio: true,
  audio_ratio: 0.25,
  buffer_seconds: 5,
  opening_delay_seconds: 60,
  voice_id: null,
  system_prompt: null,
  response_instructions: "Na primeira resposta, cumprimente pelo primeiro nome se existir e envie em áudio quando o áudio estiver habilitado. Conduza sempre SPIN: primeiro situação, depois problema, implicação e só então apresentação/convite.",
  fixed_link: null,
  fixed_link_label: null,
  fixed_image_url: null,
  fixed_image_caption: null,
  fixed_video_url: null,
  fixed_video_caption: null,
  flow_mode: null,
  schedule_hour_start: 8,
  schedule_hour_end: 19,
  schedule_slot_minutes: 30,
  schedule_block_sunday: true,
  schedule_block_monday: false,
  schedule_block_tuesday: false,
  schedule_block_wednesday: false,
  schedule_block_thursday: false,
  schedule_block_friday: false,
  schedule_block_saturday: false,

};

export default function QualificacaoHumanizada() {
  const { branding: __b } = useBranding(); const agent = __b.agent_name;
  const company = __b.company_name;

  const [userId, setUserId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [, setConvs] = useState<Conversation[]>([]);
  const [stats, setStats] = useState({ inbound: 0, replies: 0, pending: 0 });
  const [, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasAssistant, setHasAssistant] = useState(false);
  const [assistant, setAssistant] = useState<{
    produto?: string; publico_alvo?: string; ticket_medio?: string; regiao?: string;
    diferenciais?: string; ja_tentou?: string; system_prompt?: string;
    icp_descricao?: string; segmentos_alvo?: string[]; personas_alvo?: string[];
    value_props?: string[]; spin_bank?: any; clientes_referencia?: string[];
  } | null>(null);

  const webhookUrl = useMemo(() => {
    if (!userId) return "";
    return `${SUPABASE_URL}/functions/v1/webhook-qualification/${userId}`;
  }, [userId]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      await loadAll(user.id);
    })();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") loadConvs(userId);
    }, 20000);
    return () => clearInterval(t);
  }, [userId]);

  async function loadAll(uid: string) {
    setLoading(true);
    const [{ data: s }, { data: profile }, { data: briefing }] = await Promise.all([
      supabase.from("qualification_settings").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("prospecting_profiles")
        .select("system_prompt, produto, publico_alvo, ticket_medio, regiao, diferenciais, ja_tentou")
        .eq("user_id", uid).maybeSingle(),
      supabase.from("mavi_briefing")
        .select("icp_descricao, segmentos_alvo, personas_alvo, value_props, spin_bank, clientes_referencia")
        .eq("user_id", uid).maybeSingle(),
    ]);
    if (profile?.system_prompt) setHasAssistant(true);
    setAssistant({ ...(profile ?? {}), ...(briefing ?? {}) } as any);
    if (s) {
      setSettings({
        paused: s.paused, use_audio: s.use_audio, audio_ratio: Number(s.audio_ratio),
        buffer_seconds: s.buffer_seconds, opening_delay_seconds: Number((s as any).opening_delay_seconds ?? 60), voice_id: s.voice_id, system_prompt: s.system_prompt,
        response_instructions: (s as any).response_instructions ?? DEFAULTS.response_instructions,
        fixed_link: (s as any).fixed_link ?? null,
        fixed_link_label: (s as any).fixed_link_label ?? null,
        fixed_image_url: (s as any).fixed_image_url ?? null,
        fixed_image_caption: (s as any).fixed_image_caption ?? null,
        fixed_video_url: (s as any).fixed_video_url ?? null,
        fixed_video_caption: (s as any).fixed_video_caption ?? null,
        flow_mode: (s as any).flow_mode ?? null,
        schedule_hour_start: Number((s as any).schedule_hour_start ?? DEFAULTS.schedule_hour_start),
        schedule_hour_end: Number((s as any).schedule_hour_end ?? DEFAULTS.schedule_hour_end),
        schedule_slot_minutes: Number((s as any).schedule_slot_minutes ?? DEFAULTS.schedule_slot_minutes),
        schedule_block_sunday: (s as any).schedule_block_sunday ?? DEFAULTS.schedule_block_sunday,
        schedule_block_monday: (s as any).schedule_block_monday ?? DEFAULTS.schedule_block_monday,
        schedule_block_tuesday: (s as any).schedule_block_tuesday ?? DEFAULTS.schedule_block_tuesday,
        schedule_block_wednesday: (s as any).schedule_block_wednesday ?? DEFAULTS.schedule_block_wednesday,
        schedule_block_thursday: (s as any).schedule_block_thursday ?? DEFAULTS.schedule_block_thursday,
        schedule_block_friday: (s as any).schedule_block_friday ?? DEFAULTS.schedule_block_friday,
        schedule_block_saturday: (s as any).schedule_block_saturday ?? DEFAULTS.schedule_block_saturday,

      });
    }
    await loadConvs(uid);
    setLoading(false);
  }

  async function loadConvs(uid: string) {
    const { data } = await supabase.from("qualification_conversations")
      .select("id, telefone, nome, last_message_at, status")
      .eq("user_id", uid)
      .order("last_message_at", { ascending: false }).limit(20);
    setConvs(data ?? []);
    const [{ count: inbound }, { count: replies }, { count: pending }] = await Promise.all([
      supabase.from("qualification_messages").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("role", "user"),
      supabase.from("qualification_messages").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("role", "assistant"),
      supabase.from("qualification_messages").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("role", "user").eq("processed", false),
    ]);
    setStats({ inbound: inbound ?? 0, replies: replies ?? 0, pending: pending ?? 0 });
  }

  async function saveSettings(patch: Partial<Settings>) {
    if (!userId) return;
    setSaving(true);
    const next = { ...settings, ...patch };
    setSettings(next);
    const { error } = await supabase.from("qualification_settings").upsert(
      { user_id: userId, ...next } as any,
      { onConflict: "user_id" }
    );
    setSaving(false);
    if (error) toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
  }

  function copyWebhook() {
    navigator.clipboard.writeText(webhookUrl);
    toast({ title: "URL copiada", description: "Cole no webhook da Mandrack (evento Message)." });
  }

  const [installing, setInstalling] = useState(false);
  async function instalarWebhook() {
    if (!webhookUrl) return;
    setInstalling(true);
    const { data, error } = await supabase.functions.invoke("mandrack-manager", {
      body: { action: "set-webhook", webhook_url: webhookUrl, events: ["Message"] },
    });
    setInstalling(false);
    if (error || !data?.ok) {
      toast({ title: "Falha ao instalar webhook", description: error?.message || JSON.stringify(data?.results ?? data), variant: "destructive" });
    } else {
      toast({
        title: `Webhook instalado em ${data.installed}/${data.total} chip(s)`,
        description: "Mandrack agora envia mensagens recebidas em qualquer chip para o Lovable.",
      });
    }
  }

  async function usarPromptDoAssistente() {
    if (!userId) return;
    const { data } = await supabase.from("prospecting_profiles")
      .select("system_prompt").eq("user_id", userId).maybeSingle();
    if (data?.system_prompt) {
      await saveSettings({ system_prompt: data.system_prompt });
      toast({ title: "Prompt do Assistente carregado" });
    }
  }

  return (
    <div className="container mx-auto p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquareHeart className="h-6 w-6 text-primary" />
          Qualificação de Lead Humanizada
        </h1>
        <p className="text-sm text-muted-foreground">
          Atendimento automático no WhatsApp com IA, 100% nativo na plataforma — sem n8n, sem VPS.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Mensagens recebidas" value={stats.inbound} />
        <StatCard label="Respostas enviadas" value={stats.replies} />
        <StatCard label="No buffer" value={stats.pending} />
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Fonte de verdade da IA — sincronizado com Treinar IA
            <Badge variant="outline" className="h-5 border-emerald-500/40 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
            </Badge>
            <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => userId && loadAll(userId)}>
              <RefreshCw className="h-3 w-3 mr-1" /> Recarregar
            </Button>
            <Button asChild size="sm" variant="outline" className="h-7">
              <Link to="/assistente"><ExternalLink className="h-3 w-3 mr-1" /> Editar em Treinar IA</Link>
            </Button>
          </CardTitle>
          <CardDescription>
            Esses são os dados que a {agent} está usando AGORA nas respostas do WhatsApp/IG/Telegram/E-mail. Alterou em Treinar IA? Clique Recarregar.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-xs space-y-2">
          {!assistant || (!assistant.produto && !assistant.system_prompt && !assistant.icp_descricao) ? (
            <div className="p-3 rounded border border-destructive/40 bg-destructive/5 text-destructive">
              ⚠️ Treinar IA vazio. A IA vai responder genérico. <Link to="/assistente" className="underline font-medium">Preencha agora →</Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
              <Field label="Produto" value={assistant.produto} />
              <Field label="Público-alvo" value={assistant.publico_alvo} />
              <Field label="Ticket médio" value={assistant.ticket_medio} />
              <Field label="Região" value={assistant.regiao} />
              <Field label="Diferenciais" value={assistant.diferenciais} full />
              <Field label="ICP (Knowledge)" value={assistant.icp_descricao} full />
              <Field label="Personas" value={assistant.personas_alvo?.join(", ")} />
              <Field label="Segmentos" value={assistant.segmentos_alvo?.join(", ")} />
              <Field label="Value props" value={assistant.value_props?.length ? `${assistant.value_props.length} definidas` : ""} />
              <Field label="Banco SPIN" value={
                assistant.spin_bank
                  ? `S:${assistant.spin_bank.situacao?.length ?? 0} P:${assistant.spin_bank.problema?.length ?? 0} I:${assistant.spin_bank.implicacao?.length ?? 0} N:${assistant.spin_bank.need_payoff?.length ?? 0}`
                  : ""
              } />
              <Field label="System prompt" value={assistant.system_prompt ? `${assistant.system_prompt.length} chars` : ""} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como funciona</CardTitle>
        </CardHeader>
        <CardHeader>
          <CardTitle className="text-base">Como funciona</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            "Webhook nativo recebe mensagens da Mandrack",
            "Áudios são transcritos automaticamente",
            "Buffer agrupa mensagens picotadas",
            "IA responde com histórico completo da conversa",
            "Sorteio texto/áudio realista (ElevenLabs)",
            "Tudo rodando no Lovable Cloud",
          ].map((f) => (
            <div key={f} className="flex gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span className="text-muted-foreground">{f}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle className="text-base">1. Conectar Mandrack</CardTitle>
          <CardDescription>
            Um clique configura o webhook na sua instância para receber as mensagens.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button onClick={instalarWebhook} disabled={installing} className="w-full sm:w-auto">
            {installing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
            Instalar automático
          </Button>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground select-none">Configurar manualmente</summary>
            <div className="flex gap-2 mt-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={copyWebhook}><Copy className="h-4 w-4" /></Button>
            </div>
            <p className="mt-1">Cole no webhook da Mandrack (evento <code>Message</code>).</p>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>2. Configurações do agente</span>
            <div className="flex items-center gap-2">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              <Button
                size="sm"
                variant={settings.paused ? "default" : "outline"}
                onClick={() => saveSettings({ paused: !settings.paused })}
              >
                {settings.paused ? <><Play className="h-3 w-3 mr-1" /> Retomar</> : <><Pause className="h-3 w-3 mr-1" /> Pausar</>}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Buffer (segundos)</Label>
              <Input type="number" min={1} max={30} value={settings.buffer_seconds}
                onChange={(e) => saveSettings({ buffer_seconds: Number(e.target.value) })} />
              <p className="text-xs text-muted-foreground">Tempo de espera para agrupar mensagens picotadas.</p>
            </div>
            <div className="space-y-2">
              <Label>Delay da 1ª resposta (segundos)</Label>
              <Input type="number" min={0} max={180} value={settings.opening_delay_seconds}
                onChange={(e) => saveSettings({ opening_delay_seconds: Math.max(0, Math.min(180, Number(e.target.value) || 0)) })} />
              <p className="text-xs text-muted-foreground">Humaniza a abertura: aguarda esse tempo antes da 1ª mensagem da IA numa conversa nova (default 60s, máx 180s).</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Voz ElevenLabs (voice_id)</Label>
            <Input placeholder="EXAVITQu4vr4xnSDxMaL" value={settings.voice_id ?? ""}
              onChange={(e) => saveSettings({ voice_id: e.target.value || null })} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4 rounded-md border border-primary/20 bg-primary/5 p-3">
            <div className="space-y-2">
              <Label>Rótulo do link fixo</Label>
              <Input
                placeholder="Ex: Link de agendamento"
                value={settings.fixed_link_label ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, fixed_link_label: e.target.value || null }))}
                onBlur={() => saveSettings({ fixed_link_label: settings.fixed_link_label })}
              />
            </div>
            <div className="space-y-2">
              <Label>Link fixo que a IA pode enviar</Label>
              <Input
                type="url"
                placeholder="https://..."
                value={settings.fixed_link ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, fixed_link: e.target.value || null }))}
                onBlur={() => saveSettings({ fixed_link: settings.fixed_link })}
              />
              <p className="text-xs text-muted-foreground">Opcional. Quando o lead pedir o link/agendar/catálogo, a {agent} envia EXATAMENTE esta URL.</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 rounded-md border border-primary/20 bg-primary/5 p-3">
            <div className="space-y-2">
              <Label>Legenda da imagem</Label>
              <Input
                placeholder="Ex: Nosso catálogo"
                value={settings.fixed_image_caption ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, fixed_image_caption: e.target.value || null }))}
                onBlur={() => saveSettings({ fixed_image_caption: settings.fixed_image_caption })}
              />
            </div>
            <div className="space-y-2">
              <Label>Imagem fixa que a IA pode enviar</Label>
              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="https://..."
                  value={settings.fixed_image_url ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, fixed_image_url: e.target.value || null }))}
                  onBlur={() => saveSettings({ fixed_image_url: settings.fixed_image_url })}
                />
                <Input
                  type="file"
                  accept="image/*"
                  className="max-w-[160px]"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f || !userId) return;
                    try {
                      const path = `${userId}/qualification/${Date.now()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
                      const { error } = await supabase.storage.from("social-assets").upload(path, f);
                      if (error) throw error;
                      const { data: signed } = await supabase.storage.from("social-assets").createSignedUrl(path, 60 * 60 * 24 * 365);
                      const url = signed?.signedUrl ?? "";
                      if (!url) throw new Error("Não foi possível gerar URL");
                      setSettings((s) => ({ ...s, fixed_image_url: url }));
                      await saveSettings({ fixed_image_url: url });
                      toast({ title: "Imagem enviada" });
                    } catch (err: any) {
                      toast({ title: "Falha no upload", description: err.message, variant: "destructive" });
                    }
                  }}
                />
              </div>
              {settings.fixed_image_url && (
                <img src={settings.fixed_image_url} alt="Imagem fixa" className="mt-2 h-24 rounded border object-cover" />
              )}
              <p className="text-xs text-muted-foreground">Opcional. Quando fizer sentido (lead pediu print/catálogo/exemplo), a {agent} envia esta imagem.</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 rounded-md border border-primary/20 bg-primary/5 p-3">
            <div className="space-y-2">
              <Label>Legenda do vídeo</Label>
              <Input
                placeholder="Ex: Apresentação da solução"
                value={settings.fixed_video_caption ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, fixed_video_caption: e.target.value || null }))}
                onBlur={() => saveSettings({ fixed_video_caption: settings.fixed_video_caption })}
              />
            </div>
            <div className="space-y-2">
              <Label>Vídeo fixo que a IA pode enviar</Label>
              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="https://..."
                  value={settings.fixed_video_url ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, fixed_video_url: e.target.value || null }))}
                  onBlur={() => saveSettings({ fixed_video_url: settings.fixed_video_url })}
                />
                <Input
                  type="file"
                  accept="video/*"
                  className="max-w-[160px]"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f || !userId) return;
                    try {
                      const path = `${userId}/qualification/${Date.now()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
                      const { error } = await supabase.storage.from("social-assets").upload(path, f);
                      if (error) throw error;
                      const { data: signed } = await supabase.storage.from("social-assets").createSignedUrl(path, 60 * 60 * 24 * 365);
                      const url = signed?.signedUrl ?? "";
                      if (!url) throw new Error("Não foi possível gerar URL");
                      setSettings((s) => ({ ...s, fixed_video_url: url }));
                      await saveSettings({ fixed_video_url: url });
                      toast({ title: "Vídeo enviado" });
                    } catch (err: any) {
                      toast({ title: "Falha no upload", description: err.message, variant: "destructive" });
                    }
                  }}
                />
              </div>
              {settings.fixed_video_url && (
                <video src={settings.fixed_video_url} controls className="mt-2 h-32 rounded border" />
              )}
              <p className="text-xs text-muted-foreground">Opcional. Quando fizer sentido (lead pediu vídeo/apresentação/demo), a {agent} envia este vídeo.</p>
            </div>
          </div>





          <div className="flex items-center justify-between">
            <div>
              <Label>Responder com áudio</Label>
              <p className="text-xs text-muted-foreground">Usa ElevenLabs com a chave salva em Configurações &gt; APIs.</p>
            </div>
            <Switch checked={settings.use_audio} onCheckedChange={(v) => saveSettings({ use_audio: v })} />
          </div>

          {settings.use_audio && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>Proporção de áudio</Label>
                <span className="text-muted-foreground">{Math.round(settings.audio_ratio * 100)}%</span>
              </div>
              <Slider value={[settings.audio_ratio]} min={0} max={1} step={0.05}
                onValueChange={([v]) => saveSettings({ audio_ratio: v })} />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Label>Instruções do atendimento</Label>
                <Badge variant="outline" className="h-5 border-emerald-500/40 bg-emerald-500/10 px-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </Badge>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm">
                    Ordem real de prioridade na qualificação:
                    <br />1. <strong>Treinar IA / Assistente</strong> (fonte principal)
                    <br />2. Dados vivos do negócio + SPIN do painel
                    <br />3. Este campo entra como regra operacional do atendimento
                    <br /><br />Isso evita prompt antigo sobrescrever o treino atual da {company}.
                  </TooltipContent>
                </Tooltip>
              </div>
              {hasAssistant && (
                <Button size="sm" variant="ghost" onClick={usarPromptDoAssistente}>
                  <Wand2 className="h-3 w-3 mr-1" /> Usar do Assistente
                </Button>
              )}
            </div>
            <Textarea rows={10} className="font-mono text-xs"
              placeholder="Ex.: primeira resposta deve ser 'oi {nome}, tudo bem?' e áudio; nunca pitchar antes de descobrir situação; sempre uma pergunta por mensagem."
              value={settings.response_instructions ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, response_instructions: e.target.value }))}
              onBlur={() => saveSettings({ response_instructions: settings.response_instructions })}
            />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground select-none">Prompt legado/fallback avançado</summary>
              <Textarea rows={6} className="mt-2 font-mono text-xs"
                placeholder="Opcional. Só usado se Treinar IA estiver vazio."
                value={settings.system_prompt ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, system_prompt: e.target.value }))}
                onBlur={() => saveSettings({ system_prompt: settings.system_prompt })}
              />
            </details>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
            <div className="pr-3">
              <Label>Fluxo simples (ignora SPIN, segue só o roteiro do seu prompt)</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Avançado: desativa a metodologia de qualificação por etapas (SPIN) e faz a IA seguir literalmente o roteiro escrito no prompt principal, sem adicionar perguntas extras.
              </p>
            </div>
            <Switch
              checked={settings.flow_mode === "simple"}
              onCheckedChange={(v) => {
                const next = v ? "simple" : null;
                setSettings((s) => ({ ...s, flow_mode: next }));
                saveSettings({ flow_mode: next } as any);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preferências de agendamento (Google Meet)</CardTitle>
          <CardDescription>
            Define os dias e horários em que a IA pode agendar reuniões automaticamente na sua agenda. Fora dessa janela, ela pede outro horário.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Início (hora)</Label>
              <Input type="number" min={0} max={23} value={settings.schedule_hour_start}
                onChange={(e) => setSettings((s) => ({ ...s, schedule_hour_start: Number(e.target.value) }))}
                onBlur={() => saveSettings({ schedule_hour_start: settings.schedule_hour_start })} />
            </div>
            <div>
              <Label>Fim (hora)</Label>
              <Input type="number" min={1} max={24} value={settings.schedule_hour_end}
                onChange={(e) => setSettings((s) => ({ ...s, schedule_hour_end: Number(e.target.value) }))}
                onBlur={() => saveSettings({ schedule_hour_end: settings.schedule_hour_end })} />
            </div>
            <div>
              <Label>Duração da reunião (min)</Label>
              <Input type="number" min={15} max={120} step={5} value={settings.schedule_slot_minutes}
                onChange={(e) => setSettings((s) => ({ ...s, schedule_slot_minutes: Number(e.target.value) }))}
                onBlur={() => saveSettings({ schedule_slot_minutes: settings.schedule_slot_minutes })} />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Dias bloqueados</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                ["schedule_block_monday", "Segunda"],
                ["schedule_block_tuesday", "Terça"],
                ["schedule_block_wednesday", "Quarta"],
                ["schedule_block_thursday", "Quinta"],
                ["schedule_block_friday", "Sexta"],
                ["schedule_block_saturday", "Sábado"],
                ["schedule_block_sunday", "Domingo"],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                  <span className="text-sm">{label}</span>
                  <Switch
                    checked={(settings as any)[key]}
                    onCheckedChange={(v) => {
                      setSettings((s) => ({ ...s, [key]: v } as Settings));
                      saveSettings({ [key]: v } as any);
                    }}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Marque os dias em que você NÃO quer receber reuniões. A IA vai propor apenas os dias livres, entre {settings.schedule_hour_start}h e {settings.schedule_hour_end}h.
            </p>
          </div>
        </CardContent>
      </Card>

    </div>

  );
}

function Field({ label, value, full }: { label: string; value?: string | null; full?: boolean }) {
  const has = value && String(value).trim().length > 0;
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <span className="text-muted-foreground">{label}: </span>
      {has ? <span className="font-medium">{value}</span> : <span className="text-destructive/70 italic">não preenchido</span>}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
