import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Save, ExternalLink, Linkedin, Loader2, CheckCircle2, Mail, MessageCircle, Send } from "lucide-react";
import { useUserApiKeys } from "@/hooks/useUserApiKeys";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Unipile webhooks são globais e configurados pelo admin — não aparecem mais no painel do cliente.


interface ProviderDef {
  id: string;
  name: string;
  description: string;
  helpUrl: string;
  helpText: string;
  placeholder: string;
}

const providers: ProviderDef[] = [
  {
    id: "apify",
    name: "Apify",
    description: "Scraper de perfis do Instagram. Busca de leads por nicho e hashtag.",
    helpUrl: "https://console.apify.com/account/integrations",
    helpText: "console.apify.com/account/integrations",
    placeholder: "apify_api_...",
  },
  {
    id: "google_places",
    name: "Google Places",
    description: "Busca de empresas no Google Maps.",
    helpUrl: "https://console.cloud.google.com/apis/credentials",
    helpText: "console.cloud.google.com/apis/credentials",
    placeholder: "AIza...",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Necessário para respostas e aprendizado da IA quando você não usar Gemini. Configure pelo menos OpenAI ou Google Gemini.",
    helpUrl: "https://platform.openai.com/api-keys",
    helpText: "platform.openai.com/api-keys",
    placeholder: "sk-...",
  },
  {
    id: "kie_ai",
    name: "Kie.ai",
    description: "Geracao avancada de imagens com referencia, carrosseis e videos por tarefas assincronas.",
    helpUrl: "https://kie.ai/",
    helpText: "kie.ai",
    placeholder: "kie_...",
  },
  // Unipile removido daqui — gerenciado centralmente em /admin → Contas Unipile.
  // Os botões "Conectar LinkedIn/Gmail/IG/Telegram" do assinante ficam em outra aba (Canais).

  {
    id: "elevenlabs",
    name: "ElevenLabs",
    description: "Geração de áudio (voz da IA) para disparos humanizados com nota de voz.",
    helpUrl: "https://elevenlabs.io/app/speech-synthesis",
    helpText: "elevenlabs.io",
    placeholder: "sk_...",
  },
  // DadosBooster removido daqui — o enriquecimento (CPF/CNPJ/telefone/nome) roda
  // pela edge function dados4u-query-v2 apontando pro DadosBooster, sem chave por
  // painel. Nada a configurar aqui.
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Alternativa à OpenAI para respostas, resumo e aprendizado da IA. Configure pelo menos Gemini ou OpenAI.",
    helpUrl: "https://aistudio.google.com/app/apikey",
    helpText: "aistudio.google.com/app/apikey",
    placeholder: "AIza...",
  },
];

interface UnipileChannelDef {
  key: string;
  label: string;
  provider: string;
  icon: React.ReactNode;
  extraKey: string;
}

