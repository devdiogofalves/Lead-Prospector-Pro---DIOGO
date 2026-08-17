
-- Follow-up settings for automatic re-engagement of leads that did not respond
ALTER TABLE public.dispatch_settings
  ADD COLUMN IF NOT EXISTS followup_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_delay_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS followup_max_attempts integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS followup_template text;

-- Metrics RPC: per-chip and per-source rollup for the last N days.
CREATE OR REPLACE FUNCTION public.get_dispatch_metrics(_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_since timestamptz := now() - make_interval(days => COALESCE(_days,7));
  v_by_chip jsonb;
  v_by_source jsonb;
  v_totals jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error','not_authenticated');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_by_chip
  FROM (
    SELECT
      COALESCE(wi.instance_name, '(sem chip)') AS chip,
      dq.whatsapp_instance_id AS chip_id,
      COUNT(*) FILTER (WHERE dq.status = 'sent')                                    AS sent,
      COUNT(*) FILTER (WHERE dq.delivered_at IS NOT NULL)                           AS delivered,
      COUNT(*) FILTER (WHERE dq.read_at IS NOT NULL)                                AS read,
      COUNT(*) FILTER (WHERE dq.status = 'failed')                                  AS failed,
      COUNT(*) FILTER (WHERE dq.status = 'pending')                                 AS pending
    FROM public.dispatch_queue dq
    LEFT JOIN public.whatsapp_instances wi ON wi.id = dq.whatsapp_instance_id
    WHERE dq.user_id = v_user
      AND dq.created_at >= v_since
      AND COALESCE(dq.channel,'whatsapp') = 'whatsapp'
    GROUP BY wi.instance_name, dq.whatsapp_instance_id
    ORDER BY sent DESC
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_by_source
  FROM (
    SELECT
      COALESCE(dq.channel, 'whatsapp')  AS channel,
      COALESCE(dq.source, 'manual')     AS source,
      COUNT(*) FILTER (WHERE dq.status = 'sent')          AS sent,
      COUNT(*) FILTER (WHERE dq.delivered_at IS NOT NULL) AS delivered,
      COUNT(*) FILTER (WHERE dq.read_at IS NOT NULL)      AS read,
      COUNT(*) FILTER (WHERE dq.status = 'failed')        AS failed
    FROM public.dispatch_queue dq
    WHERE dq.user_id = v_user
      AND dq.created_at >= v_since
    GROUP BY dq.channel, dq.source
    ORDER BY sent DESC
  ) t;

  SELECT jsonb_build_object(
    'sent', COUNT(*) FILTER (WHERE status = 'sent'),
    'delivered', COUNT(*) FILTER (WHERE delivered_at IS NOT NULL),
    'read', COUNT(*) FILTER (WHERE read_at IS NOT NULL),
    'failed', COUNT(*) FILTER (WHERE status = 'failed'),
    'pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'replies', (
      SELECT COUNT(DISTINCT telefone)
      FROM public.qualification_messages qm
      WHERE qm.user_id = v_user
        AND qm.role = 'user'
        AND qm.created_at >= v_since
    ),
    'qualified', (
      SELECT COUNT(*) FROM public.pipeline_cards pc
      WHERE pc.user_id = v_user
        AND pc.updated_at >= v_since
        AND pc.estagio IN ('qualificado','proposta','ganho','agendado')
    )
  ) INTO v_totals
  FROM public.dispatch_queue
  WHERE user_id = v_user AND created_at >= v_since;

  RETURN jsonb_build_object(
    'since', v_since,
    'days', _days,
    'totals', v_totals,
    'by_chip', v_by_chip,
    'by_source', v_by_source
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dispatch_metrics(integer) TO authenticated;
