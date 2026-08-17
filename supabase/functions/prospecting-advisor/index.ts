// redeploy 2026-07-10f gemini auth
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AdvisorInput {
  produto: string;
  publico_alvo: string;
  ticket_medio?: string;
  regiao?: string;
  diferenciais?: string;
  ja_tentou?: string;
}

const SYSTEM_PROMPT = `Você é um especialista sênior em prospecção B2B no Brasil. O usuário tem acesso a uma plataforma com as seguintes ferramentas de busca:

- **Google Maps**: empresas com endereço físico (clínicas, lojas, restaurantes, escritórios). Bom para quem atende presencialmente ou prospecta por região.
- **CNPJ (Receita Federal)**: enriquece dados oficiais (sócios, porte, atividade, situação). Use para qualificar B2B e identificar decisores.
- **LinkedIn**: cargos e decisores (CEO, Diretor, Gerente). Bom para vendas consultivas e ticket alto.
- **Instagram**: negócios que vivem de marketing visual (moda, beleza, food, infoprodutores, agências, e-commerce).
- **Job Boards / Vagas (Catho, Infojobs)**: empresas contratando = empresas com dor/orçamento. Excelente para RH-tech, terceirização, treinamentos, software.
- **Dados4U**: enriquece pessoa física (CPF, telefones, emails) — use só quando o decisor já foi identificado.
- **Busca Suprema**: pipeline automatizado que combina Maps → CNPJ → LinkedIn/Instagram dos sócios.

Sua tarefa: dado o negócio do usuário, devolva um plano de prospecção CLARO e ACIONÁVEL em JSON estruturado.

Responda SEMPRE em português do Brasil e em JSON válido seguindo este schema exato:
{
  "icp": "1-2 frases descrevendo o cliente ideal",
  "personas": ["cargo/decisor 1", "cargo/decisor 2"],
  "canais_recomendados": [
    {
      "canal": "Google Maps" | "CNPJ" | "LinkedIn" | "Instagram" | "Job Boards" | "Vagas" | "Dados4U" | "Busca Suprema",
      "prioridade": "alta" | "media" | "baixa",
      "porque": "explicação curta",
      "termos_busca": ["termo 1", "termo 2", "termo 3"],
      "filtros": "ex: cidade, segmento, porte"
    }
  ],
  "passo_a_passo": ["passo 1", "passo 2", "passo 3"],
  "abordagem_sugerida": "como abordar no primeiro contato (WhatsApp/DM)",
  "alertas": ["coisas a evitar / cuidados"],
  "spin_bank": {
    "situacao": ["3-5 perguntas de Situação específicas para este negócio (entender o cenário atual do lead, sem pitch)"],
    "problema": ["3-5 perguntas de Problema (identificar dores reais que a oferta resolve)"],
    "implicacao": ["3-5 perguntas de Implicação (amplificar o custo de não resolver: tempo, dinheiro, oportunidade perdida)"],
    "need_payoff": ["3-5 perguntas de Need-Payoff (fazer o lead verbalizar o valor de resolver, abrindo espaço para apresentar a solução)"]
  }
}

IMPORTANTE sobre spin_bank: as perguntas devem ser específicas para o produto e público-alvo informados, em linguagem natural de WhatsApp (curtas, uma pergunta por item, sem jargão). Nunca cite o nome da empresa nas perguntas de Situação/Problema/Implicação.`;

