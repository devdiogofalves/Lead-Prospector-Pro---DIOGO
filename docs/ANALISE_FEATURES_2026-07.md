# Análise de Features — Julho 2026

Comparativo LeadsBooster × concorrentes (WeSalesCRM, GoHighLevel, Reportana, Leads2b) e roadmap sugerido antes de abrir para novos clientes.

Fontes raspadas em 2026-07-13:
- https://wesalescrm.com/#funcionalidades (R$ 297/mês — all-in-one MKT+vendas)
- https://www.gohighlevel.com/features (referência global do modelo)
- https://reportana.com/funcionalidades (WhatsApp+E-commerce BR)
- https://www.leads2b.com/funcionalidades (prospecção B2B BR)

---

## 1. Onde estamos vs mercado

### Overlap real (o que TODOS oferecem e nós também temos)
- CRM/Pipeline ✅ (`pipeline_cards` + `/pipeline`)
- Inbox unificado ✅ (`/conversas-handoff` — WhatsApp + IG + LinkedIn + Email + Telegram)
- Agendamento c/ Google Calendar+Meet ✅ (`qualification-worker` cria evento automaticamente)
- Automações/cadências ✅ (`auto-prospect`, LinkedIn cadence, campanhas)
- IA generativa ✅ (SPIN, dispatch, geração conteúdo, ElevenLabs, RAG)
- Multicanal ✅ (WhatsApp + Email + IG + Telegram + LinkedIn DM)

### Onde ELES ganham hoje (gaps reais nossos)

| Gap | Onde aparece | Impacto na venda |
|---|---|---|
| **Landing/funnel builder** | WeSales, GHL | 🔴 Alto — cliente quer "1 ferramenta faz tudo" |
| **Email broadcast (campanha p/ lista)** | Todos | 🔴 Alto — hoje só temos 1-a-1 |
| **Dashboard cliente com KPIs reais** | Todos | 🔴 Alto — parece "ferramenta crua" sem isso |
| **Página pública de booking (Calendly-like)** | WeSales, GHL | 🟡 Médio — substitui R$150/mês |
| **Workflow builder visual (if/then/wait)** | GHL, WeSales | 🟡 Médio — visual vende, mas nossa lógica atual cobre |
| **SMS** | Todos | 🟢 Baixo BR — WhatsApp cobre 90% |
| **Comunidade/Membros/Blog/Reviews** | GHL, WeSales | ⚪ Fora do core — não perseguir |
| **E-commerce/checkout/carrinho** | Reportana, GHL | ⚪ Fora do core — não é nosso ICP |

### Onde NÓS ganhamos (diferenciais reais — precisam aparecer na LP!)

1. **Prospecção ativa nativa** — Google Maps, LinkedIn (Unipile), Instagram, CNPJ, Dados4U. WeSales/Reportana só recebem lead que já veio. Leads2b tem, mas sem IA.
2. **Enriquecimento CNPJ + Dados4U** (celular real Receita).
3. **Qualificador IA SPIN humanizado** com áudio ElevenLabs, buffer inteligente, typing proporcional, transcrição, RAG.
4. **Multi-chip WhatsApp** com rotação + warm-up automático + auto-heal de webhook + chip dedicado atendente.
5. **White-label / Reseller** (plano R$997). Nenhum concorrente BR vende revenda pronta.
6. **Módulo social completo** — planner, carrossel canvas, reels studio, auto-engajamento IG, comment responder IA.
7. **Extensão Chrome** para captura no Google Maps.
8. **RAG / Knowledge Pack** — cliente sobe PDF/texto e IA usa no atendimento.
9. **Pipeline duplo paralelo** — WhatsApp + LinkedIn DM rodando ao mesmo tempo, kill switch por canal.

---

## 2. O que faz sentido AGREGAR (antes de abrir clientes)

Priorizado por **retorno comercial × esforço técnico**.

### 🔴 Sprint 1 — Fecha venda (3 dias)

**1.1 Dashboard do cliente com métricas reais** — `/dashboard`
Hoje mostra 4 cards básicos. Falta:
- Leads captados **hoje/semana/mês por canal** (Maps/LinkedIn/IG/CNPJ)
- Taxa de resposta por canal (WhatsApp/Email/IG/LinkedIn DM)
- Qualificados por dia (linha temporal 30d)
- Reuniões agendadas (contagem + próximas 7 dias)
- Funil visual: **Captado → Contatado → Respondeu → Qualificado → Reunião → Fechado**
- ROI simples: (qualificados / leads captados) × 100

Todos os dados já existem em `dispatch_queue`, `qualification_conversations`, `scheduled_meetings`, `pipeline_cards`. Só falta query+UI.

