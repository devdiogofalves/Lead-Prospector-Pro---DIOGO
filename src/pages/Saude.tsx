// Saude.tsx — Página de diagnóstico pré-demo multi-tenant.
// Checa em uma única tela todos os pontos de configuração que precisam estar
// OK pra agente do tenant funcionar end-to-end:
//
// 1. Chaves IA por usuário (OpenAI ou Gemini em user_api_keys)
// 2. WhatsApp Mandrack pareado (user_integrations + Mandrack /session/status)
// 3. LinkedIn Unipile conectado (user_api_keys.extra.account_id)
// 4. Apify (env var ou user_api_keys)
// 5. Briefing do tenant carregado (mavi_briefing.clientes_referencia preenchido)
// 6. Atividades CNAE resolvidas (clientes_referencia_atividades — Fase H-2)
// 7. Grupo handoff configurado (qualification_settings.handoff_group_jid)
// 8. Google Calendar OAuth (google_calendar_tokens)
// 9. Auto-prospect ativado e última execução
// 10. System prompt personalizado (prospecting_profiles.system_prompt)
// 11. Configurações de Disparo (dispatch_settings — pausa/horário/limite)
//
// Cada item: ✅ OK / ⚠️ atenção / ❌ falta + botão "Configurar →"
//
// IMPORTANTE: esta página não MODIFICA nada — só LÊ status. Operador clica
// em links pra ir resolver onde precisa.

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, ArrowRight, Activity, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { PageGuide } from "@/components/PageGuide";
import { useBranding } from "@/hooks/useBranding";
import { LiveOpsPanel } from "@/components/saude/LiveOpsPanel";
import { ChipHealthPanel } from "@/components/saude/ChipHealthPanel";

type CheckStatus = "ok" | "warn" | "fail" | "loading";

interface CheckItem {
  title: string;
  status: CheckStatus;
  description: string;
  detail?: string;
  fixLink?: string;
  fixLabel?: string;
}

