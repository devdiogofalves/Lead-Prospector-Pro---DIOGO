CREATE OR REPLACE FUNCTION public.claim_dispatch_item(_id uuid)
RETURNS TABLE (id uuid, user_id uuid, attempts int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_user uuid;
  v_attempts int;
BEGIN
  SELECT dq.id, dq.user_id, dq.attempts
    INTO v_id, v_user, v_attempts
  FROM public.dispatch_queue dq
  WHERE dq.id = _id AND dq.status = 'pending'
  FOR UPDATE SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.dispatch_queue
     SET status = 'running',
         updated_at = now()
   WHERE dispatch_queue.id = v_id;

  RETURN QUERY SELECT v_id, v_user, v_attempts;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_dispatch_item(uuid) TO service_role;