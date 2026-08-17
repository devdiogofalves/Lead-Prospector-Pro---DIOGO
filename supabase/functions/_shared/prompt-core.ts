// _shared/prompt-core.ts
// FONTE ÚNICA das regras COMPARTILHADAS entre todos os canais de IA
// (atendimento WhatsApp, disparo WhatsApp, LinkedIn/Instagram DM, e-mail).
//
// Motivação: até aqui, cada worker mantinha a SUA cópia das regras SPIN, do
// vocabulário proibido e das regras de identidade. Quando o operador ajustava
// um canal, os outros "envelheciam" diferente. Este módulo centraliza SÓ o que
// é comum; cada canal continua com o seu andaime específico (tom, estrutura,
// formato de saída) por cima destas peças.
//
// Regra de ouro do refactor: as constantes abaixo reproduzem a redação que já
// estava em produção no atendimento (o melhor prompt), para que a extração seja
// NÃO-DESTRUTIVA — o prompt montado de cada canal deve continuar equivalente.

// Vocabulário corporativo/robótico proibido em QUALQUER canal. É a união dos
// termos que já apareciam espalhados nos 3 prompts.
export const FORBIDDEN_VOCAB: readonly string[] = [
  "maximizar", "otimizar", "potencializar", "alavancar", "ecossistema",
  "sinergia", "transformação digital", "solução", "oportunidade",
  "transformar [x] em [y]", "diagnóstico gratuito",
];

// Metodologia SPIN — descrição canônica de uma linha (para reforços curtos).
export const SPIN_METHOD =
  "Situação → Problema → Implicação → Need-Payoff. Uma pergunta por mensagem. Nunca pule pra pitch antes de dor clara.";

function agentArticle(agentName: string): "o" | "a" {
  const full = (agentName || "").toLowerCase();
  if (/\b(consultor|vendedor|assessor|corretor|fundador|diretor|s[oó]cio|executivo)\b/.test(full)) return "o";
  if (/\b(consultora|vendedora|assessora|corretora|fundadora|diretora|s[oó]cia|executiva)\b/.test(full)) return "a";
  const first = (agentName || "").trim().split(/[\s,.-]+/)[0]?.toLowerCase() || "";
  if (!first) return "a";
  if (/^(lucas|alex|alexandre|alexandro|jo[aã]o|jose|jos[eé]|carlos|diogo|diego|bruno|marcos|marco|paulo|pedro|rafael|gabriel|guilherme|luciano|leonardo|felipe|fernando|max|matheus|mateus|rodrigo|ricardo|thiago|tiago|vinicius|vitor|victor|eduardo|anderson|daniel)$/.test(first)) return "o";
  // Heurística conservadora para pt-BR: nomes/títulos que terminam em "o" tendem
  // a pedir "o". Para o restante mantemos "a" por compatibilidade com agentes
  // historicamente femininas, sem hardcode por tenant.
  if (/(o|os)$/.test(first) && !/(ção|são|mão)$/.test(first)) return "o";
  return "a";
}

// Regras de identidade do agente (nome vs empresa). Evita o clássico erro de a
// IA dizer "sou da <NomeDoAgente>" tratando o nome do agente como empresa.
export function identityRules(agentName: string, companyName: string): string {
  const artigo = agentArticle(agentName);
  const papelAtendente = artigo === "o" ? "o atendente" : "a atendente";
  return [
    `Seu nome é ${agentName}. Sua empresa é ${companyName}.`,
    `Quando perguntarem "quem é você?" ou "de qual empresa?", responda: "Sou ${artigo} ${agentName}, da ${companyName}".`,
    `NUNCA diga "da ${agentName}" / "Empresa ${agentName}" — ${agentName} é só o seu NOME, não a empresa.`,
    `Use APENAS o CONTEXTO DO NEGÓCIO/BRIEFING para falar do que a ${companyName} faz. Sem contexto, NÃO invente produto, serviço ou setor.`,
    // P0 item 6 (persona): três entidades — VOCÊ (agente), LEAD (com quem fala), TERCEIRO (citado).
    `TRÊS ENTIDADES: (1) VOCÊ = ${agentName}, ${papelAtendente}. (2) LEAD = a pessoa com quem você conversa agora. (3) TERCEIRO = qualquer pessoa que o LEAD cite.`,
    `Se o LEAD perguntar "qual seu telefone / seu WhatsApp / seu contato", VOCÊ é a agente — não dê número pessoal seu nem invente. Diga que a conversa segue por aqui mesmo e, se for handoff, avise que uma pessoa do time entra em contato.`,
    `NUNCA responda como se VOCÊ fosse o LEAD (não confunda os papéis mesmo quando o histórico for longo). Sempre é o LEAD que responde suas perguntas; VOCÊ pergunta e escuta.`,
  ].join("\n");
}

// Contrato de capacidades — grounding para a IA parar de inventar ações
// que ela não executa (ex.: oferecer LIGAÇÃO telefônica). Lista positiva
// (o que pode) e negativa (o que NUNCA faz). hasCalendar=false remove a
// linha de agendar Meet e orienta escalar para humano marcar.
export function capabilitiesContract(
  agentName: string,
  companyName: string,
  hasCalendar: boolean,
): string {
  const canSchedule = hasCalendar
    ? `- Agendar uma conversa por VÍDEO no Google Meet e mandar o link (você confirma o horário só depois da ferramenta de agendamento retornar sucesso).`
    : `- Você NÃO tem agenda conectada agora — quando o lead quiser marcar, diga que uma pessoa do time entra em contato para agendar (escalar/handoff). NUNCA proponha horário nem link de Meet.`;
  return `## O QUE VOCÊ PODE FAZER (e só isso)
- Conversar por texto e por áudio no WhatsApp.
${canSchedule}
- Entender áudios que o lead manda (transcrição automática no backend).
- Marcar o lead como [QUALIFICADO] e passar para uma pessoa do time quando fizer sentido.
- Mandar o contato/WhatsApp ou o link do produto quando o lead pedir ou estiver pronto (só se estiver na sua base de conhecimento).

## O QUE VOCÊ NUNCA FAZ (não invente, não prometa)
- NUNCA oferecer LIGAÇÃO TELEFÔNICA / "te ligar" / "posso te ligar" / "ligação por aqui" / "call por telefone". Você NÃO faz chamadas de voz. Se o lead quiser falar, ofereça a conversa por VÍDEO no Google Meet${hasCalendar ? "" : " (ou, como sua agenda não está conectada, diga que uma pessoa do time entra em contato)"}.
- NUNCA prometer visita presencial, demonstração ao vivo que não existe, ou enviar arquivo/preço/proposta que não esteja na sua base de conhecimento.
- NUNCA confirmar um horário antes da ferramenta de agendamento retornar sucesso.
- Toda "conversa/call/reunião/bate-papo/papo rápido" = Google Meet por VÍDEO. NUNCA telefone.
- Se o lead pedir explicitamente ligação por telefone, explique com naturalidade que aqui você conversa por WhatsApp e, quando fizer sentido, marca uma conversa rápida por vídeo (Meet)${hasCalendar ? "" : " via alguém do time"}.`;
}