export default function Saude() {
  const { branding: __b } = useBranding(); const agent = __b.agent_name;
  const company = __b.company_name;

  const [items, setItems] = useState<CheckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function runAllChecks() {
    setRefreshing(true);
    const results: CheckItem[] = [];

    // Pega user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setItems([{ title: "Auth", status: "fail", description: "Não autenticado." }]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const userId = user.id;

    // ── 1. Chaves IA ───────────────────────────────────────────────────────
    try {
      const { data: keys } = await supabase.from("user_api_keys").select("provider").eq("user_id", userId);
      const providers = new Set((keys ?? []).map((k: any) => k.provider));
      const hasIa = providers.has("openai") || providers.has("gemini");
      results.push({
        title: "Chave de IA (OpenAI ou Gemini)",
        status: hasIa ? "ok" : "fail",
        description: `${agent} usa IA pra gerar cada mensagem. Sem essa chave, disparos falham.`,
        detail: hasIa
          ? `Providers configurados: ${Array.from(providers).filter((p) => p === "openai" || p === "gemini").join(", ")}`
          : "Nenhum provider de IA configurado.",
        fixLink: "/configuracoes",
        fixLabel: hasIa ? "Editar chaves" : "Configurar IA",
      });

      // Apify
      const hasApify = providers.has("apify");
      results.push({
        title: "Apify (LinkedIn + Instagram scraping)",
        status: hasApify ? "ok" : "warn",
        description: "Necessário pra Trilha LinkedIn e busca Instagram do sócio.",
        detail: hasApify ? "Apify configurado no user_api_keys." : "Sem chave do usuário — pode usar fallback APIFY_API_KEY do env.",
        fixLink: "/configuracoes",
        fixLabel: "Configurar Apify",
      });

      // Unipile (LinkedIn DM) — só checamos presença; nunca lemos o segredo no front
      const { data: unipileRow } = await supabase
        .from("user_api_keys")
        .select("id, extra")
        .eq("user_id", userId).eq("provider", "unipile").maybeSingle();
      const unipileKey = !!unipileRow?.id;
      const unipileDsn = (unipileRow?.extra as any)?.dsn;
      const unipileAccount = (unipileRow?.extra as any)?.account_id;
      const unipileStatus: CheckStatus =
        unipileKey && unipileDsn && unipileAccount ? "ok"
        : unipileKey && unipileDsn ? "warn"
        : "fail";
      results.push({
        title: "Unipile (LinkedIn DM + cadência)",
        status: unipileStatus,
        description: "Necessário pra busca de perfis LinkedIn e envio de DMs via cadência SPIN.",
        detail: unipileStatus === "ok"
          ? `LinkedIn vinculado (account: ${String(unipileAccount).slice(0, 8)}...).`
          : unipileStatus === "warn"
          ? "API key e DSN OK, mas LinkedIn ainda não foi conectado via OAuth."
          : "API key Unipile não configurada.",
        fixLink: "/configuracoes",
        fixLabel: unipileStatus === "warn" ? "Conectar LinkedIn" : "Configurar Unipile",
      });

      // ElevenLabs (opcional — só warn se faltar)
      const hasEleven = providers.has("elevenlabs");
      results.push({
        title: `ElevenLabs (áudio ${agent} — opcional)`,
        status: hasEleven ? "ok" : "warn",
        description: `Necessário se quiser ${agent} enviar mensagens em áudio. Sem isso, só texto.`,
        detail: hasEleven ? "Configurado." : "Não configurado — disparos vão sair só em texto.",
        fixLink: "/configuracoes",
        fixLabel: "Configurar ElevenLabs",
      });

      // DadosBooster: enriquecimento (celular pessoal dos sócios) sem chave por
      // painel — sempre disponível via edge function dados4u-query-v2.
      results.push({
        title: "DadosBooster (celular pessoal dos sócios)",
        status: "ok",
        description: "Enriquece o lead com celular pessoal do decisor a partir de CPF/CNPJ/nome.",
        detail: "Disponível — não requer chave.",
      });
    } catch (e: any) {
      results.push({ title: "Chaves API", status: "fail", description: "Erro lendo user_api_keys", detail: e.message });
    }

    // ── 2. WhatsApp Mandrack ───────────────────────────────────────────────
    try {
      const { data: integ } = await supabase
        .from("user_integrations")
        .select("evolution_instance, mandrack_instance_token")
        .eq("user_id", userId).maybeSingle();
      const hasMand = !!(integ?.evolution_instance && integ?.mandrack_instance_token);
      let waConnected = false;
      let waDetail = "Instância Mandrack não configurada.";
      if (hasMand) {
        try {
          const { data } = await supabase.functions.invoke("mandrack-manager", { body: { action: "status" } });
          waConnected = (data as any)?.state === "open";
          waDetail = waConnected
            ? `Conectado (instância: ${integ?.evolution_instance})`
            : `Instância existe mas desconectada (state: ${(data as any)?.state ?? "desconhecido"})`;
        } catch (e: any) {
          waDetail = `Erro ao checar status Mandrack: ${e.message}`;
        }
      }
      results.push({
        title: "WhatsApp pareado (Mandrack)",
        status: waConnected ? "ok" : hasMand ? "warn" : "fail",
        description: `${agent} dispara mensagens via Mandrack. Sem conexão, fila trava.`,
        detail: waDetail,
        fixLink: "/whatsapp",
        fixLabel: waConnected ? "Ver QR" : "Conectar WhatsApp",
      });
    } catch (e: any) {
      results.push({ title: "WhatsApp Mandrack", status: "fail", description: "Erro checando integração", detail: e.message });
    }

    // ── 3. Briefing do tenant ───────────────────────────────────────────────
    try {
      const { data: briefing } = await supabase
        .from("mavi_briefing" as any)
        .select("clientes_referencia, segmentos_alvo, personas_alvo, value_props, clientes_referencia_atividades")
        .eq("user_id", userId).maybeSingle();
      const refsCount = ((briefing as any)?.clientes_referencia ?? []).length;
      const segsCount = ((briefing as any)?.segmentos_alvo ?? []).length;
      const personasCount = ((briefing as any)?.personas_alvo ?? []).length;
      const vpCount = ((briefing as any)?.value_props ?? []).length;
      const cnaeCount = ((briefing as any)?.clientes_referencia_atividades ?? []).length;
      const briefingStatus: CheckStatus = refsCount >= 5 && segsCount >= 3 ? "ok" : "fail";
      results.push({
        title: `Briefing ${company} carregado`,
        status: briefingStatus,
        description: `Sem briefing, ${agent} fala genérico sem citar clientes-referência nem usar SPIN específico do nicho.`,
        detail: `${refsCount} clientes, ${segsCount} segmentos, ${personasCount} personas, ${vpCount} value props${cnaeCount > 0 ? `, ${cnaeCount} CNAEs resolvidos` : ""}.`,
        fixLink: "/mavi/aprendizado",
        fixLabel: refsCount === 0 ? `Carregar template ${company}` : "Editar briefing",
      });

      // CNAE separado pra incentivar uso da Fase H-2
      results.push({
        title: "CNAEs resolvidos dos clientes-referência (Fase H-2)",
        status: cnaeCount > 0 ? "ok" : "warn",
        description: `Sementeira mais precisa quando ${company} tem CNAE real de cada cliente (ex: Apodi → 'Fabricação de cimento').`,
        detail: cnaeCount > 0
          ? `${cnaeCount} atividades CNAE cacheadas. Sementeira usa essas + segmentos genéricos.`
          : "Sem CNAE resolvido — sementeira usa só segmentos genéricos (Fase H).",
        fixLink: "/mavi/aprendizado",
        fixLabel: "Refinar sementeira",
      });
    } catch (e: any) {
      results.push({ title: `Briefing ${company}`, status: "fail", description: "Erro lendo mavi_briefing", detail: e.message });
    }

    // ── 4. Grupo handoff ───────────────────────────────────────────────────
    try {
      const { data: qs } = await supabase
        .from("qualification_settings")
        .select("handoff_group_jid")
        .eq("user_id", userId).maybeSingle();
      const hasGroup = !!qs?.handoff_group_jid;
      results.push({
        title: "Grupo handoff (leads qualificados)",
        status: hasGroup ? "ok" : "warn",
        description: `Quando lead é qualificado, ${agent} envia card pro grupo. Sem isso, time não vê os qualificados.`,
        detail: hasGroup ? `Grupo configurado: ${qs!.handoff_group_jid?.slice(0, 20)}...` : "Sem grupo handoff configurado.",
        fixLink: "/qualificacao-humanizada",
        fixLabel: "Configurar grupo",
      });
    } catch (e: any) {
      results.push({ title: "Grupo handoff", status: "fail", description: "Erro", detail: e.message });
    }

    // ── 5. Google Calendar OAuth ────────────────────────────────────────────
    try {
      const { data: cal } = await supabase
        .from("google_calendar_tokens")
        .select("expires_at, calendar_id")
        .eq("user_id", userId).maybeSingle();
      const calOk = !!cal;
      results.push({
        title: "Google Calendar (reuniões + Meet)",
        status: calOk ? "ok" : "warn",
        description: `Sem isso, ${agent} não consegue marcar reunião automática nem gerar link Meet.`,
        detail: calOk ? `Conectado (calendar: ${cal!.calendar_id ?? "primary"}).` : "OAuth Google Calendar não conectado.",
        fixLink: "/google-calendar",
        fixLabel: calOk ? "Reconectar" : "Conectar Calendar",
      });
    } catch (e: any) {
      results.push({ title: "Google Calendar", status: "fail", description: "Erro", detail: e.message });
    }

    // ── 6. Auto-prospect ativo + última execução ───────────────────────────
    try {
      const { data: autoSettings } = await supabase
        .from("automation_settings")
        .select("enabled, last_run_at, frequency_hours")
        .eq("user_id", userId).maybeSingle();
      const enabled = !!autoSettings?.enabled;
      const lastRun = autoSettings?.last_run_at ? new Date(autoSettings.last_run_at) : null;
      const hoursAgo = lastRun ? Math.round((Date.now() - lastRun.getTime()) / 3600000) : null;
      let autoStatus: CheckStatus = "warn";
      let detail = "";
      if (!autoSettings) {
        autoStatus = "warn";
        detail = "Automation_settings nunca foi configurado.";
      } else if (!enabled) {
        autoStatus = "warn";
        detail = `Desativado. Frequência configurada: ${autoSettings.frequency_hours}h.`;
      } else if (!lastRun) {
        autoStatus = "warn";
        detail = `Ativo mas nunca rodou. Próxima execução em breve (pg_cron a cada hora).`;
      } else if (hoursAgo !== null && hoursAgo > 24) {
        autoStatus = "warn";
        detail = `Última execução há ${hoursAgo}h — possível problema no pg_cron.`;
      } else {
        autoStatus = "ok";
        detail = `Última execução: ${lastRun.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (${hoursAgo}h atrás).`;
      }
      results.push({
        title: "Prospecção Automatizada",
        status: autoStatus,
        description: `Quando ativa, o auto-prospect roda Maps → CNPJ → Instagram → ${agent} sozinho a cada N horas.`,
        detail,
        fixLink: "/automacao",
        fixLabel: enabled ? "Editar configurações" : "Ativar automação",
      });
    } catch (e: any) {
      results.push({ title: "Auto-prospect", status: "fail", description: "Erro lendo automation_settings", detail: e.message });
    }

    // ── 7. Prospecting profile (system_prompt) ─────────────────────────────
    try {
      const { data: pp } = await supabase
        .from("prospecting_profiles")
        .select("system_prompt, produto")
        .eq("user_id", userId).maybeSingle();
      const sp = (pp?.system_prompt ?? "").trim();
      const hasProfile = sp.length > 200;
      results.push({
        title: `System prompt ${agent} personalizado`,
        status: hasProfile ? "ok" : "fail",
        description: `Sem prompt no Assistente, ${agent} cai em fallback genérico — perde SPIN da ${company}, persona e diferenciais.`,
        detail: hasProfile
          ? `${sp.length} chars salvos${pp?.produto ? ` (produto: ${pp.produto.slice(0, 40)}…)` : ""}.`
          : sp
            ? `Prompt salvo mas muito curto (${sp.length} chars) — provavelmente incompleto.`
            : `Sem prompt salvo — ${agent} vai usar fallback genérico.`,
        fixLink: "/assistente",
        fixLabel: hasProfile ? "Editar Assistente" : "Configurar Assistente",
      });
    } catch (e: any) {
      results.push({ title: `System prompt ${agent}`, status: "fail", description: "Erro lendo prospecting_profiles", detail: e.message });
    }

    // ── 8. Dispatch settings (pausa + horário + daily_limit) ───────────────
    try {
      const { data: ds } = await supabase
        .from("dispatch_settings")
        .select("paused, respect_business_hours, business_hour_start, business_hour_end, daily_limit")
        .eq("user_id", userId).maybeSingle();
      if (!ds) {
        results.push({
          title: `Configurações de Disparo ${agent}`,
          status: "warn",
          description: "Sem dispatch_settings, worker usa defaults agressivos (daily_limit 80, sem business_hours).",
          detail: "Nunca configurado — defaults serão usados.",
          fixLink: "/disparo-humanizado",
          fixLabel: "Configurar Disparo",
        });
      } else if (ds.paused) {
        results.push({
          title: `Configurações de Disparo ${agent}`,
          status: "warn",
          description: `Disparo ${agent} está PAUSADO — fila não processa até despausar.`,
          detail: `Pausado. Horário: ${ds.business_hour_start}h-${ds.business_hour_end}h, daily_limit ${ds.daily_limit}.`,
          fixLink: "/disparo-humanizado",
          fixLabel: "Despausar",
        });
      } else {
        results.push({
          title: `Configurações de Disparo ${agent}`,
          status: "ok",
          description: "Pausa, horário comercial e daily_limit configurados.",
          detail: `Ativo. Horário: ${ds.business_hour_start}h-${ds.business_hour_end}h${ds.respect_business_hours ? "" : " (não respeitado)"}, daily_limit ${ds.daily_limit}.`,
          fixLink: "/disparo-humanizado",
          fixLabel: "Editar disparo",
        });
      }
    } catch (e: any) {
      results.push({ title: `Disparo ${agent}`, status: "fail", description: "Erro lendo dispatch_settings", detail: e.message });
    }

    // ── 9. Atividade recente da agente ─────────────────────────────────────
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [{ count: dispatchedToday }, { count: qualifiedRecent }] = await Promise.all([
        supabase.from("dispatch_queue").select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("status", "sent")
          .gte("sent_at", todayStart.toISOString()),
        supabase.from("qualification_conversations").select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("qualified", true)
          .gte("qualified_at", new Date(Date.now() - 7 * 86400000).toISOString()),
      ]);
      results.push({
        title: `${agent} rodando (últimas 24h / 7 dias)`,
        status: (dispatchedToday ?? 0) > 0 || (qualifiedRecent ?? 0) > 0 ? "ok" : "warn",
        description: "Quanta atividade real tá rolando no momento.",
        detail: `Disparos hoje: ${dispatchedToday ?? 0}. Leads qualificados nos últimos 7 dias: ${qualifiedRecent ?? 0}.`,
        fixLink: "/disparo-humanizado",
        fixLabel: "Ver fila",
      });
    } catch (e: any) {
      results.push({ title: `Atividade ${agent}`, status: "fail", description: "Erro", detail: e.message });
    }

    setItems(results);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    runAllChecks();
  }, []);

  const counts = items.reduce(
    (acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; },
    { ok: 0, warn: 0, fail: 0, loading: 0 } as Record<CheckStatus, number>,
  );
  const readyForDemo = counts.fail === 0;

  return (
    <div className="container mx-auto p-4 lg:p-6 space-y-4 max-w-5xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Saúde do Sistema
          </h1>
          <p className="text-sm text-muted-foreground">
            Diagnóstico de tudo que precisa estar OK pra {agent} funcionar end-to-end. Rode antes da demo.
          </p>
        </div>
        <Button onClick={runAllChecks} disabled={refreshing} variant="outline" size="sm">
          {refreshing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Re-checar
        </Button>
      </div>

      <PageGuide
        storageKey="guide_saude"
        title="Saúde do Sistema"
        what={`Diagnóstico end-to-end de todas as integrações que a ${agent} precisa: chaves de API, WhatsApp pareado, briefing carregado, system prompt gerado, grupo handoff, Google Calendar, auto-prospect. Rode SEMPRE antes da demo.`}
        steps={[
          { text: "Clique 'Re-checar' para atualizar tudo" },
          { text: "Cards com ❌ (vermelho) são CRÍTICOS — clique 'Configurar →' que leva direto na tela" },
          { text: "Cards com ⚠️ (amarelo) são opcionais ou não-críticos para demo" },
        ]}
        troubleshoot={`Tudo verde mas algo não funciona? Contate o suporte ${company}.`}
      />

      <LiveOpsPanel />

      <ChipHealthPanel />

      {!loading && (
        <Card className={readyForDemo ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}>
          <CardContent className="py-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {readyForDemo ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}
              <span className="font-medium">
                {readyForDemo
                  ? `Pronto pra demo: ${counts.ok} OK, ${counts.warn} atenção, 0 críticos.`
                  : `${counts.fail} ponto(s) crítico(s) bloqueando — resolva antes da demo.`}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="py-6">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))
          : items.map((it, i) => (
              <Card key={i} className={
                it.status === "ok" ? "border-emerald-500/30"
                : it.status === "warn" ? "border-amber-500/30"
                : "border-destructive/40"
              }>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {it.status === "ok" && <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                      {it.status === "warn" && <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                      {it.status === "fail" && <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />}
                      {it.title}
                    </CardTitle>
                    <Badge variant="outline" className={
                      it.status === "ok" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 text-[10px]"
                      : it.status === "warn" ? "border-amber-500/40 text-amber-700 dark:text-amber-400 text-[10px]"
                      : "border-destructive/40 text-destructive text-[10px]"
                    }>
                      {it.status === "ok" ? "OK" : it.status === "warn" ? "Atenção" : "Crítico"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <p className="text-xs text-muted-foreground">{it.description}</p>
                  {it.detail && <p className="text-[11px] text-muted-foreground italic">{it.detail}</p>}
                  {it.fixLink && (
                    <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                      <Link to={it.fixLink}>
                        {it.fixLabel ?? "Configurar"} <ArrowRight className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
      </div>
    </div>
  );
}
