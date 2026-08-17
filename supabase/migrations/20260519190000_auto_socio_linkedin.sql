-- Fase G: toggle `auto_socio_linkedin` em automation_settings
-- Quando ligado, após CNPJ enrichment, o auto-prospect busca cada sócio
-- identificado no LinkedIn (Unipile/Apify) e cria contato em
-- linkedin_contacts com cadência opcional iniciada. Default false (consome
-- créditos por sócio — operador liga conscientemente).

ALTER TABLE public.automation_settings
  ADD COLUMN IF NOT EXISTS auto_socio_linkedin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_socio_linkedin_start_cadence boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.automation_settings.auto_socio_linkedin IS
  'Quando true, busca sócio identificado no LinkedIn após CNPJ enrich e cria linkedin_contacts.';
COMMENT ON COLUMN public.automation_settings.auto_socio_linkedin_start_cadence IS
  'Se auto_socio_linkedin=true, também inicia automaticamente a cadência D+0 ao criar o contato.';
