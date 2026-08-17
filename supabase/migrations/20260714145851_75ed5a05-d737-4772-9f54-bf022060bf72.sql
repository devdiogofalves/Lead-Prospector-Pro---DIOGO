ALTER TABLE public.social_post_interactions
  ADD COLUMN IF NOT EXISTS spin_stage text,
  ADD COLUMN IF NOT EXISTS qualified boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_spi_qualified
  ON public.social_post_interactions (user_id, qualified)
  WHERE qualified = true;

CREATE INDEX IF NOT EXISTS idx_spi_spin_stage
  ON public.social_post_interactions (user_id, spin_stage)
  WHERE spin_stage IS NOT NULL;

-- Backfill: extrair spin_stage / qualified da coluna error (formato antigo "spin:S" ou "spin:P:qualified")
-- e limpar o prefixo spin: da coluna error para restaurá-la a falhas reais.
UPDATE public.social_post_interactions
   SET spin_stage = COALESCE(spin_stage, substring(error from 'spin:([SPIN]|qualified)')),
       qualified  = qualified OR (error LIKE '%:qualified%' OR error LIKE 'spin:qualified%'),
       error      = NULLIF(regexp_replace(error, '(^|\s\|\s)spin:[^|]*', '', 'g'), '')
 WHERE error LIKE '%spin:%';