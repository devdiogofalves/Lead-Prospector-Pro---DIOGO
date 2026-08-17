import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Upload, FileSpreadsheet, Loader2, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export type SourceKey = "leads" | "instagram_contacts" | "linkedin_contacts" | "empresas_enriquecidas";

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[]; // possible column names in spreadsheet (lowercase)
  type?: "text" | "phone" | "number" | "url";
}

const SCHEMAS: Record<SourceKey, { table: string; fields: FieldDef[]; uniqueKey?: string }> = {
  leads: {
    table: "leads",
    uniqueKey: "telefone,user_id",
    fields: [
      { key: "nome_empresa", label: "Nome da Empresa", required: true, aliases: ["nome_empresa", "nome", "empresa", "company", "name"] },
      { key: "telefone", label: "Telefone (WhatsApp)", required: true, type: "phone", aliases: ["telefone", "whatsapp", "phone", "celular", "fone"] },
      { key: "endereco", label: "Endereço", aliases: ["endereco", "endereço", "address", "rua"] },
      { key: "site", label: "Site", type: "url", aliases: ["site", "website", "url"] },
      { key: "cnpj", label: "CNPJ", aliases: ["cnpj", "cnpj_cpf"] },
      { key: "especialidades", label: "Especialidades / Nicho", aliases: ["especialidades", "nicho", "segmento", "categoria"] },
      { key: "rating", label: "Avaliação", type: "number", aliases: ["rating", "avaliacao", "estrelas"] },
      { key: "reviews", label: "Nº de Reviews", type: "number", aliases: ["reviews", "avaliacoes"] },
    ],
  },
  instagram_contacts: {
    table: "instagram_contacts",
    uniqueKey: "username,user_id",
    fields: [
      { key: "username", label: "Usuário (@)", required: true, aliases: ["username", "usuario", "user", "handle", "@"] },
      { key: "nome", label: "Nome", aliases: ["nome", "name", "full_name"] },
      { key: "whatsapp", label: "WhatsApp", type: "phone", aliases: ["whatsapp", "telefone", "phone", "celular"] },
      { key: "bio", label: "Bio", aliases: ["bio", "biografia", "descricao"] },
      { key: "email", label: "Email", aliases: ["email", "e-mail"] },
      { key: "site", label: "Site", type: "url", aliases: ["site", "website", "url"] },
      { key: "profile_url", label: "URL do Perfil", type: "url", aliases: ["profile_url", "perfil", "instagram_url"] },
      { key: "seguidores", label: "Seguidores", type: "number", aliases: ["seguidores", "followers"] },
    ],
  },
  linkedin_contacts: {
    table: "linkedin_contacts",
    uniqueKey: "linkedin_url,user_id",
    fields: [
      { key: "nome", label: "Nome", required: true, aliases: ["nome", "name", "nome_contato"] },
      { key: "cargo", label: "Cargo", aliases: ["cargo", "title", "position"] },
      { key: "empresa", label: "Empresa", aliases: ["empresa", "company", "organizacao"] },
      { key: "linkedin_url", label: "URL do LinkedIn", type: "url", aliases: ["linkedin_url", "linkedin", "url"] },
      { key: "email", label: "Email", aliases: ["email", "e-mail"] },
      { key: "telefone", label: "Telefone", type: "phone", aliases: ["telefone", "whatsapp", "phone"] },
      { key: "localizacao", label: "Localização", aliases: ["localizacao", "location", "cidade"] },
      { key: "sobre", label: "Sobre", aliases: ["sobre", "about", "bio"] },
    ],
  },
  empresas_enriquecidas: {
    table: "empresas_enriquecidas",
    uniqueKey: "cnpj,user_id",
    fields: [
      { key: "nome_empresa", label: "Nome da Empresa", required: true, aliases: ["nome_empresa", "nome", "empresa", "fantasia"] },
      { key: "cnpj", label: "CNPJ", required: true, aliases: ["cnpj"] },
      { key: "razao_social", label: "Razão Social", aliases: ["razao_social", "razão social"] },
      { key: "telefone", label: "Telefone", type: "phone", aliases: ["telefone", "whatsapp", "phone"] },
      { key: "email", label: "Email", aliases: ["email", "e-mail"] },
      { key: "site", label: "Site", type: "url", aliases: ["site", "website"] },
      { key: "endereco", label: "Endereço", aliases: ["endereco", "endereço", "address"] },
      { key: "atividade_principal", label: "Atividade Principal", aliases: ["atividade_principal", "atividade", "cnae"] },
    ],
  },
};

function normalizePhone(raw: any): string {
  let p = String(raw ?? "").replace(/\D/g, "");
  if (!p) return "";
  if (!p.startsWith("55") && p.length >= 10) p = "55" + p;
  return p;
}

function validatePhone(p: string): boolean {
  // BR mobile: 55 + DDD (2) + 9 + 8 digits = 13 digits (or 12 for fixo)
  return p.length >= 12 && p.length <= 13;
}

