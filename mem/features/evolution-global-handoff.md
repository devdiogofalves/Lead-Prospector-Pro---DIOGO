---
name: evolution-global-handoff
description: Evolution API global (admin secrets) + instâncias por cliente via UI + handoff de leads qualificados para grupo WhatsApp
type: feature
---
Evolution é hospedada pelo admin (secrets `EVOLUTION_API_URL` + `EVOLUTION_API_KEY`). Cliente nunca precisa de VPS.

- Edge `evolution-manager` (verify_jwt=true, padrão): ações `status|create|qr|pairing|logout|delete|groups|send-text`. Instância nomeada `lb_<userid_short>`. Salva em `user_integrations.evolution_instance`.
- UI: `/configuracoes/whatsapp` (`WhatsAppTab.tsx`) — criar instância, QR Code, código de pareamento, status (poll 5s), listar/selecionar grupo de handoff.
- Schema: `qualification_settings.handoff_group_jid/name`; `qualification_conversations.qualified/qualified_at/summary`.
- `qualification-worker`: instrui IA a anexar `[QUALIFICADO]` quando lead demonstra interesse real. Detecta tag → remove do texto enviado, gera resumo com Lovable AI, marca conversa qualified=true (pausa o bot), cria card no `pipeline_cards` em estágio `negociando`, envia card formatado (nome/telefone/wa.me/resumo) para o grupo via Evolution.
- Fallback: worker prefere user's evolution key se existir, senão usa env globais (admin).