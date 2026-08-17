---
name: native-qualification
description: Qualificação humanizada nativa (sem n8n) — webhook público recebe mensagens da Evolution, buffer DB, Lovable AI responde texto/áudio
type: feature
---
Substitui n8n para atendimento. Tabelas: `qualification_settings` (per-user: paused, use_audio, audio_ratio, buffer_seconds, voice_id, system_prompt), `qualification_conversations` (1 por user_id+telefone), `qualification_messages` (role user/assistant, processed bool, audio_url, transcribed).

Edge fns:
- `webhook-qualification` (público, verify_jwt=false): URL `/webhook-qualification/{user_id}`. Cliente cola na Evolution (messages.upsert). Ignora fromMe. Se vier áudio, transcreve via Lovable AI Gemini multimodal. Upsert conversation + insert message processed=false.
- `qualification-worker` (pg_cron `* * * * *`): agrupa mensagens user pendentes por conversa, espera buffer_seconds desde última, monta histórico (30 msgs), Lovable AI gemini-3-flash-preview gera resposta, sorteia áudio (audio_ratio) via ElevenLabs no bucket `qualificacao-audio`, envia via Evolution sendText/sendWhatsAppAudio. System prompt: settings.system_prompt > prospecting_profiles.system_prompt > default. Marca todas as user pendentes como processed=true.

UI `/qualificacao-humanizada`: webhook URL copy, settings (buffer, voz, áudio toggle+ratio, prompt com botão "Usar do Assistente"), pause/play, stats (inbound/replies/pending), lista conversas refresh 5s.
