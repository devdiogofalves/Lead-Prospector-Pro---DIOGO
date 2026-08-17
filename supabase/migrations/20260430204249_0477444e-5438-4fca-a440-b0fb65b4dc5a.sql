-- Backfill telefones a partir do raw_response em consultas antigas
UPDATE public.dados4u_consultas
SET 
  celulares = COALESCE(raw_response->'telefones_celulares', raw_response->'celulares', '[]'::jsonb),
  fixos = COALESCE(raw_response->'telefones_fixos', raw_response->'fixos', '[]'::jsonb)
WHERE 
  (jsonb_array_length(COALESCE(celulares, '[]'::jsonb)) = 0 OR celulares IS NULL)
  AND raw_response IS NOT NULL
  AND (raw_response ? 'telefones_celulares' OR raw_response ? 'telefones_fixos' OR raw_response ? 'celulares' OR raw_response ? 'fixos');