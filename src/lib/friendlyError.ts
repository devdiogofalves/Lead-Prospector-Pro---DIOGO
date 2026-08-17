// Tradutor centralizado de erros técnicos para mensagens que a dona da AGREGA
// (ou qualquer operador não-técnico) entende sem precisar ligar pro suporte.
//
// Uso:
//   try { ... } catch (e: any) {
//     toast.error(translateInvokeError(e, "Enriquecimento Dados4U"));
//   }
//
// Não muda fluxo nenhum — só converte string. O contexto é o nome da feature
// que falhou (aparece como prefixo da mensagem), pra dona saber qual módulo
// tem problema sem decifrar JSON ou número de status.

type ErrorLike = unknown;

function getMessage(err: ErrorLike): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;
    const m = obj.message ?? obj.error ?? obj.statusText ?? obj.code;
    if (typeof m === "string") return m;
    try { return JSON.stringify(err).slice(0, 200); } catch { return String(err); }
  }
  return String(err);
}

export function translateInvokeError(err: ErrorLike, contexto: string): string {
  const raw = getMessage(err);
  const lower = raw.toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => lower.includes(n.toLowerCase()));

  // Rate limit / quota da IA
  if (has("429", "rate limit", "too many", "quota")) {
    return `${contexto}: muitas requisições agora. Aguarde 1 minuto e tente de novo.`;
  }

  // Créditos esgotados (IA gateway Lovable, OpenAI, ElevenLabs, Apify, Dados4U)
  if (has("402", "payment required", "credit", "saldo", "esgotad")) {
    return `${contexto}: créditos esgotados. Contate o suporte para recarregar.`;
  }

  // Dados4U usa 404 para "não encontrei dados" — isso não deve derrubar a tela.
  if (has("dados4u 404", "não foi possível encontrar dados", "nao foi possivel encontrar dados")) {
    return `${contexto}: nenhum dado encontrado para esse termo. Tente outro nome, CPF/CNPJ ou telefone.`;
  }

  // LinkedIn (Unipile) 403 subscription_required → conta não-Premium tentando
  // mandar DM pra alguém que não é 1º grau. Sai ANTES do match genérico 401/403
  // pra não traduzir como "chave expirada" (engana o operador).
  if (has("subscription_required", "premium/sales", "exige conexão de 1º grau")) {
    return `${contexto}: LinkedIn exige conexão de 1º grau (sua conta não é Premium/Sales Navigator). Envie a nota de conexão primeiro — quando o lead aceitar, a cadência continua sozinha.`;
  }

  // Auth: chave inválida ou expirada
  if (has("401", "403", "unauthorized", "forbidden", "invalid api key", "invalid token", "expired")) {
    return `${contexto}: chave de API inválida ou expirada. Verifique em Configurações → APIs.`;
  }

  // Integração ausente — env vars ou configs por usuário
  if (has("mandrack_api_key", "mandrack_url", "not configured", "missing key", "configure sua chave")) {
    return `${contexto}: integração não configurada. Confira em Configurações → APIs (ou WhatsApp).`;
  }
  if (has("unipile") && has("api_key", "dsn", "account_id")) {
    return `${contexto}: integração LinkedIn (Unipile) incompleta. Verifique em Configurações → APIs.`;
  }

  // Erros específicos do Unipile (resposta crua "Unipile 4XX: ..."). 422 e 400
  // costumam significar que o lead não é conexão de 1º grau no LinkedIn —
  // precisa enviar nota de conexão primeiro (etapa D+0 Nota de Conexão).
  if (has("unipile 422", "unipile 400", "not a connection", "must be connected", "invalid recipient", "not connected")) {
    return `${contexto}: o lead ainda não é sua conexão no LinkedIn. Envie primeiro a nota de conexão (D+0 Nota de Conexão) e aguarde aceitarem.`;
  }
  // "Destinatário não pode ser alcançado" / "recipient unreachable" — significa
  // que o LinkedIn em si rejeitou a entrega (lead deletou conta, bloqueou o
  // remetente, ou tem privacidade restritiva). Diferente de "not a connection".
  if (has("destinatário não pode ser alcanç", "destinatario nao pode ser alcanc", "recipient unreachable", "cannot be reached", "user not reachable", "user unavailable", "user is unavailable")) {
    return `${contexto}: LinkedIn não conseguiu entregar a mensagem — provavelmente o lead bloqueou contato, deletou conta, ou está com privacidade restritiva. Tente outro contato.`;
  }
  if (has("unipile 429") || (has("unipile") && has("rate"))) {
    return `${contexto}: LinkedIn rate-limit atingido. Aguarde 1-2 horas — o LinkedIn limita DMs por hora para evitar spam.`;
  }
  if (has("unipile 401", "unipile 403") || (has("unipile") && has("unauthorized", "forbidden"))) {
    return `${contexto}: sessão Unipile expirou. Reconecte o LinkedIn em Configurações → APIs.`;
  }
  if (has("unipile") && has("rejected", "spam")) {
    return `${contexto}: LinkedIn rejeitou a mensagem (suspeita de spam). Espere algumas horas, use texto mais natural e evite links.`;
  }
  if (has("unipile")) {
    // Catch-all: prefixa Unipile mas mostra mensagem original truncada
    return `${contexto}: LinkedIn (Unipile) recusou o envio. Tente novamente em alguns minutos. Se persistir, verifique /saude.`;
  }

  // Manutenção / instabilidade do provedor externo
  if (has("503", "504", "maintenance", "manuten", "service unavailable", "bad gateway", "502")) {
    return `${contexto}: API do provedor está fora do ar agora. Aguarde alguns minutos e tente de novo.`;
  }

  // Sem conexão de rede
  if (has("network", "failed to fetch", "networkerror", "connection refused", "timeout")) {
    return `${contexto}: sem conexão com o servidor. Verifique sua internet e tente novamente.`;
  }

  // Conteúdo inválido / validação no backend
  if (has("400", "bad request", "validation", "obrigat", "required")) {
    return `${contexto}: dados incompletos ou inválidos. Confira os campos preenchidos.`;
  }

  // Edge function não encontrada (deploy faltando)
  if (has("404", "not found", "function not found")) {
    return `${contexto}: serviço indisponível no momento. Contate o suporte.`;
  }

  // WhatsApp específico (Mandrack devolve erros assim)
  if (has("instance not", "not paired", "disconnected", "qr")) {
    return `${contexto}: WhatsApp desconectado. Reabra o pareamento em Configurações → WhatsApp.`;
  }

  // 5xx genérico (servidor caiu)
  if (has("500", "internal server error", "edge function returned")) {
    return `${contexto}: erro temporário no servidor. Tente novamente em alguns segundos — se persistir, contate o suporte.`;
  }

  // Fallback — não engole o detalhe, mas embrulha em linguagem clara
  const ref = raw ? raw.slice(0, 60).replace(/\s+/g, " ") : "sem detalhe";
  return `${contexto}: ocorreu um erro inesperado. Se continuar, contate o suporte (ref: ${ref}).`;
}
