-- Tabela de histórico de disparos
CREATE TABLE public.disparos_humanizados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID,
  source TEXT NOT NULL,
  nome_empresa TEXT,
  telefone TEXT,
  mensagem TEXT,
  audio_url TEXT,
  tipo_envio TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  erro TEXT,
  execution_id TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_disparos_humanizados_lead ON public.disparos_humanizados(lead_id);
CREATE INDEX idx_disparos_humanizados_source ON public.disparos_humanizados(source);
CREATE INDEX idx_disparos_humanizados_created ON public.disparos_humanizados(created_at DESC);

ALTER TABLE public.disparos_humanizados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON public.disparos_humanizados FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.disparos_humanizados FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.disparos_humanizados FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.disparos_humanizados FOR DELETE USING (true);

CREATE TRIGGER update_disparos_humanizados_updated_at
BEFORE UPDATE ON public.disparos_humanizados
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket de áudios
INSERT INTO storage.buckets (id, name, public)
VALUES ('disparos-audio', 'disparos-audio', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Disparos audio public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'disparos-audio');

CREATE POLICY "Disparos audio public upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'disparos-audio');

CREATE POLICY "Disparos audio public update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'disparos-audio');

CREATE POLICY "Disparos audio public delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'disparos-audio');