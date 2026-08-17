// social-brain.ts — Cérebro único de auto-engajamento social (Instagram/LinkedIn). v2 2026-07-18
// Fonte única para: contexto rico (catálogo, dono, RAG, histórico, post),
// decisão SPIN via IA (com guard anti-alucinação de produto) e escalação
// "no máximo 1 bloco" (link do produto OU contato do dono).
//
// Usado por:
//  - meta-instagram-webhook (Meta Graph API)
//  - social-comment-responder (Unipile)
//
// NÃO altera transporte (Meta vs Unipile) nem proteções específicas
// (cooldown, dedup, require_follower, keyword). Só unifica o "cérebro".

import { generateAIContent } from "./ai-json.ts";
import { retrieveKnowledgeBlock } from "./knowledge.ts";
import { FORBIDDEN_VOCAB, identityRules } from "./prompt-core.ts";

export type ProductLite = {
  name: string;
  description?: string | null;
  link?: string | null;
  is_default?: boolean;
};

export type OwnerContact = { wa_url: string | null; label: string | null } | null;

export type HistoryEntry = { role: "actor" | "agent"; text: string };

export type EngageContext = {
  businessContext: string;
  tenantSystemPrompt: string;
  agentName: string;
  companyName: string;
  products: ProductLite[];
  postProduct: ProductLite | null;
  ownerContact: OwnerContact;
  knowledgeBlock: string;
  history: HistoryEntry[];
  caption: string;
  hashtags: string;
  defaultLink: string;
  moveToDm: boolean;
  // internos p/ decideEngagement
  _admin: any;
  _userId: string;
};

export type Decision = {
  public_reply: string | null;
  dm_text: string | null;
  spin_stage: "S" | "P" | "I" | "N" | "qualified" | null;
  qualified: boolean;
  recommend_product: { name: string; link: string } | null;
  send_owner_contact: boolean;
  error: string | null;
};

const TONE_GUIDE: Record<string, string> = {
  casual: "Tom humano, direto e leve, com no máximo 1 emoji.",
  professional: "Tom profissional, claro, objetivo, sem emojis.",
  consultive: "Tom consultivo SPIN: uma pergunta curta por mensagem, sem pitch agressivo.",
};

// ────────────────────────────────────────────────────────────────────────────
// Loaders (todos fail-safe)
// ────────────────────────────────────────────────────────────────────────────

async function loadBusinessContext(admin: any, userId: string): Promise<{
  block: string;
  agentName: string;
  companyName: string;
  tenantSystemPrompt: string;
}> {
  try {
    const [{ data: prof }, { data: brief }, { data: brand }] = await Promise.all([
      admin.from("prospecting_profiles").select("produto, publico_alvo, diferenciais, system_prompt, agent_system_prompt").eq("user_id", userId).maybeSingle(),
      admin.from("mavi_briefing").select("icp_descricao, value_props").eq("user_id", userId).maybeSingle(),
      admin.from("company_branding").select("company_name, agent_name").eq("user_id", userId).maybeSingle(),
    ]);
    const block = [
      brand?.company_name ? `Empresa: ${brand.company_name}${brand.agent_name ? ` / agente: ${brand.agent_name}` : ""}` : "",
      prof?.produto ? `Produto: ${prof.produto}` : "",
      prof?.publico_alvo ? `Público: ${prof.publico_alvo}` : "",
      prof?.diferenciais ? `Diferenciais: ${prof.diferenciais}` : "",
      brief?.icp_descricao ? `ICP: ${brief.icp_descricao}` : "",
      brief?.value_props?.length ? `Value props: ${brief.value_props.join(" | ")}` : "",
    ].filter(Boolean).join("\n") || "(briefing do negócio não preenchido)";
    return {
      block,
      agentName: (brand as any)?.agent_name || "IA assistente",
      companyName: (brand as any)?.company_name || "nossa empresa",
      tenantSystemPrompt: String((prof as any)?.agent_system_prompt || (prof as any)?.system_prompt || "").slice(0, 4000),
    };
  } catch {
    return { block: "(briefing do negócio não preenchido)", agentName: "IA assistente", companyName: "nossa empresa", tenantSystemPrompt: "" };
  }
}