function buildFallbackPlan(body: AdvisorInput) {
  const produto = body.produto.trim();
  const publico = body.publico_alvo.trim();
  const regiao = body.regiao?.trim() || "Brasil";

  const baseTerms = [publico, `${publico} ${regiao}`, `empresas ${publico}`]
    .map((term) => term.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return {
    icp: `Empresas B2B no perfil ${publico}, com potencial de dor clara para ${produto}. Priorize decisores com poder de contratação e sinais recentes de operação ativa.`,
    personas: ["CEO / Sócio proprietário", "Diretor financeiro", "Gerente administrativo"],
    canais_recomendados: [
      {
        canal: "Busca Suprema",
        prioridade: "alta",
        porque: "Combina empresas, CNPJ e decisores para chegar em contatos com mais contexto antes da abordagem.",
        termos_busca: baseTerms.slice(0, 3),
        filtros: `Região: ${regiao}; priorizar empresas ativas e com sócios identificáveis`,
      },
      {
        canal: "Google Maps",
        prioridade: "alta",
        porque: "Bom para montar uma primeira lista regional de empresas reais e validar presença operacional.",
        termos_busca: baseTerms.slice(0, 3),
        filtros: `Cidade/estado: ${regiao}; somente negócios com telefone válido`,
      },
      {
        canal: "LinkedIn",
        prioridade: "media",
        porque: "Útil para localizar decisores e enriquecer a abordagem com cargo e contexto profissional.",
        termos_busca: ["CEO", "Sócio", "Diretor financeiro"],
        filtros: `Segmento: ${publico}; região: ${regiao}`,
      },
    ],
    passo_a_passo: [
      "Rode a Busca Suprema com 2 a 3 termos principais do público-alvo.",
      "Valide CNPJ, sócios e canais disponíveis antes de disparar mensagens.",
      "Priorize leads com WhatsApp válido e decisor identificado.",
      "Use abordagem consultiva SPIN: situação primeiro, sem pitch imediato.",
    ],
    abordagem_sugerida: `Comece com uma observação específica sobre o tipo de empresa (${publico}) e faça apenas uma pergunta de situação. Evite vender ${produto} na primeira mensagem.`,
    alertas: [
      "Não disparar pitch genérico na primeira mensagem.",
      "Não prometer resultado sem diagnóstico.",
      "Não abordar contatos sem telefone/decisor minimamente validado.",
    ],
    spin_bank: {
      situacao: [
        `Como vocês atendem hoje o público de ${publico}?`,
        `Quantas pessoas hoje cuidam dessa parte aí na operação?`,
        `Hoje vocês usam alguma ferramenta ou é mais no manual mesmo?`,
      ],
      problema: [
        `Onde costuma travar mais nesse processo?`,
        `Acontece de perder cliente por demora no retorno?`,
        `Tem algum gargalo que se repete toda semana?`,
      ],
      implicacao: [
        `Quanto vocês acham que deixa de faturar por mês por causa disso?`,
        `Isso já gerou problema com algum cliente importante?`,
        `Se continuar assim nos próximos 6 meses, o que acontece?`,
      ],
      need_payoff: [
        `Se desse pra resolver isso sem aumentar equipe, faria diferença?`,
        `O que mudaria pra vocês se esse gargalo sumisse?`,
        `Faz sentido eu te mostrar como outros negócios parecidos resolveram?`,
      ],
    },
  };
}

function buildFallbackSystemPrompt(body: AdvisorInput) {
  return `Você é uma SDR consultiva de WhatsApp para prospecção B2B. Negócio: ${body.produto}. Público-alvo: ${body.publico_alvo}. Região: ${body.regiao || "Brasil"}. Diferenciais: ${body.diferenciais || "não informado"}. Aplique RAPPORT + SPIN Selling: crie conexão humana primeiro, depois conduza Situação → Problema → Implicação → Need Payoff. Regras absolutas: uma pergunta por mensagem, sem pitch imediato, sem promessas exageradas, sem urgência artificial, linguagem humana e objetiva. Gere mensagens curtas, naturais e personalizadas ao contexto do lead.`;
}

async function getUserGeminiKey(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Get user id from JWT
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  // Chave própria do cliente OU chave admin-compartilhada via RPC (client service_role).
  const { data } = await supabase.rpc("get_ai_key_for_user", { _user_id: user.id, _provider: "gemini" });
  return (data as string | null) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: AdvisorInput = await req.json();
    if (!body.produto || !body.publico_alvo) {
      return new Response(JSON.stringify({ error: "produto e publico_alvo são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiKey = await getUserGeminiKey(req);

    // Sem chave Gemini configurada: retorna plano padrão sem IA
    if (!geminiKey) {
      return new Response(JSON.stringify({
        plan: buildFallbackPlan(body),
        system_prompt: buildFallbackSystemPrompt(body),
        ai_unavailable: true,
        warning: "Chave Gemini não configurada. Configure em Configurações → APIs → Gemini para ativar o plano com IA.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userMsg = `Negócio do usuário:
- Produto/serviço: ${body.produto}
- Público-alvo: ${body.publico_alvo}
- Ticket médio: ${body.ticket_medio || "não informado"}
- Região: ${body.regiao || "Brasil"}
- Diferenciais: ${body.diferenciais || "não informado"}
- O que já tentou: ${body.ja_tentou || "nada relatado"}

Monte o plano de prospecção em JSON.`;

    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;

    const resp = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${geminiKey}` },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Limite de uso atingido. Tente novamente em alguns minutos." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const txt = await resp.text();
      console.error("[prospecting-advisor] Gemini error:", resp.status, txt);
      // Fallback para plano padrão em caso de erro de API
      return new Response(JSON.stringify({
        plan: buildFallbackPlan(body),
        system_prompt: buildFallbackSystemPrompt(body),
        ai_unavailable: true,
        warning: "Erro ao chamar a IA. Verifique sua chave Gemini em Configurações → APIs.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    let plan;
    try {
      plan = JSON.parse(content);
    } catch {
      plan = { raw: content };
    }

    // IMPORTANTE: não geramos mais system_prompt aqui.
    // O system_prompt MAVI é definido manualmente pelo operador em /assistente e NÃO deve ser sobrescrito.
    // O frontend tem proteção adicional para nunca substituir um prompt customizado (>500 chars).
    return new Response(JSON.stringify({ plan, system_prompt: "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[prospecting-advisor]", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
