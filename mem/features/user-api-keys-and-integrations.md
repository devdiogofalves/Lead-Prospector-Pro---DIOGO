---
name: User API keys and integrations (multi-tenant)
description: Per-user API keys (OpenAI, Gemini, Apify, Google Places, Evolution, Dados4U) and n8n/MCP integrations stored in DB. UI at /configuracoes with sub-tabs (apis, webhooks, n8n template, mcp).
type: feature
---
- Tables: `user_api_keys` (user_id+provider unique, api_key, extra jsonb) and `user_integrations` (one row per user: n8n_webhook_url, n8n_mcp_url, n8n_mcp_token, evolution_instance). RLS owner-only.
- Hooks: `useUserApiKeys` and `useUserIntegrations` in src/hooks/useUserApiKeys.ts.
- Routes: /configuracoes (layout with tabs) → /apis, /webhooks, /n8n, /mcp.
- Provider IDs: openai, gemini, apify, google_places, evolution, dados4u.
- n8n template tab (/configuracoes/n8n) gera o **Disparo Humanizado WhatsApp** com formulário (Schedule cron, Sheet ID, Evolution, ElevenLabs voice, OpenAI model, system prompt editável) e injeta nos placeholders {{...}} do template em src/templates/humanizedDispatchTemplate.ts. Pré-preenche com chaves salvas em /apis (provider 'evolution' + extra.url, 'elevenlabs' + extra.voice_id) e user_integrations.evolution_instance.
- MCP: client pastes their n8n MCP URL (Settings → MCP access in n8n) so painel can call workflows without webhook.
- NEXT: edge functions still read from Deno.env. Phase 2 = read user keys from DB scoped to authed user.
