
-- P0 item 2: colunas de estado real da fila (accepted vs delivered vs read).
-- Aditivo, nullable. Zero impacto no comportamento atual — worker vai passar
-- a preencher accepted_at quando Mandrack retornar 200 numa próxima rodada.

ALTER TABLE public.dispatch_queue
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_error TEXT,
  ADD COLUMN IF NOT EXISTS chip_selection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_provider_message_id
  ON public.dispatch_queue (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_accepted_at
  ON public.dispatch_queue (accepted_at)
  WHERE accepted_at IS NOT NULL AND delivered_at IS NULL;
