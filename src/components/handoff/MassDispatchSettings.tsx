import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Rocket, MessageSquare, Instagram, Send, Linkedin, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type ChannelKey = "whatsapp" | "instagram" | "telegram" | "linkedin" | "messenger" | "email";

interface ChannelDef {
  key: ChannelKey;
  label: string;
  icon: any;
  color: string;
  pauseField: string;
  limitField: string;
  defaultLimit: number;
  description: string;
}

const CHANNELS: ChannelDef[] = [
  { key: "whatsapp", label: "WhatsApp", icon: MessageSquare, color: "text-green-500", pauseField: "whatsapp_paused", limitField: "daily_limit", defaultLimit: 50, description: "Disparo via Mandrack — multi-chip com rotação automática" },
  { key: "instagram", label: "Instagram DM", icon: Instagram, color: "text-pink-500", pauseField: "instagram_paused", limitField: "instagram_daily_limit", defaultLimit: 30, description: "DM direta via Unipile — exige conta IG conectada" },
  { key: "telegram", label: "Telegram", icon: Send, color: "text-sky-500", pauseField: "telegram_paused", limitField: "telegram_daily_limit", defaultLimit: 30, description: "Mensagens diretas via Unipile" },
  { key: "linkedin", label: "LinkedIn DM", icon: Linkedin, color: "text-blue-500", pauseField: "linkedin_paused", limitField: "linkedin_daily_limit", defaultLimit: 20, description: "Cadência de DM via Unipile (requer Premium/Sales Nav p/ não-conexões)" },
  { key: "messenger", label: "Messenger", icon: MessageSquare, color: "text-blue-400", pauseField: "messenger_paused", limitField: "messenger_daily_limit", defaultLimit: 20, description: "Mensagens via Unipile (Facebook Messenger)" },
  { key: "email", label: "E-mail", icon: Mail, color: "text-amber-500", pauseField: "email_paused", limitField: "email_daily_limit", defaultLimit: 100, description: "Disparo via Unipile (Gmail/Outlook/IMAP do cliente)" },
];