**1.2 Email broadcast (campanha p/ lista)** — nova rota `/campanhas-email` ou tab em `/campanhas`
- Selecionar múltiplos leads (4 tabelas) → assunto + corpo c/ merge fields `{{nome}}`, `{{empresa}}`, `{{cargo}}`
- 3-5 templates HTML pré-prontos (transacional, promocional, follow-up)
- Agendar envio (data/hora) ou disparar imediato
- Reaproveita `dispatch_queue` com `channel='email'` (já implementado, só falta UI de "lista" ao invés de 1-a-1)
- Rate limit visível: "sua conta Unipile suporta X e-mails/dia"

**1.3 LP comercial** — projeto Lovable separado que você já tem ("LeadsBooster LP")
- Ajustar copy usando estrutura WeSales + destacando 9 diferenciais acima
- Tabela "O que você substitui" (Apollo R$800 + RD R$1.500 + Mailchimp R$500 + Calendly R$150 + N8N R$500 = R$3.450 → LeadsBooster R$697)
- Grid de 13-15 funcionalidades com ícones
- CTA Kiwify c/ os 4 planos

### 🟡 Sprint 2 — Nivela em qualidade (5 dias)

**2.1 Kanban CRM melhorado** — `@dnd-kit` já instalado
- Drag-drop entre estágios
- Soma de valor R$ por coluna
- Filtros: origem, tag, data, valor
- Card expandido: histórico de mensagens

**2.2 Página pública de booking** — `/agendar/:userSlug`
- Cliente publica link tipo `leadsbooster.com.br/agendar/cleo-energia`
- Lead escolhe horário disponível (usa `google-calendar-api` free/busy)
- Ao confirmar: cria evento c/ Meet, notifica handoff group, salva em `scheduled_meetings`
- Substitui Calendly (economia R$150/mês na tabela comercial)

**2.3 Templates visuais de email** — 3-5 layouts responsivos (transacional, promocional, follow-up, reativação, evento)

**2.4 Filtros/badges no inbox** — `/conversas-handoff`
- Badge de canal claro em cada conversa (WhatsApp/IG/Email/LinkedIn/Telegram)
- Filtro rápido por canal + busca global (nome/telefone/texto)

### 🟢 Sprint 3 — Nice-to-have (pós-lançamento, só se cliente pedir)

- **Workflow builder visual** (React Flow) — if/then/wait/split. Bonito de vender mas nossa lógica atual (`auto-prospect` + cadências) cobre 95% dos casos.
- **Instagram DM broadcast** — extensão natural do `dispatch-queue` com `channel='instagram'`.
- **Telegram broadcast** — idem.
- **A/B test de mensagens** — variantes na campanha, medir taxa de resposta.

### ⚪ NÃO fazer (fora do core, viram produto próprio)

- Comunidade / Área de membros → integrar Circle/Hotmart
- Blog / CMS → integrar Ghost/WordPress
- Reputação Google Reviews → integrar Trustvox
- E-commerce/checkout → integrar Kiwify/Hotmart (já usamos p/ pagamento)
- SMS via Twilio → só se cliente pagar addon
- Editor de site drag-drop → escopo enorme, integrar Framer/Webflow

---

## 3. Reposicionamento comercial recomendado

Contra WeSales/Reportana:

> **"CRM comercial com prospecção ativa e IA que qualifica sozinha —
> enquanto o WeSales espera o lead chegar,
> o LeadsBooster CAÇA o lead no Google Maps + LinkedIn + Instagram,
> qualifica no WhatsApp com áudio humano usando metodologia SPIN,
> agenda a reunião no Google Meet automaticamente,
> e só te chama quando o lead está pronto pra fechar."**

Tabela "substitui" no plano Agency (R$697):
| Ferramenta | Preço | Substituída por |
|---|---|---|
| Apollo/Sales Navigator | R$800 | Prospecção LinkedIn (Unipile) |
| Serasa Experian/Leads2b | R$500 | CNPJ + Dados4U |
| RD Station Marketing | R$1.500 | Campanhas Email/WA/IG |
| Mailchimp | R$500 | Email broadcast (Unipile) |
| Calendly | R$150 | Booking público + Meet |
| ManyChat + N8N | R$500 | Cadências + auto-prospect |
| ChatGPT + ElevenLabs | R$300 | IA SPIN + áudio humano |
| **Total substituído** | **R$4.250/mês** | **LeadsBooster: R$697** |

---

## 4. Próximo passo

Aguardando sua decisão sobre:
- Começar Sprint 1 pelo bloco (A) Dashboard, (B) Email broadcast, ou (C) ajuste da LP existente?
- Executar em paralelo ou em sequência?
- Alguma feature da lista Sprint 2/3 é prioridade que subiria pro Sprint 1?
