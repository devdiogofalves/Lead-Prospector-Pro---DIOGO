
-- Remove os jobs duplicados criados agora, mantendo os -tick originais
SELECT cron.unschedule('dispatch-worker');
SELECT cron.unschedule('qualification-worker');
