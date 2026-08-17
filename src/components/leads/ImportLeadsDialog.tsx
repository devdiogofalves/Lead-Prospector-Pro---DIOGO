import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, FileSpreadsheet, Sparkles, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

// ---------- Tipos ----------
type Field =
  | "ignore"
  | "nome_empresa"
  | "nome_pessoa"
  | "telefone"
  | "email"
  | "endereco"
  | "site"
  | "cnpj"
  | "cargo"
  | "cidade"
  | "segmento"
  | "especialidades";

const FIELD_LABEL: Record<Field, string> = {
  ignore: "Ignorar coluna",
  nome_empresa: "Nome / Empresa",
  nome_pessoa: "Nome do contato",
  telefone: "Telefone / WhatsApp",
  email: "E-mail",
  endereco: "Endereço",
  site: "Site / URL",
  cnpj: "CNPJ",
  cargo: "Cargo / Função",
  cidade: "Cidade",
  segmento: "Segmento / Setor",
  especialidades: "Observações / Contexto",
};

const MAX_ROWS = 5000;

// ---------- Heurísticas de header ----------
const HEADER_RULES: { field: Exclude<Field, "ignore">; re: RegExp }[] = [
  { field: "telefone", re: /(telefone|celular|whats|phone|contato.*(fone|tel)|fone|mobile|movel|móvel|numero|número)/i },
  { field: "email", re: /(e[-\s]?mail|email)/i },
  { field: "cnpj", re: /^cnpj$|cnpj|cpf.?cnpj/i },
  { field: "cargo", re: /(cargo|fun[cç][aã]o|position|role|t[ií]tulo|titulo)/i },
  { field: "cidade", re: /(cidade|munic[ií]pio|city|localidade)/i },
  { field: "segmento", re: /(segmento|setor|nicho|ramo|categoria|[aá]rea|area)/i },
  { field: "nome_empresa", re: /(empresa|razão|razao|razao.social|estabelecimento|neg[oó]cio|company|loja|escola|clinica|clínica|comercio|comércio)/i },
  { field: "nome_pessoa", re: /(nome.*contato|contato|respons[aá]vel|pessoa|cliente|lead|name|dono|s[oó]cio|socio)/i },
  { field: "endereco", re: /(endere[çc]o|logradouro|rua|address|bairro|estado|uf)/i },
  { field: "site", re: /(site|website|url|link|p[aá]gina|homepage)/i },
];

const detectFieldByHeader = (h: string): Field => {
  const s = h.trim();
  if (!s) return "ignore";
  for (const r of HEADER_RULES) if (r.re.test(s)) return r.field;
  return "especialidades";
};

// ---------- Fallback: detectar por conteúdo ----------
const looksLikePhone = (v: any) => {
  if (v == null) return false;
  const digits = String(v).replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
};
const looksLikeEmail = (v: any) => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

