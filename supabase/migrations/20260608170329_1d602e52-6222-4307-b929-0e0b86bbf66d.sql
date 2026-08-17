
-- Índices para queries quentes dos workers
CREATE INDEX IF NOT EXISTS idx_dispatch_queue_user_status_sched
  ON public.dispatch_queue (user_id, status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_user_sent_at
  ON public.dispatch_queue (user_id, sent_at DESC)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_campaign_status
  ON public.dispatch_queue (campaign_id, status)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_dead
  ON public.dispatch_queue (user_id)
  WHERE status = 'failed';

CREATE INDEX IF NOT EXISTS idx_qmsg_user_created
  ON public.qualification_messages (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_history_card_created
  ON public.pipeline_history (card_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_camp_recipients_campaign_status
  ON public.campaign_recipients (campaign_id, status);

-- RPC com métricas de operação para o /saude
CREATE OR REPLACE FUNCTION public.get_worker_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_dispatch jsonb;
  v_qual jsonb;
  v_linkedin jsonb;
  v_latency jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error','not_authenticated');
  END IF;

  -- Fila de disparo
  SELECT jsonb_build_object(
    'pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'overdue', COUNT(*) FILTER (WHERE status = 'pending' AND scheduled_at < v_now - interval '5 minutes'),
    'running', COUNT(*) FILTER (WHERE status = 'running'),
    'stuck_running', COUNT(*) FILTER (WHERE status = 'running' AND updated_at < v_now - interval '10 minutes'),
    'failed_recent', COUNT(*) FILTER (WHERE status = 'failed' AND updated_at > v_now - interval '24 hours'),
    'dead_letters', COUNT(*) FILTER (WHERE status = 'failed' AND attempts >= max_attempts),
    'sent_24h', COUNT(*) FILTER (WHERE status = 'sent' AND sent_at > v_now - interval '24 hours'),
    'oldest_pending_minutes', COALESCE(
      EXTRACT(EPOCH FROM (v_now - MIN(scheduled_at) FILTER (WHERE status = 'pending'))) / 60,
      0
    )::int
  )
  INTO v_dispatch
  FROM public.dispatch_queue
  WHERE user_id = v_user;

  -- Latência (criado→enviado) últimos 60 min
  SELECT jsonb_build_object(
    'sample_size', COUNT(*),
    'p50_seconds', COALESCE(
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (sent_at - created_at))),
      0
    )::int,
    'p95_seconds', COALESCE(
      percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (sent_at - created_at))),
      0
    )::int
  )
  INTO v_latency
  FROM public.dispatch_queue
  WHERE user_id = v_user
    AND status = 'sent'
    AND sent_at > v_now - interval '60 minutes';

  -- Qualificação
  SELECT jsonb_build_object(
    'pending_user_msgs', COUNT(*) FILTER (WHERE role = 'user' AND processed = false),
    'oldest_pending_minutes', COALESCE(
      EXTRACT(EPOCH FROM (v_now - MIN(created_at) FILTER (WHERE role = 'user' AND processed = false))) / 60,
      0
    )::int,
    'assistant_replies_24h', COUNT(*) FILTER (WHERE role = 'assistant' AND created_at > v_now - interval '24 hours')
  )
  INTO v_qual
  FROM public.qualification_messages
  WHERE user_id = v_user;

  -- LinkedIn cadência
  SELECT jsonb_build_object(
    'active', COUNT(*) FILTER (WHERE cadencia_status = 'active'),
    'due_now', COUNT(*) FILTER (WHERE cadencia_status = 'active' AND data_prox_disparo <= v_now),
    'attempts_24h', COUNT(*) FILTER (WHERE last_attempt_at > v_now - interval '24 hours')
  )
  INTO v_linkedin
  FROM public.linkedin_contacts
  WHERE user_id = v_user;

  RETURN jsonb_build_object(
    'generated_at', v_now,
    'dispatch', v_dispatch,
    'latency', v_latency,
    'qualification', v_qual,
    'linkedin', v_linkedin
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_worker_metrics() FROM public;
GRANT EXECUTE ON FUNCTION public.get_worker_metrics() TO authenticated;
