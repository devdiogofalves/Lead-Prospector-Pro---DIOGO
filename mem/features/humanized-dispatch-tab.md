---
name: humanized-dispatch-tab
description: Disparo Humanizado tab — triggers n8n via webhook from dashboard, monitors execution node-by-node via n8n API
type: feature
---
Aba `/disparo-humanizado` (sidebar > Pipeline) dispara o workflow humanizado direto pelo painel.

## Arquitetura
- Template n8n tem **2 triggers**: Schedule (cron) + Webhook Trigger (`{{WEBHOOK_PATH}}`, padrão `disparo-humanizado`).
- Webhook usa `responseMode: "responseNode"` + nó `Responde Webhook` que retorna `{ ok, executionId, count }`.
- Edge function `n8n-trigger-dispatch`: recebe `{ webhookUrl, leads[], config? }`, faz POST e retorna resposta + executionId.
- Edge function `n8n-execution-monitor`: chama `GET {apiUrl}/api/v1/executions/{id}?includeData=true` com header `X-N8N-API-KEY`, retorna lista de nodes com status/erro/output.
- Frontend faz auto-poll a cada 3.5s até `finished=true`.

## user_integrations (novos campos)
- `n8n_webhook_dispatch_url` — URL do webhook do workflow
- `n8n_api_url` — base URL do n8n (ex: `https://meu.app.n8n.cloud`)
- `n8n_api_key` — API Key do n8n (Settings > API)

## Fontes de lead pro teste
- `leads`, `instagram_contacts`, `linkedin_contacts`, `empresas_enriquecidas` (15 mais recentes)
- Lead manual com nome+telefone+nicho

## Payload enviado pro webhook
```json
{ "leads": [ { id, source, nome_empresa, telefone, ... } ], "config": {} }
```
O nó "Normaliza Payload Webhook" do template aceita `{leads:[]}`, array direto, ou `{body:{leads}}`.