export default function MassDispatchSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [automation, setAutomation] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [{ data: ds }, { data: au }] = await Promise.all([
        supabase.from("dispatch_settings").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("automation_settings" as any).select("*").eq("user_id", user.id).maybeSingle(),
      ]);
      setSettings(ds ?? {});
      setAutomation((au as any) ?? {});
      setLoading(false);
    })();
  }, [user]);

  const updateField = (field: string, value: any) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const toggleChannel = async (ch: ChannelDef, enable: boolean) => {
    if (!user) return;
    const payload: any = { user_id: user.id, [ch.pauseField]: !enable };
    // Garante que existe row
    if (!settings.id) payload.daily_limit = settings.daily_limit ?? 50;
    setSettings((prev) => ({ ...prev, [ch.pauseField]: !enable }));
    const { error } = await supabase.from("dispatch_settings").upsert(payload, { onConflict: "user_id" });
    if (error) {
      toast.error(`Erro: ${error.message}`);
      setSettings((prev) => ({ ...prev, [ch.pauseField]: enable })); // rollback
    } else {
      toast.success(enable ? `${ch.label}: disparo automático LIGADO` : `${ch.label}: disparo automático PAUSADO`);
    }
  };

  const saveLimits = async () => {
    if (!user) return;
    setSaving(true);
    const payload: any = { user_id: user.id };
    for (const ch of CHANNELS) {
      if (settings[ch.limitField] !== undefined && settings[ch.limitField] !== null) {
        payload[ch.limitField] = Number(settings[ch.limitField]);
      }
    }
    const { error } = await supabase.from("dispatch_settings").upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error(`Erro: ${error.message}`);
    else toast.success("Limites diários salvos");
  };

  const toggleAutomation = async (enabled: boolean) => {
    if (!user) return;
    setAutomation((prev) => ({ ...prev, enabled }));
    const { error } = await supabase
      .from("automation_settings" as any)
      .upsert({ user_id: user.id, enabled }, { onConflict: "user_id" });
    if (error) {
      toast.error(error.message);
      setAutomation((prev) => ({ ...prev, enabled: !enabled }));
    } else {
      toast.success(enabled ? "🚀 Prospecção automática LIGADA" : "Prospecção automática PAUSADA");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allPaused = CHANNELS.every((c) => settings[c.pauseField] === true);
  const anyActive = CHANNELS.some((c) => settings[c.pauseField] !== true);

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Master switch */}
      <Card className="p-5 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-primary/20">
              <Rocket className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Prospecção Automática 24/7</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Quando ligada, o sistema busca leads sozinho (Maps + LinkedIn + Instagram), enriquece e dispara nos canais habilitados abaixo.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Configure ICP, regiões e nichos em <a href="/automacao" className="text-primary underline">Prospecção Automática</a>.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Switch
              checked={automation.enabled === true}
              onCheckedChange={toggleAutomation}
            />
            <Badge variant={automation.enabled ? "default" : "secondary"} className="text-[10px]">
              {automation.enabled ? "● ATIVO" : "○ PAUSADO"}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Channels */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-base">Canais de Disparo em Massa</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ligue/desligue individualmente. Quem estiver pausado não envia mesmo com fila cheia.
            </p>
          </div>
          {allPaused ? (
            <Badge variant="destructive" className="text-[10px]">Todos pausados</Badge>
          ) : anyActive ? (
            <Badge className="text-[10px] bg-success">
              {CHANNELS.filter((c) => settings[c.pauseField] !== true).length}/{CHANNELS.length} ativos
            </Badge>
          ) : null}
        </div>

        <div className="space-y-3">
          {CHANNELS.map((ch) => {
            const Icon = ch.icon;
            const isActive = settings[ch.pauseField] !== true;
            const limit = settings[ch.limitField] ?? ch.defaultLimit;
            return (
              <div
                key={ch.key}
                className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                  isActive ? "bg-card border-border" : "bg-muted/30 border-muted opacity-60"
                }`}
              >
                <div className={`p-2 rounded-md bg-muted/50 ${ch.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{ch.label}</span>
                    {isActive && <Badge variant="outline" className="text-[9px] h-4 px-1.5">LIGADO</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{ch.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Label className="text-[11px] text-muted-foreground">Limite/dia</Label>
                  <Input
                    type="number"
                    min={1}
                    max={5000}
                    value={limit}
                    onChange={(e) => updateField(ch.limitField, e.target.value)}
                    className="w-20 h-8 text-sm"
                    disabled={!isActive}
                  />
                  <Switch
                    checked={isActive}
                    onCheckedChange={(v) => toggleChannel(ch, v)}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={saveLimits} disabled={saving} size="sm">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar limites
          </Button>
        </div>
      </Card>

      {/* Follow-up automático */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="font-semibold text-base">Follow-up automático</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Se o lead recebeu a mensagem e não respondeu depois de X horas, envia uma mensagem de reengajamento (WhatsApp). Para se o lead responder.
            </p>
          </div>
          <Switch
            checked={settings.followup_enabled === true}
            onCheckedChange={async (v) => {
              if (!user) return;
              setSettings((p) => ({ ...p, followup_enabled: v }));
              const { error } = await supabase.from("dispatch_settings")
                .upsert({ user_id: user.id, followup_enabled: v }, { onConflict: "user_id" });
              if (error) { toast.error(error.message); setSettings((p) => ({ ...p, followup_enabled: !v })); }
              else toast.success(v ? "Follow-up automático LIGADO" : "Follow-up automático PAUSADO");
            }}
          />
        </div>
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${settings.followup_enabled ? "" : "opacity-60 pointer-events-none"}`}>
          <div>
            <Label className="text-xs">Aguardar (horas)</Label>
            <Input
              type="number" min={1} max={168}
              value={settings.followup_delay_hours ?? 24}
              onChange={(e) => updateField("followup_delay_hours", Number(e.target.value))}
              className="h-8 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Máx. tentativas</Label>
            <Input
              type="number" min={1} max={5}
              value={settings.followup_max_attempts ?? 2}
              onChange={(e) => updateField("followup_max_attempts", Number(e.target.value))}
              className="h-8 mt-1"
            />
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs">Mensagem do follow-up</Label>
            <Input
              value={settings.followup_template ?? ""}
              onChange={(e) => updateField("followup_template", e.target.value)}
              placeholder="Oi! Passei aqui só pra saber se recebeu minha mensagem — se agora não for hora boa, me avisa que eu retomo depois."
              className="h-8 mt-1"
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm" disabled={saving}
            onClick={async () => {
              if (!user) return;
              setSaving(true);
              const { error } = await supabase.from("dispatch_settings").upsert({
                user_id: user.id,
                followup_enabled: settings.followup_enabled ?? false,
                followup_delay_hours: Number(settings.followup_delay_hours ?? 24),
                followup_max_attempts: Number(settings.followup_max_attempts ?? 2),
                followup_template: settings.followup_template ?? null,
              }, { onConflict: "user_id" });
              setSaving(false);
              if (error) toast.error(error.message); else toast.success("Follow-up salvo");
            }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar follow-up
          </Button>
        </div>
      </Card>

      <Card className="p-4 bg-amber-500/5 border-amber-500/30">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          <strong>💡 Dica:</strong> WhatsApp tem o maior poder de conversão mas exige aquecimento dos chips.
          E-mail é o mais escalável (até 500/dia por conta Gmail). LinkedIn DM exige Premium para enviar a não-conexões.
          Comece com limites baixos e suba 20% por dia.
        </p>
      </Card>
    </div>
  );
}