function cleanCnpj(raw: any): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function validateCnpj(c: string): boolean {
  return c.length === 14;
}

interface Props {
  source: SourceKey;
  onChanged?: () => void;
}

export function AddImportLeads({ source, onChanged }: Props) {
  const qc = useQueryClient();
  const schema = SCHEMAS[source];
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [importStats, setImportStats] = useState<{ ok: number; skipped: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const resetForm = () => setForm({});

  const handleAdd = async () => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Não autenticado");

      const row: Record<string, any> = { user_id: userId };
      for (const f of schema.fields) {
        const v = (form[f.key] || "").trim();
        if (f.required && !v) throw new Error(`${f.label} é obrigatório`);
        if (!v) continue;
        if (f.type === "phone") {
          const p = normalizePhone(v);
          if (!validatePhone(p)) throw new Error(`Telefone inválido em ${f.label} (use formato BR: DDD + número)`);
          row[f.key] = p;
        } else if (f.type === "number") {
          row[f.key] = Number(v.replace(",", "."));
        } else if (f.key === "cnpj") {
          const c = cleanCnpj(v);
          if (!validateCnpj(c)) throw new Error("CNPJ inválido (precisa ter 14 dígitos)");
          row[f.key] = c;
        } else if (f.key === "username") {
          row[f.key] = v.replace(/^@/, "");
        } else {
          row[f.key] = v;
        }
      }

      const { error } = await supabase.from(schema.table as any).insert(row as any);
      if (error) throw error;

      toast({ title: "Lead cadastrado", description: "Salvo na sua base." });
      resetForm();
      setAddOpen(false);
      onChanged?.();
      qc.invalidateQueries({ queryKey: ["meus-leads"] });
    } catch (e: any) {
      toast({ title: "Erro ao cadastrar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = () => {
    const headers = schema.fields.map((f) => f.key);
    const example: Record<string, any> = {};
    schema.fields.forEach((f) => {
      example[f.key] = f.key === "telefone" || f.key === "whatsapp" ? "11999998888"
        : f.key === "cnpj" ? "00000000000000"
        : f.key === "username" ? "exemplo"
        : f.key === "nome_empresa" || f.key === "nome" ? "Exemplo Ltda"
        : "";
    });
    const ws = XLSX.utils.json_to_sheet([example], { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, `modelo_${source}.xlsx`);
  };

  const handleFile = async (file: File) => {
    setImporting(true);
    setImportStats(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

      if (!rawRows.length) throw new Error("Planilha vazia");

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Não autenticado");

      // 1) Match by alias (exact or contains)
      const headers = Object.keys(rawRows[0]);
      const colMap: Record<string, string> = {};
      for (const f of schema.fields) {
        for (const h of headers) {
          const hn = h.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
          if (f.aliases.some((a) => {
            const an = a.toLowerCase().replace(/[^a-z0-9]/g, "");
            return hn === an || hn.includes(an) || an.includes(hn);
          })) { colMap[f.key] = h; break; }
        }
      }

      // 2) Heurística: detectar colunas de telefone/nome pelo CONTEÚDO se ainda não mapeadas
      const sample = rawRows.slice(0, 20);
      const phoneField = schema.fields.find((f) => f.type === "phone");
      if (phoneField && !colMap[phoneField.key]) {
        for (const h of headers) {
          if (Object.values(colMap).includes(h)) continue;
          const hits = sample.filter((r) => {
            const v = String(r[h] ?? "").replace(/\D/g, "");
            return v.length >= 10 && v.length <= 13;
          }).length;
          if (hits >= Math.max(2, Math.floor(sample.length * 0.5))) { colMap[phoneField.key] = h; break; }
        }
      }
      const nameField = schema.fields.find((f) => f.required && f.type !== "phone" && f.key !== "cnpj");
      if (nameField && !colMap[nameField.key]) {
        // primeira coluna de texto não usada
        for (const h of headers) {
          if (Object.values(colMap).includes(h)) continue;
          const hasText = sample.some((r) => {
            const v = String(r[h] ?? "").trim();
            return v.length >= 2 && !/^\d+$/.test(v.replace(/\D/g, "")) || v.length >= 3;
          });
          if (hasText) { colMap[nameField.key] = h; break; }
        }
      }

      // Ensure required fields mapped
      const missingReq = schema.fields.filter((f) => f.required && !colMap[f.key]);
      if (missingReq.length) {
        throw new Error(`Não consegui identificar: ${missingReq.map((f) => f.label).join(", ")}. Renomeie a coluna ou use o modelo abaixo.`);
      }

      const toInsert: any[] = [];
      const errors: string[] = [];
      let skipped = 0;

      rawRows.forEach((raw, idx) => {
        const row: Record<string, any> = { user_id: userId };
        let ok = true;
        for (const f of schema.fields) {
          const header = colMap[f.key];
          if (!header) continue;
          let v: any = raw[header];
          if (v === "" || v === null || v === undefined) {
            if (f.required) { errors.push(`Linha ${idx + 2}: ${f.label} vazio`); ok = false; }
            continue;
          }
          if (f.type === "phone") {
            const p = normalizePhone(v);
            if (!validatePhone(p)) { errors.push(`Linha ${idx + 2}: telefone inválido (${v})`); ok = false; continue; }
            row[f.key] = p;
          } else if (f.type === "number") {
            row[f.key] = Number(String(v).replace(",", "."));
          } else if (f.key === "cnpj") {
            const c = cleanCnpj(v);
            if (f.required && !validateCnpj(c)) { errors.push(`Linha ${idx + 2}: CNPJ inválido (${v})`); ok = false; continue; }
            row[f.key] = c;
          } else if (f.key === "username") {
            row[f.key] = String(v).replace(/^@/, "").trim();
          } else {
            row[f.key] = String(v).trim();
          }
        }
        if (ok) toInsert.push(row); else skipped++;
      });

      if (!toInsert.length) {
        setImportStats({ ok: 0, skipped, errors: errors.slice(0, 10) });
        throw new Error("Nenhuma linha válida para importar");
      }

      // Upsert in chunks
      const chunkSize = 200;
      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { error } = await supabase
          .from(schema.table as any)
          .upsert(chunk as any, schema.uniqueKey ? { onConflict: schema.uniqueKey, ignoreDuplicates: false } : undefined);
        if (error) { errors.push(`Lote ${i / chunkSize + 1}: ${error.message}`); }
        else inserted += chunk.length;
      }

      setImportStats({ ok: inserted, skipped, errors: errors.slice(0, 10) });
      toast({
        title: `${inserted} lead(s) importado(s)`,
        description: skipped ? `${skipped} ignorado(s) por erro de validação.` : "Tudo certo!",
      });
      onChanged?.();
      qc.invalidateQueries({ queryKey: ["meus-leads"] });
    } catch (e: any) {
      toast({ title: "Erro ao importar", description: e.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const canEnrich = source === "leads" || source === "empresas_enriquecidas";

  const handleEnrich = async () => {
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke("cnpj-batch-lookup", { body: {} });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro");
      toast({
        title: "Enriquecimento concluído",
        description: `${data.processed} de ${data.total} CNPJs processados.`,
      });
      onChanged?.();
      qc.invalidateQueries({ queryKey: ["meus-leads"] });
      qc.invalidateQueries({ queryKey: ["empresas_enriquecidas"] });
    } catch (e: any) {
      toast({ title: "Erro ao enriquecer", description: e.message, variant: "destructive" });
    } finally {
      setEnriching(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="default" onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Cadastrar Lead
        </Button>
        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
          <Upload className="h-4 w-4" /> Importar CSV/XLSX
        </Button>
        {canEnrich && (
          <Button size="sm" variant="outline" onClick={handleEnrich} disabled={enriching} className="gap-2">
            {enriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Enriquecer CNPJ
          </Button>
        )}
      </div>

      {/* Add manually */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cadastrar Lead</DialogTitle>
            <DialogDescription>Preencha os campos. Os marcados com * são obrigatórios.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {schema.fields.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={f.key} className="text-sm">
                  {f.label} {f.required && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id={f.key}
                  value={form[f.key] || ""}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  placeholder={f.type === "phone" ? "11999998888" : f.key === "cnpj" ? "00.000.000/0000-00" : ""}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import */}
      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) setImportStats(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar Planilha</DialogTitle>
            <DialogDescription>
              Aceita .csv, .xlsx ou .xls. O sistema mapeia colunas automaticamente, valida telefones BR e CNPJs, e ignora duplicatas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              <strong>Colunas esperadas (qualquer uma destas variações):</strong>
              <ul className="mt-1 space-y-0.5">
                {schema.fields.map((f) => (
                  <li key={f.key}>
                    • <span className={f.required ? "text-foreground font-medium" : ""}>{f.label}{f.required && " *"}</span>:{" "}
                    <code className="text-[10px]">{f.aliases.slice(0, 3).join(", ")}</code>
                  </li>
                ))}
              </ul>
            </div>

            <Button size="sm" variant="ghost" onClick={downloadTemplate} className="gap-2">
              <Download className="h-4 w-4" /> Baixar modelo .xlsx
            </Button>

            <Input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />

            {importing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Processando...
              </div>
            )}

            {importStats && (
              <div className="rounded-md border border-border p-3 text-sm space-y-1">
                <div>✅ Importados: <strong>{importStats.ok}</strong></div>
                {importStats.skipped > 0 && <div>⚠️ Ignorados: <strong>{importStats.skipped}</strong></div>}
                {importStats.errors.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-destructive">Ver erros ({importStats.errors.length})</summary>
                    <ul className="mt-1 text-xs space-y-0.5">
                      {importStats.errors.map((er, i) => <li key={i}>• {er}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
