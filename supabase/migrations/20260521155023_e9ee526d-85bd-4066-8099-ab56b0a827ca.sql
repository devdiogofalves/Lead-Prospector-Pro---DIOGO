UPDATE public.leads
SET disparo='Não', data_disparo=NULL
WHERE disparo='Sim'
  AND data_disparo BETWEEN '2026-05-20 22:55:00+00' AND '2026-05-20 23:10:00+00'
  AND id NOT IN (SELECT source_id FROM public.dispatch_queue WHERE source='leads' AND source_id IS NOT NULL);