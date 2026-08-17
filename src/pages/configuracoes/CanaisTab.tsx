import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Linkedin, Mail, MessageCircle, Send, Loader2, CheckCircle2, Instagram, Zap, RefreshCw } from "lucide-react";
import { useUserApiKeys } from "@/hooks/useUserApiKeys";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageGuide } from "@/components/PageGuide";


interface ChannelDef {
  key: string;
  label: string;
  provider: string;
  description: string;
  icon: React.ReactNode;
  extraKey: string;
}

const channels: ChannelDef[] = [
  { key: "linkedin", label: "LinkedIn", provider: "LINKEDIN", description: "DM e convites de conexão automatizados (disparo em massa).", icon: <Linkedin className="h-5 w-5 text-primary" />, extraKey: "account_id" },
  { key: "email", label: "Gmail / Outlook", provider: "GOOGLE", description: "Cold email pela sua conta real (alta deliverability).", icon: <Mail className="h-5 w-5 text-blue-400" />, extraKey: "account_id_email" },
  { key: "instagram", label: "Instagram (DM em massa)", provider: "INSTAGRAM", description: "Envia DMs em massa pela sua conta Instagram. Para auto-resposta em tempo real, use o card Meta abaixo.", icon: <MessageCircle className="h-5 w-5 text-pink-400" />, extraKey: "account_id_instagram" },
  { key: "telegram", label: "Telegram", provider: "TELEGRAM", description: "Mensagens pela sua conta pessoal do Telegram.", icon: <Send className="h-5 w-5 text-sky-400" />, extraKey: "account_id_telegram" },
];

