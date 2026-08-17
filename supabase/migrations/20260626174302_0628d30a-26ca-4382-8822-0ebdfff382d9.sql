-- Destrava worker: marca como processadas mensagens antigas que estão envenenando a fila
UPDATE qualification_messages SET processed=true, error='cleared: stuck old conversation polluting batch'
WHERE role='user' AND processed=false AND created_at < now() - interval '24 hours';

-- Fecha conversas órfãs/loop (telegram self-feedback do admin: "Relatório VPS")
UPDATE qualification_conversations SET status='ignored'
WHERE id IN ('da3e1401-0c39-4114-b724-6beb30070220','b619d46f-add2-4610-ab22-b8152fd08a67');