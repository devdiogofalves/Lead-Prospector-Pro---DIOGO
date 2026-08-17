import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Trash2, FileText, Upload, Star, StarOff } from "lucide-react";

type Product = {
  id: string;
  name: string;
  description: string | null;
  link: string | null;
  target_audience: string | null;
  features: any;
  pains: any;
  docs: any;
  active: boolean;
  is_default: boolean;
};

export default function ProdutosTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Product> | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["social_products"],
    queryFn: async () => {
      const { data } = await supabase.from("social_products").select("*").order("created_at", { ascending: false });
      return (data as Product[]) ?? [];
    },
  });

  function startNew() {
    setEditing({ name: "", description: "", link: "", target_audience: "", features: [], pains: [], docs: [], active: true, is_default: false });
  }

  async function save() {
    if (!editing?.name?.trim()) return toast({ title: "Nome obrigatório" });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload: any = {
      user_id: user.id,
      name: editing.name,
      description: editing.description ?? null,
      link: editing.link ?? null,
      target_audience: editing.target_audience ?? null,
      features: Array.isArray(editing.features) ? editing.features : (typeof editing.features === "string" ? (editing.features as string).split("\n").filter(Boolean) : []),
      pains: Array.isArray(editing.pains) ? editing.pains : (typeof editing.pains === "string" ? (editing.pains as string).split("\n").filter(Boolean) : []),
      docs: editing.docs ?? [],
      active: editing.active ?? true,
      is_default: editing.is_default ?? false,
    };
    if (editing.id) {
      await supabase.from("social_products").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("social_products").insert(payload);
    }
    if (payload.is_default) {
      await supabase.from("social_products").update({ is_default: false }).eq("user_id", user.id).neq("name", payload.name);
    }
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["social_products"] });
    toast({ title: "Salvo" });
  }

  async function setDefault(p: Product) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("social_products").update({ is_default: false }).eq("user_id", user.id);
    await supabase.from("social_products").update({ is_default: true }).eq("id", p.id);
    qc.invalidateQueries({ queryKey: ["social_products"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir produto?")) return;
    await supabase.from("social_products").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["social_products"] });
  }

  async function uploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !editing) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const docs: any[] = Array.isArray(editing.docs) ? [...editing.docs] : [];
    for (const f of files) {
      // Tenta ler texto (txt/md). Para PDF/DOCX, salva o arquivo + usuário pode colar texto manualmente.
      let extracted_text = "";
      if (/\.(txt|md|markdown|csv|json)$/i.test(f.name)) {
        extracted_text = await f.text();
      }
      const path = `${user.id}/products/${Date.now()}_${f.name}`;
      const { error } = await supabase.storage.from("social-assets").upload(path, f);
      if (error) { toast({ title: "Upload falhou", description: error.message, variant: "destructive" }); continue; }
      const { data: signed } = await supabase.storage.from("social-assets").createSignedUrl(path, 60 * 60 * 24 * 365);
      docs.push({ filename: f.name, url: signed?.signedUrl, extracted_text, uploaded_at: new Date().toISOString() });
    }
    setEditing({ ...editing, docs });
    toast({ title: `${files.length} doc(s) anexada(s)`, description: "Para PDF/DOCX cole o texto no campo 'Texto extraído' se quiser que a IA leia." });
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Package className="h-5 w-5" /> Seus Produtos</h2>
          <p className="text-sm text-muted-foreground">Cadastre cada solução com documentação. Ao gerar conteúdo você escolhe qual produto divulgar — a IA usa a doc como fonte de verdade.</p>
        </div>
        <Button onClick={startNew}><Plus className="h-4 w-4 mr-1" /> Novo produto</Button>
      </div>

      {editing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing.id ? "Editar produto" : "Novo produto"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Nome *</Label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <Label>Link / CTA</Label>
                <Input placeholder="https://..." value={editing.link ?? ""} onChange={(e) => setEditing({ ...editing, link: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Descrição (o que é, o que faz)</Label>
              <Textarea rows={3} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <div>
              <Label>Público-alvo (ICP específico desse produto)</Label>
              <Textarea rows={2} value={editing.target_audience ?? ""} onChange={(e) => setEditing({ ...editing, target_audience: e.target.value })} />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Features (uma por linha)</Label>
                <Textarea rows={4} value={Array.isArray(editing.features) ? (editing.features as string[]).join("\n") : (editing.features as string) ?? ""}
                  onChange={(e) => setEditing({ ...editing, features: e.target.value.split("\n").filter(Boolean) as any })} />
              </div>
              <div>
                <Label>Dores que resolve (uma por linha)</Label>
                <Textarea rows={4} value={Array.isArray(editing.pains) ? (editing.pains as string[]).join("\n") : (editing.pains as string) ?? ""}
                  onChange={(e) => setEditing({ ...editing, pains: e.target.value.split("\n").filter(Boolean) as any })} />
              </div>
            </div>

            <div>
              <Label>Documentação (TXT/MD lê automático; PDF/DOCX salva o arquivo)</Label>
              <div className="flex gap-2 items-center mt-1">
                <label className="inline-flex items-center gap-2 px-3 py-2 border-2 border-dashed rounded cursor-pointer hover:bg-muted text-sm">
                  <Upload className="h-4 w-4" /> Anexar arquivos
                  <input type="file" multiple className="hidden" onChange={uploadDoc} />
                </label>
                <span className="text-xs text-muted-foreground">{(editing.docs as any[])?.length ?? 0} doc(s)</span>
              </div>
              {(editing.docs as any[])?.length > 0 && (
                <div className="space-y-2 mt-2">
                  {(editing.docs as any[]).map((d, i) => (
                    <div key={i} className="border rounded p-2 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {d.filename}</span>
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ ...editing, docs: (editing.docs as any[]).filter((_, j) => j !== i) })}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <Textarea rows={3} placeholder="Texto extraído (cole o conteúdo do PDF/DOCX aqui — a IA usa isso)"
                        value={d.extracted_text ?? ""}
                        onChange={(e) => {
                          const docs = [...(editing.docs as any[])];
                          docs[i] = { ...docs[i], extracted_text: e.target.value };
                          setEditing({ ...editing, docs });
                        }} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
                <Label>Ativo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editing.is_default ?? false} onCheckedChange={(v) => setEditing({ ...editing, is_default: v })} />
                <Label>Produto padrão (usado quando não escolho nenhum)</Label>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={save}>Salvar</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        {products.map((p) => (
          <Card key={p.id} className={p.is_default ? "border-primary" : ""}>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold flex items-center gap-2">{p.name} {p.is_default && <Badge variant="default" className="text-[10px]">padrão</Badge>}</div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{p.description}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setDefault(p)} title={p.is_default ? "Padrão" : "Tornar padrão"}>
                    {p.is_default ? <Star className="h-4 w-4 text-primary" /> : <StarOff className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p as any)}>Editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>{(p.features as any[])?.length ?? 0} features</span>
                <span>•</span>
                <span>{(p.docs as any[])?.length ?? 0} docs</span>
                {p.link && (<><span>•</span><a href={p.link} target="_blank" rel="noreferrer" className="text-primary truncate max-w-[150px]">{p.link}</a></>)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {products.length === 0 && !editing && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum produto ainda. Clique em "Novo produto" pra começar.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
