# Plano P0 — Estabilização para os clientes

Baseado em auditoria do código atual. Algumas áreas já estão prontas (marco isso explicitamente para não retrabalhar); outras exigem trabalho novo.

## Diagnóstico curto do que já existe

| Área | Estado atual | Ação |
|---|---|---|
| Lock transacional na fila (`FOR UPDATE SKIP LOCKED`) | Pronto | Manter |
| `selectBestChip` ignora `close`/paused/`disconnected` | Pronto | Só ajustar critério de tie-break |
| Dedupe por `message_id` + `fromMe` filtrado no webhook | Pronto | Manter |
| `identityRules(agentName, companyName)` centralizado | Pronto | Só reforçar prompt |
| Colunas `delivered_at` / `read_at` / `provider_status` | **Não existe** | Criar |
| Endpoint de teste de credencial IA | **Não existe** | Criar |
| Webhook Mandrack para status/delivery | **Não existe** | Criar |

## O que vai ser feito nesta rodada

### 1. Saúde dos chips WhatsApp (bloqueio + UI)
- Novo edge `whatsapp-health-check` (cron 2min) que chama `/session/status` de cada `whatsapp_instances.active=true` e persiste `status` (`open`/`connecting`/`close`) + `last_health_check_at`.
- `dispatch-worker` já ignora `close`; adicionar guard extra: se **nenhum** chip do tenant está `open`, marca o item como `blocked_no_chip` (novo status transiente, não `failed`) e não consome tentativa.
- `mandrack-manager` ganha `action=auto_reconnect` que tenta `/session/connect` se `status='close'` há >5min.
- UI `WhatsAppTab.tsx`: badge por chip com 4 estados (`Conectado`, `Desconectado`, `Reconectando`, `QR necessário`) + botão "Reconectar" (chama `action=auto_reconnect`) e botão "Testar envio" (novo `action=test_send` que manda 1 msg pro próprio número do cliente).

### 2. Estado real da fila (accepted vs delivered vs read)
- Migration: adicionar em `dispatch_queue` colunas `provider_status text`, `provider_message_id text` (já existe em outras tabelas, reaproveitar), `accepted_at timestamptz`, `delivered_at timestamptz`, `read_at timestamptz`, `provider_error text`.
- `dispatch-worker`: quando Mandrack responder 200, marcar `status='accepted'` (não mais `sent`) + `accepted_at=now()` + salvar `provider_message_id` retornado.
- Timeout: item em `running` >10min → `failed` com `provider_error='timeout'` e retry com backoff exponencial (attempts 1→2min, 2→10min, 3→1h, depois dead-letter).
- Fila de falhas: view `dispatch_dead_letters` para o front listar itens com `attempts >= max_attempts`.

### 3. Novo webhook `mandrack-status-webhook`
- Recebe eventos `message.ack` do Mandrack (ACK 2 = server, 3 = delivered, 4 = read).
- Atualiza `dispatch_queue` por `provider_message_id` setando `delivered_at`/`read_at`.
- Instalação automática do webhook via `mandrack-manager` ao conectar chip (endpoint `/webhook` do Mandrack, já usado).
- **Fallback:** se Mandrack não expuser ACK detalhado nessa versão, faço polling opcional em `/chat/messages/{id}` a cada 30s por até 10min por mensagem accepted. Documento a decisão inline.

### 4. CRM só move após confirmação
- Reescrever trigger `auto_crm_on_dispatch_sent`: só dispara quando `NEW.delivered_at IS NOT NULL AND OLD.delivered_at IS NULL` (não mais em transição de `status`).
- Se webhook de delivery não estiver disponível no Mandrack, cair para regra "moved após `accepted_at + 2min` sem erro" (opção configurável em `dispatch_settings.crm_move_on: accepted|delivered`).
- Histórico do card: registrar `chip_instance`, `provider_message_id`, `accepted_at`, `delivered_at` no `pipeline_history`.

### 5. Distribuição entre chips (fix da concentração no chip5)
- `selectBestChip` hoje ordena por `remaining DESC` (capacidade restante). Concentra no chip com maior limite. Trocar por:
  - **Round-robin ponderado**: sortear entre chips com `remaining > 0` com peso = `remaining`.
  - Desempate: chip com `last_used_at` mais antigo (LRU).
- Manter warm-up individual por chip (não regride).
- Logar em `dispatch_queue.chip_selection_reason` (nova coluna text) por que aquele chip foi escolhido — permite auditar.

### 6. Validação de credenciais IA + persona
- Novo edge `test-ai-key`: recebe `{provider, api_key}`, faz chamada real ao provider (`/v1/models` na OpenAI, `/v1beta/models` no Gemini), retorna `{valid, quota?, error?}`.
- `useUserApiKeys.upsert`: chamar `test-ai-key` antes de salvar; se inválido, bloqueia e mostra erro real (não silencioso).
- UI `ApisTab.tsx`: chip de saúde por provider (`Conectado` / `Erro: quota` / `Erro: chave inválida`) + timestamp do último teste.
- `_shared/ai-chat.ts`: quando **ambos** providers falham, **não** cair para template genérico silencioso — retornar `null` e o worker chamador loga `provider_error` e não envia mensagem (marca item `failed` com motivo).
- `qualification-worker`: adicionar guard no início do processamento — se última mensagem `role='assistant'` foi enviada há <30s, skipa (evita duplo "Oi" quando dois ticks concorrem — o lock já cobre 99%, isso é cinto+suspensório).
- Persona: reforçar no `identityRules` regra explícita "Se o usuário pedir 'seu telefone' ou 'seu WhatsApp', você é o AGENTE, não o LEAD. Nunca dê número pessoal; oriente a falar por aqui mesmo." Distinguir 3 entidades no prompt: **agente (você)**, **lead (com quem fala)**, **terceiro citado**.

## Ordem de execução (1 PR por área, testável isolado)

1. Migration + colunas novas (item 2)
2. `mandrack-status-webhook` + install automático (item 3)
3. Trigger CRM revisado (item 4)
4. `selectBestChip` weighted round-robin (item 5)
5. `whatsapp-health-check` + UI badges + botão Reconectar (item 1)
6. `test-ai-key` + validação no upsert + guards de persona (item 6)

## Validação ao vivo
- Após cada item, testo no painel do **Lucas** (chip5 vs outros chips, disparar 3 msgs e ver distribuição/status real) e no painel da **Cleo** (não regredir SPIN da Sofia).
- Não publico até você aprovar visualmente no preview.

## Fora de escopo desta rodada (fica pra P1)
- Follow-up automático configurável
- Humanização de redação (jargões de IA)
- Correção da importação de planilha (377 rejeitados)
- Onboarding Unipile guiado
- Analisador de perfil IG (erro non-2xx)
- Tooltips/explicações na UI
- Painel de métricas por chip/campanha

## Riscos assumidos
- Trigger `auto_crm_on_dispatch_sent` mudando de "sent" para "delivered": clientes que hoje veem cards movendo instantaneamente vão ver movimento em ~30-120s (após ACK real). É o comportamento correto, mas comunico no changelog.
- Se Mandrack não expuser ACK: caio no fallback "accepted + 2min sem erro". Documento e sigo.
- Se `test-ai-key` bloquear salvamento e o provider estiver instável no momento, cliente não salva. Mitigação: botão "Salvar mesmo assim (não recomendado)" secundário.