async function loadProductsCatalog(admin: any, userId: string): Promise<ProductLite[]> {
  try {
    const { data } = await admin
      .from("social_products")
      .select("name, description, link, is_default, active")
      .eq("user_id", userId)
      .eq("active", true)
      .order("is_default", { ascending: false })
      .limit(20);
    return ((data as any[]) ?? [])
      .filter((p) => p?.name)
      .map((p) => ({ name: p.name, description: p.description, link: p.link, is_default: p.is_default }));
  } catch {
    return [];
  }
}

async function loadProductById(admin: any, id: string | null | undefined): Promise<ProductLite | null> {
  if (!id) return null;
  try {
    const { data } = await admin
      .from("social_products")
      .select("name, description, link, is_default")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return { name: (data as any).name, description: (data as any).description, link: (data as any).link, is_default: (data as any).is_default };
  } catch {
    return null;
  }
}

function normalizePhoneToWaUrl(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D+/g, "");
  if (digits.length < 10) return null;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

async function loadOwnerContact(admin: any, userId: string): Promise<OwnerContact> {
  try {
    const { data } = await admin
      .from("company_branding")
      .select("whatsapp_number, whatsapp_cta_label")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return null;
    const wa = normalizePhoneToWaUrl((data as any).whatsapp_number);
    if (!wa) return null;
    return { wa_url: wa, label: (data as any).whatsapp_cta_label || "👉 Fala direto com a gente" };
  } catch {
    return null;
  }
}

async function loadKnowledge(admin: any, userId: string, query: string): Promise<string> {
  try {
    const { data: gkey } = await admin.rpc("get_ai_key_for_user", { _user_id: userId, _provider: "gemini" });
    return await retrieveKnowledgeBlock(admin, userId, query, gkey as string | null);
  } catch {
    return "";
  }
}

