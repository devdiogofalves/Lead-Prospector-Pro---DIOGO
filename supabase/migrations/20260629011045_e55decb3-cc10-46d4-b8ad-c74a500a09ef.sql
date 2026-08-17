CREATE TABLE IF NOT EXISTS public.meta_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object text,
  event_type text,
  ig_user_id text,
  user_id uuid,
  interaction_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  processing_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.meta_webhook_events TO service_role;

ALTER TABLE public.meta_webhook_events ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_meta_webhook_events_updated_at ON public.meta_webhook_events;
CREATE TRIGGER update_meta_webhook_events_updated_at
BEFORE UPDATE ON public.meta_webhook_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_meta_webhook_events_received_at ON public.meta_webhook_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_webhook_events_processed ON public.meta_webhook_events (processed, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_webhook_events_user_id ON public.meta_webhook_events (user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_webhook_events_ig_user_id ON public.meta_webhook_events (ig_user_id, received_at DESC);