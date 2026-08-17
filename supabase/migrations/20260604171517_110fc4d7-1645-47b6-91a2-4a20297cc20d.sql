
ALTER TABLE public.dispatch_queue
  ADD COLUMN IF NOT EXISTS media_type TEXT,
  ADD COLUMN IF NOT EXISTS media_url TEXT;

COMMENT ON COLUMN public.dispatch_queue.media_type IS 'text | audio | image (campanha DisparoBooster). NULL = comportamento legado.';
COMMENT ON COLUMN public.dispatch_queue.media_url IS 'URL pública do áudio/imagem pré-carregado pelo usuário na campanha.';
