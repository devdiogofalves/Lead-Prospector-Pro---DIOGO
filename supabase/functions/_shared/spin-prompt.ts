// _shared/spin-prompt.ts
// Fonte única de verdade do SPIN + Rapport. Todos os canais (Email, IG DM,
// Telegram, WhatsApp, LinkedIn DM, Campanhas, Follow-ups) importam daqui.
//
// Uso:
//   const ctx = await loadProspectContext(admin, userId);
//   const system = buildSpinSystem({ channel: "email", stage: "abertura", ctx });
//   const out = await callTextLLM(admin, userId, { system, user: prompt, json: true });

import { aiChat } from "./ai-chat.ts";
import { generateOpenAIImages, getResolvedMediaKeys } from "./ai-media.ts";
import { identityRules, FORBIDDEN_VOCAB } from "./prompt-core.ts";

export type Channel =
  | "email"
  | "instagram"
  | "telegram"
  | "whatsapp"
  | "linkedin"
  | "campaign"
  | "followup";

export type SpinStage =
  | "abertura"      // 1º contato — Situação leve + observação específica
  | "situacao"      // S — Situação
  | "problema"      // P — Problema
  | "implicacao"    // I — Implicação
  | "necessidade"   // N — Need Payoff
  | "encerramento"; // fechamento elegante

export interface ProspectContext {
  branding: any;
  profile: any;   // prospecting_profiles
  briefing: any;  // mavi_briefing (ICP, SPIN bank, value props)
  agent_name: string;
  company_name: string;
}

