# LeadsBooster — Guia de Contexto para IA

> Leia este arquivo PRIMEIRO antes de qualquer análise ou modificação do projeto.

## O que é este projeto

**LeadsBooster** é um SaaS B2B white-label de prospecção, qualificação e automação de vendas.  
Cada cliente configura suas próprias APIs, identidade de empresa e IA — o sistema não tem branding fixo.

- **Repo:** github.com/nucleodameta-lab/leadsbooster
- **Stack:** React + TypeScript (Lovable/Vite), Supabase (Postgres + Edge Functions em Deno), pg_cron
- **Deploy:** Lovable (frontend) + Supabase (backend)
- **Usuário admin:** nucleodameta@gmail.com

---

## Arquitetura geral

```
Frontend (React/Lovable)
  ↓
Supabase Edge Functions (Deno)
  ↓
Supabase Postgres (tabelas abaixo)
  ↓
APIs externas: Mandrack Studio, Unipile, Apify (só Instagram), Dados4U, ElevenLabs, Google Gemini, OpenAI
```

### Fluxo principal
1. **Prospecção** → LinkedIn (Unipile People Search), Google Maps, CNPJ, Instagram (Apify) → salva em tabelas de leads
2. **Enriquecimento** → Dados4U (celular/email real), cruzamento de tabelas (Enriquecidos view)
3. **Disparo IA** → `dispatch_queue` → `dispatch-worker` (pg_cron 1min) → Mandrack WhatsApp
4. **Qualificação** → webhook recebe resposta WhatsApp → `qualification_messages` → `qualification-worker` (pg_cron 1min) → IA responde → classifica lead
5. **LinkedIn DM** → Unipile API → envia DM diretamente no LinkedIn
6. **Handoff** → lead qualificado → grupo WhatsApp + pipeline CRM + Google Meet automático

---

## Identidade White-Label (IMPORTANTE)

**Não existe mais branding fixo AGREGA/MAVI.** Cada cliente configura:

| Tabela | Campo | Descrição |
|--------|-------|-----------|
| `company_branding` | `company_name` | Nome da empresa do cliente |
| `company_branding` | `agent_name` | Nome do agente IA (ex: "Cléo", "Max") |
| `company_branding` | `agent_tagline` | Slogan/função do agente |
| `company_branding` | `logo_url` | Logo da empresa |
| `company_branding` | `primary_color` | Cor primária da interface |

**Fallbacks nos workers (quando company_branding não configurado):**
- `company_name` → `"nossa empresa"`
- `agent_name` → `"IA assistente"`

> ⚠️ Nunca hardcode "AGREGA", "MAVI" ou "GRAZI" em código novo. Sempre use branding dinâmico.

---

## WhatsApp — Arquitetura Mandrack (IMPORTANTE)

**Modelo atual:** Multi-chip por usuário via tabela `whatsapp_instances`.

