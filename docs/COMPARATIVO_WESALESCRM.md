# Comparativo LeadsBooster × WeSalesCRM

Fonte: https://wesalescrm.com/#funcionalidades (raspado em 2026-07-13).
Preço deles: **R$ 297/mês** — se posicionam como "substituto de R$ 6.800/mês em ferramentas soltas".

Eles são um **all-in-one de marketing + vendas** (estilo GoHighLevel/HighLevel BR). Nós somos **prospecção fria + qualificação IA multicanal**. O overlap é menor do que parece — mas a **promessa comercial** ("uma plataforma substitui tudo") é o que precisamos copiar para vender melhor.

---

## Tabela comparativa (13 pilares do WeSales)

| # | Funcionalidade WeSalesCRM | LeadsBooster hoje | Gap | Prioridade |
|---|---|---|---|---|
| 1 | **CRM / Pipeline** | ✅ `pipeline_cards` + `/pipeline` (Kanban) | UI enxuta; falta drag-drop entre colunas, filtros, valor por estágio, forecast | 🟡 P2 |
| 2 | **Funis (landing/upsell/downsell)** | ❌ | Não existe construtor de funil/página | 🔴 P1 (para bater a promessa) |
| 3 | **E-mail Marketing** | ⚠️ `/disparo-email` via Unipile (1-a-1) | Falta **campanha broadcast**, templates visuais, listas, segmentação, editor drag-drop | 🔴 P1 |
| 4 | **SMS / Chat SMS** | ❌ | Não temos SMS. WhatsApp cobre 90% do caso BR — vender como equivalente | 🟢 P3 |
| 5 | **Central de Chat (inbox unificado)** | ✅ `/conversas-handoff` (WhatsApp + Unipile IG/LinkedIn/Email/Telegram) | Já superior — só falta **badge de canal** claro + busca global | 🟡 P2 |
| 6 | **Agendamentos / Calendário** | ✅ Google Calendar + Meet automático via `qualification-worker` | Falta **página pública de booking** (estilo Calendly) | 🟡 P2 |
| 7 | **Automações / Fluxos** | ✅ `auto-prospect` + cadências LinkedIn + campanhas | Falta **workflow builder visual** (if/then/wait) | 🟡 P2 |
| 8 | **Websites / Landing** | ❌ (só `/bio` link) | Editor de site é escopo enorme — vender integração externa | 🟢 P3 |
| 9 | **Comunidade / Área de membros** | ❌ | Fora do core — não perseguir | ⚪ Não |
| 10 | **Blog** | ❌ | Fora do core | ⚪ Não |
| 11 | **A.I. (IA generativa)** | ✅ Muito superior: SPIN qualifier, dispatch IA, geração de conteúdo, transcrição, áudio ElevenLabs, RAG (knowledge pack) | Nenhum | ⭐ Diferencial |
| 12 | **Analytics** | ⚠️ `/admin` MRR + `/saude` LiveOps + `/dashboard` básico | Falta **dashboard do cliente**: taxa de resposta, qualificados/dia, ROI por canal, funil de conversão | 🔴 P1 |
| 13 | **Reputação (Google Reviews)** | ❌ | Fora do core | ⚪ Não |

### O que temos que ELES NÃO TÊM (nosso diferencial — precisa aparecer na landing!)

1. **Prospecção ativa nativa** — Google Maps, LinkedIn (Unipile), Instagram (Apify), CNPJ, Dados4U. WeSales só recebe leads que já vieram.
2. **Enriquecimento CNPJ + Dados4U** (celular real, dados Receita).
3. **Qualificador IA SPIN humanizado** (áudio ElevenLabs, buffer, typing, transcrição).
4. **Multi-chip WhatsApp** com rotação + warm-up automático + auto-heal de webhook.
5. **White-label / Reseller** (plano R$997) — WeSales não vende revenda.
6. **Módulo de conteúdo social** (planner, carrossel, reels, auto-engajamento IG).
7. **Extensão Chrome** (Maps).
8. **RAG / Knowledge Pack** para treinar a IA com PDFs do cliente.

