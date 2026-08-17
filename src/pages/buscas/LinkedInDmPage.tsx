import { useEffect, useMemo, useState } from "react";
import { Send, Linkedin, Loader2, Copy, CheckCircle2, ExternalLink, RefreshCw,
  MessageSquare, Users, Clock, Zap, Search, Plus, ChevronLeft, ChevronRight, Bot, Play } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUserApiKeys, useUserIntegrations } from "@/hooks/useUserApiKeys";
import { Switch } from "@/components/ui/switch";
import { useLinkedInContacts, LinkedInContact } from "@/hooks/useLinkedInContacts";
import { useQueryClient } from "@tanstack/react-query";
import { translateInvokeError } from "@/lib/friendlyError";
import { Link } from "react-router-dom";

type Etapa = "conexao" | "primeira" | "followup1" | "followup2" | "encerramento";

const ETAPAS: { value: Etapa; label: string; days: string; desc: string }[] = [
  { value: "conexao",      label: "Nota de Conexão",    days: "D+0",  desc: "Convite (até 300 chars)" },
  { value: "primeira",     label: "1ª Mensagem",         days: "D+0",  desc: "Após aceitar conexão" },
  { value: "followup1",    label: "Follow-up",           days: "D+7",  desc: "Sem resposta" },
  { value: "followup2",    label: "Diagnóstico grátis",  days: "D+14", desc: "Reativar interesse" },
  { value: "encerramento", label: "Encerramento",        days: "D+21", desc: "Fechar ciclo" },
];

const FALLBACK: Record<Etapa, (c: LinkedInContact) => string> = {
  conexao:      (c) => `Vi que você atua ${c.cargo ? `como ${c.cargo}` : "na área"} em ${c.empresa ?? "sua empresa"} — setor com desafios interessantes de gestão. Faria sentido trocar uma ideia?`,
  primeira:     (c) => `Olá ${c.nome.split(" ")[0]}, obrigado por conectar!\n\nVejo que você cuida da área financeira em ${c.empresa ?? "sua empresa"}. Curiosidade: hoje vocês têm alguma operação estruturada de recuperação de inadimplência, ou ainda é algo mais manual?`,
  followup1:    (c) => `Oi ${c.nome.split(" ")[0]}, uma reflexão que ouço bastante no setor: cobrança manual rouba tempo do financeiro que deveria estar em outras frentes.\n\nAcontece aí em ${c.empresa ?? "sua empresa"}?`,
  followup2:    (c) => `Oi ${c.nome.split(" ")[0]}!\n\nQuando títulos passam de D+90, o impacto não é só caixa — costuma travar planejamento de Q+1 também. Você consegue dimensionar quanto isso pesa em ${c.empresa ?? "sua empresa"} hoje?`,
  encerramento: (c) => `Oi ${c.nome.split(" ")[0]}, entendo que prioridades mudam e o timing pode não ser ideal agora.\n\nFica o contato: se a questão de inadimplência surgir como prioridade, é só me chamar por aqui. Sucesso nos projetos! 👋`,
};

interface DMState { loading: boolean; mensagem: string; sent: boolean; error: string | null; usedFallback?: boolean; fallbackReason?: string; }