export default function CanaisTab() {
  const { get, upsert } = useUserApiKeys();
  const unipile = get("unipile");
  const extra = (unipile?.extra as any) || {};
  const isActivated = !!unipile && !!extra.dsn;

  const [busy, setBusy] = useState<string | null>(null);
  const [metaBusy, setMetaBusy] = useState(false);

  // Status real de cada canal Unipile (OK / CREDENTIALS / etc)
  const { data: unipileStatuses } = useQuery({
    queryKey: ["unipile-real-status", unipile?.id, extra.account_id_instagram, extra.account_id, extra.account_id_telegram, extra.account_id_email],
    enabled: isActivated,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    queryFn: async () => {
      const result: Record<string, { status: string | null; blocked: boolean } | undefined> = {};
      await Promise.all(channels.map(async (ch) => {
        try {
          const { data } = await supabase.functions.invoke("unipile-list-accounts", { body: { channel: ch.key } });
          const acc = data?.accounts?.[0];
          if (acc) result[ch.key] = { status: acc.status ?? null, blocked: !!acc.blocked };
        } catch { /* keep undefined */ }
      }));
      return result;
    },
  });

  // Meta IG account (auto-reply via Meta Graph API — separate from Unipile)
  const { data: metaAccount, refetch: refetchMeta } = useQuery({
    queryKey: ["meta-ig-account"],
    queryFn: async () => {
      const { data } = await supabase
        .from("meta_instagram_accounts")
        .select("ig_user_id, username, expires_at, created_at, token_type, scopes, metadata")
        .maybeSingle();
      return data;
    },
  });

  // Detect callback success/error from query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const meta = params.get("meta_ig");
    if (meta === "ok") {
      toast.success("Instagram conectado para Auto-Reply (Meta) ✅");
      refetchMeta();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (meta && meta !== "ok") {
      toast.error(`Falha ao conectar Meta: ${meta}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [refetchMeta]);

  async function connectMeta() {
    setMetaBusy(true);
    // Abre uma aba já (gesto do usuário) para evitar bloqueio de pop-up
    const w = window.open("about:blank", "_blank");
    try {
      const { data, error } = await supabase.functions.invoke("meta-instagram-oauth-start");
      if (error || !data?.url) throw new Error(data?.error || error?.message || "Falha ao gerar link Meta");
      if (w) {
        w.location.href = data.url;
      } else {
        // fallback: nova aba bloqueada → tenta top
        window.open(data.url, "_blank") || (window.top!.location.href = data.url);
      }
      toast.info("Autorize o Instagram na nova aba. Depois volte aqui — vai aparecer ✅ conectado.");
    } catch (e: any) {
      if (w) w.close();
      toast.error(e.message);
    } finally {
      setMetaBusy(false);
    }
  }

  async function disconnectMeta() {
    if (!confirm("Desconectar Instagram do Auto-Reply (Meta)?")) return;
    setMetaBusy(true);
    try {
      const { error } = await supabase
        .from("meta_instagram_accounts")
        .delete()
        .eq("ig_user_id", metaAccount!.ig_user_id);
      if (error) throw error;
      toast.success("Instagram desconectado do Auto-Reply.");
      refetchMeta();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setMetaBusy(false);
    }
  }

  async function forceRefreshMetaToken() {
    setMetaBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-instagram-token-refresh", {
        body: { force: true, include_short_lived: true },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Falha ao renovar token");
      const failed = data.results?.find((r: any) => !r.ok);
      if (failed) throw new Error(failed.error || failed.errors?.[0]?.response?.error?.message || "Meta recusou a revalidação");
      toast.success("Token Meta revalidado e webhook reassinado com sucesso.");
      refetchMeta();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setMetaBusy(false);
    }
  }


  function getAccountId(ch: ChannelDef): string | undefined {
    if (ch.key === "email") {
      return extra.account_id_email || extra.account_id_google || extra.account_id_outlook || extra.account_id_imap;
    }
    return extra[ch.extraKey];
  }

  async function connect(ch: ChannelDef) {
    setBusy(ch.key);
    try {
      const { data, error } = await supabase.functions.invoke("unipile-connect-link", {
        body: { provider: ch.provider },
      });
      if (error || !data?.url) throw new Error(data?.error || error?.message || "Falha ao gerar link");
      const w = window.open(data.url, "unipile_oauth", "width=520,height=720");
      if (!w) throw new Error("Popup bloqueado pelo navegador");
      const t = setInterval(() => {
        if (w.closed) {
          clearInterval(t);
          setBusy(null);
          setTimeout(() => location.reload(), 600);
        }
      }, 800);
    } catch (e: any) {
      toast.error(e.message);
      setBusy(null);
    }
  }

  async function disconnect(ch: ChannelDef) {
    if (!confirm(`Desconectar ${ch.label}?`)) return;
    setBusy(ch.key);
    try {
      const newExtra = { ...extra };
      delete newExtra[ch.extraKey];
      if (ch.key === "email") {
        delete newExtra.account_id_google;
        delete newExtra.account_id_outlook;
        delete newExtra.account_id_imap;
      }
      await upsert.mutateAsync({
        provider: "unipile",
        extra: newExtra,
      });
      toast.success(`${ch.label} desconectado.`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  const metaTokenExpired = !!metaAccount?.expires_at && new Date(metaAccount.expires_at).getTime() <= Date.now();
  const metaConnected = !!metaAccount && (metaAccount.token_type === "page_token" || !metaTokenExpired);
  const metaTemporary = !!metaAccount && metaAccount.token_type === "short_lived_fallback" && !metaTokenExpired;

  return (
    <div className="space-y-6">
      <PageGuide
        storageKey="guide_canais"
        title="Conectar canais (Unipile + Meta)"
        what="Aqui você conecta as contas reais que o LeadsBooster vai usar. Unipile cuida de disparo em massa e postagem. Meta cuida da resposta automática de comentários e DMs em tempo real."
        steps={[
          { text: "Peça ao admin para ativar sua conta Unipile em Configurações → APIs", route: "/configuracoes" },
          { text: "Clique em Conectar em cada canal desejado (LinkedIn, Gmail, Instagram, Telegram)" },
          { text: "Para auto-resposta no Instagram, conecte também via Meta API abaixo" },
        ]}
        troubleshoot="Se um canal ficar com badge 'Reconectar', a sessão expirou — clique novamente em Conectar."
        troubleshootRoute="/saude"
      />

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="font-medium mb-1">🔗 Como funcionam as conexões</p>
        <p className="text-muted-foreground">
          Cada canal tem <strong>2 finalidades possíveis</strong>:
          <span className="block mt-1"><strong>Disparo em massa & postagem</strong>: conecte via <strong>Unipile</strong> na seção abaixo.</span>
          <span className="block"><strong>Auto-resposta em tempo real</strong>: conecte via <strong>Meta API</strong> no card do Instagram Auto-Reply.</span>
          <span className="block mt-1 text-xs">As duas conexões são independentes e <strong>complementares</strong>: o ideal é ter as duas ativas pro Instagram.</span>
        </p>
      </div>

      {/* Section 1: Unipile — Disparo em massa */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Send className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">1. Disparo em massa & postagem (Unipile)</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Use estes canais para <strong>enviar mensagens em volume</strong> (cold outreach) e <strong>publicar conteúdo</strong>. Usa sua conta real, sem cookies expostos.
        </p>

      {!isActivated && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm mb-3">
          <p className="font-medium text-amber-500 mb-1">⏳ Aguardando ativação pelo administrador</p>
          <p className="text-muted-foreground">
            Assim que o admin liberar sua conta, os botões <strong>Conectar</strong> abaixo ficarão disponíveis.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {channels.map((ch) => {
          const aid = getAccountId(ch);
          const hasId = !!aid;
          const st = unipileStatuses?.[ch.key];
          const rawStatus = (st?.status ?? "").toString().toUpperCase();
          const healthy = hasId && (!st || rawStatus === "OK" || rawStatus === "CONNECTED" || rawStatus === "CREATION_SUCCESS" || rawStatus === "");
          const needsReconnect = hasId && st && !healthy && !st.blocked;
          const connected = healthy;
          return (
            <Card key={ch.key}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {ch.icon}
                    {ch.label}
                    {connected && (
                      <Badge className="text-[10px] bg-green-500/20 text-green-500 border-green-500/30">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Conectado
                      </Badge>
                    )}
                    {needsReconnect && (
                      <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">
                        ⚠️ Reconectar {rawStatus ? `(${rawStatus})` : ""}
                      </Badge>
                    )}
                    {st?.blocked && (
                      <Badge className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30">
                        Bloqueada
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>{ch.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {hasId && (
                  <p className="text-xs font-mono text-muted-foreground">
                    {aid!.slice(0, 8)}…{aid!.slice(-4)}
                  </p>
                )}
                {needsReconnect && (
                  <p className="text-xs text-amber-400">
                    Sua sessão no Unipile expirou (o Instagram costuma deslogar contas sem 2FA em app após alguns dias). Clique em <strong>Reconectar</strong> e, se falhar por credenciais, use a aba <strong>Cookies</strong> no popup do Unipile.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => connect(ch)}
                    disabled={!isActivated || busy === ch.key}
                    variant={connected ? "outline" : "default"}
                  >
                    {busy === ch.key ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      ch.icon
                    )}
                    {hasId ? "Reconectar" : `Conectar ${ch.label}`}
                  </Button>
                  {hasId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => disconnect(ch)}
                      disabled={busy === ch.key}
                    >
                      Desconectar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      </div>

      {/* Section 2: Meta Auto-Reply — separate from Unipile */}
      <div className="pt-2">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-yellow-500" />
          <h3 className="text-sm font-semibold">2. Auto-Resposta em Tempo Real do Instagram (Meta API)</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Responde <strong>comentários, DMs e respostas de Stories</strong> automaticamente (estilo ManyChat). Conexão oficial da Meta — recomendada para todo assinante que tem Instagram Business.
        </p>
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-yellow-500" />
          <h3 className="text-sm font-semibold">Auto-Engajamento em Tempo Real (Meta API)</h3>
        </div>
        <Card className="border-pink-500/20 bg-gradient-to-br from-pink-500/5 to-purple-500/5">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Instagram className="h-5 w-5 text-pink-400" />
                Instagram Auto-Reply
                {metaConnected && (
                  <Badge className="text-[10px] bg-green-500/20 text-green-500 border-green-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> @{metaAccount.username}
                  </Badge>
                )}
                {metaAccount && !metaConnected && (
                  <Badge className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30">
                    Token expirado
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Responde <strong>comentários, DMs e respostas de Stories</strong> automaticamente (estilo ManyChat).
                Independente da conexão Unipile (que continua cuidando de postagem e disparo em massa).
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {metaAccount && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {metaAccount.token_type === "page_token" ? (
                  <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    ✓ Token permanente + webhook ativo
                  </Badge>
                ) : metaTokenExpired ? (
                  <Badge className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30">Token expirado</Badge>
                ) : metaTemporary ? (
                  <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">Token temporário</Badge>
                ) : metaAccount.token_type === "long_lived" ? (
                  <Badge variant="default" className="text-[10px]">Token 60 dias (auto-renova)</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Token curto</Badge>
                )}
                {metaAccount.token_type !== "page_token" && metaAccount.expires_at && (
                  <span className="text-muted-foreground">
                    {metaTokenExpired ? "Expirou em " : "Expira em "}
                    {new Date(metaAccount.expires_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </span>
                )}
              </div>
            )}
            {metaTemporary && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                A conexão foi salva, mas a Meta retornou apenas um token curto. Isso serve para teste imediato,
                mas ainda não é suficiente para produção. Clique em <strong>Revalidar agora</strong>; se continuar
                temporário, falta corrigir as credenciais do app Instagram, publicar a função de renovação ou concluir o App Review/permissões.
              </div>
            )}
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-2">
              <p><strong className="text-foreground">Fluxo recomendado para assinantes:</strong></p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Clique em <strong>Conectar Instagram</strong> e faça login <strong>direto com a conta do Instagram</strong> (Instagram Login — não precisa mais de Facebook nem Página).</li>
                <li>O backend troca o token curto por um token de 60 dias, salva a conta e assina o webhook.</li>
                <li>Um job automático renova o token antes de expirar, sem ação manual do assinante.</li>
              </ol>
              <p className="pt-1"><strong className="text-foreground">Pré-requisito único:</strong></p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Conta Instagram <strong>Profissional</strong> (Empresa ou Criador) — configure em Instagram → Configurações → Conta → Mudar para conta profissional.</li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={connectMeta}
                disabled={metaBusy}
                variant={metaAccount ? "outline" : "default"}
              >
                {metaBusy ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Instagram className="h-3.5 w-3.5 mr-1" />
                )}
                {metaAccount ? "Reconectar Instagram" : "Conectar Instagram"}
              </Button>
              {metaAccount && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={forceRefreshMetaToken}
                  disabled={metaBusy}
                >
                  {metaBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                  Revalidar agora
                </Button>
              )}
              {metaAccount && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={disconnectMeta}
                  disabled={metaBusy}
                >
                  Desconectar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

}
