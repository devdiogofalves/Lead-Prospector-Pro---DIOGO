import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Sparkles } from "lucide-react";

type UnipileAccount = { id: string; name: string; type?: string; status?: string | null; blocked?: boolean };

type Props = {
  igAccounts: UnipileAccount[];
  liAccounts: UnipileAccount[];
  onCreated: () => void;
};

export default function CreatePostWizard({ igAccounts, liAccounts, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"instagram" | "linkedin">("instagram");
  const [format, setFormat] = useState<"feed" | "reels" | "stories" | "carousel">("feed");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [accountId, setAccountId] = useState<string>("");
  const [theme, setTheme] = useState("");
  const [cta, setCta] = useState("Link na bio");
  const [scheduleMode, setScheduleMode] = useState<"draft" | "schedule">("draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const accounts = channel === "linkedin" ? liAccounts : igAccounts;

  function handleFormatChange(f: typeof format) {
    setFormat(f);
    setMediaType(f === "reels" ? "video" : "image");
  }

  async function handleSubmit() {
    if (!theme.trim()) {
      toast({ title: "Informe o tema", description: "O tema é necessário pra IA gerar a copy.", variant: "destructive" });
      return;
    }
    if (scheduleMode === "schedule" && !scheduledAt) {
      toast({ title: "Defina o horário", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const aspect = format === "reels" || format === "stories" ? "9:16" : format === "feed" ? "1:1" : "4:5";

      const { data: gen, error: genErr } = await supabase.functions.invoke("social-auto-prompt", {
        body: {
          channel,
          media_type: mediaType,
          aspect_ratio: aspect,
          theme_hint: theme + (extraNotes ? `\n\nNotas extras: ${extraNotes}` : ""),
          cta_text: cta,
        },
      });
      if (genErr) throw genErr;
      const d = gen as { success?: boolean; image_prompt?: string; caption?: string; hashtags?: string; error?: string };
      if (!d?.success) throw new Error(d?.error ?? "Falha ao gerar copy");

      const { error: insErr } = await supabase.from("social_posts").insert({
        user_id: user.id,
        channel,
        post_format: format,
        media_type: mediaType,
        caption: d.caption ?? "",
        hashtags: d.hashtags ?? "",
        ai_prompt: d.image_prompt ?? "",
        status: scheduleMode === "schedule" ? "scheduled" : "draft",
        scheduled_at: scheduleMode === "schedule" ? new Date(scheduledAt).toISOString() : null,
        unipile_account_id: accountId || null,
        plan_id: null,
        media_urls: [],
      });
      if (insErr) throw insErr;

      toast({ title: "Post avulso criado!", description: "Gere a mídia e publique quando quiser." });
      setOpen(false);
      setTheme("");
      setExtraNotes("");
      setScheduledAt("");
      onCreated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="h-4 w-4 mr-2" /> ➕ Criar post avulso
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Novo post avulso
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Canal</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as "instagram" | "linkedin")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="instagram">📸 Instagram</SelectItem>
                  <SelectItem value="linkedin">💼 LinkedIn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Formato</Label>
              <Select value={format} onValueChange={(v) => handleFormatChange(v as typeof format)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="feed">Feed (1:1)</SelectItem>
                  <SelectItem value="carousel">Carrossel (4:5)</SelectItem>
                  <SelectItem value="reels">Reels (9:16, vídeo)</SelectItem>
                  <SelectItem value="stories">Stories (9:16)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Conta de destino</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder={accounts.length ? "Selecione a conta" : "Nenhuma conta conectada"} /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} {a.blocked ? "⚠️" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Você pode trocar depois no card.</p>
          </div>

          <div>
            <Label>Tema / ideia do post *</Label>
            <Textarea value={theme} onChange={(e) => setTheme(e.target.value)} rows={2}
              placeholder="Ex: Como automatizar follow-up de leads em 3 passos" />
          </div>

          <div>
            <Label>CTA</Label>
            <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Link na bio / Comenta EU QUERO / DM AGORA" />
          </div>

          <div>
            <Label>Notas extras (opcional)</Label>
            <Textarea value={extraNotes} onChange={(e) => setExtraNotes(e.target.value)} rows={2}
              placeholder="Tom específico, dado pra citar, oferta, deadline..." />
          </div>

          <div>
            <Label>Quando publicar</Label>
            <Select value={scheduleMode} onValueChange={(v) => setScheduleMode(v as "draft" | "schedule")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Salvar como rascunho (publico manual depois)</SelectItem>
                <SelectItem value="schedule">Agendar data e hora</SelectItem>
              </SelectContent>
            </Select>
            {scheduleMode === "schedule" && (
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-2" />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            <Sparkles className="h-4 w-4 mr-2" />
            {loading ? "Gerando copy..." : "✨ Criar com IA"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