export default function LinkedInDmPage() {
  const { get } = useUserApiKeys();
  const unipile = get("unipile");
  // Toggle global de cadência automática LinkedIn — controlado pela coluna
  // user_integrations.linkedin_cadence_enabled (migration 20260521120000).
  // Quando false (default), o linkedin-cadence-worker pula este usuário no
  // cron hourly mesmo que existam contatos com cadencia_status='active'.
  const { integration, save: saveIntegration } = useUserIntegrations();
  const cadenceEnabled = !!(integration as any)?.linkedin_cadence_enabled;
  const { contacts, isLoading } = useLinkedInContacts();
  const queryClient = useQueryClient();

  // ── Busca Automática de leads LinkedIn (via Unipile) ───────────────────
  // 100% Unipile: usa a própria sessão LinkedIn conectada (não consome
  // crédito Apify). Loop nos termos → linkedin-dm action=search → save em
  // linkedin_contacts. Opcionalmente já inicia a cadência (convite + SPIN).
  const [autoLoaded, setAutoLoaded] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoSettings, setAutoSettings] = useState({
    enabled: false,
    frequency_hours: 24,
    max_leads_per_run: 20,
    run_linkedin: true,
    auto_socio_linkedin: false,
    auto_socio_linkedin_start_cadence: false,
    linkedin_search_terms: [] as string[],
    last_run_at: null as string | null,
    next_run_at: null as string | null,
  });
  const [termsDraft, setTermsDraft] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAutoLoaded(true); return; }
      const { data } = await supabase.from("automation_settings" as any)
        .select("*").eq("user_id", user.id).maybeSingle();
      if (data) {
        setAutoSettings((s) => ({ ...s, ...(data as any) }));
        setTermsDraft(((data as any).linkedin_search_terms ?? []).join(", "));
      }
      setAutoLoaded(true);
    })();
  }, []);

  async function persistAuto(patch: Partial<typeof autoSettings>) {
    setAutoSettings((s) => ({ ...s, ...patch }));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("automation_settings" as any)
      .upsert({ user_id: user.id, ...patch } as any, { onConflict: "user_id" });
    if (error) toast.error(`Erro ao salvar: ${error.message}`);
  }

  async function runAutoNow() {
    if (!autoSettings.linkedin_search_terms.length) {
      toast.error("Adicione pelo menos um termo de busca (ex: CFO varejo, gerente financeiro).");
      return;
    }
    if (!unipile) {
      toast.error("Configure a API key do Unipile em Configurações antes de buscar.");
      return;
    }
    setAutoRunning(true);
    try {
      const terms = autoSettings.linkedin_search_terms;
      const limitPerTerm = Math.max(
        1,
        Math.ceil(autoSettings.max_leads_per_run / terms.length),
      );
      let totalFound = 0;
      let totalSaved = 0;
      const errors: string[] = [];
      for (const term of terms) {
        const { data: searchData, error: searchErr } = await supabase.functions.invoke(
          "linkedin-dm",
          { body: { action: "search", keywords: term, limit: limitPerTerm } },
        );
        if (searchErr) { errors.push(`${term}: ${searchErr.message}`); continue; }
        if (!searchData?.success) { errors.push(`${term}: ${searchData?.error ?? "falhou"}`); continue; }
        const profiles = searchData.profiles ?? [];
        totalFound += profiles.length;
        if (!profiles.length) continue;
        const { data: saveData, error: saveErr } = await supabase.functions.invoke(
          "linkedin-dm",
          { body: { action: "save", profiles } },
        );
        if (saveErr) { errors.push(`${term} (save): ${saveErr.message}`); continue; }
        if (saveData?.success) totalSaved += saveData.inserted ?? 0;
      }
      // Atualiza last_run_at manualmente já que não passamos pelo cron.
      await persistAuto({ last_run_at: new Date().toISOString() } as any);
      queryClient.invalidateQueries({ queryKey: ["linkedin_contacts"] });
      if (totalSaved > 0) {
        toast.success(`${totalSaved} novos perfis salvos (${totalFound} encontrados via Unipile).`);
      } else if (totalFound > 0) {
        toast.message(`${totalFound} perfis encontrados, nenhum novo para salvar.`);
      } else {
        toast.error(errors[0] ?? "Nenhum perfil retornado pelo Unipile.");
      }
    } catch (e: any) {
      toast.error(translateInvokeError(e, "Busca automática LinkedIn"));
    } finally {
      setAutoRunning(false);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const [etapa, setEtapa] = useState<Etapa>("primeira");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [selected, setSelected] = useState<LinkedInContact | null>(null);
  const [dm, setDm] = useState<DMState>({ loading: false, mensagem: "", sent: false, error: null });
  const [copied, setCopied] = useState(false);

  // Mode: "contacts" = from table, "manual" = free-form URL
  const [mode, setMode] = useState<"contacts" | "manual" | "search">("contacts");
  const [manualUrl, setManualUrl] = useState("");
  const [manualMsg, setManualMsg] = useState("");
  const [manualSending, setManualSending] = useState(false);

  // Search via Unipile
  const [searchKeywords, setSearchKeywords] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [searchApi, setSearchApi] = useState<"classic" | "sales_navigator">("classic");
  const [searchLimit, setSearchLimit] = useState(25);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [savingSel, setSavingSel] = useState(false);

  const total = contacts.length;
  const enviados = contacts.filter((c) => c.disparo === "Sim").length;
  const pendentes = total - enviados;

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.nome.toLowerCase().includes(q) ||
      (c.empresa ?? "").toLowerCase().includes(q) ||
      (c.cargo ?? "").toLowerCase().includes(q);
  });

  // Paginação: reseta ao mudar busca, e clampa quando contagem total mudar.
  useEffect(() => { setPage(1); }, [search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = useMemo(
    () => filtered.slice(pageStart, pageStart + PAGE_SIZE),
    [filtered, pageStart],
  );

  function openContact(c: LinkedInContact) {
    setSelected(c);
    setDm({ loading: false, mensagem: "", sent: false, error: null });
    setCopied(false);
  }

  async function generateMsg(c: LinkedInContact): Promise<{ mensagem: string; usedFallback?: boolean; fallbackReason?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-dm", {
        body: { action: "generate", contact_id: c.id, etapa },
      });
      if (error || !data?.mensagem) throw new Error("Falha na geração");
      return {
        mensagem: data.mensagem,
        usedFallback: data.used_fallback === true,
        fallbackReason: data.fallback_reason,
      };
    } catch {
      return { mensagem: FALLBACK[etapa](c), usedFallback: true, fallbackReason: "Edge function indisponível — usando fallback local." };
    }
  }

  async function handleGenerate() {
    if (!selected) return;
    setDm((s) => ({ ...s, loading: true, error: null }));
    const r = await generateMsg(selected);
    setDm({ loading: false, mensagem: r.mensagem, sent: false, error: null, usedFallback: r.usedFallback, fallbackReason: r.fallbackReason });
  }

  async function handleCadenceAction(
    contactId: string,
    action: "start_cadence" | "pause_cadence" | "resume_cadence" | "stop_cadence" | "mark_replied",
    label: string,
  ) {
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-dm", {
        body: { action, contact_id: contactId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha na ação de cadência");
      queryClient.invalidateQueries({ queryKey: ["linkedin_contacts"] });
      toast.success(label);
    } catch (e: any) {
      toast.error(translateInvokeError(e, "Cadência LinkedIn"));
    }
  }

  async function handleSend() {
    if (!selected || !dm.mensagem.trim()) return;
    if (!unipile) {
      setDm((s) => ({
        ...s,
        error: "Unipile não configurado. Copie a mensagem e envie manualmente no LinkedIn.",
      }));
      return;
    }
    setDm((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-dm", {
        body: {
          profile_url: selected.linkedin_url,
          message: dm.mensagem,
        },
      });
      if (error) throw error;
      if (!data?.success) {
        const errMsg: string = data?.error || "Falha no envio";
        // Fallback automático: se o LinkedIn recusou porque o lead NÃO é
        // conexão de 1º grau, em vez de erro a gente envia um convite de
        // conexão e inicia a cadência. Quando o lead aceitar, o webhook
        // unipile-relation-webhook agenda a 1ª mensagem automaticamente.
        const notConnected = /1º grau|first[- ]?degree|invalid_recipient|cannot be reached|not.*connect|subscription_required|Premium\/Sales/i.test(errMsg);
        if (notConnected && selected?.id) {
          toast.info("Lead não é conexão de 1º grau. Enviando nota de conexão e iniciando cadência…");
          const { data: inv, error: invErr } = await supabase.functions.invoke("linkedin-dm", {
            body: { action: "invite_and_start_cadence", contact_id: selected.id },
          });
          if (invErr) throw invErr;
          if (!inv?.success) throw new Error(inv?.error || "Falha ao enviar convite de conexão");
          await supabase.from("linkedin_contacts").update({
            updated_at: new Date().toISOString(),
          }).eq("id", selected.id);
          queryClient.invalidateQueries({ queryKey: ["linkedin_contacts"] });
          setDm((s) => ({ ...s, loading: false, sent: true }));
          toast.success(`Convite enviado para ${selected.nome}. A 1ª mensagem da cadência sai automaticamente quando ele aceitar.`);
          return;
        }
        throw new Error(errMsg);
      }
      // Update disparo in DB
      await supabase.from("linkedin_contacts").update({
        disparo: "Sim",
        data_disparo: new Date().toISOString(),
        mensagem: dm.mensagem,
        updated_at: new Date().toISOString(),
      }).eq("id", selected.id);
      queryClient.invalidateQueries({ queryKey: ["linkedin_contacts"] });
      setDm((s) => ({ ...s, loading: false, sent: true }));
      toast.success(`DM enviada para ${selected.nome}!`);
    } catch (e: any) {
      // Banner amber no modal recebe a mesma tradução amigável do toast.
      // Backend agora retorna 200 com success:false (não 502), então quando
      // chega aqui a mensagem já costuma vir do data?.error (mais específica).
      setDm((s) => ({ ...s, loading: false, error: translateInvokeError(e, "Envio DM LinkedIn") }));
    }
  }

  function copyMessage() {
    if (!dm.mensagem) return;
    navigator.clipboard.writeText(dm.mensagem);
    setCopied(true);
    toast.success("Copiado! Cole no LinkedIn.");
    setTimeout(() => setCopied(false), 3000);
  }

  async function manualSend() {
    if (!unipile) { toast.error("Configure a API Key do Unipile em Configurações → APIs."); return; }
    if (!manualUrl.trim() || !manualMsg.trim()) { toast.error("Preencha URL do perfil e mensagem."); return; }
    setManualSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-dm", {
        body: { profile_url: manualUrl.trim(), message: manualMsg.trim() },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha no envio");
      toast.success("Mensagem enviada via LinkedIn!");
      setManualMsg("");
    } catch (e: any) {
      toast.error(translateInvokeError(e, "Envio manual LinkedIn"));
    } finally {
      setManualSending(false);
    }
  }

  async function runSearch() {
    if (!unipile) { toast.error("Configure a API Key do Unipile em Configurações → APIs."); return; }
    if (!searchKeywords.trim() && !searchLocation.trim()) { toast.error("Informe palavras-chave ou localização."); return; }
    setSearching(true);
    setResults([]);
    setPicked(new Set());
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-dm", {
        body: { action: "search", keywords: searchKeywords.trim(), location: searchLocation.trim(), api: searchApi, limit: searchLimit },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha na busca");
      setResults(data.profiles ?? []);
      toast.success(`${data.profiles?.length ?? 0} perfis encontrados`);
    } catch (e: any) {
      toast.error(translateInvokeError(e, "Busca de perfis LinkedIn"));
    } finally {
      setSearching(false);
    }
  }

  function togglePick(idx: number) {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(idx)) n.delete(idx); else n.add(idx);
      return n;
    });
  }

  async function saveSelected(all: boolean) {
    const list = all ? results : results.filter((_, i) => picked.has(i));
    if (!list.length) { toast.error("Selecione ao menos um perfil"); return; }
    setSavingSel(true);
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-dm", {
        body: { action: "save", profiles: list },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha ao salvar");
      toast.success(`${data.inserted} perfis salvos em Meus Contatos`);
      queryClient.invalidateQueries({ queryKey: ["linkedin_contacts"] });
      setPicked(new Set());
    } catch (e: any) {
      toast.error(translateInvokeError(e, "Salvar perfis em Meus Contatos"));
    } finally {
      setSavingSel(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/20">
          <Linkedin className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">LinkedIn DM</h1>
          <p className="text-sm text-muted-foreground">
            Disparo humanizado por IA na cadência certa. Usa Unipile para envio automático ou gera a mensagem para copiar.
          </p>
        </div>
      </div>

      {/* Toggle global de cadência automática (D+0/D+7/D+14/D+21). Default
          desligado por segurança — operador liga depois de validar Unipile
          + nota de conexão + cadência configurada por contato. */}
      <div className="rounded-lg border bg-card p-4 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm">Cadência automática LinkedIn</span>
            {cadenceEnabled
              ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 font-medium">ATIVA</span>
              : <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border font-medium">DESLIGADA</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            Quando ligada, o worker roda a cada hora e dispara automaticamente as etapas D+0 / D+7 / D+14 / D+21 para contatos com cadência ativa (até 20 DMs/dia por conta, 15-45s entre cada). Quando desligada, só envios manuais (botão "Disparar" da lista).
          </p>
        </div>
        <Switch
          checked={cadenceEnabled}
          onCheckedChange={(checked) => {
            if (checked && !unipile) {
              toast.error("Configure o Unipile primeiro (Configurações → APIs).");
              return;
            }
            saveIntegration({ linkedin_cadence_enabled: checked });
          }}
          aria-label="Ligar cadência automática LinkedIn"
        />
      </div>

      {/* ── Busca Automática de Leads LinkedIn (Unipile) ─────────────────────
          Usa a própria sessão LinkedIn conectada via Unipile (action=search
          do edge linkedin-dm). NÃO usa Apify. Sem custo extra além do plano
          Unipile + da sessão LinkedIn do usuário. */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-4 w-4 text-primary" />
                Busca Automática de Leads (Unipile)
                {(autoSettings.enabled && autoSettings.run_linkedin)
                  ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 font-medium">ATIVA</span>
                  : <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border font-medium">DESLIGADA</span>}
              </CardTitle>
              <CardDescription>
                Busca perfis direto no LinkedIn pela sua sessão conectada no Unipile, usando os termos abaixo.
                {autoSettings.last_run_at && (
                  <span className="block mt-1 text-[11px]">
                    Última execução: {new Date(autoSettings.last_run_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    {autoSettings.next_run_at && ` · Próxima: ${new Date(autoSettings.next_run_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`}
                  </span>
                )}
              </CardDescription>
            </div>
            <Switch
              checked={autoSettings.enabled && autoSettings.run_linkedin}
              onCheckedChange={(v) => persistAuto({ enabled: v, run_linkedin: v } as any)}
              disabled={!autoLoaded}
              aria-label="Ligar busca automática"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Termos de busca LinkedIn (separados por vírgula)</Label>
            <Textarea
              rows={2}
              value={termsDraft}
              onChange={(e) => setTermsDraft(e.target.value)}
              onBlur={() => {
                const arr = termsDraft.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
                persistAuto({ linkedin_search_terms: arr });
              }}
              placeholder="CFO inadimplência, gerente financeiro varejo, diretor financeiro indústria..."
              className="text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Salva automaticamente ao sair do campo. Cada termo vira uma busca People no LinkedIn via Unipile.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Frequência (horas)</Label>
              <Input
                type="number" min={1} max={168}
                value={autoSettings.frequency_hours}
                onChange={(e) => setAutoSettings((s) => ({ ...s, frequency_hours: Number(e.target.value) || 24 }))}
                onBlur={() => persistAuto({ frequency_hours: autoSettings.frequency_hours })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Máx. leads por execução</Label>
              <Input
                type="number" min={1} max={200}
                value={autoSettings.max_leads_per_run}
                onChange={(e) => setAutoSettings((s) => ({ ...s, max_leads_per_run: Number(e.target.value) || 20 }))}
                onBlur={() => persistAuto({ max_leads_per_run: autoSettings.max_leads_per_run })}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={runAutoNow} disabled={autoRunning || !autoLoaded} className="flex-1">
              {autoRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              {autoRunning ? "Buscando…" : "Buscar agora"}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/automacao">Config. avançada</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Fase N: pre-flight banners (paralelo à Fase A do /disparo-humanizado).
          Ordem: bloqueante (vermelho) primeiro, depois warn (amber). */}
      {!unipile ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-start gap-2">
          <span className="mt-0.5">❌</span>
          <div className="flex-1">
            <strong>Unipile não configurado.</strong> Sem isso, LinkedIn DM funciona só em modo "copiar mensagem" — não envia automaticamente nem dispara cadências D+0/+7/+14/+21.
            <div className="mt-1 text-xs">
              Configure em <a href="/configuracoes" className="underline font-medium">Configurações → APIs</a>.
              Status geral em <a href="/saude" className="underline font-medium">Saúde do Sistema</a>.
            </div>
          </div>
        </div>
      ) : !(unipile?.extra as any)?.account_id ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm flex items-start gap-2">
          <span className="mt-0.5">⚠️</span>
          <div className="flex-1">
            <strong>LinkedIn ainda não conectado via OAuth.</strong> API key Unipile OK, mas <code>account_id</code> ausente — o endpoint de envio vai retornar 400.
            <div className="mt-1 text-xs">
              Vá em <a href="/configuracoes" className="underline font-medium">Configurações → APIs</a> e clique no botão "Conectar LinkedIn" do card Unipile.
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs flex items-center gap-2">
          <span>✓</span>
          <span>Unipile conectado. Cadências D+0/+7/+14/+21 disponíveis. <a href="/saude" className="underline text-muted-foreground">Checar saúde geral →</a></span>
        </div>
      )}

      {/* Mode selector */}
      <div className="flex gap-2">
        <Button variant={mode === "contacts" ? "default" : "outline"} size="sm" onClick={() => setMode("contacts")}>
          <Users className="h-4 w-4 mr-1" /> Meus Contatos
        </Button>
        <Button variant={mode === "search" ? "default" : "outline"} size="sm" onClick={() => setMode("search")}>
          <Search className="h-4 w-4 mr-1" /> Buscar Perfis
        </Button>
        <Button variant={mode === "manual" ? "default" : "outline"} size="sm" onClick={() => setMode("manual")}>
          <Send className="h-4 w-4 mr-1" /> Envio Manual
        </Button>
      </div>

      {mode === "search" ? (
        /* ─── MODO BUSCA UNIPILE ─── */
        <Card>
          <CardHeader>
            <CardTitle>Buscar perfis no LinkedIn (Unipile)</CardTitle>
            <CardDescription>
              Busca perfis usando sua conta LinkedIn conectada. Resultados podem ser salvos em Meus Contatos para iniciar a cadência.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Palavras-chave</Label>
                <Input value={searchKeywords} onChange={(e) => setSearchKeywords(e.target.value)}
                  placeholder="CFO inadimplência, gerente financeiro varejo..." />
              </div>
              <div className="space-y-1">
                <Label>Localização</Label>
                <Input value={searchLocation} onChange={(e) => setSearchLocation(e.target.value)}
                  placeholder="Brasil, São Paulo..." />
              </div>
              <div className="space-y-1">
                <Label>Tipo de busca</Label>
                <Select value={searchApi} onValueChange={(v) => setSearchApi(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="classic">LinkedIn People Search (padrão)</SelectItem>
                    <SelectItem value="sales_navigator">Sales Navigator (requer plano)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Limite (máx 50)</Label>
                <Input type="number" min={1} max={50} value={searchLimit}
                  onChange={(e) => setSearchLimit(Math.min(50, Math.max(1, Number(e.target.value) || 25)))} />
              </div>
            </div>
            <Button onClick={runSearch} disabled={searching} className="w-full">
              {searching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              {searching ? "Buscando..." : "Buscar"}
            </Button>

            {results.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {results.length} perfis · {picked.size} selecionados
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => saveSelected(false)} disabled={savingSel || picked.size === 0}>
                      <Plus className="h-3 w-3 mr-1" /> Salvar selecionados
                    </Button>
                    <Button size="sm" onClick={() => saveSelected(true)} disabled={savingSel}>
                      <Plus className="h-3 w-3 mr-1" /> Salvar todos
                    </Button>
                  </div>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Cargo / Empresa</TableHead>
                        <TableHead>Localização</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((p, i) => (
                        <TableRow key={i} className="cursor-pointer hover:bg-muted/40" onClick={() => togglePick(i)}>
                          <TableCell>
                            <input type="checkbox" checked={picked.has(i)} onChange={() => togglePick(i)} onClick={(e) => e.stopPropagation()} />
                          </TableCell>
                          <TableCell className="font-medium">{p.nome}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {[p.cargo, p.empresa].filter(Boolean).join(" · ") || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.localizacao || "—"}</TableCell>
                          <TableCell>
                            {p.linkedin_url && (
                              <a href={p.linkedin_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                                className="text-primary hover:opacity-70">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : mode === "manual" ? (
        /* ─── MODO MANUAL ─── */
        <Card>
          <CardHeader>
            <CardTitle>Enviar DM</CardTitle>
            <CardDescription>Cole a URL pública do perfil LinkedIn e escreva a mensagem.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>URL do perfil LinkedIn</Label>
              <Input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/..." />
            </div>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea value={manualMsg} onChange={(e) => setManualMsg(e.target.value)}
                placeholder="Olá! Vi seu perfil e..." rows={6} />
            </div>
            <Button onClick={manualSend} disabled={manualSending} className="w-full">
              <Send className="h-4 w-4 mr-2" />
              {manualSending ? "Enviando..." : "Enviar DM"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* ─── MODO CONTATOS ─── */
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="pt-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div><p className="text-2xl font-bold">{total}</p><p className="text-xs text-muted-foreground">Contatos</p></div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <div><p className="text-2xl font-bold text-green-500">{enviados}</p><p className="text-xs text-muted-foreground">Disparados</p></div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <div><p className="text-2xl font-bold text-amber-500">{pendentes}</p><p className="text-xs text-muted-foreground">Pendentes</p></div>
            </CardContent></Card>
          </div>

          {/* Controls */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1 flex-1 min-w-[180px]">
                  <p className="text-xs font-medium text-muted-foreground">Etapa da cadência</p>
                  <Select value={etapa} onValueChange={(v) => setEtapa(v as Etapa)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ETAPAS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>
                          <span className="font-mono text-xs mr-2">{e.days}</span>
                          {e.label}
                          <span className="text-muted-foreground text-xs ml-2">— {e.desc}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 flex-1 min-w-[180px]">
                  <p className="text-xs font-medium text-muted-foreground">Buscar</p>
                  <Input placeholder="Nome, empresa ou cargo..." value={search}
                    onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
              {/* Cadence pills */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {ETAPAS.map((e) => (
                  <button key={e.value} onClick={() => setEtapa(e.value)}
                    className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      etapa === e.value ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/40"
                    }`}>
                    {e.days} {e.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="pt-4">
              {isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhum contato encontrado.</p>
                  <p className="text-xs mt-1">Importe contatos em <a href="/buscas/linkedin" className="underline">LinkedIn — Leads</a> primeiro.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cargo / Empresa</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Cadência</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageItems.map((c) => (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openContact(c)}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {c.linkedin_url && (
                              <a href={c.linkedin_url} target="_blank" rel="noreferrer"
                                onClick={(e) => e.stopPropagation()} className="text-primary hover:opacity-70">
                                <Linkedin className="h-3 w-3" />
                              </a>
                            )}
                            {c.nome}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {[c.cargo, c.empresa].filter(Boolean).join(" · ") || "—"}
                        </TableCell>
                        <TableCell>
                          {c.disparo === "Sim" ? (
                            <Badge variant="secondary" className="bg-green-500/20 text-green-600 border-green-500/30 text-[10px]">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Enviado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-[10px]">Pendente</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <CadenceCell contact={c} onAction={handleCadenceAction} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openContact(c); }}>
                            <Zap className="h-3 w-3 mr-1" /> Disparar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Paginação — mantém o estado ao trocar de página (não recarrega) */}
              {!isLoading && filtered.length > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-4 pt-3 mt-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Mostrando <span className="font-medium text-foreground">{pageStart + 1}</span>
                    {"–"}
                    <span className="font-medium text-foreground">
                      {Math.min(pageStart + PAGE_SIZE, filtered.length)}
                    </span>{" "}
                    de <span className="font-medium text-foreground">{filtered.length}</span> contatos
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((n) => {
                        // Janela: primeira, última, e ±2 ao redor da atual
                        return n === 1 || n === totalPages || Math.abs(n - currentPage) <= 2;
                      })
                      .reduce<(number | "…")[]>((acc, n, idx, arr) => {
                        if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push("…");
                        acc.push(n);
                        return acc;
                      }, [])
                      .map((n, i) =>
                        n === "…" ? (
                          <span key={`gap-${i}`} className="px-1.5 text-xs text-muted-foreground">…</span>
                        ) : (
                          <Button
                            key={n}
                            size="sm"
                            variant={n === currentPage ? "default" : "outline"}
                            onClick={() => setPage(n as number)}
                            className="min-w-8 h-8 px-2"
                          >
                            {n}
                          </Button>
                        ),
                      )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ─── DM Dialog ─── */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Linkedin className="h-4 w-4 text-primary" /> {selected?.nome}
            </DialogTitle>
            <DialogDescription>
              {[selected?.cargo, selected?.empresa].filter(Boolean).join(" · ")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Etapa pills */}
            <div className="flex flex-wrap gap-1">
              {ETAPAS.map((e) => (
                <button key={e.value} onClick={() => setEtapa(e.value)}
                  className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                    etapa === e.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                  }`}>
                  {e.days} {e.label}
                </button>
              ))}
            </div>

            {/* Message area */}
            {dm.mensagem ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs font-medium text-muted-foreground">
                    {dm.usedFallback ? "Mensagem (template padrão — IA não disponível)" : "Mensagem gerada pela IA"}
                  </p>
                  {dm.usedFallback && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-700">
                      template
                    </Badge>
                  )}
                </div>
                {dm.usedFallback && dm.fallbackReason && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-700">
                    <strong>Por quê?</strong> {dm.fallbackReason}
                  </div>
                )}
                <Textarea value={dm.mensagem} onChange={(e) => setDm((s) => ({ ...s, mensagem: e.target.value }))}
                  rows={8} className="text-sm" />
                {dm.error && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                    <p className="text-xs text-amber-700">{dm.error}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Copie e envie manualmente no LinkedIn.</p>
                  </div>
                )}
                {dm.sent && (
                  <div className="rounded-md border border-green-500/30 bg-green-500/10 p-2">
                    <p className="text-xs text-green-700 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> DM enviada via Unipile!
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDm((s) => ({ ...s, mensagem: "", sent: false, error: null }))}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={copyMessage}>
                    {copied ? <CheckCircle2 className="h-4 w-4 mr-1 text-green-500" /> : <Copy className="h-4 w-4 mr-1" />}
                    {copied ? "Copiado!" : "Copiar"}
                  </Button>
                  {!dm.sent && (
                    <Button className="flex-1" onClick={handleSend} disabled={dm.loading}>
                      {dm.loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                      Enviar via Unipile
                    </Button>
                  )}
                  {selected?.linkedin_url && (
                    <a href={selected.linkedin_url} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="icon" title="Abrir no LinkedIn">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={handleGenerate} disabled={dm.loading}>
                    {dm.loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-1" />}
                    Gerar mensagem
                  </Button>
                  <Button className="flex-1" onClick={async () => { await handleGenerate(); }} disabled={dm.loading}>
                    {dm.loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
                    Gerar + Enviar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  A IA gera a mensagem personalizada. Se Unipile configurado, envia direto no LinkedIn.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const CADENCE_LABELS: Record<string, { text: string; cls: string }> = {
  none:      { text: "—",          cls: "text-muted-foreground" },
  active:    { text: "Ativa",      cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  paused:    { text: "Pausada",    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  completed: { text: "Concluída",  cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  replied:   { text: "Respondeu",  cls: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30" },
  failed:    { text: "Falhou",     cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

const ETAPA_LABEL_SHORT: Record<string, string> = {
  primeira: "1ª msg (D+0)",
  followup1: "Follow-up (D+7)",
  followup2: "Diagnóstico (D+14)",
  encerramento: "Encerramento (D+21)",
};

function CadenceCell({
  contact,
  onAction,
}: {
  contact: LinkedInContact;
  onAction: (id: string, action: any, label: string) => void;
}) {
  const _cs = String(contact.cadencia_status ?? "none"); const status = (_cs === "idle" ? "none" : _cs) as keyof typeof CADENCE_LABELS;
  const meta = CADENCE_LABELS[status] ?? CADENCE_LABELS.none;
  const proxData = contact.data_prox_disparo ? new Date(contact.data_prox_disparo) : null;
  const etapaLabel = contact.etapa_atual ? (ETAPA_LABEL_SHORT[contact.etapa_atual] ?? contact.etapa_atual) : null;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="flex flex-col gap-1" onClick={stop}>
      {status === "none" ? (
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px] px-2"
          disabled={!contact.linkedin_url}
          onClick={() => onAction(contact.id, "start_cadence", `Cadência iniciada com ${contact.nome}`)}
          title={!contact.linkedin_url ? "Contato sem URL do LinkedIn" : "Iniciar cadência D+0 → D+7 → D+14 → D+21"}
        >
          <Clock className="h-2.5 w-2.5 mr-1" /> Iniciar
        </Button>
      ) : (
        <>
          <Badge variant="outline" className={`text-[10px] font-medium h-5 ${meta.cls}`}>{meta.text}</Badge>
          {status === "active" && etapaLabel && (
            <span className="text-[10px] text-muted-foreground">
              Próx: {etapaLabel}
              {proxData && (<><br />{proxData.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</>)}
            </span>
          )}
          {status === "failed" && (contact.cadencia_last_error || contact.ultima_falha) && (
            <span className="text-[10px] text-destructive font-mono break-words" title={contact.cadencia_last_error || contact.ultima_falha || ""}>
              {(contact.cadencia_last_error || contact.ultima_falha || "").slice(0, 50)}…
            </span>
          )}
          <div className="flex gap-1 flex-wrap">
            {status === "active" && (
              <>
                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1" onClick={() => onAction(contact.id, "pause_cadence", "Cadência pausada")}>
                  Pausar
                </Button>
                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1" title="Marcar manualmente que este lead respondeu no LinkedIn (para a cadência)" onClick={() => onAction(contact.id, "mark_replied", `Lead ${contact.nome} marcado como respondeu — cadência parada`)}>
                  Marcar como respondeu
                </Button>
              </>
            )}
            {status === "paused" && (
              <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1" onClick={() => onAction(contact.id, "resume_cadence", "Cadência retomada")}>
                Retomar
              </Button>
            )}
            {(status === "completed" || status === "replied" || status === "failed") && (
              <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1" onClick={() => onAction(contact.id, "start_cadence", "Cadência reiniciada")}>
                Reiniciar
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
