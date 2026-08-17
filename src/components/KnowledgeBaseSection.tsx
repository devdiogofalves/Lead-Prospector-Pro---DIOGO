import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { FileText, Loader2, Trash2, Upload, ClipboardPaste } from "lucide-react";
import { translateInvokeError } from "@/lib/friendlyError";

interface KnowledgeDoc {
  id: string;
  title: string;
  source_type: string;
  storage_path: string | null;
  status: "pending" | "processing" | "ready" | "failed";
  char_count: number | null;
  chunk_count: number | null;
  error: string | null;
  created_at: string;
}

const ACCEPTED = ".pdf,.txt,.md,.csv,.json";

function statusBadge(status: KnowledgeDoc["status"]) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Na fila", className: "border-muted-foreground/40 text-muted-foreground" },
    processing: { label: "Processando", className: "border-amber-500/40 text-amber-500" },
    ready: { label: "Pronto", className: "border-emerald-500/40 text-emerald-500" },
    failed: { label: "Falhou", className: "border-destructive/40 text-destructive" },
  };
  const s = map[status] ?? map.pending;
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
}

export function KnowledgeBaseSection() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pastingTitle, setPastingTitle] = useState("");
  const [pastingText, setPastingText] = useState("");
  const [pasting, setPasting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("knowledge_documents")
      .select("id, title, source_type, storage_path, status, char_count, chunk_count, error, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar documentos", description: error.message, variant: "destructive" });
    } else {
      setDocs((data ?? []) as KnowledgeDoc[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Poll enquanto houver docs processando
  useEffect(() => {
    const anyProcessing = docs.some((d) => d.status === "pending" || d.status === "processing");
    if (!anyProcessing) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [docs, load]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !user) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const id = crypto.randomUUID();
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${user.id}/${id}-${safeName}`;

        const { error: upErr } = await supabase.storage
          .from("knowledge-docs")
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw new Error(`Upload falhou: ${upErr.message}`);

        const { data: doc, error: insErr } = await supabase
          .from("knowledge_documents")
          .insert({
            user_id: user.id,
            title: file.name,
            source_type: "upload",
            storage_path: path,
            status: "pending",
          })
          .select("id")
          .single();
        if (insErr) throw new Error(`Registro falhou: ${insErr.message}`);

        await load();

        const { error: fnErr } = await supabase.functions.invoke("knowledge-ingest", {
          body: { document_id: doc.id },
        });
        if (fnErr) {
          toast({
            title: `Falha ao processar ${file.name}`,
            description: translateInvokeError(fnErr, "processar documento"),
            variant: "destructive",
          });
        } else {
          toast({ title: `${file.name} enviado`, description: "Processando na fila da IA." });
        }
      }
      await load();
    } catch (e: any) {
      toast({ title: "Erro no upload", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handlePasteText() {
    const title = pastingTitle.trim();
    const text = pastingText.trim();
    if (!title || text.length < 20) {
      toast({ title: "Preencha título e um texto com pelo menos 20 caracteres", variant: "destructive" });
      return;
    }
    setPasting(true);
    try {
      const { error } = await supabase.functions.invoke("knowledge-ingest", { body: { title, text } });
      if (error) throw new Error(translateInvokeError(error, "enviar texto"));
      setPastingTitle("");
      setPastingText("");
      toast({ title: "Texto enviado", description: "A IA está indexando." });
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao enviar texto", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setPasting(false);
    }
  }

  async function handleDelete(doc: KnowledgeDoc) {
    if (!confirm(`Excluir "${doc.title}"? Os trechos indexados também serão apagados.`)) return;
    try {
      if (doc.storage_path) {
        await supabase.storage.from("knowledge-docs").remove([doc.storage_path]);
      }
      const { error } = await supabase.from("knowledge_documents").delete().eq("id", doc.id);
      if (error) throw error;
      toast({ title: "Documento removido" });
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: String(e?.message ?? e), variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Base de Conhecimento (arquivos)
        </CardTitle>
        <CardDescription>
          Suba PDFs, TXT, MD ou CSV com informações da sua empresa, cases, FAQs e material comercial.
          A IA consulta essa base a cada resposta para trazer contexto real do seu negócio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload de arquivos */}
        <div className="rounded-lg border border-dashed p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium">Enviar arquivo</p>
              <p className="text-xs text-muted-foreground">Aceita {ACCEPTED}. Máx recomendado: 10 MB por arquivo.</p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                size="sm"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                Escolher arquivos
              </Button>
            </div>
          </div>
        </div>

        {/* Colar texto */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardPaste className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Colar texto direto</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="kb-title" className="text-xs">Título</Label>
            <Input
              id="kb-title"
              value={pastingTitle}
              onChange={(e) => setPastingTitle(e.target.value)}
              placeholder="Ex: FAQ sobre planos"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="kb-text" className="text-xs">Conteúdo</Label>
            <Textarea
              id="kb-text"
              value={pastingText}
              onChange={(e) => setPastingText(e.target.value)}
              rows={6}
              placeholder="Cole aqui o texto (mínimo 20 caracteres)…"
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handlePasteText} disabled={pasting}>
              {pasting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enviar texto
            </Button>
          </div>
        </div>

        {/* Lista */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Documentos indexados</p>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {docs.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum documento ainda. Suba um arquivo ou cole um texto para começar.
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{doc.title}</span>
                      {statusBadge(doc.status)}
                      {doc.chunk_count != null && doc.chunk_count > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          {doc.chunk_count} trechos
                        </Badge>
                      )}
                    </div>
                    {doc.status === "failed" && doc.error && (
                      <p className="text-xs text-destructive mt-1 line-clamp-2">{doc.error}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(doc)}
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
