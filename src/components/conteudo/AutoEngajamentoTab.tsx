// AutoEngajamentoTab — piloto automático da IA por canal.
// Modos de automação por canal. Comentários, DMs e Story Replies usam Meta Graph;
// curtidas e novos seguidores dependem do conector que fornece esses eventos.
//   global         → 💬 Comentário: IA lê contexto e decide responder público / puxar pra DM
//   keyword        → 🔑 Palavra-chave: entrega presente/link (opcionalmente só p/ seguidores)
//   thank_like     → ❤️ Curtida: DM de agradecimento + follow-up agendado
//   welcome_follow → 👋 Novo seguidor: boas-vindas + follow-up agendado
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Zap, Link as LinkIcon, MessageCircle, Save, Info, Clock, UserCheck } from "lucide-react";

type Mode = "global" | "keyword" | "dm" | "story_reply" | "thank_like" | "welcome_follow";

type Rule = {
  id?: string;
  channel: "instagram" | "linkedin" | "facebook";
  mode: Mode;
  post_id: string | null;
  keyword: string | null;
  use_ai: boolean;
  public_reply_template: string;
  dm_template: string;
  cta_link: string | null;
  cta_label: string | null;
  reply_public: boolean;
  send_dm: boolean;
  capture_lead: boolean;
  priority: number;
  active: boolean;
  // Novos campos v2
  ai_tone?: "casual" | "professional" | "consultive";
  default_link?: string | null;
  require_follower?: boolean;
  followup_delay_hours?: number | null;
  followup_message?: string | null;
  followup_use_ai?: boolean;
  move_to_dm_on_interest?: boolean;
  // Métricas
  hits_count?: number;
  last_hit_at?: string | null;
};

const EMPTY: Rule = {
  channel: "instagram",
  mode: "global",
  post_id: null,
  keyword: null,
  use_ai: true,
  public_reply_template: "Oi @{name}! Te mandei no direct 💌",
  dm_template: "Oi {name}! Vi seu comentário 👇",
  cta_link: "",
  cta_label: "Quero saber mais",
  reply_public: true,
  send_dm: true,
  capture_lead: true,
  priority: 100,
  active: true,
  ai_tone: "casual",
  default_link: "",
  require_follower: false,
  followup_delay_hours: 24,
  followup_message: "",
  followup_use_ai: true,
  move_to_dm_on_interest: true,
};

const MODE_LABEL: Record<Mode, string> = {
  global: "💬 Comentário → IA conversacional",
  keyword: "🔑 Palavra-chave → entrega de presente/link",
  dm: "✉️ DM recebida → resposta automática",
  story_reply: "◉ Resposta de Story → conversa automática",
  thank_like: "❤️ Curtida → DM de agradecimento + follow-up",
  welcome_follow: "👋 Novo seguidor → boas-vindas + follow-up",
};

const MODE_HELP: Record<Mode, string> = {
  global:
    "Quando alguém comentar num post seu, a IA lê o comentário + a legenda + dados do seu negócio (Treinar IA) e decide sozinha: responde só no comentário (se for elogio) ou já puxa pra DM (se demonstrar interesse).",
  keyword:
    "Estilo campanha: 'Comente PRESENTE para receber'. Quando o comentário contém a palavra, manda resposta pública curta + DM com o link/cupom. Pode exigir que a pessoa esteja seguindo antes de entregar.",
  dm:
    "Quando alguém enviar uma DM, a IA responde usando o contexto do negócio e salva o contato como lead. Este fluxo usa o Instagram Login e a API oficial da Meta.",
  story_reply:
    "Quando alguém responder a um Story, a IA continua a conversa no Direct usando o contexto do Story e do negócio. Este fluxo usa a API oficial da Meta.",
  thank_like:
    "Toda vez que o conector registrar uma curtida: manda DM imediata de agradecimento e, opcionalmente, um follow-up X horas/dias depois. Este evento depende da Unipile.",
  welcome_follow:
    "Quando o conector registrar um novo seguidor, envia boas-vindas e um follow-up opcional. Este evento depende da Unipile.",
};