export async function loadProspectContext(admin: any, userId: string): Promise<ProspectContext> {
  const [{ data: branding }, { data: profile }, { data: briefing }] = await Promise.all([
    admin.from("company_branding").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("prospecting_profiles").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("mavi_briefing").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    branding,
    profile,
    briefing,
    agent_name: branding?.agent_name?.trim() || "IA assistente",
    company_name: branding?.company_name?.trim() || "nossa empresa",
  };
}

const RAPPORT_RULES = `
RAPPORT (regras absolutas, valem em TODOS os canais):
- Abertura SEMPRE com observação concreta e específica sobre o lead (nome, cargo, segmento, conteúdo recente, bio). NUNCA "Olá, tudo bem?", "Espero que esteja bem", "Vi seu perfil", "Vamos conectar?".
- Use o primeiro nome do contato UMA vez no início, e SÓ se for nome próprio real.
- Fale como pessoa real escrevendo de cabeça, não bot rodando template. Sem "interessante", "ótimo", "fantástico".
- Nunca prometa resultado. Nunca cite preço. Nunca peça reunião na abertura.
- Sem gírias jovens forçadas ("bora", "fechou", "tmj"), sem emojis em LinkedIn/Email.
- Uma pergunta por mensagem. Aberta, não fechada.`;

const SPIN_RULES = `
SPIN SELLING (metodologia obrigatória):
- S (Situação): entender o contexto operacional atual SEM julgar.
- P (Problema): identificar dor real do segmento, sem pitch.
- I (Implicação): amplificar consequência (caixa, time, crescimento, oportunidade perdida).
- N (Need Payoff): lead VERBALIZA a necessidade — só aqui você apresenta a empresa em 1 frase + convite leve.
- 1 fase por mensagem. NUNCA misture S+P+I+N numa mensagem só.`;

function briefingBlock(ctx: ProspectContext): string {
  const b = ctx.briefing ?? {};
  const p = ctx.profile ?? {};
  const parts: string[] = [];
  const arr = (v: any) => Array.isArray(v) ? v.filter(Boolean).join(" | ") : (typeof v === "string" ? v : "");
  const add = (label: string, value: any) => {
    const text = arr(value)?.trim?.() || "";
    if (text) parts.push(`${label}: ${text}`);
  };

  // Dados reais salvos no Treinar IA → Negócio. Estes campos existem no schema
  // atual e devem guiar todos os canais que usam este prompt compartilhado.
  add("Produto/serviço", p.produto);
  add("Público-alvo", p.publico_alvo);
  add("Ticket médio", p.ticket_medio);
  add("Região", p.regiao);
  add("Diferenciais", p.diferenciais);
  add("O que já tentou / evitar repetir", p.ja_tentou);

  // Knowledge Pack atual do Treinar IA → Aprendizado/SPIN.
  add("ICP (lead ideal)", b.icp_descricao ?? b.icp);
  add("Segmentos-alvo", b.segmentos_alvo);
  add("Portes-alvo", b.portes_alvo);
  add("Personas decisoras", b.personas_alvo);
  add("Gatilhos de compra", b.gatilhos_compra);
  add("Objeções comuns", b.objecoes_comuns);
  add("Abordagem preferida", b.abordagem_preferida);
  add("Clientes-referência / prova social", b.clientes_referencia ?? b.cases);
  add("Propostas de valor", b.value_props);

  // Banco SPIN do usuário — perguntas reais que ele cadastrou
  const bank: string[] = [];
  const sb = b.spin_bank ?? {};
  const spinSituacao = arr(sb.situacao ?? b.spin_situacao);
  const spinProblema = arr(sb.problema ?? b.spin_problema);
  const spinImplicacao = arr(sb.implicacao ?? b.spin_implicacao);
  const spinNecessidade = arr(sb.need_payoff ?? sb.necessidade ?? b.spin_necessidade);
  if (spinSituacao) bank.push(`PERGUNTAS S (use uma destas, adaptando):\n${spinSituacao}`);
  if (spinProblema) bank.push(`PERGUNTAS P:\n${spinProblema}`);
  if (spinImplicacao) bank.push(`PERGUNTAS I:\n${spinImplicacao}`);
  if (spinNecessidade) bank.push(`PERGUNTAS N:\n${spinNecessidade}`);
  if (bank.length > 0) parts.push(bank.join("\n\n"));

  if (parts.length === 0) {
    return `(Briefing vazio — o usuário ainda não preencheu /assistente. Use linguagem genérica B2B consultiva.)`;
  }
  return parts.join("\n\n");
}

const CHANNEL_RULES: Record<Channel, string> = {
  email: `
CANAL: E-MAIL FRIO
- Subject: 4-8 palavras, PT-BR, sem caps lock, sem emoji, sem clickbait. Específico do lead/segmento.
- Corpo: 80-130 palavras. Estrutura em 3 blocos curtos (parágrafos de 1-3 linhas):
  1) Abertura específica do lead.
  2) Observação consultiva sobre desafio do segmento + 1 pergunta diagnóstica.
  3) CTA leve: "faz sentido trocar 15 min essa semana?".
- HTML permitido no body: <strong>, <em>, <br>. Use <strong> em 1-2 trechos chave (número, palavra do diagnóstico) e <em> em 1 nuance sutil. NUNCA markdown (**, *). Nada de <style>, <table>, <img>, <script>, <a>.
- Assinatura no final: "— {AGENT}, {COMPANY}".`,

  instagram: `
CANAL: INSTAGRAM DM
- 50-90 palavras, português brasileiro.
- Tom casual de DM (não e-mail). Pode usar até 1 emoji sutil no final.
- NUNCA enviar link (Instagram penaliza/esconde DMs com link).
- Não chame pra WhatsApp na 1ª mensagem.
- Termine SEMPRE com 1 pergunta aberta.`,

  telegram: `
CANAL: TELEGRAM
- 60-110 palavras, português brasileiro.
- Texto LIMPO e bem espaçado: parágrafos de 1-2 linhas separados por linha em branco. NUNCA texto embolado num bloco só.
- Pode incluir 1 URL completo cru (https://...) se fizer sentido — Telegram torna clicável automaticamente. Sem markdown [texto](link).
- Sem emojis em excesso (máximo 1).
- Termine com 1 pergunta OU com opções numeradas: "Responde 1 = quero saber mais, 2 = me conta depois, 3 = agora não faz sentido".`,

  whatsapp: `
CANAL: WHATSAPP
- 40-80 palavras. Tom humano, conversacional.
- 1 pergunta por mensagem, sempre aberta.
- Sem links na 1ª mensagem. Sem emojis em excesso.`,

  linkedin: `
CANAL: LINKEDIN DM
- 60-110 palavras (nota de conexão: máximo 280 caracteres).
- Sem emojis. Sem links. Sem "vamos conectar" / "bora conectar" — frases-clichê queimadas.
- 1 pergunta por mensagem.`,

  campaign: `
CANAL: CAMPANHA MULTICANAL
- Adapte ao canal especificado no contexto da mensagem.
- Mantenha SPIN + Rapport intactos.`,

  followup: `
CANAL: FOLLOW-UP
- NUNCA escreva "fazendo follow-up" / "passando pra reforçar" / "ainda em pé minha pergunta".
- Comece com NOVO ângulo: dado de mercado, pergunta diferente, observação contrária.
- Avance 1 fase do SPIN em relação à mensagem anterior.`,
};

const STAGE_RULES: Record<SpinStage, string> = {
  abertura: `FASE ATUAL: ABERTURA (Rapport + Situação leve). Faça observação específica do lead + 1 pergunta de situação. Sem pitch.`,
  situacao: `FASE ATUAL: SITUAÇÃO (S). 1 pergunta aberta sobre operação atual. Sem pitch. Sem mencionar a empresa.`,
  problema: `FASE ATUAL: PROBLEMA (P). 1 pergunta que provoca reflexão sobre o que NÃO funciona hoje. Sem pitch.`,
  implicacao: `FASE ATUAL: IMPLICAÇÃO (I). Amplifique consequência do problema (caixa, time, crescimento). Pode citar dado de mercado. Sem pitch direto.`,
  necessidade: `FASE ATUAL: NEED PAYOFF (N). Agora SIM apresente a empresa em 1 frase + convite leve para conversa de 15min.`,
  encerramento: `FASE ATUAL: ENCERRAMENTO. 2-3 linhas. Sem pergunta. Porta aberta, sem ressentimento.`,
};

export interface BuildOpts {
  channel: Channel;
  stage?: SpinStage;
  ctx: ProspectContext;
  extraInstructions?: string;
}

export function buildSpinSystem(opts: BuildOpts): string {
  const stage = opts.stage ?? "abertura";
  const userSp = String(opts.ctx.profile?.system_prompt ?? "").trim() || String(opts.ctx.profile?.agent_system_prompt ?? "").trim();

  return [
    `Você é um SDR B2B brasileiro consultivo representando ${opts.ctx.company_name}.`,
    identityRules(opts.ctx.agent_name, opts.ctx.company_name),
    `Sempre assine como "— ${opts.ctx.agent_name}, ${opts.ctx.company_name}".`,
    `Vocabulário corporativo/robótico PROIBIDO: ${FORBIDDEN_VOCAB.join(", ")}.`,
    RAPPORT_RULES,
    SPIN_RULES,
    `\n=== BRIEFING DA EMPRESA (use isto para personalizar — nunca invente dados) ===\n${briefingBlock(opts.ctx)}\n=== FIM BRIEFING ===`,
    userSp ? `\n=== INSTRUÇÕES EXTRAS DO OPERADOR ===\n${userSp.slice(0, 2000)}\n=== FIM EXTRAS ===` : "",
    CHANNEL_RULES[opts.channel],
    STAGE_RULES[stage],
    opts.extraInstructions ?? "",
    `\nFORMATO DE SAÍDA: JSON estrito conforme solicitado no prompt do usuário. Sem markdown extra, sem comentários fora do JSON.`,
  ].filter(Boolean).join("\n");
}

// ============================================================================
// LLM caller - usa OpenAI/Gemini resolvidos por tenant ou admin compartilhado.
// ============================================================================

export interface LLMOpts {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
}

async function getResolvedAIKeys(admin: any, userId: string): Promise<{ openaiKey?: string; geminiKey?: string }> {
  try {
    const [{ data: ok }, { data: gk }] = await Promise.all([
      admin.rpc("get_ai_key_for_user", { _user_id: userId, _provider: "openai" }),
      admin.rpc("get_ai_key_for_user", { _user_id: userId, _provider: "gemini" }),
    ]);
    return {
      openaiKey: String(ok ?? "").trim() || undefined,
      geminiKey: String(gk ?? "").trim() || undefined,
    };
  } catch { return {}; }
}

export async function callTextLLM(admin: any, userId: string, opts: LLMOpts): Promise<string> {
  const keys = await getResolvedAIKeys(admin, userId);
  const out = await aiChat({
    openaiKey: keys.openaiKey,
    geminiKey: keys.geminiKey,
    messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.user }],
    temperature: 0.75,
    max_tokens: opts.maxTokens ?? 800,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });
  return out.text;
}

// ============================================================================
// Image generation — Gemini Flash Image (Nano Banana) via Lovable Gateway
// Retorna data URL pronto pra <img src=...>
// ============================================================================

export async function generateHeroImage(admin: any, userId: string, prompt: string): Promise<string | null> {
  try {
    const keys = await getResolvedMediaKeys(admin, userId);
    if (!keys.openaiKey) return null;
    const out = await generateOpenAIImages({
      admin,
      userId,
      apiKey: keys.openaiKey,
      prompt,
      count: 1,
      aspectRatio: "16:9",
    });
    return out.urls[0] ?? null;
  } catch { return null; }
}
