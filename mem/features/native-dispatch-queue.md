---
name: native-dispatch-queue
description: Disparo humanizado nativo (sem n8n) — fila dispatch_queue, worker via pg_cron, Lovable AI gera mensagem, ElevenLabs gera áudio, envio via Evolution API
type: feature
---
Substitui n8n para disparo. Tabelas: `dispatch_queue` (fila com status pending/running/sent/failed/cancelled, scheduled_at, attempts, proxy_url) e `dispatch_settings` (per-user: min/max delay, janela comercial BRT, daily_limit, use_audio + audio_ratio, proxy_url, paused kill-switch, warmup_mode).

**pg_cron `dispatch-worker-tick`** roda `* * * * *` chamando edge function `dispatch-worker` via pg_net.
**Edge fn `dispatch-enqueue`** (auth required): recebe leads, espaça scheduled_at usando random(min,max) acumulando do último pendente.
**Edge fn `dispatch-worker`** (público, chamado pelo cron): pega 1 envio por user_id (anti rate-limit), valida settings/horário/limite diário, gera mensagem com Lovable AI + system_prompt do prospecting_profiles, opcionalmente gera áudio ElevenLabs no bucket `disparos-audio`, envia via Evolution `/message/sendText` ou `/sendWhatsAppAudio` com `options.proxy` quando configurado.

**Anti-ban**: 3 falhas em 10min => paused=true automático. Backoff exponencial (60s × attempts × 2). Atualiza tabela origem (leads/instagram_contacts/etc) com disparo='Sim' e data_disparo.

UI em `/disparo-humanizado`: stats (pending/running/sent/failed), próximo ETA, lista da fila (refresh 5s), seletor multi-lead, settings inline (delay/horário/limite/áudio/proxy), botão pausar/retomar.