export default function AutoEngajamentoTab() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("social_auto_engage_rules")
      .select("*")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRules((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) { toast.error("Sessão expirada"); setSaving(false); return; }

    const isKeyword = editing.mode === "keyword";
    const isLikeOrFollow = editing.mode === "thank_like" || editing.mode === "welcome_follow";

    const payload: any = {
      ...editing,
      user_id: userRes.user.id,
      cta_link: isKeyword ? (editing.cta_link?.trim() || null) : null,
      cta_label: isKeyword ? (editing.cta_label?.trim() || null) : null,
      default_link: ["global", "dm", "story_reply"].includes(editing.mode) ? (editing.default_link?.trim() || null) : null,
      keyword: isKeyword ? (editing.keyword?.trim() || null) : null,
      require_follower: isKeyword ? !!editing.require_follower : false,
      followup_delay_hours: isLikeOrFollow ? (editing.followup_delay_hours ?? null) : null,
      followup_message: isLikeOrFollow ? (editing.followup_message?.trim() || null) : null,
      followup_use_ai: isLikeOrFollow ? !!editing.followup_use_ai : false,
      reply_public: editing.mode === "global" || isKeyword ? editing.reply_public : false,
      post_id: null,
    };

    const q = editing.id
      ? supabase.from("social_auto_engage_rules").update(payload).eq("id", editing.id)
      : supabase.from("social_auto_engage_rules").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Regra salva");
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta regra?")) return;
    const { error } = await supabase.from("social_auto_engage_rules").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Excluída"); load(); }
  };

  const toggle = async (r: Rule) => {
    if (!r.id) return;
    const { error } = await supabase.from("social_auto_engage_rules").update({ active: !r.active }).eq("id", r.id);
    if (error) toast.error(error.message); else load();
  };

  const seedDefaults = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) { toast.error("Sessão expirada"); return; }
    const uid = userRes.user.id;
    const defaults = [
      {
        user_id: uid, channel: "instagram", mode: "global", use_ai: true, ai_tone: "consultive",
        public_reply_template: "Oi @{name}! Te respondi no direct 💌",
        dm_template: "Oi {name}! Vi seu comentário e vim continuar a conversa por aqui. Posso te entender melhor pra te ajudar?",
        reply_public: true, send_dm: true, capture_lead: true, move_to_dm_on_interest: true,
        followup_use_ai: false,
        priority: 100, active: true,
      },
      {
        user_id: uid, channel: "instagram", mode: "dm", use_ai: true, ai_tone: "consultive",
        dm_template: "Oi {name}! Obrigado pela mensagem. Para eu te ajudar melhor, o que você está buscando hoje?",
        followup_use_ai: false,
        reply_public: false, send_dm: true, capture_lead: true, move_to_dm_on_interest: true, priority: 90, active: true,
      },
      {
        user_id: uid, channel: "instagram", mode: "story_reply", use_ai: true, ai_tone: "consultive",
        dm_template: "Oi {name}! Vi sua resposta no Story. Quer que eu te explique melhor por aqui?",
        followup_use_ai: false,
        reply_public: false, send_dm: true, capture_lead: true, move_to_dm_on_interest: true, priority: 80, active: true,
      },
    ];
    const { error } = await supabase.from("social_auto_engage_rules").insert(defaults);
    if (error) { toast.error(error.message); return; }
    toast.success("3 regras padrão criadas para Instagram!");
    load();
  };

  const seedDefaultsLinkedIn = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) { toast.error("Sessão expirada"); return; }
    const uid = userRes.user.id;
    const defaults = [
      {
        user_id: uid, channel: "linkedin", mode: "global", use_ai: true, ai_tone: "consultive",
        public_reply_template: "Obrigado pelo comentário, {name}! Te chamei no inbox pra continuar.",
        dm_template: "Olá {name}, vi seu comentário no meu post. Posso te entender melhor pra ver se faz sentido a gente trocar uma ideia?",
        reply_public: true, send_dm: true, capture_lead: true, move_to_dm_on_interest: true,
        followup_use_ai: false,
        priority: 100, active: true,
      },
      {
        user_id: uid, channel: "linkedin", mode: "welcome_follow", use_ai: true, ai_tone: "professional",
        dm_template: "Olá {name}, obrigado por conectar! O que te chamou atenção pra aceitar o convite?",
        followup_delay_hours: 72, followup_use_ai: true,
        followup_message: "Olá {name}, voltando aqui rapidinho — faria sentido te mostrar como ajudamos empresas parecidas com a sua?",
        reply_public: false, send_dm: true, capture_lead: true, move_to_dm_on_interest: false, priority: 90, active: true,
      },
      {
        user_id: uid, channel: "linkedin", mode: "global", use_ai: true, ai_tone: "consultive",
        // Regra DM-only: cobre mensagens recebidas na caixa de entrada. O webhook de mensagem usa
        // `qualification-worker`, mas mantemos a regra ativa para garantir que o tom/contexto
        // sejam aplicados se o roteamento futuro passar por aqui.
        public_reply_template: "",
        dm_template: "Olá {name}, obrigado pela mensagem! Pra te ajudar melhor: o que você está buscando hoje?",
        reply_public: false, send_dm: true, capture_lead: true, move_to_dm_on_interest: true,
        followup_use_ai: false,
        priority: 85, active: true,
      },
    ];
    const { error } = await supabase.from("social_auto_engage_rules").insert(defaults);
    if (error) { toast.error(error.message); return; }
    toast.success("3 regras padrão criadas para LinkedIn!");
    load();
  };



  const m = editing?.mode;
  const showPublicReply = m === "global" || m === "keyword";
  const showDmField = !!editing;
  const showCta = m === "keyword";
  const showDefaultLink = m === "global" || m === "dm" || m === "story_reply";
  const showFollowup = m === "thank_like" || m === "welcome_follow";
  const showFollowerGate = m === "keyword";
  const showAiTone = m === "global" || m === "dm" || m === "story_reply";
  

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" /> Auto-Engajamento</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Automação oficial da Meta para comentários, DMs e respostas de Stories. Curtidas e novos seguidores usam o conector Unipile quando disponível.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={seedDefaults}>✨ Criar 3 regras padrão (IG)</Button>
            <Button variant="outline" onClick={seedDefaultsLinkedIn}>✨ Criar 3 regras padrão (LinkedIn)</Button>
            <Button onClick={() => setEditing({ ...EMPTY })}><Plus className="h-4 w-4 mr-1" /> Nova regra</Button>
          </div>

        </CardHeader>
        <CardContent>
          {loading ? <p className="text-muted-foreground text-sm">Carregando...</p> :
            rules.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma regra criada. Clique em "Nova regra" para começar.</p>
            ) : (
              <div className="space-y-2">
                {rules.map((r) => (
                  <div key={r.id} className="flex items-center justify-between border rounded-lg p-3 gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={r.active ? "default" : "secondary"}>{r.channel}</Badge>
                        <Badge variant="outline">{MODE_LABEL[r.mode]}{r.mode === "keyword" && r.keyword ? `: "${r.keyword}"` : ""}</Badge>
                        {r.use_ai && <Badge variant="outline">IA</Badge>}
                        {r.followup_delay_hours ? <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> follow-up {r.followup_delay_hours}h</Badge> : null}
                        {r.require_follower && <Badge variant="outline" className="gap-1"><UserCheck className="h-3 w-3" /> só seguidores</Badge>}
                        {r.cta_link && <Badge variant="outline" className="gap-1"><LinkIcon className="h-3 w-3" /> CTA</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 truncate">{r.dm_template}</p>
                      <p className="text-xs text-muted-foreground mt-1">Disparou {r.hits_count ?? 0}x{r.last_hit_at ? ` · último: ${new Date(r.last_hit_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={r.active} onCheckedChange={() => toggle(r)} />
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Editar</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(r.id!)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>

      {editing && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5" /> {editing.id ? "Editar regra" : "Nova regra"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <Label>Canal</Label>
                <Select value={editing.channel} onValueChange={(v: any) => setEditing({ ...editing, channel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quando disparar</Label>
                <Select value={editing.mode} onValueChange={(v: any) => setEditing({ ...editing, mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">{MODE_LABEL.global}</SelectItem>
                    <SelectItem value="keyword">{MODE_LABEL.keyword}</SelectItem>
                    <SelectItem value="dm">{MODE_LABEL.dm}</SelectItem>
                    <SelectItem value="story_reply">{MODE_LABEL.story_reply}</SelectItem>
                    <SelectItem value="thank_like">{MODE_LABEL.thank_like}</SelectItem>
                    <SelectItem value="welcome_follow">{MODE_LABEL.welcome_follow}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade (menor = avalia antes)</Label>
                <Input type="number" value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: parseInt(e.target.value || "100", 10) })} />
              </div>
            </div>

            {/* Card explicativo do modo */}
            <div className="flex gap-2 items-start border rounded-lg p-3 bg-muted/30">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">{MODE_HELP[editing.mode]}</p>
            </div>

            {/* Palavra-chave */}
            {editing.mode === "keyword" && (
              <div>
                <Label>Palavra-chave (case insensitive)</Label>
                <Input value={editing.keyword ?? ""} placeholder='Ex: "PRESENTE", "QUERO", "INFO"' onChange={(e) => setEditing({ ...editing, keyword: e.target.value })} />
              </div>
            )}

            {/* Tom da IA (só modo global) */}
            {showAiTone && (
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>Tom da resposta da IA</Label>
                  <Select value={editing.ai_tone ?? "casual"} onValueChange={(v: any) => setEditing({ ...editing, ai_tone: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Descontraído</SelectItem>
                      <SelectItem value="professional">Profissional</SelectItem>
                      <SelectItem value="consultive">Consultivo (SPIN)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <div className="flex items-center gap-2">
                    <Switch checked={editing.move_to_dm_on_interest ?? true} onCheckedChange={(v) => setEditing({ ...editing, move_to_dm_on_interest: v })} />
                    <Label>Puxar pra DM quando detectar interesse</Label>
                  </div>
                </div>
              </div>
            )}

            {/* Link padrão (modo global) */}
            {showDefaultLink && (
              <div>
                <Label>Link padrão da plataforma (opcional)</Label>
                <Input value={editing.default_link ?? ""} placeholder="https://… (a IA só usa quando o lead pedir)" onChange={(e) => setEditing({ ...editing, default_link: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">A IA só envia este link quando o comentário/conversa demonstrar interesse claro. Pode ser link do produto, WhatsApp, formulário etc.</p>
              </div>
            )}

            {/* Resposta pública (global e keyword) */}
            {showPublicReply && (
              <div>
                <Label>Resposta pública no comentário {editing.mode === "global" && "(usada quando IA NÃO está ligada)"}</Label>
                <Textarea rows={2} value={editing.public_reply_template} onChange={(e) => setEditing({ ...editing, public_reply_template: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">Use <code>{"{name}"}</code> para o @ do usuário.</p>
              </div>
            )}

            {/* Mensagem DM */}
            {showDmField && (
              <div>
                <Label>
                  {editing.mode === "thank_like" ? "DM de agradecimento pela curtida" :
                   editing.mode === "welcome_follow" ? "DM de boas-vindas" :
                   editing.mode === "keyword" ? "Mensagem da DM com o presente/link" :
                   editing.mode === "story_reply" ? "Resposta privada para o Story" :
                   editing.mode === "dm" ? "Resposta automática da DM" :
                   "Mensagem DM (instrução base quando IA ligada)"}
                </Label>
                <Textarea rows={3} value={editing.dm_template} onChange={(e) => setEditing({ ...editing, dm_template: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">Use <code>{"{name}"}</code>. {editing.use_ai && "Com IA ligada, esse texto vira a instrução base — a IA reescreve no tom configurado."}</p>
              </div>
            )}

            {/* Link/CTA (só keyword) */}
            {showCta && (
              <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium"><LinkIcon className="h-4 w-4" /> Presente / link entregue na DM</div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label>Texto do botão</Label>
                    <Input value={editing.cta_label ?? ""} placeholder="Ex: Quero o desconto" onChange={(e) => setEditing({ ...editing, cta_label: e.target.value })} />
                  </div>
                  <div>
                    <Label>URL</Label>
                    <Input value={editing.cta_link ?? ""} placeholder="https://..." onChange={(e) => setEditing({ ...editing, cta_link: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            {/* Gate seguidor (keyword) */}
            {showFollowerGate && (
              <div className="flex items-center gap-2 border rounded-lg p-3">
                <Switch checked={!!editing.require_follower} onCheckedChange={(v) => setEditing({ ...editing, require_follower: v })} />
                <div>
                  <Label className="flex items-center gap-1"><UserCheck className="h-4 w-4" /> Só entregar se for seguidor</Label>
                  <p className="text-xs text-muted-foreground">Confere via Unipile antes. Se não for seguidor, manda DM curta pedindo follow primeiro.</p>
                </div>
              </div>
            )}

            {/* Follow-up (like / follow) */}
            {showFollowup && (
              <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium"><Clock className="h-4 w-4" /> Follow-up agendado (opcional)</div>
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <Label>Disparar após (horas)</Label>
                    <Input type="number" min={0} value={editing.followup_delay_hours ?? ""} placeholder="Ex: 24 (deixe vazio para desativar)"
                      onChange={(e) => setEditing({ ...editing, followup_delay_hours: e.target.value === "" ? null : parseInt(e.target.value, 10) })} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Mensagem do follow-up</Label>
                    <Textarea rows={2} value={editing.followup_message ?? ""} placeholder="Ex: Ei {name}, sobre aquele post de ontem — faz sentido pra você?"
                      onChange={(e) => setEditing({ ...editing, followup_message: e.target.value })} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={!!editing.followup_use_ai} onCheckedChange={(v) => setEditing({ ...editing, followup_use_ai: v })} />
                  <Label>IA reescreve o follow-up no tom configurado</Label>
                </div>
              </div>
            )}

            {/* Toggles gerais */}
            <div className="flex flex-wrap gap-6 pt-2 border-t">
              {showPublicReply && (
                <div className="flex items-center gap-2"><Switch checked={editing.reply_public} onCheckedChange={(v) => setEditing({ ...editing, reply_public: v })} /><Label>Responder no comentário</Label></div>
              )}
              <div className="flex items-center gap-2"><Switch checked={editing.send_dm} onCheckedChange={(v) => setEditing({ ...editing, send_dm: v })} /><Label>Enviar DM privada</Label></div>
              <div className="flex items-center gap-2"><Switch checked={editing.use_ai} onCheckedChange={(v) => setEditing({ ...editing, use_ai: v })} /><Label>Personalizar com IA</Label></div>
              <div className="flex items-center gap-2"><Switch checked={editing.capture_lead} onCheckedChange={(v) => setEditing({ ...editing, capture_lead: v })} /><Label>Salvar como lead</Label></div>
              <div className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label>Regra ativa</Label></div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" /> {saving ? "Salvando..." : "Salvar regra"}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
