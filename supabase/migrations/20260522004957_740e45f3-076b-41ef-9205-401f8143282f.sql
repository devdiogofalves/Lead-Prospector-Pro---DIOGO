
WITH ordered AS (
  SELECT
    id,
    (ROW_NUMBER() OVER (ORDER BY created_at, id))::int - 1 AS rn
  FROM public.dispatch_queue
  WHERE status = 'pending'
    AND scheduled_at <= '2026-05-23 00:00:00+00'
),
spaced AS (
  SELECT
    id,
    rn,
    -- Base: Segunda 25/05/2026 09:00 BRT = 12:00 UTC + jitter inicial 0-15min
    (TIMESTAMPTZ '2026-05-25 12:00:00+00'
     + (random() * INTERVAL '15 minutes')
     -- gap médio ~165s por lead (90-240s)
     + (rn * INTERVAL '1 second' * (90 + random() * 150))
     -- coffee break ~25min a cada 12 leads
     + (FLOOR(rn::numeric / 12) * INTERVAL '25 minutes')
    ) AS new_sched
  FROM ordered
)
UPDATE public.dispatch_queue d
SET scheduled_at = s.new_sched
FROM spaced s
WHERE d.id = s.id;
