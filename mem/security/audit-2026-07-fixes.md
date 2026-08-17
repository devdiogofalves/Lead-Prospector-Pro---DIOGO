---
name: Auditoria 2026-07 — fixes aplicados
description: Registro dos fixes de segurança/isolamento aplicados após a auditoria HTML enviada pelo cliente
type: reference
---
# Auditoria multi-tenant — status

Todos os crons rodam no projeto CORRETO (`owxcdevylkljaiilevav`). A auditoria falava em "cron no projeto errado" mas era especulação — os workers dispatch/qualification/auto-prospect/linkedin/mavi-learn/social/meta-refresh estão vivos.

## Bloco 1 + 2 aplicados (2026-07-06)

### Migration
- Dropada constraint `unique_cnpj` (global) em `empresas_enriquecidas` — mantida só a composta `(cnpj, user_id)`.
- Removida policy "Resellers manage their clients" em `client_subscriptions`; revogado INSERT/UPDATE/DELETE de `authenticated`. Escrita agora só via edge functions (kiwify-webhook, admin-manage-client, reseller-create-client).
- `get_apify_key_for_user` refatorado: ignora argumento `_user`, usa `auth.uid()`.

### Edge functions
- `cnpj-lookup`: adicionado `.eq("user_id", userId)` em update e select do lead (fecha IDOR).
- `webhook-qualification`: valida `?token=<WEBHOOK_QUALIFICATION_SECRET>` quando env está definido (opt-in — habilitar quando Mandrack estiver configurado com o token no URL).
- `auto-prospect` cron branch: exige `Authorization: Bearer <SERVICE_ROLE>` OU header `x-cron-secret`.
- `mavi-learn` cron branch: mesmo esquema.
- `meta-instagram-token-refresh`: quando sem user JWT, exige service_role ou x-cron-secret.
- `google-oauth-start` + `google-oauth-callback`: state assinado com HMAC-SHA256 (secret `OAUTH_STATE_SECRET`), TTL 15min.
- `meta-instagram-webhook`: valida `X-Hub-Signature-256` com `META_IG_APP_SECRET` (constant-time compare).

### Crons alterados (via cron.alter_job)
- jobids 2, 7, 6, 48 agora enviam `Authorization: Bearer <service_role via vault>`.

### Secrets gerados
- `CRON_SECRET`, `OAUTH_STATE_SECRET`, `WEBHOOK_QUALIFICATION_SECRET` (opt-in, ativo só quando cliente atualizar Mandrack pra enviar `?token=`).

## Bloco 3 — aplicado (2026-07-06)

### Follow-ups (loop infinito + templates AGREGA hardcoded) — RESOLVIDO
- Migration: adicionadas `followups_sent int`, `last_followup_stage text`, `last_followup_at timestamptz` em `dispatch_queue` e `qualification_conversations` (+ índices).
- `src/pages/FollowUps.tsx`:
  - `getStage(days, followupsSent)` avança pelas etapas D+7 → D+14 → D+21 conforme o contador, não conforme timestamp mutável.
  - `sendFollowUp` NÃO reseta mais `sent_at` / `last_message_at`. Incrementa `followups_sent`, salva `last_followup_stage` e `last_followup_at`.
  - Templates trocados por versões genéricas (sem "inadimplência" / "recuperação de crédito" / "60%"); usam `agent_name` + `company_name` do branding via `buildTemplates(agent, company)`.
  - Queries filtram `followups_sent < 3` para não repopular leads que já esgotaram a cadência.
  - Contagem de dias em conversas usa `created_at` (não `last_message_at`), evitando reset quando a IA responde.

## Pendências dos blocos 3-5
- Cadência LinkedIn manda DM antes do convite
- Dashboard: "Leads Qualificados" lê `leads.tags` inexistente; "Em Negociação" = 0 fixo
- Onboarding-30s grava em `business_context` inexistente
- Extensão Chrome: rota inexistente, regex de licença, revalidação 6h
- `carousel-generate` 500 quando Brand Kit existe
- `social-metrics-sync` usa coluna errada (LinkedIn nunca sincroniza)
- Anexos do Suporte não abrem (URL pública em bucket privado)
- Limites de plano não aplicados nos workers
- Reaper de itens presos em `running`; unificação BRT vs UTC

