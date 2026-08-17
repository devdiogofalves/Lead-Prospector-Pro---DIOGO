import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Rocket, Users, Search, Send, RefreshCw, Filter, CheckCircle2, Trash2,
  Brain, Pencil, FolderPlus, Folder, Tag, MapPin, Linkedin, Instagram,
  MessageCircle, Hash, Plus, X, Upload,
} from "lucide-react";
import ImportLeadsDialog from "@/components/leads/ImportLeadsDialog";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { translateInvokeError } from "@/lib/friendlyError";
import { useBranding } from "@/hooks/useBranding";

type Source = "maps" | "linkedin" | "instagram" | "whatsapp_group" | "instagram_hashtag";
type Status = "novo" | "contactado" | "respondeu" | "qualificado" | "perdido";

const SOURCE_META: Record<Source, { label: string; icon: any; color: string; table: string }> = {
  maps: { label: "Maps", icon: MapPin, color: "text-rose-300 border-rose-500/30 bg-rose-500/10", table: "leads" },
  linkedin: { label: "LinkedIn", icon: Linkedin, color: "text-blue-300 border-blue-500/30 bg-blue-500/10", table: "linkedin_contacts" },
  instagram: { label: "Instagram", icon: Instagram, color: "text-pink-300 border-pink-500/30 bg-pink-500/10", table: "instagram_contacts" },
  whatsapp_group: { label: "Grupo WA", icon: MessageCircle, color: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10", table: "whatsapp_group_leads" },
  instagram_hashtag: { label: "Hashtag IG", icon: Hash, color: "text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/10", table: "instagram_hashtag_leads" },
};

const STATUS_META: Record<Status, { label: string; color: string }> = {
  novo: { label: "Novo", color: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  contactado: { label: "Contactado", color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  respondeu: { label: "Respondeu", color: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  qualificado: { label: "Qualificado", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  perdido: { label: "Perdido", color: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
};

interface UnifiedLead {
  source_id: string;
  source: Source;
  user_id: string;
  nome: string;
  identificador: string | null;
  empresa: string | null;
  contexto: string | null;
  disparo: string | null;
  data_disparo: string | null;
  created_at: string;
  extra: any;
}

interface TagRow { id: string; name: string; color: string }
interface FolderRow { id: string; name: string; color: string; description: string | null }

const sb: any = supabase;
const keyOf = (l: { source: string; source_id: string }) => `${l.source}::${l.source_id}`;

export default function MeusLeads() {
  const { branding: __b } = useBranding(); const agent = __b.agent_name;
  const qc = useQueryClient();

  // Filtros
  const [search, setSearch] = useState("");
  const [activeSources, setActiveSources] = useState<Set<Source>>(new Set(Object.keys(SOURCE_META) as Source[]));
  const [activeStatus, setActiveStatus] = useState<Status | "all">("all");
  const [activeFolder, setActiveFolder] = useState<string | "all">("all");
  const [onlyPending, setOnlyPending] = useState(false);
  const [hidePrivateWA, setHidePrivateWA] = useState(true);

  // Seleção e modais
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [useMaviAi, setUseMaviAi] = useState(true);
  const [copy, setCopy] = useState("");
  const [detailLead, setDetailLead] = useState<UnifiedLead | null>(null);
  const [detailRaw, setDetailRaw] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);


  // Pastas: criar
  const [newFolderName, setNewFolderName] = useState("");
  const [newTagName, setNewTagName] = useState("");

  // ============ QUERIES ============
  const { data: leads = [], isFetching, refetch } = useQuery({
    queryKey: ["leads-unified"],
    queryFn: async (): Promise<UnifiedLead[]> => {
      // Fetch per-source so um canal com muitos leads (ex: grupos WA) não esconda os outros.
      const sources: Source[] = ["maps", "linkedin", "instagram", "whatsapp_group", "instagram_hashtag"];
      const results = await Promise.all(
        sources.map((s) =>
          sb.from("leads_unified")
            .select("*")
            .eq("source", s)
            .order("created_at", { ascending: false })
            .limit(1500)
        )
      );
      const all: UnifiedLead[] = [];
      results.forEach((r) => { if (!r.error && r.data) all.push(...r.data); });
      all.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      return all;
    },
  });

  const { data: tags = [] } = useQuery<TagRow[]>({
    queryKey: ["lead-tags"],
    queryFn: async () => {
      const { data, error } = await sb.from("lead_tags").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: folders = [] } = useQuery<FolderRow[]>({
    queryKey: ["lead-folders"],
    queryFn: async () => {
      const { data, error } = await sb.from("lead_folders").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: tagAssignments = [] } = useQuery<any[]>({
    queryKey: ["lead-tag-assignments"],
    queryFn: async () => {
      const { data, error } = await sb.from("lead_tag_assignments").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: folderItems = [] } = useQuery<any[]>({
    queryKey: ["lead-folder-items"],
    queryFn: async () => {
      const { data, error } = await sb.from("lead_folder_items").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: statuses = [] } = useQuery<any[]>({
    queryKey: ["lead-pipeline-status"],
    queryFn: async () => {
      const { data, error } = await sb.from("lead_pipeline_status").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Mapas auxiliares (chave: source::source_id)
  const tagsByLead = useMemo(() => {
    const m = new Map<string, TagRow[]>();
    const tById = new Map(tags.map((t) => [t.id, t]));
    tagAssignments.forEach((a) => {
      const k = `${a.source}::${a.source_id}`;
      const t = tById.get(a.tag_id);
      if (!t) return;
      const arr = m.get(k) ?? [];
      arr.push(t); m.set(k, arr);
    });
    return m;
  }, [tagAssignments, tags]);

  const foldersByLead = useMemo(() => {
    const m = new Map<string, FolderRow[]>();
    const fById = new Map(folders.map((f) => [f.id, f]));
    folderItems.forEach((it) => {
      const k = `${it.source}::${it.source_id}`;
      const f = fById.get(it.folder_id);
      if (!f) return;
      const arr = m.get(k) ?? [];
      arr.push(f); m.set(k, arr);
    });
    return m;
  }, [folderItems, folders]);

  const statusByLead = useMemo(() => {
    const m = new Map<string, any>();
    statuses.forEach((s) => m.set(`${s.source}::${s.source_id}`, s));
    return m;
  }, [statuses]);

  // ============ FILTRO ============
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (!activeSources.has(l.source as Source)) return false;
      if (onlyPending && l.disparo === "Sim") return false;
      const k = keyOf(l);
      if (activeStatus !== "all") {
        const st = statusByLead.get(k)?.status ?? "novo";
        if (st !== activeStatus) return false;
      }
      if (activeFolder !== "all") {
        const fs = foldersByLead.get(k) ?? [];
        if (!fs.some((f) => f.id === activeFolder)) return false;
      }
      // Esconde leads de grupo WA sem telefone real (apenas @lid privacy id)
      if (hidePrivateWA && l.source === "whatsapp_group" && l.extra?.private_only) return false;
      if (!q) return true;
      return (
        (l.nome || "").toLowerCase().includes(q) ||
        (l.identificador || "").toLowerCase().includes(q) ||
        (l.empresa || "").toLowerCase().includes(q) ||
        (l.contexto || "").toLowerCase().includes(q)
      );
    });
  }, [leads, search, activeSources, activeStatus, activeFolder, onlyPending, hidePrivateWA, statusByLead, foldersByLead]);

  // Contagem por canal
  const sourceCounts = useMemo(() => {
    const c: Record<Source, number> = {
      maps: 0, linkedin: 0, instagram: 0, whatsapp_group: 0, instagram_hashtag: 0,
    };
    leads.forEach((l) => { c[l.source as Source] = (c[l.source as Source] ?? 0) + 1; });
    return c;
  }, [leads]);

  // Contagem por pasta
  const folderCounts = useMemo(() => {
    const c = new Map<string, number>();
    folderItems.forEach((it) => c.set(it.folder_id, (c.get(it.folder_id) ?? 0) + 1));
    return c;
  }, [folderItems]);

  // ============ AÇÕES ============
  const toggleSource = (s: Source) => {
    setActiveSources((set) => {
      const n = new Set(set);
      n.has(s) ? n.delete(s) : n.add(s);
      return n;
    });
  };

  const toggleSelect = (k: string) =>
    setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const toggleAll = () =>
    setSelected((s) => s.size === filtered.length ? new Set() : new Set(filtered.map(keyOf)));

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["leads-unified"] });
    qc.invalidateQueries({ queryKey: ["lead-tag-assignments"] });
    qc.invalidateQueries({ queryKey: ["lead-folder-items"] });
    qc.invalidateQueries({ queryKey: ["lead-pipeline-status"] });
  };

  // ---- Criar pasta/tag ----
  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await sb.from("lead_folders").insert({ user_id: user.id, name: newFolderName.trim() });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setNewFolderName("");
    qc.invalidateQueries({ queryKey: ["lead-folders"] });
    toast({ title: "Pasta criada" });
  };

  const deleteFolder = async (id: string) => {
    if (!confirm("Apagar esta pasta? (os leads continuam no banco)")) return;
    const { error } = await sb.from("lead_folders").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    if (activeFolder === id) setActiveFolder("all");
    qc.invalidateQueries({ queryKey: ["lead-folders"] });
    qc.invalidateQueries({ queryKey: ["lead-folder-items"] });
  };

  const createTag = async () => {
    if (!newTagName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await sb.from("lead_tags").insert({ user_id: user.id, name: newTagName.trim() });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setNewTagName("");
    qc.invalidateQueries({ queryKey: ["lead-tags"] });
  };

  // ---- Bulk: tag, pasta, status ----
  const bulkAddTag = async (tagId: string) => {
    if (!selected.size) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const rows = filtered.filter((l) => selected.has(keyOf(l))).map((l) => ({
      user_id: user.id, tag_id: tagId, source: l.source, source_id: l.source_id,
    }));
    const { error } = await sb.from("lead_tag_assignments").upsert(rows, { onConflict: "tag_id,source,source_id" });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["lead-tag-assignments"] });
    toast({ title: `Tag adicionada a ${rows.length} leads` });
  };

  const bulkAddToFolder = async (folderId: string) => {
    if (!selected.size) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const rows = filtered.filter((l) => selected.has(keyOf(l))).map((l) => ({
      user_id: user.id, folder_id: folderId, source: l.source, source_id: l.source_id,
    }));
    const { error } = await sb.from("lead_folder_items").upsert(rows, { onConflict: "folder_id,source,source_id" });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["lead-folder-items"] });
    toast({ title: `${rows.length} leads movidos pra pasta` });
  };

  const setStatusFor = async (lead: UnifiedLead, status: Status) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await sb.from("lead_pipeline_status").upsert(
      { user_id: user.id, source: lead.source, source_id: lead.source_id, status },
      { onConflict: "source,source_id" }
    );
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["lead-pipeline-status"] });
  };

  // ---- Dispatch (mesma lógica de antes, agora via view) ----
  const openDispatch = () => {
    if (!selected.size) return toast({ title: "Selecione pelo menos 1 lead", variant: "destructive" });
    setUseMaviAi(true); setCopy(""); setDispatchOpen(true);
  };

  const confirmDispatch = async () => {
    setDispatching(true);
    try {
      const chosenAll = filtered.filter((l) => selected.has(keyOf(l)));
      const useCustom = !useMaviAi && copy.trim().length > 0;
      // Roteia canal por source. LinkedIn → cadência DM nativa (não WhatsApp).
      const channelOf = (src: string) =>
        src === "linkedin" ? "linkedin"
        : src === "instagram" || src === "instagram_hashtag" ? "instagram"
        : "whatsapp";
      // Guarda: canais que exigem telefone (whatsapp) — filtrar leads sem número.
      const chosen = chosenAll.filter((l) => {
        const ch = channelOf(l.source);
        if (ch === "whatsapp") return !!(l.identificador && l.identificador.trim());
        return true;
      });
      const skipped = chosenAll.length - chosen.length;
      if (skipped > 0) {
        toast({ title: `${skipped} lead(s) sem telefone ignorados` });
      }
      if (!chosen.length) {
        toast({ title: "Nenhum lead com telefone válido para disparo", variant: "destructive" });
        setDispatching(false);
        return;
      }
      const leadsPayload = chosen.map((l) => {
        const ex: any = l.extra || {};
        return {
          source: l.source, source_id: l.source_id,
          channel: channelOf(l.source),
          nome_empresa: l.empresa || l.nome,
          nome_contato: ex.nome_contato || ex.nome || (l.source !== "maps" ? l.nome : null) || null,
          cargo: ex.cargo || null,
          cidade: ex.cidade || ex.localizacao || null,
          segmento: ex.segmento || null,
          telefone: l.identificador || "",
          especialidades: l.contexto || "",
          mensagem: useCustom ? copy.replace(/\{nome\}/gi, (l.nome || "").split(" ")[0] || "tudo bem") : null,
        };
      });
      const { data, error } = await supabase.functions.invoke("dispatch-enqueue", { body: { leads: leadsPayload } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      // Marca disparo na tabela origem APENAS para canais que enfileiraram no
      // dispatch_queue (WhatsApp/Instagram/etc). LinkedIn entra em cadência e é gerenciado
      // pelo linkedin-cadence-worker via cadencia_status/etapa_atual.
      const bySource: Record<string, string[]> = {};
      chosen.forEach((l) => {
        if (channelOf(l.source) !== "linkedin") {
          (bySource[l.source] ||= []).push(l.source_id);
        }
      });
      for (const [src, ids] of Object.entries(bySource)) {
        const tbl = SOURCE_META[src as Source]?.table;
        if (!tbl || !ids.length) continue;
        await sb.from(tbl).update({ disparo: "Sim", data_disparo: new Date().toISOString() }).in("id", ids);
      }

      const d = (data as any) || {};
      const parts: string[] = [];
      const unipileQueued = Number(d.unipile_queued ?? 0);
      const totalQueued = Number(d.queued ?? 0);
      const whatsappQueued = Math.max(0, totalQueued - unipileQueued);
      if (whatsappQueued) parts.push(`${whatsappQueued} WhatsApp na fila`);
      if (unipileQueued) parts.push(`${unipileQueued} multicanal na fila`);
      if (d.linkedin_cadence_activated) parts.push(`${d.linkedin_cadence_activated} LinkedIn em cadência DM`);
      toast({
        title: parts.length ? parts.join(" · ") : `${chosen.length} lead(s) processados`,
        description: d.eta ? `Último envio: ${new Date(d.eta).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "",
      });
      setSelected(new Set());
      setDispatchOpen(false);
      refreshAll();
    } catch (e: any) {
      toast({ title: "Erro ao disparar", description: translateInvokeError(e, `Disparo ${agent}`), variant: "destructive" });
    } finally { setDispatching(false); }
  };

  // ---- Apagar ----
  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      const chosen = filtered.filter((l) => selected.has(keyOf(l)));
      const bySource: Record<string, string[]> = {};
      chosen.forEach((l) => { (bySource[l.source] ||= []).push(l.source_id); });
      for (const [src, ids] of Object.entries(bySource)) {
        const tbl = SOURCE_META[src as Source]?.table;
        if (!tbl) continue;
        await sb.from(tbl).delete().in("id", ids);
      }
      toast({ title: `${chosen.length} lead(s) apagado(s)` });
      setSelected(new Set()); setConfirmBulkDelete(false);
      refreshAll();
    } catch (e: any) {
      toast({ title: "Erro ao apagar", description: translateInvokeError(e, "Apagar leads"), variant: "destructive" });
    } finally { setDeleting(false); }
  };

  // ---- Detalhe ----
  const openDetail = async (l: UnifiedLead) => {
    setDetailLead(l); setDetailRaw(null); setDetailLoading(true);
    try {
      const tbl = SOURCE_META[l.source]?.table;
      if (!tbl) return;
      const { data } = await sb.from(tbl).select("*").eq("id", l.source_id).maybeSingle();
      setDetailRaw(data);
    } finally { setDetailLoading(false); }
  };

  // ============ RENDER ============
  return (
    <div className="container mx-auto p-4 lg:p-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Meus Leads <span className="text-base font-normal text-muted-foreground">— banco mestre multicanal</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Maps · LinkedIn · Instagram · Grupos WA · Hashtags. Organize em pastas, etiquete e dispare.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="default" size="sm" onClick={() => setImportOpen(true)} className="gap-1">
            <Upload className="h-4 w-4" /> Importar planilha
          </Button>
          <Button asChild variant="outline" size="sm"><Link to="/">Buscar mais leads</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/pipeline">Pipeline CRM</Link></Button>
        </div>
      </div>

      <ImportLeadsDialog open={importOpen} onOpenChange={setImportOpen} onDone={refreshAll} />


      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
        {/* ===== Sidebar Pastas ===== */}
        <Card className="h-fit sticky top-4">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2"><Folder className="h-4 w-4" /> Pastas</h3>
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-6 w-6"><FolderPlus className="h-3.5 w-3.5" /></Button>
                </PopoverTrigger>
                <PopoverContent className="w-64">
                  <div className="space-y-2">
                    <Label className="text-xs">Nome da pasta</Label>
                    <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Ex: Núcleo Automação" onKeyDown={(e) => e.key === "Enter" && createFolder()} />
                    <Button size="sm" className="w-full" onClick={createFolder}>Criar</Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </CardHeader>
          <CardContent className="p-2 space-y-0.5">
            <button
              onClick={() => setActiveFolder("all")}
              className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between ${
                activeFolder === "all" ? "bg-primary/15 text-primary" : "hover:bg-muted/50"
              }`}
            >
              <span>Todos</span>
              <span className="text-xs text-muted-foreground">{leads.length}</span>
            </button>
            {folders.map((f) => (
              <div key={f.id} className="group flex items-center gap-1">
                <button
                  onClick={() => setActiveFolder(f.id)}
                  className={`flex-1 text-left px-2 py-1.5 rounded text-sm flex items-center justify-between ${
                    activeFolder === f.id ? "bg-primary/15 text-primary" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Folder className="h-3.5 w-3.5" style={{ color: f.color }} />
                    <span className="truncate">{f.name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{folderCounts.get(f.id) ?? 0}</span>
                </button>
                <button
                  onClick={() => deleteFolder(f.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition"
                  title="Apagar pasta"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {!folders.length && (
              <p className="text-xs text-muted-foreground px-2 py-2">
                Sem pastas. Crie uma pra agrupar leads (ex: "Campanha Maio").
              </p>
            )}
          </CardContent>
        </Card>

        {/* ===== Lista principal ===== */}
        <div className="space-y-3 min-w-0">
          {/* Filtros canal */}
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SOURCE_META) as Source[]).map((s) => {
              const M = SOURCE_META[s]; const Icon = M.icon;
              const on = activeSources.has(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleSource(s)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition ${
                    on ? M.color : "border-border text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <Icon className="h-3 w-3" /> {M.label}
                  <span className="text-[10px] opacity-70">{sourceCounts[s] ?? 0}</span>
                </button>
              );
            })}
          </div>

          {/* Search + filtros */}
          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar por nome, telefone, empresa..." value={search}
                    onChange={(e) => setSearch(e.target.value)} className="pl-8" />
                </div>
                <Select value={activeStatus} onValueChange={(v) => setActiveStatus(v as any)}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    {(Object.keys(STATUS_META) as Status[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant={onlyPending ? "default" : "outline"} onClick={() => setOnlyPending((v) => !v)}>
                  <Filter className="h-4 w-4 mr-1" /> Pendentes
                </Button>
                <Button size="sm" variant={hidePrivateWA ? "default" : "outline"} onClick={() => setHidePrivateWA((v) => !v)} title="Esconde leads de grupo WhatsApp sem número real (@lid)">
                  {hidePrivateWA ? "🙈 @lid ocultos" : "👁 @lid visíveis"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
              </div>

              {/* Barra de ações */}
              <div className="flex items-center justify-between border-t pt-2">
                <div className="flex items-center gap-3 text-sm">
                  <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
                  <span className="text-muted-foreground">
                    {selected.size > 0 ? `${selected.size} selecionado(s)` : `${filtered.length} leads`}
                  </span>
                  {selected.size > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar</Button>
                  )}
                </div>
                {selected.size > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Bulk Tag */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1"><Tag className="h-3.5 w-3.5" /> Tag</Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64">
                        <div className="space-y-2">
                          <div className="flex gap-1">
                            <Input value={newTagName} onChange={(e) => setNewTagName(e.target.value)}
                              placeholder="Nova tag..." className="h-8 text-sm" onKeyDown={(e) => e.key === "Enter" && createTag()} />
                            <Button size="icon" className="h-8 w-8" onClick={createTag}><Plus className="h-3.5 w-3.5" /></Button>
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-0.5">
                            {tags.map((t) => (
                              <button key={t.id} onClick={() => bulkAddTag(t.id)}
                                className="w-full text-left px-2 py-1 hover:bg-muted/50 rounded text-sm flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full" style={{ background: t.color }} /> {t.name}
                              </button>
                            ))}
                            {!tags.length && <p className="text-xs text-muted-foreground px-2">Crie sua 1ª tag acima</p>}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    {/* Bulk Folder */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1"><Folder className="h-3.5 w-3.5" /> Pasta</Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64">
                        <div className="max-h-48 overflow-y-auto space-y-0.5">
                          {folders.map((f) => (
                            <button key={f.id} onClick={() => bulkAddToFolder(f.id)}
                              className="w-full text-left px-2 py-1 hover:bg-muted/50 rounded text-sm flex items-center gap-2">
                              <Folder className="h-3.5 w-3.5" style={{ color: f.color }} /> {f.name}
                            </button>
                          ))}
                          {!folders.length && <p className="text-xs text-muted-foreground px-2">Crie uma pasta na lateral</p>}
                        </div>
                      </PopoverContent>
                    </Popover>

                    <Button variant="outline" size="sm" onClick={() => setConfirmBulkDelete(true)}
                      className="gap-1 text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" /> Apagar
                    </Button>
                    <Button size="sm" onClick={openDispatch} className="gap-1">
                      <Rocket className="h-3.5 w-3.5" /> Disparar
                    </Button>
                  </div>
                )}
              </div>

              {/* Lista */}
              <div className="space-y-1 max-h-[65vh] overflow-auto">
                {isFetching && <Skeleton className="h-16" />}
                {!isFetching && !filtered.length && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    Nenhum lead. <Link to="/" className="text-primary underline">Buscar agora</Link>
                  </div>
                )}
                {filtered.map((l) => {
                  const k = keyOf(l);
                  const isSel = selected.has(k);
                  const M = SOURCE_META[l.source]; const Icon = M.icon;
                  const st = (statusByLead.get(k)?.status ?? "novo") as Status;
                  const stM = STATUS_META[st];
                  const lTags = tagsByLead.get(k) ?? [];
                  const lFolders = foldersByLead.get(k) ?? [];
                  return (
                    <div key={k} onClick={() => openDetail(l)}
                      className={`flex items-start gap-3 p-2.5 rounded-md border cursor-pointer transition-colors ${
                        isSel ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      }`}>
                      <div onClick={(e) => e.stopPropagation()} className="pt-1">
                        <Checkbox checked={isSel} onCheckedChange={() => toggleSelect(k)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${M.color}`}>
                            <Icon className="h-3 w-3" /> {M.label}
                          </span>
                          <span className="font-medium truncate">{l.nome || "—"}</span>
                          <Badge variant="outline" className={`text-[10px] ${stM.color}`}>{stM.label}</Badge>
                          {l.disparo === "Sim" && (
                            <Badge variant="secondary" className="text-[10px] gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Disparado
                            </Badge>
                          )}
                          {lTags.map((t) => (
                            <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded-full border"
                              style={{ borderColor: t.color, color: t.color }}>
                              {t.name}
                            </span>
                          ))}
                          {lFolders.map((f) => (
                            <span key={f.id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/40 flex items-center gap-1">
                              <Folder className="h-2.5 w-2.5" style={{ color: f.color }} /> {f.name}
                            </span>
                          ))}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {l.identificador || "—"} · {l.empresa || l.contexto || ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== Dispatch Dialog ===== */}
      <Dialog open={dispatchOpen} onOpenChange={setDispatchOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" /> Disparo ({selected.size} lead(s))
            </DialogTitle>
            <DialogDescription>
              Padrão: {agent} gera a abertura SPIN com base no seu briefing + Aprendizado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <button type="button" onClick={() => setUseMaviAi(true)}
                className={`flex-1 flex items-center gap-2 rounded-md border p-3 text-left text-sm ${
                  useMaviAi ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
                }`}>
                <Brain className="h-4 w-4 text-primary" />
                <div><div className="font-medium">{agent} inteligente</div>
                  <div className="text-xs text-muted-foreground">IA gera por lead</div></div>
              </button>
              <button type="button" onClick={() => setUseMaviAi(false)}
                className={`flex-1 flex items-center gap-2 rounded-md border p-3 text-left text-sm ${
                  !useMaviAi ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
                }`}>
                <Pencil className="h-4 w-4 text-primary" />
                <div><div className="font-medium">Mensagem fixa</div>
                  <div className="text-xs text-muted-foreground">Mesma cópia (ignora IA)</div></div>
              </button>
            </div>
            {!useMaviAi && (
              <div className="space-y-2">
                <Label>Mensagem fixa (use {"{nome}"})</Label>
                <Textarea value={copy} onChange={(e) => setCopy(e.target.value)} rows={5} placeholder="Olá {nome}..." />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispatchOpen(false)} disabled={dispatching}>Cancelar</Button>
            <Button onClick={confirmDispatch} disabled={dispatching || (!useMaviAi && !copy.trim())} className="gap-2">
              <Send className="h-4 w-4" /> {dispatching ? "Enfileirando..." : "Disparar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Detail Dialog ===== */}
      <Dialog open={!!detailLead} onOpenChange={(o) => { if (!o) { setDetailLead(null); setDetailRaw(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {detailLead?.nome || "Detalhes"}
            </DialogTitle>
            <DialogDescription>
              {detailLead && SOURCE_META[detailLead.source]?.label} · {detailLead?.identificador || "—"}
            </DialogDescription>
          </DialogHeader>

          {detailLead && (
            <div className="border rounded-md p-3 space-y-2 bg-muted/20">
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-xs">Status:</Label>
                <Select value={statusByLead.get(keyOf(detailLead))?.status ?? "novo"}
                  onValueChange={(v) => setStatusFor(detailLead, v as Status)}>
                  <SelectTrigger className="h-7 text-xs w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_META) as Status[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <Label className="text-xs">Tags:</Label>
                {(tagsByLead.get(keyOf(detailLead)) ?? []).map((t) => (
                  <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded-full border"
                    style={{ borderColor: t.color, color: t.color }}>{t.name}</span>
                ))}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-6 w-6"><Plus className="h-3 w-3" /></Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56">
                    {tags.map((t) => (
                      <button key={t.id} onClick={async () => {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user || !detailLead) return;
                        await sb.from("lead_tag_assignments").upsert({
                          user_id: user.id, tag_id: t.id, source: detailLead.source, source_id: detailLead.source_id
                        }, { onConflict: "tag_id,source,source_id" });
                        qc.invalidateQueries({ queryKey: ["lead-tag-assignments"] });
                      }} className="w-full text-left px-2 py-1 hover:bg-muted/50 rounded text-sm">{t.name}</button>
                    ))}
                    {!tags.length && <p className="text-xs text-muted-foreground p-2">Sem tags. Crie pelo botão Tag acima.</p>}
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <Label className="text-xs">Pastas:</Label>
                {(foldersByLead.get(keyOf(detailLead)) ?? []).map((f) => (
                  <span key={f.id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/40 flex items-center gap-1">
                    <Folder className="h-2.5 w-2.5" style={{ color: f.color }} /> {f.name}
                  </span>
                ))}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-6 w-6"><Plus className="h-3 w-3" /></Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56">
                    {folders.map((f) => (
                      <button key={f.id} onClick={async () => {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user || !detailLead) return;
                        await sb.from("lead_folder_items").upsert({
                          user_id: user.id, folder_id: f.id, source: detailLead.source, source_id: detailLead.source_id
                        }, { onConflict: "folder_id,source,source_id" });
                        qc.invalidateQueries({ queryKey: ["lead-folder-items"] });
                      }} className="w-full text-left px-2 py-1 hover:bg-muted/50 rounded text-sm">{f.name}</button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto pr-2 mt-2">
            {detailLoading && <Skeleton className="h-32" />}
            {!detailLoading && detailRaw && (
              <div className="grid grid-cols-1 gap-1.5 text-sm">
                {Object.entries(detailRaw)
                  .filter(([k, v]) => v !== null && v !== "" && !["id", "user_id", "created_at", "updated_at"].includes(k))
                  .map(([k, v]) => (
                    <div key={k} className="flex flex-col sm:flex-row gap-1 sm:gap-3 border-b border-border/40 pb-1.5">
                      <span className="text-xs font-medium text-muted-foreground sm:w-36 uppercase">{k.replace(/_/g, " ")}</span>
                      <span className="text-sm break-words flex-1">
                        {typeof v === "object" ? <pre className="text-[11px] font-mono whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre> : String(v)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <DialogFooter className="border-t pt-3">
            <Button variant="outline" onClick={() => { setDetailLead(null); setDetailRaw(null); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar {selected.size} lead(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove os leads selecionados de suas tabelas de origem. Não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90">
              {deleting ? "Apagando..." : "Apagar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
