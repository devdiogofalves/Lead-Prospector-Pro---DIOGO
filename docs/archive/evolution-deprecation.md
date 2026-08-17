# Arquivamento de Evolution API

## Decisão atual

O produto atual usa Mandrack para WhatsApp. Evolution API é legado e não deve ser usado em novas features.

## O que ainda existe no repositório

- `supabase/functions/evolution-manager/index.ts` permanece no histórico/código como legado.
- Algumas colunas e campos com nome `evolution_*` ainda existem em migrations e tipos porque guardam respostas históricas ou compatibilidade de dados.
- Algumas memórias antigas ainda citam Evolution e devem ser consideradas arquivadas, não fonte da arquitetura atual.

## Regra operacional

- Não configurar `EVOLUTION_API_URL` nem `EVOLUTION_API_KEY` em produção nova.
- Não criar UI nova apontando para `evolution-manager`.
- Usar `mandrack-manager`, `whatsapp_instances` e `MANDRACK_API_KEY`/`MANDRACK_URL`.

## Remoção definitiva futura

Antes de deletar código/colunas, validar:

1. Nenhum cliente ativo usa registros legados em `user_integrations.evolution_instance`.
2. Nenhum cron ou webhook chama `evolution-manager`.
3. Backups/migrations estão prontos para renomear campos históricos sem perda de auditoria.
4. A documentação pública e memórias antigas foram atualizadas.
