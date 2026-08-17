
CREATE OR REPLACE FUNCTION public.get_chip_health_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_today_start timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_chips jsonb;
  v_total_capacity int := 0;
  v_monthly_target int;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error','not_authenticated');
  END IF;

  SELECT COALESCE(monthly_target, 1000) INTO v_monthly_target
  FROM public.dispatch_settings WHERE user_id = v_user LIMIT 1;
  v_monthly_target := COALESCE(v_monthly_target, 1000);

  WITH base AS (
    SELECT
      wi.id,
      wi.instance_name,
      wi.active,
      wi.paused,
      wi.status,
      wi.daily_limit,
      wi.created_at,
      wi.last_health_check_at,
      GREATEST(0, EXTRACT(EPOCH FROM (now() - wi.created_at))/86400)::int AS age_days,
      (SELECT COUNT(*) FROM public.dispatch_queue dq
        WHERE dq.whatsapp_instance_id = wi.id AND dq.status='sent'
          AND dq.sent_at >= v_today_start) AS sent_today,
      (SELECT COUNT(*) FROM public.dispatch_queue dq
        WHERE dq.whatsapp_instance_id = wi.id AND dq.status='failed'
          AND dq.updated_at >= v_today_start) AS failed_today
    FROM public.whatsapp_instances wi
    WHERE wi.user_id = v_user
  ),
  computed AS (
    SELECT
      b.*,
      CASE
        WHEN age_days < 1 THEN LEAST(daily_limit, 8)
        WHEN age_days < 2 THEN LEAST(daily_limit, 15)
        WHEN age_days < 4 THEN LEAST(daily_limit, 25)
        WHEN age_days < 7 THEN LEAST(daily_limit, 35)
        WHEN age_days < 14 THEN LEAST(daily_limit, 50)
        ELSE daily_limit
      END AS warmup_cap,
      CASE WHEN (sent_today + failed_today) > 0
           THEN failed_today::numeric / (sent_today + failed_today)::numeric
           ELSE 0 END AS fail_ratio
    FROM base b
  ),
  adjusted AS (
    SELECT
      c.*,
      CASE
        WHEN (sent_today + failed_today) < 3 THEN warmup_cap
        WHEN fail_ratio >= 0.5 THEN sent_today
        WHEN fail_ratio >= 0.3 THEN LEAST(warmup_cap, sent_today + 2)
        WHEN fail_ratio >= 0.15 THEN GREATEST(sent_today, warmup_cap / 2)
        ELSE warmup_cap
      END AS effective_cap
    FROM computed c
  )
  SELECT jsonb_agg(row_to_json(a) ORDER BY instance_name) INTO v_chips
  FROM (
    SELECT
      id, instance_name, active, paused, status, daily_limit,
      age_days, warmup_cap, effective_cap, sent_today, failed_today,
      ROUND(fail_ratio*100)::int AS fail_ratio_pct,
      GREATEST(0, effective_cap - sent_today) AS remaining_today,
      CASE
        WHEN NOT active OR paused THEN 'alto'
        WHEN status IN ('close','disconnected','logged_out') THEN 'alto'
        WHEN fail_ratio >= 0.5 THEN 'alto'
        WHEN fail_ratio >= 0.15 THEN 'medio'
        WHEN age_days < 2 THEN 'medio'
        WHEN sent_today >= effective_cap THEN 'medio'
        ELSE 'baixo'
      END AS risk,
      CASE
        WHEN NOT active THEN 'Desativado'
        WHEN paused THEN 'Pausado'
        WHEN status IN ('close','disconnected','logged_out') THEN 'Desconectado — parear novamente'
        WHEN fail_ratio >= 0.5 THEN 'Backoff: falhas ' || ROUND(fail_ratio*100)::int || '% (congelado)'
        WHEN fail_ratio >= 0.3 THEN 'Backoff: falhas ' || ROUND(fail_ratio*100)::int || '% (+2)'
        WHEN fail_ratio >= 0.15 THEN 'Backoff: falhas ' || ROUND(fail_ratio*100)::int || '% (metade)'
        WHEN sent_today >= effective_cap THEN 'Teto diário atingido'
        WHEN age_days < 2 THEN 'Aquecendo (dia ' || age_days || ')'
        ELSE 'Saudável'
      END AS reason
    FROM adjusted
  ) a;

  SELECT COALESCE(SUM(effective_cap), 0) INTO v_total_capacity FROM adjusted;

  RETURN jsonb_build_object(
    'chips', COALESCE(v_chips, '[]'::jsonb),
    'monthly_target', v_monthly_target,
    'monthly_projection', v_total_capacity * 30,
    'meets_target', (v_total_capacity * 30) >= v_monthly_target
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_chip_health_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chip_health_metrics() TO authenticated;

ALTER TABLE public.dispatch_settings
  ADD COLUMN IF NOT EXISTS monthly_target integer DEFAULT 1000;