function ProviderCard({ provider }: { provider: ProviderDef }) {
  const { get, upsert, remove } = useUserApiKeys();
  const existing = get(provider.id);
  const isShared = existing?.is_admin_shared === true;
  const [value, setValue] = useState("");
  const [dsn, setDsn] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    // NUNCA pré-preenche com o segredo — o front não lê mais o valor.
    setValue("");
    setDsn((existing?.extra as any)?.dsn ?? "");
  }, [existing?.id]);


  const isUnipile = provider.id === "unipile";
  const accountId = (existing?.extra as any)?.account_id as string | undefined;
  const accountIdInstagram = (existing?.extra as any)?.account_id_instagram as string | undefined;
  const accountIdEmail = (existing?.extra as any)?.account_id_google as string | undefined || (existing?.extra as any)?.account_id_outlook as string | undefined || (existing?.extra as any)?.account_id_imap as string | undefined;
  const accountIdTelegram = (existing?.extra as any)?.account_id_telegram as string | undefined;

  const unipileChannels: UnipileChannelDef[] = [
    { key: "linkedin", label: "LinkedIn", provider: "LINKEDIN", icon: <Linkedin className="h-3.5 w-3.5 text-primary" />, extraKey: "account_id" },
    { key: "instagram", label: "Instagram", provider: "INSTAGRAM", icon: <MessageCircle className="h-3.5 w-3.5 text-pink-400" />, extraKey: "account_id_instagram" },
    { key: "email", label: "E-mail", provider: "GOOGLE", icon: <Mail className="h-3.5 w-3.5 text-blue-400" />, extraKey: "account_id_email" },
    { key: "telegram", label: "Telegram", provider: "TELEGRAM", icon: <Send className="h-3.5 w-3.5 text-sky-400" />, extraKey: "account_id_telegram" },
  ];

  const getAccountId = (ch: UnipileChannelDef) => {
    if (ch.key === "linkedin") return accountId;
    if (ch.key === "instagram") return accountIdInstagram;
    if (ch.key === "email") return accountIdEmail;
    if (ch.key === "telegram") return accountIdTelegram;
    return undefined;
  };

  // Chave gerenciada pelo admin — não permite edição pelo cliente,
  // mas (para Unipile) ainda mostra botões "Conectar" por canal porque
  // cada cliente vincula a SUA própria conta LinkedIn/Instagram/Email/Telegram.
  if (isShared) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {provider.name}
              <Badge className="text-[10px] bg-primary/20 text-primary border-primary/30">🔒 Pronto pra usar</Badge>
            </CardTitle>
            <CardDescription>{provider.description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isUnipile && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              Esta chave está sendo gerenciada pelo administrador da plataforma. Você não precisa configurar nada aqui — o serviço já está ativo para sua conta.
            </p>
          )}
          {isUnipile && (
            <>
              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                Tudo pronto! Clique em <strong>Conectar</strong> em cada canal abaixo para vincular suas contas. Vai abrir uma janela segura da Unipile pra você fazer login normalmente.
              </p>
              <div className="rounded-md border bg-background/60 p-3 space-y-3">
                {unipileChannels.map((ch) => {
                  const aid = getAccountId(ch);
                  return (
                    <div key={ch.key} className="flex items-center justify-between gap-2">
                      <div className="text-xs min-w-0">
                        <p className="font-medium flex items-center gap-1">
                          {ch.icon}
                          {ch.label}
                          {aid && (
                            <Badge className="ml-1 text-[9px] bg-green-500/20 text-green-500 border-green-500/30">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Conectado
                            </Badge>
                          )}
                        </p>
                        <p className="text-muted-foreground mt-0.5 truncate">
                          {aid ? (
                            <span className="font-mono">{aid.slice(0, 8)}…{aid.slice(-4)}</span>
                          ) : (
                            "Nenhuma conta vinculada ainda."
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => connectChannel(ch.provider)}
                          disabled={connecting}
                          variant={aid ? "outline" : "default"}
                        >
                          {connecting ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            ch.icon
                          )}
                          {aid ? "Reconectar" : `Conectar ${ch.label}`}
                        </Button>
                        {aid && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-2"
                            onClick={() => disconnectChannel(ch.provider, ch.label, ch.extraKey)}
                            disabled={disconnecting}
                          >
                            {disconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Desconectar"}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  async function connectChannel(channelProvider: string) {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("unipile-connect-link", {
        body: { provider: channelProvider },
      });
      if (error || !data?.url) throw new Error(data?.error || error?.message || "Falha ao gerar link");
      const w = window.open(data.url, "unipile_oauth", "width=520,height=720");
      if (!w) throw new Error("Popup bloqueado pelo navegador");
      const t = setInterval(() => {
        if (w.closed) {
          clearInterval(t);
          setConnecting(false);
          window.dispatchEvent(new Event("focus"));
          setTimeout(() => location.reload(), 600);
        }
      }, 800);
    } catch (e: any) {
      toast.error(e.message);
      setConnecting(false);
    }
  }

  async function disconnectChannel(channelProvider: string, label: string, extraKey?: string) {
    const key = extraKey ?? `account_id_${channelProvider.toLowerCase()}`;
    if (!confirm(`Desconectar a conta ${label}? A API Key + DSN do Unipile permanecem salvos.`)) return;
    setDisconnecting(true);
    try {
      const newExtra = { ...(existing?.extra || {}) };
      delete (newExtra as any)[key];
      delete (newExtra as any)[`connected_at_${channelProvider.toLowerCase()}`];
      await upsert.mutateAsync({
        provider: provider.id,
        extra: newExtra,
      });
      toast.success(`${label} desconectado.`);
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setDisconnecting(false);
    }
  }



  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            {provider.name}
            {existing && <Badge variant="secondary" className="text-[10px]">Configurado</Badge>}
            {isUnipile && accountId && (
              <Badge className="text-[10px] bg-green-500/20 text-green-500 border-green-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" /> LinkedIn vinculado
              </Badge>
            )}
          </CardTitle>
          <CardDescription>{provider.description}</CardDescription>
        </div>
        <a
          href={provider.helpUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 shrink-0"
        >
          {provider.helpText}
          <ExternalLink className="h-3 w-3" />
        </a>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isUnipile && existing && (
          <div className="text-xs text-muted-foreground">
            <Badge className="text-[10px] bg-green-500/20 text-green-500 border-green-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Configurada
            </Badge>
            <span className="ml-2">Deixe em branco pra manter. Digite uma nova chave só se quiser substituir.</span>
          </div>
        )}
        {!isUnipile && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Label htmlFor={`key-${provider.id}`} className="sr-only">
                {provider.name} API Key
              </Label>
              <Input
                id={`key-${provider.id}`}
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={existing ? "•••• (deixe em branco para manter)" : provider.placeholder}
                autoComplete="off"
              />
            </div>
            <Button
              onClick={() => value.trim() && upsert.mutate({ provider: provider.id, api_key: value.trim() })}
              disabled={!value.trim()}
            >
              <Save className="h-4 w-4 mr-1" />
              Salvar
            </Button>
            {existing && (
              <Button variant="outline" size="icon" onClick={() => remove(provider.id)} aria-label="Remover">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}


        {isUnipile && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-amber-500 mb-1">⏳ Aguardando ativação pelo administrador</p>
            <p>
              O Unipile é gerenciado centralmente pela plataforma. Assim que o admin liberar sua conta, os botões
              <strong> Conectar LinkedIn / Gmail / Instagram / Telegram</strong> aparecerão aqui automaticamente — você não precisa
              configurar API Key, DSN nem webhooks.
            </p>
          </div>
        )}

      </CardContent>
    </Card>
  );
}

export default function ApisTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="font-medium mb-1">🔐 Suas chaves, seu controle</p>
        <p className="text-muted-foreground">
          As chaves abaixo são salvas criptografadas no banco e usadas apenas pelas suas buscas. Cada cliente tem suas próprias chaves — ninguém vê as suas.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {providers.map((p) => (
          <ProviderCard key={p.id} provider={p} />
        ))}
      </div>
    </div>
  );
}