async function loadConversationHistory(
  admin: any,
  userId: string,
  actorId: string,
): Promise<HistoryEntry[]> {
  if (!actorId) return [];
  try {
    const { data } = await admin
      .from("social_post_interactions")
      .select("content, dm_content, reply_content, created_at, dm_sent, replied")
      .eq("user_id", userId)
      .eq("actor_provider_id", actorId)
      .order("created_at", { ascending: false })
      .limit(6);
    const rows = ((data as any[]) ?? []).reverse();
    const history: HistoryEntry[] = [];
    for (const row of rows) {
      if (row.content) history.push({ role: "actor", text: String(row.content).slice(0, 240) });
      const agentText = row.dm_content || row.reply_content;
      if (agentText && (row.dm_sent || row.replied)) history.push({ role: "agent", text: String(agentText).slice(0, 240) });
    }
    return history.slice(-6);
  } catch {
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// API pública
// ────────────────────────────────────────────────────────────────────────────

export async function buildEngageContext(
  admin: any,
  userId: string,
  opts: {
    post?: any | null;
    actorProviderId?: string | null;
    leadText?: string;
    defaultLink?: string;
    moveToDm?: boolean;
  },
): Promise<EngageContext> {
  const post = opts.post ?? null;
  const actorId = opts.actorProviderId ?? "";
  const leadText = opts.leadText ?? "";
  const [biz, products, postProduct, ownerContact, knowledgeBlock, history] = await Promise.all([
    loadBusinessContext(admin, userId),
    loadProductsCatalog(admin, userId),
    loadProductById(admin, post?.product_id ?? null),
    loadOwnerContact(admin, userId),
    loadKnowledge(admin, userId, leadText),
    loadConversationHistory(admin, userId, actorId),
  ]);
  return {
    businessContext: biz.block,
    tenantSystemPrompt: biz.tenantSystemPrompt,
    agentName: biz.agentName,
    companyName: biz.companyName,
    products,
    postProduct,
    ownerContact,
    knowledgeBlock,
    history,
    caption: String(post?.caption ?? ""),
    hashtags: String(post?.hashtags ?? ""),
    defaultLink: opts.defaultLink ?? "",
    moveToDm: opts.moveToDm !== false,
    _admin: admin,
    _userId: userId,
  };
}

export async function decideEngagement(args: {
  ctx: EngageContext;
  eventType: string;
  text: string;
  tone: string;
  baseDm: string;
  name: string;
}): Promise<Decision> {
  const { ctx } = args;
  const productList = ctx.products.length
    ? ctx.products.slice(0, 8).map((p) =>
        `- ${p.name}${p.description ? ` — ${String(p.description).slice(0, 120)}` : ""}${p.link ? ` [${p.link}]` : ""}${p.is_default ? " (padrão)" : ""}`
      ).join("\n")
    : "(sem catálogo cadastrado)";
  const postProductBlock = ctx.postProduct
    ? `\nProduto associado ao post: ${ctx.postProduct.name}${ctx.postProduct.link ? ` [${ctx.postProduct.link}]` : ""}`
    : "";
  const ownerBlock = ctx.ownerContact?.wa_url
    ? `\nContato do dono (usar SOMENTE se lead qualificado ou pedir para falar com humano): ${ctx.ownerContact.wa_url}`
    : "";
  const historyBlock = ctx.history.length
    ? `\n\nHistórico recente (últimas ${ctx.history.length} mensagens):\n${ctx.history.map((m) => `${m.role === "actor" ? args.name : "Você"}: ${m.text}`).join("\n")}`
    : "";

  const forbiddenLine = `Vocabulário PROIBIDO (nunca escreva nada disto): ${FORBIDDEN_VOCAB.join(", ")}.`;
  const identity = identityRules(ctx.agentName || "IA assistente", ctx.companyName || "nossa empresa");
  const tenantPrompt = ctx.tenantSystemPrompt
    ? `\n\n=== ROTEIRO DA EMPRESA (siga religiosamente, sobrescreve o padrão) ===\n${ctx.tenantSystemPrompt}\n=== FIM DO ROTEIRO ===`
    : "";

  const sys = `Você é um humano de verdade — SDR sênior — respondendo mensagens/comentários no Instagram em PT-BR do Brasil. NÃO soa como robô, atendente de chatbot nem "IA prestativa".
${identity}

${TONE_GUIDE[args.tone] ?? TONE_GUIDE.consultive}
Metodologia SPIN (S→P→I→N). UMA pergunta curta por mensagem — nunca duas.

REGRA #1 — ESPECIFICIDADE (a mais importante):
Você DEVE reagir ao conteúdo EXATO da mensagem do lead. Cite/parafraseie 3-6 palavras do que ele escreveu. Se a mensagem é vaga ("oi", "quero saber mais"), pergunte 1 coisa concreta sobre o negócio dele (segmento, tamanho, dor). PROIBIDO responder algo que caberia em qualquer conversa.

Como um humano escreve DM/comentário no IG:
- Frases curtas, PT-BR coloquial ("tá", "pra", "cê", "beleza"). Zero jargão corporativo.
- NUNCA comece com "Olá!", "Prezado", "Espero que esteja bem" ou "Tudo bem?". Comece direto ou com "Oi Fulano!" / "Fala Fulano!" / "E aí Fulano!".
- Se o histórico já mostra que você cumprimentou, NÃO cumprimente de novo — continua a conversa como amigo.
- Comentário público: 1 linha SUPER curta (até ~12 palavras), tipo amigo respondendo. Sem "Fico à disposição".
- DM: 2-3 linhas MAX. Estrutura: (1) reação específica ao que ele disse → (2) UMA pergunta que qualifica → (opcional 3) link/contato só se hora certa.
- No máximo 1 emoji na mensagem inteira. Zero se o tom é professional.

EXEMPLOS DO QUE NUNCA FAZER (vetado):
- "Olá! Espero que esteja bem. Que legal seu interesse! Como podemos ajudar você a otimizar seus resultados?" ← genérico, robô, 2 perguntas embutidas.
- "Oi! Que ótimo receber sua mensagem 😊 Nossa solução é perfeita pra você. Fico à disposição!" ← puxa-saco, sem pergunta, jargão.

EXEMPLOS DO QUE FAZER (bom):
- Lead diz "tenho agência de tráfego e quero automatizar prospecção" → "Fala! Agência de tráfego prospectando pra quem? B2B ou infoprodutor?"
- Lead comenta "🔥" no post → resposta pública: "Valeu! 🙌 Te chamei no direct."
- Lead diz "quanto custa" → "Depende do volume. Cê dispara pra quantos leads/mês hoje?"

${forbiddenLine}

Regras invioláveis:
- Nunca invente produto/preço/promessa. Só recomende produto que esteja no CATÁLOGO (nome + link EXATOS).
- Só envie contato do dono se o lead demonstrar intenção clara ("quero", "como comprar", "preço", "falar com humano") OU se pedir explicitamente.
- Não repita pergunta que já está no histórico.
- Se moveToDm=false devolva dm_text=null.
- public_reply é obrigatório para eventType=comment (1 linha curta convidando pro direct); use null para DM/story_reply.
${tenantPrompt}

Responda APENAS um JSON válido no formato exato:
{"public_reply": string|null, "dm_text": string|null, "spin_stage": "S"|"P"|"I"|"N"|"qualified", "qualified": boolean, "recommend_product": {"name": string, "link": string}|null, "send_owner_contact": boolean}`;

  const user = `Negócio:
${ctx.businessContext}

Catálogo de produtos:
${productList}${postProductBlock}${ownerBlock}
${ctx.knowledgeBlock || ""}

Contexto do post/story: ${ctx.caption || "(sem legenda)"}${ctx.hashtags ? `\nHashtags: ${ctx.hashtags}` : ""}
Tipo de evento: ${args.eventType}
Nome do lead: ${args.name}
Mensagem atual do lead: "${args.text}"${historyBlock}

DM base sugerida (referência; reescreva com naturalidade humana): "${args.baseDm}"
moveToDm=${ctx.moveToDm}`;

  const callAi = async (extraSys = "") => {
    const content = await generateAIContent(ctx._admin, ctx._userId, {
      system: sys + extraSys,
      user,
      json: true,
      maxTokens: 700,
      temperature: 0.55,
      openaiModel: "gpt-5.5",
    });
    return JSON.parse(String(content ?? "{}").replace(/```json|```/g, "").trim());
  };

  const isBadReply = (txt: string | null | undefined): boolean => {
    if (!txt) return false;
    const s = String(txt).toLowerCase();
    if (FORBIDDEN_VOCAB.some((w) => s.includes(w.toLowerCase()))) return true;
    // Aberturas robotizadas / puxa-saco
    if (/^\s*(olá!|prezado|espero que esteja bem|tudo bem\?|que legal|que [oó]timo|que bom saber)/i.test(txt)) return true;
    // Genérico demais / chatbot
    if (/entre em contato|estamos à disposi[çc][aã]o|fico à disposi[çc][aã]o|qualquer d[úu]vida|como (posso|podemos) (te )?ajudar|nossa (solu[çc][aã]o|equipe)/i.test(s)) return true;
    return false;
  };

  try {
    let parsed = await callAi();
    // Retry se resposta gerou jargão/abertura robô ou vazia
    const badDm = isBadReply(parsed?.dm_text);
    const badPub = args.eventType === "comment" && isBadReply(parsed?.public_reply);
    const emptyDm = ctx.moveToDm && !String(parsed?.dm_text ?? "").trim();
    if (badDm || badPub || emptyDm) {
      console.warn("[social-brain] retry (bad/generic reply)", { badDm, badPub, emptyDm });
      parsed = await callAi(`\n\n[REFAÇA] A resposta anterior soou robótica/genérica. Reescreva em português BR coloquial, curto, humano. Não comece com "Olá!" nem "Espero que esteja bem". Nada de "solução", "otimizar", "à disposição". Reaja ao que a pessoa escreveu.`);
    }

    const rec = parsed.recommend_product && typeof parsed.recommend_product === "object"
      ? { name: String(parsed.recommend_product.name ?? ""), link: String(parsed.recommend_product.link ?? "") }
      : null;
    let validatedRec: { name: string; link: string } | null = null;
    if (rec && (rec.link || rec.name)) {
      const hit = ctx.products.find((p) =>
        (p.link && rec.link && p.link === rec.link) ||
        (p.name && rec.name && p.name.toLowerCase() === rec.name.toLowerCase())
      );
      if (hit && hit.link) validatedRec = { name: hit.name, link: hit.link };
    }
    const stageRaw = String(parsed.spin_stage ?? "").toUpperCase();
    const stage = (["S", "P", "I", "N", "QUALIFIED"].includes(stageRaw)
      ? (stageRaw === "QUALIFIED" ? "qualified" : stageRaw)
      : null) as Decision["spin_stage"];
    return {
      public_reply: parsed.public_reply ?? null,
      dm_text: ctx.moveToDm ? (parsed.dm_text ?? null) : null,
      spin_stage: stage,
      qualified: !!parsed.qualified,
      recommend_product: validatedRec,
      send_owner_contact: !!parsed.send_owner_contact,
      error: null,
    };
  } catch (e) {
    const reason = String((e as Error)?.message ?? e).slice(0, 200);
    console.error("[social-brain] decideEngagement fallback", reason);
    return {
      public_reply: args.eventType === "comment" ? `Te chamei no direct, ${args.name}!` : null,
      dm_text: ctx.moveToDm ? (args.baseDm || fallbackDm(args.name, args.eventType)) : null,
      spin_stage: null,
      qualified: false,
      recommend_product: null,
      send_owner_contact: false,
      error: `decide_fallback:${reason}`,
    };
  }
}

// Escalação: no máx 1 bloco por DM — link de produto OU contato do dono.
// Se a IA já embutiu qualquer link do catálogo inline, não anexa mais nada.
export function applyEscalation(
  dmText: string,
  decision: Decision,
  ctx: EngageContext,
): string {
  if (!dmText) return dmText;
  let out = dmText;
  let appended = false;
  const rec = decision.recommend_product;
  if (rec?.link && !out.includes(rec.link)) {
    out = `${out}\n\n👉 ${rec.name}: ${rec.link}`;
    appended = true;
  }
  const hasCatalogLink = (ctx.products || []).some((p) => p?.link && out.includes(p.link));
  if (!appended && !hasCatalogLink && (decision.qualified || decision.send_owner_contact) && ctx.ownerContact?.wa_url && !out.includes(ctx.ownerContact.wa_url)) {
    const label = ctx.ownerContact.label || "Falar no WhatsApp";
    out = `${out}\n\n${label}: ${ctx.ownerContact.wa_url}`;
  }
  return out;
}

function fallbackDm(name: string, type: string): string {
  if (type === "story_reply") return `Oi, ${name}! Vi sua resposta no story. Quer que eu te mande os detalhes por aqui?`;
  if (type === "comment") return `Oi, ${name}! Vi seu comentário. Quer que eu te mande os detalhes por aqui?`;
  return `Oi, ${name}! Vi sua mensagem. Quer que eu te mande os detalhes por aqui?`;
}
