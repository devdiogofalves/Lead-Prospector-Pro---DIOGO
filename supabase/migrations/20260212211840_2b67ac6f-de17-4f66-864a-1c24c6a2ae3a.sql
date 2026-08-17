
CREATE TABLE public.saved_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(url)
);

ALTER TABLE public.saved_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON public.saved_webhooks FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.saved_webhooks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.saved_webhooks FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.saved_webhooks FOR DELETE USING (true);