// ---------- Limpeza de nome ----------
const SOCIETY_SUFFIX_RE = /[\s,.-]+(ltda|me|eireli|epp|s\/?a|sa)\.?$/i;
const toTitleCase = (s: string): string =>
  s.toLowerCase().replace(/(^|[\s'/-])(\p{L})/gu, (_, p1, p2) => p1 + p2.toUpperCase());

export const cleanName = (raw: any): string => {
  if (raw == null) return "";
  let s = String(raw).trim().replace(/\s+/g, " ");
  if (!s) return "";
  const m = s.match(/^([^,]+),\s*(.+)$/);
  if (m && !/\d/.test(s)) s = `${m[2].trim()} ${m[1].trim()}`;
  if (s === s.toUpperCase()) s = toTitleCase(s);
  return s;
};

export const cleanCompanyName = (raw: any): string => {
  let s = cleanName(raw);
  for (let i = 0; i < 3; i++) {
    const next = s.replace(SOCIETY_SUFFIX_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
};

// ---------- Normalização BR ----------
type PhoneInfo = { canonical: string; isMobile: boolean; isFixed: boolean; dedupKey: string };

export const analyzeBRPhone = (raw: any): PhoneInfo | null => {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (/e[+-]/i.test(s) && !isNaN(Number(s))) s = Number(s).toFixed(0);
  const candidates = s.split(/\s*(?:\/|;|,|\se\s|\|)\s*/).filter(Boolean);
  const list = candidates.length > 1 ? candidates : [s];
  for (const c of list) {
    let d = c.replace(/\D/g, "");
    if (!d) continue;
    if (d.startsWith("00")) d = d.slice(2);
    if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    if (d.length === 12 && d.startsWith("0")) d = d.slice(1);
    let withDdi = d;
    if (!d.startsWith("55") && (d.length === 10 || d.length === 11)) withDdi = "55" + d;
    if (!withDdi.startsWith("55") || (withDdi.length !== 12 && withDdi.length !== 13)) continue;
    const dd = Number(withDdi.slice(2, 4));
    if (!(dd >= 11 && dd <= 99)) continue;
    const localFirst = withDdi[4];
    if (withDdi.length === 12 && /[2-5]/.test(localFirst)) {
      return { canonical: withDdi, isMobile: false, isFixed: true, dedupKey: withDdi.slice(2) };
    }
    if (withDdi.length === 12 && /[6-9]/.test(localFirst)) {
      withDdi = withDdi.slice(0, 4) + "9" + withDdi.slice(4);
    }
    if (withDdi.length === 13 && withDdi[4] === "9") {
      return { canonical: withDdi, isMobile: true, isFixed: false, dedupKey: withDdi.slice(2, 4) + withDdi.slice(5) };
    }
  }
  return null;
};

export const normalizeBRPhone = (raw: any): string | null => {
  const info = analyzeBRPhone(raw);
  return info ? info.canonical : null;
};

const cleanCnpj = (raw: any): string | null => {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, "");
  return d.length === 14 ? d : null;
};

const cleanEmail = (raw: any): string | null => {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
};

// ---------- Parser TXT / MD ----------
const MD_SEPARATOR_RE = /^\s*\|?\s*:?-{2,}:?(\s*\|\s*:?-{2,}:?)*\s*\|?\s*$/;

function parseTxt(content: string): Record<string, any>[] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !MD_SEPARATOR_RE.test(l));
  if (!lines.length) return [];
  const total = lines.length;
  const countDelim = (d: string) => lines.filter((l) => l.includes(d)).length;
  const delims: Array<{ d: string; c: number }> = [
    { d: "|", c: countDelim("|") },
    { d: ";", c: countDelim(";") },
    { d: "\t", c: countDelim("\t") },
    { d: ",", c: countDelim(",") },
  ].sort((a, b) => b.c - a.c);
  const best = delims[0];
  if (best.c / total >= 0.5 && best.c > 0) {
    const rows = lines.map((l) => {
      let parts = l.split(best.d).map((v) => v.trim());
      if (best.d === "|") {
        if (parts.length && parts[0] === "") parts.shift();
        if (parts.length && parts[parts.length - 1] === "") parts.pop();
      }
      return parts;
    });
    const maxCols = Math.max(...rows.map((r) => r.length));
    const headers = Array.from({ length: maxCols }, (_, i) => `coluna_${i + 1}`);
    return rows.map((r) => {
      const obj: Record<string, any> = {};
      headers.forEach((h, i) => { obj[h] = r[i] ?? ""; });
      return obj;
    });
  }
  return lines.map((l) => ({ coluna_1: l }));
}

// ---------- Component ----------
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
  defaultPipeline?: boolean;
}

interface ParsedRow { raw: Record<string, any>; }

export default function ImportLeadsDialog({ open, onOpenChange, onDone, defaultPipeline = false }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"pick" | "map" | "importing" | "done">("pick");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, Field>>({});
  const [createPipeline, setCreatePipeline] = useState<boolean>(defaultPipeline);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; pipeline: number; errors: string[] } | null>(null);

  const reset = () => {
    setStep("pick"); setFileName(""); setHeaders([]); setRows([]);
    setMapping({}); setResult(null); setCreatePipeline(defaultPipeline);
    if (fileRef.current) fileRef.current.value = "";
  };

  const applyAutoDetect = (arr: Record<string, any>[], syntheticHeaders: boolean) => {
    const hs = Object.keys(arr[0] ?? {});
    const map: Record<string, Field> = {};

    if (!syntheticHeaders) {
      hs.forEach((h) => { map[h] = detectFieldByHeader(h); });
    } else {
      hs.forEach((h) => { map[h] = "ignore"; });
    }

    // Detecção por conteúdo (todas as colunas se sintético; só faltantes se com header)
    const sample = arr.slice(0, 30);
    const consider = (field: Field) => Object.values(map).includes(field);

    if (syntheticHeaders || !consider("telefone")) {
      let best = ""; let bestScore = 0;
      hs.forEach((h) => {
        if (!syntheticHeaders && map[h] !== "ignore" && map[h] !== "especialidades") return;
        const score = sample.filter((r) => looksLikePhone(r[h])).length;
        if (score > bestScore) { bestScore = score; best = h; }
      });
      if (best && bestScore >= Math.min(3, Math.ceil(sample.length * 0.3))) map[best] = "telefone";
    }
    if (syntheticHeaders || !consider("email")) {
      for (const h of hs) {
        if (!syntheticHeaders && map[h] !== "ignore" && map[h] !== "especialidades") continue;
        if (map[h] === "telefone") continue;
        const hits = sample.filter((r) => looksLikeEmail(r[h])).length;
        if (hits >= Math.min(2, Math.ceil(sample.length * 0.2))) { map[h] = "email"; break; }
      }
    }
    if (!consider("nome_empresa") && !consider("nome_pessoa")) {
      const cand = hs.find((h) => (map[h] === "ignore" || map[h] === "especialidades") && sample.some((r) => {
        const v = String(r[h] || "").trim();
        return v.length > 2 && !looksLikePhone(v) && !looksLikeEmail(v);
      }));
      if (cand) map[cand] = "nome_empresa";
    }

    return { hs, map };
  };

  const handleFile = async (f: File) => {
    setFileName(f.name);
    try {
      const isTxt = /\.(txt|md|markdown)$/i.test(f.name);
      let arr: Record<string, any>[] = [];
      let syntheticHeaders = false;

      if (isTxt) {
        const text = await f.text();
        arr = parseTxt(text);
        syntheticHeaders = true;
      } else {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sh = wb.Sheets[wb.SheetNames[0]];
        arr = XLSX.utils.sheet_to_json(sh, { defval: "", raw: false });
        if (arr.length) {
          const firstRow = arr[0];
          const headerValues = Object.values(firstRow);
          const looksLikeDataRow = headerValues.length > 0 && headerValues.every(
            (v) => v == null || v === "" || looksLikePhone(v) || looksLikeEmail(v)
          );
          if (looksLikeDataRow) {
            const rowsArr: any[][] = XLSX.utils.sheet_to_json(sh, { defval: "", raw: false, header: 1 });
            const maxCols = Math.max(...rowsArr.map((r) => r.length));
            arr = rowsArr.map((r) => {
              const obj: Record<string, any> = {};
              for (let i = 0; i < maxCols; i++) obj[`coluna_${i + 1}`] = r[i] ?? "";
              return obj;
            });
            syntheticHeaders = true;
          }
        }
      }

      if (!arr.length) {
        toast({ title: "Arquivo vazio", variant: "destructive" });
        return;
      }
      if (arr.length > MAX_ROWS) {
        toast({
          title: "Arquivo muito grande",
          description: `Máximo ${MAX_ROWS} linhas por importação. Seu arquivo tem ${arr.length}. Divida em partes menores.`,
          variant: "destructive",
        });
        return;
      }

      const { hs, map } = applyAutoDetect(arr, syntheticHeaders);
      setHeaders(hs);
      setRows(arr.map((raw) => ({ raw })));
      setMapping(map);
      setCreatePipeline(defaultPipeline);
      setStep("map");
    } catch (e: any) {
      toast({ title: "Erro ao ler arquivo", description: e.message, variant: "destructive" });
    }
  };

  const preview = useMemo(() => {
    if (step !== "map") return null;
    const inv = Object.entries(mapping).reduce<Record<Field, string[]>>((acc, [h, f]) => {
      (acc[f] ||= []).push(h); return acc;
    }, {} as any);
    const phoneCols = inv.telefone || [];
    const emailCols = inv.email || [];
    const nameCols = [...(inv.nome_empresa || []), ...(inv.nome_pessoa || [])];

    let ok = 0, invalid = 0, noName = 0;
    const samples: any[] = [];
    rows.forEach((r) => {
      const phone = phoneCols.map((c) => normalizeBRPhone(r.raw[c])).find(Boolean) || null;
      const email = emailCols.map((c) => cleanEmail(r.raw[c])).find(Boolean) || null;
      if (!phone && !email) { invalid++; return; }
      const name = nameCols.map((c) => String(r.raw[c] || "").trim()).find(Boolean);
      if (!name) noName++;
      ok++;
      if (samples.length < 5) samples.push({
        nome: name || "(usará telefone/email)",
        telefone: phone || "—",
        email: email || "",
      });
    });
    return { ok, invalid, noName, samples };
  }, [step, mapping, rows]);

  const doImport = async () => {
    setImporting(true); setStep("importing");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado.");

      const inv = Object.entries(mapping).reduce<Record<Field, string[]>>((acc, [h, f]) => {
        (acc[f] ||= []).push(h); return acc;
      }, {} as any);
      const phoneCols = inv.telefone || [];
      const emailCols = inv.email || [];
      const cnpjCols = inv.cnpj || [];
      const siteCols = inv.site || [];
      const addrCols = inv.endereco || [];
      const empresaCols = inv.nome_empresa || [];
      const pessoaCols = inv.nome_pessoa || [];
      const cargoCols = inv.cargo || [];
      const cidadeCols = inv.cidade || [];
      const segmentoCols = inv.segmento || [];
      const notesCols = inv.especialidades || [];

      const seenPhoneKey = new Set<string>();
      const seenEmail = new Set<string>();
      const withPhone: any[] = [];
      const emailOnly: any[] = [];
      const pessoaByKey = new Map<string, string>();
      let skipped = 0;

      rows.forEach((r) => {
        const phoneInfo = phoneCols.map((c) => analyzeBRPhone(r.raw[c])).find(Boolean) || null;
        const phone = phoneInfo?.canonical || null;
        const isFixed = phoneInfo?.isFixed === true;
        const email = emailCols.map((c) => cleanEmail(r.raw[c])).find(Boolean) || null;
        if (!phone && !email) { skipped++; return; }

        // Dedup canônico: mesmo número com/sem 9 e com/sem 55 conta como um
        if (phoneInfo && seenPhoneKey.has(phoneInfo.dedupKey)) { skipped++; return; }
        if (!phone && email && seenEmail.has(email)) { skipped++; return; }
        if (phoneInfo) seenPhoneKey.add(phoneInfo.dedupKey);
        if (email) seenEmail.add(email);

        const empresa = cleanCompanyName(empresaCols.map((c) => String(r.raw[c] || "").trim()).find(Boolean) || "");
        const pessoa = cleanName(pessoaCols.map((c) => String(r.raw[c] || "").trim()).find(Boolean) || "");
        const cargo = cargoCols.map((c) => String(r.raw[c] || "").trim()).find(Boolean) || null;
        const cidade = cidadeCols.map((c) => String(r.raw[c] || "").trim()).find(Boolean) || null;
        const segmento = segmentoCols.map((c) => String(r.raw[c] || "").trim()).find(Boolean) || null;
        const nome_empresa = (empresa || pessoa || phone || email || "").toString().slice(0, 300);

        const cnpj = cnpjCols.map((c) => cleanCnpj(r.raw[c])).find(Boolean) || null;
        const site = siteCols.map((c) => String(r.raw[c] || "").trim()).find(Boolean) || null;
        const endereco = addrCols.map((c) => String(r.raw[c] || "").trim()).filter(Boolean).join(" · ") || null;

        const notesParts: string[] = [];
        if (isFixed) notesParts.push("Telefone fixo (não é WhatsApp)");
        notesCols.forEach((c) => {
          const v = String(r.raw[c] || "").trim();
          if (v) notesParts.push(`${c}: ${v}`);
        });
        const especialidades = notesParts.join(" | ") || null;

        // Fixo: não vai como WhatsApp — segmenta como "email/manual"
        const telefoneParaBanco = isFixed ? null : phone;

        const row: any = {
          user_id: user.id,
          nome_empresa,
          nome_contato: pessoa || null,
          cargo,
          cidade,
          segmento,
          telefone: telefoneParaBanco,
          email,
          cnpj,
          site,
          endereco,
          especialidades,
          disparo: "Não",
          email_disparo: "Não",
        };

        const key = telefoneParaBanco || `email:${email || phone}`;
        if (pessoa) pessoaByKey.set(key, pessoa);

        if (telefoneParaBanco) withPhone.push(row);
        else emailOnly.push(row);
      });

      const errors: string[] = [];
      let inserted = 0;
      const insertedRows: Array<{ id: string; nome_empresa: string | null; telefone: string | null; email: string | null }> = [];

      // 1) leads com telefone → upsert (telefone,user_id)
      for (let i = 0; i < withPhone.length; i += 500) {
        const chunk = withPhone.slice(i, i + 500);
        let q = (supabase as any)
          .from("leads")
          .upsert(chunk, { onConflict: "telefone,user_id", ignoreDuplicates: true });
        q = q.select("id, nome_empresa, telefone, email");
        const { data, error } = await q;
        if (error) errors.push(error.message);
        else {
          const arr = Array.isArray(data) ? data : [];
          inserted += arr.length;
          if (createPipeline) insertedRows.push(...arr);
        }
      }

      // 2) email-only: filtra existentes e insere
      if (emailOnly.length) {
        const allEmails = emailOnly.map((r) => r.email as string);
        const existing = new Set<string>();
        for (let i = 0; i < allEmails.length; i += 500) {
          const slice = allEmails.slice(i, i + 500);
          const { data } = await (supabase as any)
            .from("leads")
            .select("email")
            .eq("user_id", user.id)
            .in("email", slice);
          (data ?? []).forEach((r: any) => r.email && existing.add(String(r.email).toLowerCase()));
        }
        const toInsertEmail = emailOnly.filter((r) => !existing.has(String(r.email).toLowerCase()));
        skipped += emailOnly.length - toInsertEmail.length;
        for (let i = 0; i < toInsertEmail.length; i += 500) {
          const chunk = toInsertEmail.slice(i, i + 500);
          let q = (supabase as any).from("leads").insert(chunk).select("id, nome_empresa, telefone, email");
          const { data, error } = await q;
          if (error) errors.push(error.message);
          else {
            const arr = Array.isArray(data) ? data : [];
            inserted += arr.length || chunk.length;
            if (createPipeline) insertedRows.push(...arr);
          }
        }
      }

      // 3) pipeline_cards (opcional) — dedup por source_id
      let pipelineCreated = 0;
      if (createPipeline && insertedRows.length) {
        const ids = insertedRows.map((r) => r.id);
        const alreadyLinked = new Set<string>();
        for (let i = 0; i < ids.length; i += 500) {
          const slice = ids.slice(i, i + 500);
          const { data } = await (supabase as any)
            .from("pipeline_cards")
            .select("source_id")
            .eq("user_id", user.id)
            .eq("source_table", "leads")
            .in("source_id", slice);
          (data ?? []).forEach((r: any) => r.source_id && alreadyLinked.add(String(r.source_id)));
        }

        const cards = insertedRows
          .filter((r) => !alreadyLinked.has(String(r.id)))
          .map((r) => {
            const key = r.telefone || `email:${r.email}`;
            return {
              user_id: user.id,
              nome_empresa: r.nome_empresa || r.telefone || r.email || "Sem nome",
              contato: pessoaByKey.get(key) ?? null,
              telefone: r.telefone,
              email: r.email,
              estagio: "novo_lead",
              origem: "importacao",
              source_table: "leads",
              source_id: r.id,
            };
          });

        for (let i = 0; i < cards.length; i += 500) {
          const chunk = cards.slice(i, i + 500);
          const { error, data } = await (supabase as any)
            .from("pipeline_cards")
            .insert(chunk)
            .select("id");
          if (error) errors.push(`pipeline: ${error.message}`);
          else pipelineCreated += (data?.length ?? chunk.length);
        }
      }

      setResult({ inserted, skipped, pipeline: pipelineCreated, errors });
      setStep("done");
      onDone?.();
    } catch (e: any) {
      toast({ title: "Erro ao importar", description: e.message, variant: "destructive" });
      setStep("map");
    } finally { setImporting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setTimeout(reset, 300); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" /> Importar contatos
          </DialogTitle>
          <DialogDescription>
            CSV, XLSX ou TXT. Detectamos as colunas automaticamente, validamos telefones/e-mails brasileiros e ignoramos duplicados.
          </DialogDescription>
        </DialogHeader>

        {step === "pick" && (
          <div className="space-y-4">
            <label className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-primary transition">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="font-medium">Clique para escolher o arquivo</span>
              <span className="text-xs text-muted-foreground">.xlsx, .xls, .csv, .txt, .md — qualquer estrutura</span>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt,.md,.markdown,text/csv,text/plain,text/markdown,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </label>
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> Detecção inteligente: encontra telefone, e-mail, nome, empresa, cargo, cidade, segmento e CNPJ.</p>
              <p>📞 Telefones sem DDI recebem +55; sem o 9º dígito recebem o 9. Fixos entram como e-mail/manual (não como WhatsApp).</p>
              <p>📧 Leads apenas com e-mail também são aceitos (viram alvo de Campanhas de E-mail).</p>
              <p>📝 Bloco de notas (.txt / .md): um contato por linha ou tabela markdown com <code>|</code>.</p>
              <p>🔁 Duplicados (mesmo número com/sem 9, mesmo e-mail) são ignorados. Limite: {MAX_ROWS} linhas por importação.</p>
            </div>
          </div>
        )}

        {step === "map" && preview && (
          <div className="space-y-4">
            <div className="text-sm flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" /> <strong>{fileName}</strong>
              <Badge variant="outline">{rows.length} linhas</Badge>
            </div>

            <div className="grid gap-2">
              <Label className="text-xs uppercase text-muted-foreground">Como cada coluna deve ser importada</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                {headers.map((h) => (
                  <div key={h} className="flex items-center gap-2">
                    <Input value={h} readOnly className="h-8 text-xs bg-muted/40" />
                    <Select value={mapping[h] ?? "ignore"} onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v as Field }))}>
                      <SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(FIELD_LABEL) as Field[]).map((f) => (
                          <SelectItem key={f} value={f} className="text-xs">{FIELD_LABEL[f]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
              <div className="flex items-center gap-3 text-sm flex-wrap">
                <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {preview.ok} válidos
                </Badge>
                {preview.invalid > 0 && (
                  <Badge className="bg-rose-500/15 text-rose-300 border-rose-500/30 gap-1">
                    <AlertTriangle className="h-3 w-3" /> {preview.invalid} sem telefone nem e-mail (descartados)
                  </Badge>
                )}
                {preview.noName > 0 && (
                  <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30">
                    {preview.noName} sem nome (usará telefone/e-mail)
                  </Badge>
                )}
              </div>
              {preview.samples.length > 0 && (
                <div className="text-xs">
                  <p className="text-muted-foreground mb-1">Prévia:</p>
                  <div className="space-y-0.5 font-mono">
                    {preview.samples.map((s, i) => (
                      <div key={i} className="truncate">
                        <span className="text-primary">{s.telefone}</span> — {s.nome}
                        {s.email && <span className="text-muted-foreground"> · {s.email}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3 space-y-2 bg-primary/5 border-primary/20">
              <p className="text-xs text-muted-foreground">
                Os contatos entram na sua base e ficam disponíveis para <strong>Disparos WhatsApp</strong> e <strong>Campanhas de E-mail</strong> automaticamente.
              </p>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={createPipeline} onCheckedChange={(v) => setCreatePipeline(!!v)} />
                <span>Criar cards no Pipeline (CRM)</span>
              </label>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={reset}>Trocar arquivo</Button>
              <Button onClick={doImport} disabled={preview.ok === 0}>
                Importar {preview.ok} contatos
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "importing" && (
          <div className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importando contatos...</p>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 bg-emerald-500/10 border-emerald-500/30">
              <p className="font-semibold text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" /> {result.inserted} contatos importados
              </p>
              {result.pipeline > 0 && (
                <p className="text-xs text-emerald-200 mt-1">{result.pipeline} cards criados no Pipeline</p>
              )}
              {result.skipped > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {result.skipped} linhas descartadas (sem telefone/e-mail válido ou duplicadas)
                </p>
              )}
              {result.errors.length > 0 && (
                <p className="text-xs text-rose-300 mt-1">Erros: {result.errors.join("; ")}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Importar outro arquivo</Button>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