---

## Plano de implementação URGENTE (antes de liberar os clientes)

### 🔴 Sprint 1 — 3 dias (o que FECHA venda vs WeSales)

**Objetivo:** ter as 3 caixas onde o WeSales ganha hoje minimamente cobertas + landing comercial.

1. **Landing pública comercial** (`/` deslogado, ou projeto Lovable separado)
   - Hero copiando estrutura WeSales: "A única ferramenta para transformar LEAD FRIO em CLIENTE"
   - Grid "13 funcionalidades" (usar nossa lista + destacar 8 diferenciais acima)
   - Tabela "O que você substitui" — replicar visual (Apollo R$500, RD Station R$1.500, Calendly R$150, Mailchimp R$500 etc. → total R$6.800 vs nossos R$197-997)
   - Preços atuais (starter/pro/agency/whitelabel) com CTA Kiwify
   - Prova social (deixar espaço, mesmo que placeholder)
   - **Estimativa:** 1 dia (posso gerar tudo)

2. **Dashboard do cliente com métricas reais** (`/dashboard`)
   - Cards: leads captados hoje/semana/mês por canal, taxa de resposta WhatsApp/Email/IG/LinkedIn, qualificados, reuniões agendadas, ROI (qualificados/leads captados)
   - Funil visual (captado → contatado → respondeu → qualificado → reunião)
   - Já temos os dados em `dispatch_queue`, `qualification_conversations`, `scheduled_meetings` — só precisa view/query.
   - **Estimativa:** 1 dia

3. **Email broadcast (campanha para lista, não 1-a-1)**
   - Reaproveitar `dispatch_queue` com `channel='email'` já feito
   - UI: selecionar múltiplos leads → assunto/corpo com merge fields `{{nome}}`, `{{empresa}}` → agendar envio
   - Template básico (HTML pré-pronto) — 3 layouts
   - **Estimativa:** 1 dia

### 🟡 Sprint 2 — 5 dias (nivela em qualidade)

4. **Kanban CRM melhorado** — drag-drop entre estágios (@dnd-kit já instalado), soma de valor por coluna, filtros por origem/tag/data. `pipeline_cards` já tem tudo.
5. **Página pública de booking** (`/agendar/:userSlug`) — usa `google-calendar-api` já existente. Substitui Calendly (R$150/mês na tabela).
6. **Templates visuais de email** — 3-5 layouts prontos (transacional, promocional, follow-up).
7. **Badges de canal no inbox** + filtro por canal em `/conversas-handoff`.

### 🟢 Sprint 3 — nice-to-have (pós-lançamento)

8. **Workflow builder visual** (React Flow) — se/então/aguarde X dias
9. **Editor de landing page simples** (blocos pré-prontos, tipo bio link expandido)
10. **SMS** via Twilio (só se cliente pedir)

### ⚪ Não fazer (fora do core)

- Comunidade / Área de membros / Blog / Reputação Google — cada um vira produto próprio. Melhor integrar com Circle/Hotmart do que reimplementar.

---

## Reposicionamento comercial recomendado

Hoje vendemos "prospecção + IA". Contra WeSales vira:

> **"CRM comercial com prospecção ativa e IA que qualifica sozinha — enquanto o WeSales espera o lead chegar, o LeadsBooster CAÇA o lead, qualifica no WhatsApp com áudio humano, e só te chama quando ele está pronto pra fechar."**

Tabela "substitui" no plano Agency (R$697):
- Apollo/Sales Navigator: R$800
- RD Station: R$1.500
- Mailchimp: R$500
- Calendly: R$150
- ManyChat/N8N: R$500
- ChatGPT + ElevenLabs: R$300
- **Total substituído: R$3.750/mês → você paga R$697.**

---

## Próximo passo

Me diga qual dos 3 blocos do Sprint 1 quer que eu comece **agora**:
- **(A)** Landing pública comercial
- **(B)** Dashboard com métricas reais
- **(C)** Email broadcast para lista
