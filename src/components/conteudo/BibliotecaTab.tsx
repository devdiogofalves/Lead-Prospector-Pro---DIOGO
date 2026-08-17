import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Star, Trash2, Image as ImageIcon, User, Layers, Palette, Crown } from "lucide-react";

type Kind = "logo" | "ugc_avatar" | "feed_template" | "carousel_template" | "mood";

const KINDS: { value: Kind; label: string; desc: string; icon: typeof Upload }[] = [
  { value: "logo", label: "Logo da empresa", desc: "Sua marca — usada como assinatura nas peças.", icon: Crown },
  { value: "ugc_avatar", label: "Avatar UGC", desc: "1 foto do rosto que vai aparecer recorrente nos reels/imagens UGC.", icon: User },
  { value: "feed_template", label: "Template de Feed", desc: "Imagem-modelo do estilo dos seus posts estáticos.", icon: ImageIcon },
  { value: "carousel_template", label: "Template de Carrossel", desc: "Exemplo de slide do seu carrossel (a IA replica o layout).", icon: Layers },
  { value: "mood", label: "Mood / Estética", desc: "Imagens de inspiração que definem cores e clima.", icon: Palette },
];

export default function BibliotecaTab() {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState<string | null>(null);

  const { data: assets = [] } = useQuery({
    queryKey: ["social_brand_assets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("social_brand_assets").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function handleUpload(kind: Kind, file: File, isDefault: boolean) {
    setUploading(kind);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kind);
      form.set("is_default", String(isDefault));
      form.set("label", file.name);
      const { data, error } = await supabase.functions.invoke("social-assets-upload", { body: form });
      if (error) throw error;
      const j = data as { success?: boolean; error?: string };
      if (!j?.success) throw new Error(j?.error ?? "Upload falhou");
      toast({ title: "Referência salva" });
      qc.invalidateQueries({ queryKey: ["social_brand_assets"] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setUploading(null);
    }
  }

  async function setDefault(id: string, kind: string) {
    await supabase.from("social_brand_assets").update({ is_default: false }).eq("kind", kind);
    await supabase.from("social_brand_assets").update({ is_default: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["social_brand_assets"] });
    toast({ title: "Definido como padrão" });
  }

  async function remove(id: string) {
    await supabase.from("social_brand_assets").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["social_brand_assets"] });
  }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📚 Biblioteca de Referências</CardTitle>
          <p className="text-sm text-muted-foreground">
            Suba referências visuais. A IA usa essas imagens como base para gerar conteúdo on-brand e manter consistência (mesmo avatar, mesmo estilo, mesma identidade).
          </p>
        </CardHeader>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {KINDS.map(({ value, label, desc, icon: Icon }) => {
          const items = assets.filter((a: { kind: string }) => a.kind === value);
          return (
            <Card key={value}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Icon className="h-4 w-4" /> {label}</CardTitle>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Adicionar</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={uploading === value}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(value, f, items.length === 0);
                      e.currentTarget.value = "";
                    }}
                  />
                </div>
                {items.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {items.map((a: { id: string; public_url: string; is_default: boolean; kind: string }) => (
                      <div key={a.id} className="relative group">
                        <img src={a.public_url} alt="" className="w-full aspect-square object-cover rounded border" />
                        {a.is_default && (
                          <Badge className="absolute top-1 left-1 text-[10px]"><Star className="h-3 w-3 mr-0.5" /> padrão</Badge>
                        )}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1">
                          {!a.is_default && (
                            <Button size="sm" variant="secondary" onClick={() => setDefault(a.id, a.kind)}>
                              <Star className="h-3 w-3" />
                            </Button>
                          )}
                          <Button size="sm" variant="destructive" onClick={() => remove(a.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
