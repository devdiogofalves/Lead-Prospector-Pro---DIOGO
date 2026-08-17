import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useBranding } from "@/hooks/useBranding";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Save, Upload, Loader2, Image as ImageIcon } from "lucide-react";

export default function BrandingTab() {
  const { branding, save, saving } = useBranding();
  const [form, setForm] = useState(branding);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem (PNG, JPG, SVG, WEBP)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo deve ter no máximo 2MB");
      return;
    }
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Não autenticado");
      const ext = file.name.split(".").pop() || "png";
      const path = `${uid}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("branding-logos")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("branding-logos").getPublicUrl(path);
      setForm((f) => ({ ...f, logo_url: pub.publicUrl }));
      save({ logo_url: pub.publicUrl });
      toast.success("Logo enviada com sucesso");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao enviar logo");
    } finally {
      setUploading(false);
    }
  };


  useEffect(() => {
    setForm(branding);
  }, [branding.company_name, branding.agent_name, branding.agent_tagline, branding.primary_color, branding.logo_url, branding.whatsapp_number, branding.whatsapp_cta_label]);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/20">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Identidade da Empresa</h1>
          <p className="text-sm text-muted-foreground">
            Personalize o painel com a marca da sua empresa e o nome da sua agente IA.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Marca</CardTitle>
          <CardDescription>Estes dados aparecem na barra lateral, no login e nos disparos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="company_name">Nome da empresa</Label>
            <Input
              id="company_name"
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              placeholder="Ex: Empresa XPTO"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent_name">Nome da agente IA</Label>
            <Input
              id="agent_name"
              value={form.agent_name}
              onChange={(e) => setForm({ ...form, agent_name: e.target.value })}
              placeholder="Ex: Alex, Marina, Max..."
            />
            <p className="text-xs text-muted-foreground">
              Esse é o nome que aparece nos disparos e na qualificação dos leads.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent_tagline">Slogan / função do agente</Label>
            <Input
              id="agent_tagline"
              value={form.agent_tagline}
              onChange={(e) => setForm({ ...form, agent_tagline: e.target.value })}
              placeholder="Sua agente de prospecção com IA"
            />
          </div>

          <div className="space-y-2">
            <Label>Logo da empresa</Label>
            <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-3">
              <div className="h-16 w-16 shrink-0 rounded-md bg-background border border-border flex items-center justify-center overflow-hidden">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                  {form.logo_url ? "Trocar logo" : "Enviar logo"}
                </Button>
                {form.logo_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setForm({ ...form, logo_url: null });
                      save({ logo_url: null });
                    }}
                  >
                    Remover
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              PNG, JPG, SVG ou WEBP. Até 2MB. Fundo transparente fica melhor.
            </p>

            <Label htmlFor="logo_url" className="pt-2 text-xs text-muted-foreground">
              ...ou cole uma URL pública
            </Label>
            <Input
              id="logo_url"
              value={form.logo_url ?? ""}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value || null })}
              placeholder="https://..."
            />
          </div>


          <div className="space-y-1.5">
            <Label htmlFor="primary_color">Cor primária (hex)</Label>
            <div className="flex gap-2 items-center">
              <Input
                id="primary_color"
                value={form.primary_color ?? ""}
                onChange={(e) => setForm({ ...form, primary_color: e.target.value || null })}
                placeholder="#7C3AED"
                className="font-mono"
              />
              {form.primary_color && /^#[0-9a-fA-F]{6}$/.test(form.primary_color) && (
                <div
                  className="h-9 w-9 rounded-md border"
                  style={{ background: form.primary_color }}
                />
              )}
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-border">
            <Label htmlFor="whatsapp_number">WhatsApp para CTA nos e-mails</Label>
            <Input
              id="whatsapp_number"
              value={form.whatsapp_number ?? ""}
              onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value || null })}
              placeholder="5511999998888 (DDI + DDD + número)"
            />
            <p className="text-xs text-muted-foreground">
              Quando preenchido, adiciona um botão verde "Falar no WhatsApp" no e-mail, levando o lead direto pra qualificação no seu número.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="whatsapp_cta_label">Texto do botão WhatsApp</Label>
            <Input
              id="whatsapp_cta_label"
              value={form.whatsapp_cta_label ?? ""}
              onChange={(e) => setForm({ ...form, whatsapp_cta_label: e.target.value || null })}
              placeholder="Falar no WhatsApp"
            />
          </div>

          <Button onClick={() => save(form)} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            Salvar identidade
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
