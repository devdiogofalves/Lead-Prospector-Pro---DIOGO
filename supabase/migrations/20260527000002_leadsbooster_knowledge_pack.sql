-- Knowledge Pack do LeadsBooster para a conta nucleodameta@gmail.com
-- Branding, ICP, SPIN bank e perfil de prospecção preenchidos com dados reais do produto.
-- Usa subquery para resolver o user_id sem hardcode.

DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'nucleodameta@gmail.com' LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'Usuário nucleodameta@gmail.com não encontrado — faça login primeiro e re-execute.';
    RETURN;
  END IF;

  -- ── Branding ────────────────────────────────────────────────────────────────
  INSERT INTO public.company_branding (user_id, company_name, agent_name, agent_tagline, primary_color)
  VALUES (
    v_uid,
    'LeadsBooster',
    'Booster',
    'Prospecção e qualificação com IA — no canal certo, na hora certa',
    '#6366f1'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    company_name   = EXCLUDED.company_name,
    agent_name     = EXCLUDED.agent_name,
    agent_tagline  = EXCLUDED.agent_tagline,
    primary_color  = EXCLUDED.primary_color,
    updated_at     = now();

  -- ── Knowledge Pack (mavi_briefing) ──────────────────────────────────────────
  INSERT INTO public.mavi_briefing (
    user_id,
    icp_descricao,
    segmentos_alvo,
    portes_alvo,
    personas_alvo,
    gatilhos_compra,
    objecoes_comuns,
    value_props,
    spin_bank,
    abordagem_preferida
  ) VALUES (
    v_uid,

    -- ICP
    'Donos de agências de marketing digital, consultores B2B e gestores comerciais de PMEs que vendem para outras empresas e fazem prospecção manual ou com ferramentas fragmentadas. Têm 1 a 50 funcionários, faturam entre R$500K e R$10M/ano e sofrem com alto custo de ferramentas, falta de escala e leads frios consumindo tempo do time de vendas.',

    -- Segmentos
    ARRAY[
      'Agências de marketing digital',
      'SaaS e empresas de tecnologia',
      'Consultorias (contábil, jurídica, RH, financeira)',
      'Distribuidores e atacadistas B2B',
      'Franqueadoras',
      'Imobiliárias comerciais',
      'EdTech e treinamento corporativo'
    ],

    -- Portes
    ARRAY['Microempresa (1–10)', 'Pequena empresa (10–50)', 'Média empresa (50–200)'],

    -- Personas
    ARRAY[
      'Dono/CEO de PME que vende B2B e ele mesmo prospecta',
      'Gestor Comercial / Head de Vendas com time de 3–15 SDRs',
      'Dono de agência que quer oferecer prospecção como serviço (White-label)',
      'Consultor independente que atende múltiplos clientes',
      'Fundador de SaaS na fase de tração validando outbound'
    ],

    -- Gatilhos de compra
    ARRAY[
      'Acabou de perder um contrato por demora no follow-up',
      'Percebeu que paga R$1.500+/mês em ferramentas separadas sem integração',
      'Quer escalar prospecção sem contratar mais SDRs',
      'Agência que quer revender o serviço de prospecção com margem',
      'Equipe comercial travada em tarefas manuais repetitivas'
    ],

    -- Objeções comuns
    ARRAY[
      'Está caro / não tenho orçamento',
      'Já uso Ramper / Dripify / Speedio',
      'Tenho medo de ban no WhatsApp',
      'Prefiro fazer na mão / meu vendedor já faz isso',
      'Não sei se funciona para o meu segmento',
      'Ferramentas de automação são bloqueadas pelo LinkedIn',
      'Vou pesquisar mais antes de decidir'
    ],

    -- Value props
    ARRAY[
      'Tudo em um lugar: LinkedIn + WhatsApp + Instagram + Google Maps + CRM — substitui uma stack de R$1.800–2.500/mês por R$197/mês',
      'IA com SPIN Selling: não é chatbot genérico — conduz S→P→I→N e entrega leads qualificados prontos para fechar',
      'WhatsApp humanizado com warm-up automático: simula comportamento humano, evita ban e aquece o número progressivamente',
      'Multicanal real: 4 canais onde o lead brasileiro está — todos integrados e em cadência automática',
      'White-label Agency/WhiteLabel: agências revendem com a própria marca por R$500–2.000/cliente com custo de R$697–997/mês',
      'CRM integrado: pipeline de vendas sem precisar do Pipedrive ou RD Station separado'
    ],

    -- SPIN Bank (JSON)
    '{
      "situacao": [
        "Hoje, como você encontra novos clientes para o seu negócio?",
        "Quanto tempo por semana você ou seu time dedicam à prospecção?",
        "Quais canais você usa para chegar nos seus leads — LinkedIn, Instagram, WhatsApp?",
        "Você usa alguma ferramenta de automação hoje ou faz tudo manualmente?",
        "Quantas mensagens ou abordagens sua equipe consegue fazer por dia?"
      ],
      "problema": [
        "Você sente que perde leads por falta de follow-up no momento certo?",
        "Já aconteceu de um concorrente fechar um cliente que você estava prospectando porque respondeu mais rápido?",
        "Seu vendedor passa mais tempo prospectando do que fechando?",
        "Você paga por ferramentas separadas que não se conversam — dados numa, disparo noutra, CRM em outra?",
        "Qual é o maior gargalo no seu processo comercial hoje?"
      ],
      "implicacao": [
        "Com esse volume de prospecção manual, você consegue manter consistência todos os dias — ou cai quando aparece outro projeto?",
        "O que acontece com o seu faturamento quando a prospecção para por uma semana ocupada?",
        "Se cada ferramenta separada custa R$300–600/mês, quanto você está gastando no total só para manter a operação rodando?",
        "Com o time gastando horas em prospecção manual, quantas oportunidades de fechamento estão sendo negligenciadas?",
        "Se isso continuar assim por mais 6 meses, onde você estará em relação à meta de faturamento?"
      ],
      "need_payoff": [
        "Se você pudesse prospectar no LinkedIn, WhatsApp e Instagram de forma automática — com IA qualificando os leads por você — isso resolveria o problema que você me descreveu?",
        "Quanto valeria para o seu negócio chegar em 50 leads qualificados por semana sem o seu time precisar fazer nada manualmente?",
        "Se o LeadsBooster substituísse todas essas ferramentas separadas por R$197/mês e ainda qualificasse os leads com IA, faria sentido testarmos?"
      ]
    }'::jsonb,

    -- Abordagem preferida
    'Prospecção outbound multicanal com SPIN Selling. Abertura no WhatsApp em 2 partes: observação específica sobre o negócio do lead + 1 pergunta situacional. Sem pitch inicial. Conduz S→P→I→N ao longo da conversa. Apresenta o LeadsBooster somente na fase N, após o lead verbalizar a necessidade. Tom direto, consultivo e sem jargão de vendas.'

  )
  ON CONFLICT (user_id) DO UPDATE SET
    icp_descricao        = EXCLUDED.icp_descricao,
    segmentos_alvo       = EXCLUDED.segmentos_alvo,
    portes_alvo          = EXCLUDED.portes_alvo,
    personas_alvo        = EXCLUDED.personas_alvo,
    gatilhos_compra      = EXCLUDED.gatilhos_compra,
    objecoes_comuns      = EXCLUDED.objecoes_comuns,
    value_props          = EXCLUDED.value_props,
    spin_bank            = EXCLUDED.spin_bank,
    abordagem_preferida  = EXCLUDED.abordagem_preferida,
    updated_at           = now();

  -- ── Perfil de prospecção ─────────────────────────────────────────────────────
  INSERT INTO public.prospecting_profiles (
    user_id,
    produto,
    publico_alvo,
    ticket_medio,
    regiao,
    diferenciais,
    ja_tentou,
    site_url,
    system_prompt,
    agent_system_prompt
  ) VALUES (
    v_uid,
    'LeadsBooster — Plataforma SaaS de prospecção e qualificação com IA. Planos de R$197 a R$997/mês. Canais: WhatsApp, LinkedIn, Instagram, Google Maps. CRM integrado. White-label para agências.',

    'Donos de agências de marketing digital, consultores B2B, gestores comerciais de PMEs (10–200 funcionários) que vendem para outras empresas e fazem prospecção manual ou com stack fragmentada. Brasil inteiro, foco em SP, RJ, MG, PR, RS.',

    'R$197–997/mês (recorrente). LTV médio estimado R$2.400–12.000/cliente/ano.',

    'Brasil — foco inicial em SP, RJ, MG, PR, RS. Atendimento 100% digital.',

    '1. Único all-in-one brasileiro: WhatsApp + LinkedIn + Instagram + Google Maps em uma plataforma. 2. IA com metodologia SPIN Selling — qualifica, não só dispara. 3. Warm-up automático anti-ban. 4. White-label: agência revende com a própria marca. 5. Preço 5–10x menor que uma stack equivalente.',

    'Outbound manual no WhatsApp. Ferramentas pontuais (só LinkedIn ou só WhatsApp). Stack cara e fragmentada (Ramper + ChatGuru + Dripify + Speedio).',

    'https://leadsbooster.com.br',

    'Você é Booster, o agente de IA do LeadsBooster. Sua missão é prospectar donos de agências de marketing digital, consultores B2B e gestores comerciais que fazem prospecção manual ou com ferramentas fragmentadas.

REGRAS ABSOLUTAS:
- Uma pergunta por mensagem — nunca duas
- Não mencione o LeadsBooster, não faça pitch, não cite benefícios nas fases S, P e I
- Só apresente a solução na fase N, após o lead verbalizar uma necessidade clara
- Tom: direto, consultivo, sem jargão de vendas, sem emoji excessivo
- WhatsApp: mensagem em 2 partes — observação específica + 1 pergunta situacional

FLUXO SPIN:
S → entender como o lead prospecta hoje e com quais ferramentas
P → identificar o principal gargalo (follow-up, custo, manual, LinkedIn, WhatsApp)
I → amplificar a consequência desse gargalo no faturamento e na escala
N → perguntar se automatizar resolveria → então apresentar o LeadsBooster brevemente

ABERTURA MODELO:
"Oi [Nome], vi que você tem uma agência de [especialidade].
Curioso saber: hoje, como vocês prospectam novos clientes para a agência?"',

    'Você é Booster, agente de qualificação do LeadsBooster. Quando o lead responde, conduza o SPIN completo até a fase N. Ao identificar que o lead tem dor real com prospecção manual, stack cara ou falta de qualificação, apresente: "O LeadsBooster resolve exatamente isso — é uma plataforma que prospecta no WhatsApp, LinkedIn e Instagram com IA, e ainda qualifica os leads pelo SPIN Selling automaticamente. Planos a partir de R$197/mês. Faz sentido você ver como funciona?" Se qualificado, envie o link https://leadsbooster.com.br e marque no CRM como [QUALIFICADO].'

  )
  ON CONFLICT (user_id) DO UPDATE SET
    produto              = EXCLUDED.produto,
    publico_alvo         = EXCLUDED.publico_alvo,
    ticket_medio         = EXCLUDED.ticket_medio,
    regiao               = EXCLUDED.regiao,
    diferenciais         = EXCLUDED.diferenciais,
    ja_tentou            = EXCLUDED.ja_tentou,
    site_url             = EXCLUDED.site_url,
    system_prompt        = EXCLUDED.system_prompt,
    agent_system_prompt  = EXCLUDED.agent_system_prompt,
    updated_at           = now();

  RAISE NOTICE 'Knowledge Pack do LeadsBooster aplicado com sucesso para %', v_uid;
END $$;
