import { CampaignStep, StepMediaType } from "@/hooks/useCampaigns";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, GripVertical, Type, Mic, Image as ImageIcon, Upload, Loader2, X } from "lucide-react";
import { MessageEditorWithAI } from "./MessageEditorWithAI";
import { supabase } from "@/integrations/supabase/client";
import { uploadToStorageWithRetry } from "@/lib/storageUpload";
import { toast } from "@/hooks/use-toast";

interface Props {
  steps: CampaignStep[];
  onChange: (next: CampaignStep[]) => void;
  exampleLead?: any;
}

const MEDIA_OPTIONS: { value: StepMediaType; label: string; icon: any }[] = [
  { value: "text", label: "Texto", icon: Type },
  { value: "audio", label: "Áudio", icon: Mic },
  { value: "image", label: "Imagem", icon: ImageIcon },
];

export function SequenceEditor({ steps, onChange, exampleLead }: Props) {
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  const update = (idx: number, patch: Partial<CampaignStep>) => {
    onChange(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const setMedia = (idx: number, media: StepMediaType) => {
    update(idx, {
      media_type: media,
      use_audio: media === "audio",
      ...(media === "text" ? { media_url: null } : {}),
    });
  };

  const upload = async (idx: number, file: File, kind: "audio" | "image") => {
    setUploadingIdx(idx);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const ext = file.name.split(".").pop() ?? (kind === "image" ? "jpg" : "mp3");
      const path = `${u.user.id}/campaign/${Date.now()}_${kind}_${idx}.${ext}`;
      const { error } = await uploadToStorageWithRetry("disparos-audio", path, file, {
        upsert: true,
        contentType: file.type,
        onRetry: (attempt, delay) =>
          console.warn(`[upload] tentativa ${attempt} falhou, retry em ${delay}ms`),
      });
      if (error) throw error;
      // Bucket privado: signed URL de 1 ano (persiste no campaign step).
      const { data, error: signErr } = await supabase.storage
        .from("disparos-audio")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr || !data?.signedUrl) throw signErr ?? new Error("Falha ao assinar URL");
      update(idx, { media_url: data.signedUrl, media_type: kind, use_audio: kind === "audio" });
      toast({ title: kind === "image" ? "Imagem carregada" : "Áudio carregado" });
    } catch (e: any) {
      toast({ title: "Falha no upload", description: e.message, variant: "destructive" });
    } finally {
      setUploadingIdx(null);
    }
  };

  const add = () => {
    onChange([
      ...steps,
      {
        ordem: steps.length + 1,
        delay_hours: steps.length === 0 ? 0 : 48,
        mensagem: "",
        use_audio: false,
        media_type: "text",
        media_url: null,
      },
    ]);
  };

  const remove = (idx: number) => {
    onChange(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, ordem: i + 1 })));
  };

  return (
    <div className="space-y-3">
      {steps.map((step, idx) => {
        const media: StepMediaType = step.media_type ?? (step.use_audio ? "audio" : "text");
        return (
          <Card key={idx} className="border-primary/20">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline" className="font-mono">Passo {idx + 1}</Badge>
                  {idx === 0 ? (
                    <span className="text-xs text-muted-foreground">Abertura (imediato)</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Delay:</Label>
                      <Input
                        type="number" min={1} className="h-7 w-20"
                        value={step.delay_hours}
                        onChange={(e) => update(idx, { delay_hours: Number(e.target.value) })}
                      />
                      <span className="text-xs text-muted-foreground">h após anterior</span>
                    </div>
                  )}
                </div>
                {steps.length > 1 && (
                  <Button size="icon" variant="ghost" onClick={() => remove(idx)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>

              {/* Tipo de mídia */}
              <div className="flex flex-wrap gap-2">
                {MEDIA_OPTIONS.map((opt) => {
                  const Active = media === opt.value;
                  return (
                    <Button
                      key={opt.value}
                      type="button"
                      size="sm"
                      variant={Active ? "default" : "outline"}
                      onClick={() => setMedia(idx, opt.value)}
                    >
                      <opt.icon className="h-3.5 w-3.5 mr-1.5" /> {opt.label}
                    </Button>
                  );
                })}
              </div>

              {/* Upload de mídia quando aplicável */}
              {(media === "audio" || media === "image") && (
                <div className="rounded-md border border-dashed p-3 space-y-2">
                  {step.media_url ? (
                    <div className="flex items-center justify-between gap-2">
                      {media === "image" ? (
                        <img src={step.media_url} alt="" className="h-16 w-16 rounded object-cover" />
                      ) : (
                        <audio src={step.media_url} controls className="h-8 flex-1" />
                      )}
                      <Button size="icon" variant="ghost" onClick={() => update(idx, { media_url: null })}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                      {uploadingIdx === idx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {media === "image" ? "Enviar imagem (JPG/PNG)" : "Enviar áudio (MP3/OGG)"}
                      <input
                        type="file"
                        accept={media === "image" ? "image/*" : "audio/*"}
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) upload(idx, f, media);
                        }}
                      />
                    </label>
                  )}
                  {media === "audio" && !step.media_url && (
                    <p className="text-[10px] text-muted-foreground">
                      Sem áudio enviado? A IA gera com TTS automaticamente (se ElevenLabs estiver configurada).
                    </p>
                  )}
                </div>
              )}

              {/* Mensagem (texto p/ texto; legenda p/ imagem; roteiro p/ áudio) */}
              <div>
                <Label className="text-xs text-muted-foreground">
                  {media === "image" ? "Legenda" : media === "audio" ? "Roteiro / Texto fallback" : "Mensagem"}
                </Label>
                <MessageEditorWithAI
                  value={step.mensagem}
                  onChange={(v) => update(idx, { mensagem: v, gerado_por_ia: true })}
                  stepIndex={idx}
                  totalSteps={steps.length}
                  exampleLead={exampleLead}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Button variant="outline" onClick={add} className="w-full">
        <Plus className="h-4 w-4 mr-2" /> Adicionar passo
      </Button>
    </div>
  );
}
