// AutomateCommentsModal — pós-publicação/agendamento: oferece criar regra ManyChat-style
// vinculada ao post. Inspirado no fluxo do instagem.ai.
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Zap, MessageSquare, Send, Loader2, ArrowRight, Link as LinkIcon, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  postId: string | null;
  defaultKeyword?: string;
  defaultLink?: string;
}

export function AutomateCommentsModal({ open, onClose, postId: initialPostId, defaultKeyword, defaultLink }: Props) {
  const [step, setStep] = useState<"intro" | "form">("intro");
  const [keyword, setKeyword] = useState(defaultKeyword ?? "EU QUERO");
  const [dm, setDm] = useState(
    "Oi {name}! Vi seu comentário 👇\n\nTá aqui o link que prometi — qualquer dúvida me chama 🙌"
  );
  const [ctaLink, setCtaLink] = useState(defaultLink ?? "");
  const [ctaLabel, setCtaLabel] = useState("Pegar agora");
  const [requireFollower, setRequireFollower] = useState(true);
  const [replyPublic, setReplyPublic] = useState("Te chamei na DM 📩");
  const [saving, setSaving] = useState(false);
  const [postUrl, setPostUrl] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolvedPostId, setResolvedPostId] = useState<string | null>(null);
  const [resolvedKind, setResolvedKind] = useState<string | null>(null);

  const postId = initialPostId ?? resolvedPostId;

  const resolveUrl = async () => {
    if (!postUrl.trim()) return toast.error("Cole o link do post, reel ou story");
    setResolving(true);
    const { data, error } = await supabase.functions.invoke("meta-resolve-media-from-url", {
      body: { url: postUrl.trim() },
    });
    setResolving(false);
    if (error || !data?.ok) {
      return toast.error(data?.hint ?? data?.error ?? error?.message ?? "Não consegui localizar essa mídia");
    }
    setResolvedPostId(data.media_id);
    setResolvedKind(data.kind);
    toast.success(`${data.kind === "story" ? "Story" : data.kind === "reel" ? "Reel" : "Post"} localizado ✓`);
  };

  const close = () => {
    setStep("intro");
    setResolvedPostId(null);
    setResolvedKind(null);
    setPostUrl("");
    onClose();
  };

  const create = async () => {
    if (!postId) return toast.error("Cole o link do post primeiro");

    if (!keyword.trim()) return toast.error("Defina a palavra-chave");
    if (!dm.trim()) return toast.error("Defina a mensagem da DM");
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) { toast.error("Sessão expirada"); setSaving(false); return; }
    const { error } = await supabase.from("social_auto_engage_rules").insert({
      user_id: userRes.user.id,
      channel: "instagram",
      post_id: postId,
      mode: "keyword",
      keyword: keyword.trim(),
      dm_template: dm.trim(),
      cta_link: ctaLink.trim() || null,
      cta_label: ctaLabel.trim() || null,
      require_follower: requireFollower,
      reply_public: !!replyPublic.trim(),
      public_reply_template: replyPublic.trim() || null,
      send_dm: true,
      capture_lead: true,
      active: true,
      priority: 10,
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Automação criada! Quando comentarem essa palavra, o lead recebe DM automática.");
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        {step === "intro" ? (
          <>
            <DialogHeader className="items-center text-center">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 grid place-items-center mb-2">
                <Zap className="h-7 w-7 text-white" fill="white" />
              </div>
              <DialogTitle className="text-xl">Automatize seus comentários e DMs</DialogTitle>
              <DialogDescription>
                Quando alguém comentar nesse post, envie DMs e respostas automáticas — converta seguidores em leads no automático.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="rounded-lg border bg-muted/40 p-3 flex gap-3">
                <div className="h-9 w-9 shrink-0 rounded-md bg-blue-500/15 grid place-items-center">
                  <MessageSquare className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Detecta comentários automaticamente</p>
                  <p className="text-xs text-muted-foreground">Monitora quando alguém comenta no seu post com palavras-chave específicas.</p>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3 flex gap-3">
                <div className="h-9 w-9 shrink-0 rounded-md bg-purple-500/15 grid place-items-center">
                  <Send className="h-4 w-4 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Envia DM e responde na hora</p>
                  <p className="text-xs text-muted-foreground">Responde no privado com sua mensagem, link ou oferta — tudo sem você precisar fazer nada.</p>
                </div>
              </div>
              <Button onClick={() => setStep("form")} className="w-full bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:opacity-90">
                Criar automação agora <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <button onClick={close} className="w-full text-xs text-muted-foreground hover:text-foreground py-1">
                Agora não
              </button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg">Configurar automação</DialogTitle>
              <DialogDescription>Quem comentar a palavra-chave recebe DM com seu link/oferta.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {!initialPostId && (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><LinkIcon className="h-3.5 w-3.5" /> Link do post, reel ou story</Label>
                  <div className="flex gap-2">
                    <Input
                      value={postUrl}
                      onChange={(e) => { setPostUrl(e.target.value); setResolvedPostId(null); }}
                      placeholder="https://www.instagram.com/p/ABC123/"
                    />
                    <Button type="button" variant="outline" onClick={resolveUrl} disabled={resolving || !postUrl.trim()}>
                      {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : resolvedPostId ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : "Localizar"}
                    </Button>
                  </div>
                  {resolvedPostId && (
                    <p className="text-xs text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {resolvedKind === "story" ? "Story" : resolvedKind === "reel" ? "Reel" : "Post"} vinculado
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Palavra-chave do comentário</Label>
                <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder='Ex: "EU QUERO", "PRESENTE"' />
              </div>

              <div className="space-y-1.5">
                <Label>Mensagem da DM (use {"{name}"} pro nome)</Label>
                <Textarea rows={4} value={dm} onChange={(e) => setDm(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Link/CTA</Label>
                  <Input value={ctaLink} onChange={(e) => setCtaLink(e.target.value)} placeholder="https://..." />
                </div>
                <div className="space-y-1.5">
                  <Label>Texto do botão</Label>
                  <Input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Resposta pública no comentário</Label>
                <Input value={replyPublic} onChange={(e) => setReplyPublic(e.target.value)} placeholder="Te chamei na DM 📩" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Só entregar pra quem segue</p>
                  <p className="text-xs text-muted-foreground">Pede pra seguir antes de mandar o presente.</p>
                </div>
                <Switch checked={requireFollower} onCheckedChange={setRequireFollower} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep("intro")} className="flex-1">Voltar</Button>
                <Button onClick={create} disabled={saving} className="flex-1 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:opacity-90">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ativar automação"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