| Variável de Ambiente | Descrição |
|---|---|
| `MANDRACK_API_KEY` | Token admin global (Authorization header nas chamadas /admin/*) |
| `MANDRACK_URL` | URL base da API (ex: https://api.mandrackstudio.ia.br) |

**Por instância/chip** (tabela `whatsapp_instances`):
- `instance_name` — nome do chip (ex: "chip-principal")
- `mandrack_instance_token` — token individual da instância (usado em /session/*, /chat/*)
- `daily_limit` — limite diário de envios por chip (default 15)
- `active`, `paused` — controle de estado

**`resolveWA()` nos workers:**
```typescript
function resolveWA(instanceRow: any, integ: any) {
  // Prioridade: whatsapp_instances row → user_integrations (legado)
  if (instanceRow?.mandrack_instance_token) {
    return { url, token: instanceRow.mandrack_instance_token, instance: instanceRow.instance_name };
  }
  const token = integ?.mandrack_instance_token ?? "";
  if (!token) return null;
  return { url, token, instance: integ?.evolution_instance ?? "" };
}
```

> ⚠️ Evolution API é legado arquivado. Não adicionar de volta nem usar em novas features.
> ⚠️ UAZAPI nunca foi implementada. Não adicionar.

---

## Tabelas principais (Supabase)

| Tabela | Descrição |
|---|---|
| `leads` | Leads do Google Maps |
| `linkedin_contacts` | Leads do LinkedIn (busca via Unipile People Search) |
| `instagram_contacts` | Leads do Instagram |
| `empresas_enriquecidas` | Empresas enriquecidas com CNPJ |
| `dispatch_queue` | Fila de disparos WhatsApp |
| `dispatch_settings` | Configurações de disparo por usuário |
| `whatsapp_instances` | Chips WhatsApp por usuário (multi-chip) |
| `qualification_messages` | Mensagens das conversas de qualificação |
| `qualification_conversations` | Metadados de conversas |
| `qualification_settings` | Config: handoff_group_jid, buffer_seconds |
| `pipeline_cards` | Cards do CRM pipeline |
| `user_api_keys` | Chaves de API por usuário (Unipile, ElevenLabs, Dados4U, Gemini, OpenAI; Apify só para Instagram) |
| `user_integrations` | Config WhatsApp legado + linkedin_cadence_enabled |
| `prospecting_profiles` | System prompts de prospecção + dados do negócio |
| `mavi_briefing` | Knowledge Pack: ICP, SPIN bank, clientes referência, value props |
| `company_branding` | Identidade white-label: nome empresa, nome agente, logo, cor |
| `dados4u_consultas` | Histórico de consultas Dados4U |
| `google_calendar_tokens` | Tokens OAuth Google por usuário |
| `scheduled_meetings` | Reuniões agendadas automaticamente via conversa |

---

## Edge Functions

| Função | Propósito |
|---|---|
| `dispatch-worker` | Processa dispatch_queue, gera msg IA (Gemini/OpenAI), envia via Mandrack |
| `qualification-worker` | Processa mensagens recebidas, IA responde + agenda via Google Calendar |
| `mandrack-manager` | Gerencia instâncias WhatsApp multi-chip (criar, QR, parear, status) |
| `linkedin-dm` | Busca LinkedIn (action=search/save via Unipile), gera msg IA + envia DM/invite (cadência) |
| `auto-prospect` | Pipeline automático: busca LinkedIn+Instagram, enriquece CNPJ, enfileira WhatsApp |
| `linkedin-cadence-worker` | pg_cron horário: avança cadência DM LinkedIn (business hours, 20/dia) |
| `dispatch-enqueue` | Enfileira leads para disparo |
| `apify-scrape` | Scraping Instagram via Apify |
| `dados4u-query` | Consulta Dados4U (CPF/CNPJ/telefone) |
| `cnpj-lookup` | Consulta CNPJ.ws |
| `webhook-qualification` | Recebe mensagens WhatsApp → qualification_messages |
| `webhook-leads` | Recebe leads via webhook externo |
| `google-places-search` | Busca no Google Maps |
| `google-calendar-api` | Gerencia integração Google Calendar (status/disconnect) |
| `google-oauth-start` | Inicia fluxo OAuth Google |
| `google-oauth-callback` | Callback OAuth Google |
| `meeting-handoff` | Cria reunião Google Meet + notifica grupo handoff |

---

## Variáveis de Ambiente Supabase (configurar em Dashboard → Settings → Edge Functions)

```
MANDRACK_API_KEY          = token admin do Mandrack Studio
MANDRACK_URL              = https://api.mandrackstudio.ia.br
LOVABLE_API_KEY           = chave do Lovable AI Gateway (failover IA)
GOOGLE_OAUTH_CLIENT_ID    = client ID do OAuth Google (Google Calendar/Meet)
GOOGLE_OAUTH_CLIENT_SECRET= client secret do OAuth Google
```

> As chaves dos usuários (Apify, Unipile, ElevenLabs, Dados4U, Gemini, OpenAI) ficam em `user_api_keys` — não em variáveis de ambiente.

---

## Sidebar — Páginas existentes (estrutura atual)

### Início
- `/` → ComeceAqui (onboarding)
- `/dashboard` → Dashboard

### Prospecção
- `/buscas/maps` → Google Maps
- `/buscas/instagram` → Instagram (Apify)
- `/buscas/cnpj` → Consulta CNPJ
- `/buscas/dados4u` → Enriquecimento Dados4U
- `/meus-leads` → Todos os leads prospectados
- `/enriquecidos` → Visão 360° cruzando todas as tabelas
- `/automacao` → Prospecção Automática (auto-prospect pipeline)

### WhatsApp
- `/disparo-humanizado` → Disparo Humanizado (IA)
- `/qualificacao-conversas` → Qualificação & Conversas (tabs: Conversas ao vivo + Configurar)
- `/follow-ups` → Follow-ups WhatsApp (cadência)

### LinkedIn
- `/buscas/linkedin` → Buscar Leads LinkedIn (busca manual via Unipile People Search)
- `/buscas/linkedin-dm` → LinkedIn DM (cadência automática + configurações Unipile)

### IA
- `/assistente` → Treinar IA (tabs: 🧭 Negócio + 📚 Knowledge Pack + ✨ O que aprendi)
- `/pipeline` → Pipeline CRM

### Integrações
- `/whatsapp` → Conectar WhatsApp (QR Code / Pairing — multi-chip)
- `/google-calendar` → Google Calendar & Meet

### Conta
- `/configuracoes` → APIs (Unipile, Google Places, ElevenLabs, Dados4U, OpenAI, Gemini; Apify só para Instagram)
- `/configuracoes/branding` → Identidade da Empresa (white-label)

---

## Regras e decisões importantes

1. **Nunca voltar para Evolution** — legado arquivado. Usar só Mandrack. Consulte `docs/archive/evolution-deprecation.md`.
2. **Nunca usar UAZAPI** — não foi implementado e não será.
3. **Mandrack usa token de admin no servidor** — usuário não vê nem configura token do Mandrack (só conecta via QR/pairing na aba WhatsApp).
4. **ApisTab não tem card Mandrack** — Mandrack é configurado pelo admin via env vars.
5. **LinkedIn 100% via Unipile** — busca manual, busca automática e DM cadência usam a função `linkedin-dm`. A função `linkedin-scrape` (Apify) foi removida.
6. **Apify apenas para Instagram** — único uso restante de Apify é a busca de perfis Instagram.
7. **IA via Gemini do usuário ou Lovable AI Gateway (failover)** — modelo padrão `gemini-2.5-flash`. OpenAI é alternativa.
8. **Cadência LinkedIn DM:** Conexão (D+0) → 1ª Mensagem (D+0) → Follow-up (D+7) → Implicação (D+14) → Encerramento (D+21).
9. **Humanização WhatsApp:** typing indicator proporcional ao tamanho da mensagem antes de cada envio.
10. **Warm-up automático:** dispatch-worker limita envios diários conforme idade da conta (10/25/50/limite configurado).
11. **Multi-chip WhatsApp:** dispatch_queue.whatsapp_instance_id aponta qual chip enviou. qualification_conversations.whatsapp_instance_id garante continuidade (mesmo chip que iniciou responde).
12. **Google Calendar/Meet automático:** qualification-worker detecta intent de agendamento via LLM e cria evento com Meet link automaticamente.
13. **Dois pipelines paralelos:** Pipeline A (WhatsApp) + Pipeline B (LinkedIn DM). Kill switch: `linkedin_cadence_enabled` em `user_integrations`.
14. **White-label:** todo texto visível ao lead usa `company_branding.company_name` e `agent_name`. Fallback: "nossa empresa" / "IA assistente". NUNCA hardcode nomes de clientes.

---

## Metodologia — SPIN Selling

Todos os prompts de IA seguem SPIN Selling: S (Situação) → P (Problema) → I (Implicação) → N (Need Payoff).

### Regras absolutas nos prompts
- **Uma pergunta por mensagem** — nunca duas
- **Sem pitch nas fases S, P, I** — não mencionar empresa, solução, benefícios
- **Fase N** → apresentar empresa brevemente + convidar para conversa
- **WhatsApp (dispatch-worker):** abertura em 2 partes — observação específica + 1 pergunta situacional
- **WhatsApp (qualification-worker):** conduz S→P→I→N completo, tag `[QUALIFICADO]` quando lead verbaliza necessidade
- **LinkedIn DM (linkedin-dm):** cadência 5 etapas — Conexão → S → P → I → Encerramento

---

## Como retomar o projeto após workspace reset

```bash
git clone https://TOKEN@github.com/nucleodameta-lab/leadsbooster.git /tmp/leadsbooster
cd /tmp/leadsbooster
git config user.email "nucleodameta@gmail.com"
git config user.name "Nucleo da Meta"
```

Depois: leia este CLAUDE.md e o estado atual com `git log --oneline -10`.

---

## Pendências e próximas melhorias conhecidas

- [x] **Fase 2** — Auto-rotação de chips: `selectBestChip()` em `dispatch-worker` escolhe chip com maior capacidade restante (com warm-up por chip)
- [x] **Fase 2** — ETA na UI: `formatEta()` em `DisparoHumanizado.tsx` mostra "hoje HH:MM (em Xmin)", "amanhã HH:MM" etc.; chip exibido na fila
- [x] **Fase 2** — Chip atendente dedicado: `attendant_instance_id` em `qualification_settings`; UI em `WhatsAppTab.tsx`; `qualification-worker` usa o chip configurado
- [x] **Fase 2** — Warm-up por chip: `dispatch-worker` usa `whatsapp_instances.created_at` para rampa individual (10/25/50/limite por chip)
- [x] **SaaS** — `client_subscriptions`: tabela com plano, limites, feature flags e reseller_id; migration `20260527000001` aplicada em produção
- [x] **SaaS** — `kiwify-webhook`: detecta plano pelo nome do produto, cria usuário via `inviteUserByEmail`, salva limites + feature flags em `client_subscriptions`
- [x] **SaaS** — `admin-metrics`: retorna visão completa de clientes, uso e MRR estimado (só `nucleodameta@gmail.com`)
- [x] **SaaS** — `admin-manage-client`: pause/resume/change_plan/add_note/reset_password
- [x] **SaaS** — `reseller-create-client`: WhiteLabel cria e gerencia sub-contas (reseller_enabled=true)
- [x] **SaaS** — `Admin.tsx`: painel com stat cards, filtros, tabela de clientes, modal troca de plano, aba receita/MRR; rota `/admin`
- [x] **SaaS** — `Reseller.tsx`: painel WhiteLabel para criar e gerenciar clientes; rota `/reseller`
- [x] **SaaS** — `AppSidebar.tsx`: links condicionais "Painel Admin" (só admin) e "Meus Clientes" (só reseller_enabled)
- [ ] **SaaS** — Configurar secret `KIWIFY_WEBHOOK_TOKEN` no Supabase Dashboard → Edge Functions → Secrets
- [ ] **SaaS** — Criar produto LeadsBooster no Kiwify com 3–4 planos e configurar URL do webhook
- [ ] **SaaS** — Landing page (fazer no Lovable em projeto separado)
- [x] **Fase 3 / MVP E-mail** — Unipile escolhido como hub multicanal (substitui Resend). Edge functions `unipile-send` (genérica) + `email-ai-message`. Página `/disparo-email`. Reutiliza `dispatch_queue` com coluna `channel`.
- [ ] **Fase 3** — Worker cron para `dispatch_queue WHERE channel='email'` (hoje envio é síncrono da UI; quando volume crescer, mover pro `dispatch-worker` com switch por canal)
- [ ] **Fase 3** — Instagram DM via `unipile-send` (channel=instagram) reutilizando a mesma infra
- [ ] **Fase 3** — Telegram via `unipile-send` (channel=telegram) — sem precisar de bot token, usa conta Unipile do usuário
- [ ] **Fase 3** — Webhook inbound de e-mail/IG/TG no `qualification-worker` para IA responder em qualquer canal
- [ ] Unipile: registrar webhook para evento de conexão aceita → avançar cadência de `nota_conexao` para `primeira` automaticamente
- [ ] LinkedIn DM: batch send (disparar múltiplos com delay entre envios)
- [ ] LinkedIn DM: UI de pause/resume/stop por contato
- [ ] Dashboard: métricas em tempo real (leads hoje, taxa de resposta, qualificados)
- [ ] Remover coluna `user_integrations.evolution_instance` após todos os registros migrarem para `whatsapp_instances`

---

## SaaS — Planos de Assinatura e Infra de Vendas

> Implementado em 2026-05-27. Webhook Kiwify + Admin Panel + WhiteLabel Reseller.

### Planos e limites

| Plano | chips_limit | dispatches_daily | LinkedIn | Instagram | Email | Reseller | Preço MRR |
|---|---|---|---|---|---|---|---|
| trial | 1 | 20 | ✗ | ✗ | ✗ | ✗ | R$0 |
| starter | 1 | 50 | ✗ | ✗ | ✗ | ✗ | R$197 |
| pro | 3 | 200 | ✓ | ✓ | ✗ | ✗ | R$397 |
| agency | ilimitado | ilimitado | ✓ | ✓ | ✓ | ✗ | R$697 |
| whitelabel | ilimitado | ilimitado | ✓ | ✓ | ✓ | ✓ | R$997 |

### Tabela `client_subscriptions`
Criada pela migration `20260527000001_client_subscriptions.sql`. Campos principais:
- `user_id` (FK único para auth.users)
- `plan`, `status` (active/paused/canceled)
- `chips_limit`, `dispatches_daily_limit` (NULL = ilimitado)
- `linkedin_enabled`, `instagram_enabled`, `email_dispatch_enabled`, `reseller_enabled`
- `reseller_id` (FK para auth.users — quem criou esta conta)
- `kiwify_subscription_id`, `kiwify_order_id`
- `notes` (anotações internas do admin)

### Kiwify — Webhook de auto-provisionamento
- **URL:** `https://tzrqcmkdkljxjkrekbyx.supabase.co/functions/v1/kiwify-webhook?token=SEU_TOKEN`
- **Secret obrigatório:** `KIWIFY_WEBHOOK_TOKEN` no Supabase Dashboard → Edge Functions → Secrets
- **1 produto, múltiplos planos** — `detectPlan(planName)` detecta pelo nome (ex: "Pro LeadsBooster" → plano `pro`)
- Compra aprovada → `inviteUserByEmail()` → Supabase envia e-mail de definição de senha → upsert em `client_subscriptions`
- Cancelamento → pausa `dispatch_settings` + status = "canceled"

### Admin Panel — `/admin`
- Acesso restrito: apenas `nucleodameta@gmail.com`
- Protegido no frontend: `if (!user || user.email !== ADMIN_EMAIL) return <Navigate to="/dashboard" />`
- Chama `admin-metrics` (GET) e `admin-manage-client` (POST)
- Features: 7 stat cards, distribuição de planos, tabela com filtros, modal de troca de plano + nota, aba Receita/MRR

### Reseller Panel — `/reseller`
- Acesso restrito: `client_subscriptions.reseller_enabled = true`
- Chama `reseller-create-client` com actions: `list`, `create`, `pause`, `resume`
- Sub-clientes criados recebem plano "agency" por padrão, vinculados via `reseller_id`

### Navegação sidebar
- "Painel Admin" → visível só para `nucleodameta@gmail.com`
- "Meus Clientes" → visível só para usuários com `reseller_enabled = true`

### Proximos passos SaaS
1. Criar produto no Kiwify (1 produto, 3–4 planos com nomes contendo "starter"/"pro"/"agency"/"whitelabel")
2. Configurar webhook URL no Kiwify com o token
3. Criar landing page no Lovable (projeto separado)
4. Testar fluxo completo: compra → e-mail convite → login → painel

---

## Fase 3 — Hub Multicanal via Unipile (decisão revisada 2026-06-09)

> Decisão revisada: **Unipile é o hub multicanal** para e-mail, Instagram, Telegram e Messenger. Resend foi descartado.

### Por que Unipile e não Resend
- **Deliverability MUITO superior:** e-mail sai da conta REAL do cliente (Gmail/Outlook/IMAP) com histórico, reputação e DKIM nativos. Sem DNS, sem SPF/DMARC, sem warm-up de domínio.
- **Cold email parece pessoal**, não newsletter — taxa de resposta significativamente maior.
- **Threading nativo:** resposta do lead cai direto no Inbox do cliente; futuramente o `qualification-worker` pode ler via webhook Unipile e responder no mesmo canal.
- **Reaproveita infra existente:** mesma API Key Unipile que já usamos para LinkedIn DM. Cliente conecta Gmail no dashboard Unipile (OAuth em 2 cliques) e pronto.
- **Multicanal por design:** mesmo endpoint serve Instagram DM, Telegram, Messenger, WhatsApp Cloud — sem precisar de bot tokens ou contas separadas.
- **Sem custo adicional:** já está no plano Unipile que pagamos para LinkedIn.

### Limites herdados (avisar na UI)
- Gmail pessoal: ~500 e-mails/dia. Workspace: ~2.000/dia.
- Outlook: ~300/dia.
- Bounce alto destrói a reputação da conta real do cliente — validar e-mails antes de disparar.

### Arquitetura implementada (2026-06-09)

**Banco** (migration aplicada):
- `dispatch_queue.channel TEXT DEFAULT 'whatsapp'` (`whatsapp`/`email`/`instagram`/`telegram`/`messenger`/`linkedin`)
- `dispatch_queue.email`, `subject`, `html_body`, `provider_message_id`, `unipile_account_id`
- `dispatch_queue.telefone` agora NULLABLE (era NOT NULL — quebrava insert de e-mail)
- `dispatch_settings.email_paused`, `email_daily_limit`, `email_from_name`, `email_reply_to`, `email_min_delay_seconds`
- Coluna `email_disparo TEXT DEFAULT 'Não'` em `leads`, `instagram_contacts`, `linkedin_contacts`, `empresas_enriquecidas`
- Coluna `email` em `leads` e `empresas_enriquecidas` (já existia em IG e LinkedIn)

**Edge Functions:**
- `unipile-send` — hub genérico. Body: `{ channel, to?, subject?, html?, text?, chat_id?, attendees_ids?, account_id? }`.
  - `channel=email` → `POST /api/v1/emails` no Unipile DSN do usuário.
  - `channel=linkedin|instagram|telegram|messenger` → `POST /api/v1/chats` (novo) ou `POST /api/v1/chats/{id}/messages` (thread existente).
  - Auto-resolve `account_id` por canal e cacheia em `user_api_keys.extra.account_id_{channel}`.
- `email-ai-message` — gera `{subject, html, text}` por lead via Lovable AI Gateway (Gemini 2.5 Flash), usando `prospecting_profiles` + `mavi_briefing` + `company_branding`. Prompt SPIN específico para cold email (60-110 palavras, sem promessas, sem preço).

**UI:** `/disparo-email` (página `src/pages/DisparoEmail.tsx`)
- Lista leads de 4 tabelas com `email` preenchido + filtro "só não disparados"
- Seleção múltipla → "Gerar prévia" (batch IA até 20 leads) → editar subject/HTML inline → "Enviar"
- Envio sequencial com delay configurável (default 20s)
- Loga cada envio em `dispatch_queue` com `channel='email'` e marca `email_disparo='Sim'` na tabela origem
- Link na sidebar em "WhatsApp" → será reorganizado para seção "Canais" quando IG/TG forem adicionados

**Pré-requisito do cliente:** conectar conta de e-mail no dashboard Unipile (Gmail/Outlook/IMAP) usando a mesma API Key já configurada em Configurações → APIs.

### Próximos passos (pós-MVP)
1. **Worker cron** — quando volume crescer, extender `dispatch-worker` com switch por `channel` ao invés do envio síncrono da UI atual.
2. **Instagram DM** — adicionar página `/disparo-instagram` reutilizando `unipile-send` com `channel=instagram`. `attendees_ids` vem do `provider_id` salvo em `instagram_contacts`.
3. **Telegram** — idem, `channel=telegram`. Substitui o plano original de bot token.
4. **Webhook inbound** — Unipile dispara webhook quando lead responde e-mail/IG/TG → reutilizar `qualification-worker` com flag `channel` para responder no mesmo canal.
5. **Validação de e-mail** — chamar Mailgun/ZeroBounce antes do disparo para reduzir bounce (futuro).
6. **Footer opt-out LGPD** — injetar automaticamente no `html_body` antes do envio.
