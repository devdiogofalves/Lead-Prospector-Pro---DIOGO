UPDATE public.linkedin_contacts
SET cadencia_status = 'active',
    cadencia_falhas = 0,
    ultima_falha = NULL,
    data_prox_disparo = now() + interval '5 minutes'
WHERE id = '9db2b834-8b90-486f-9dd4-2c65db327daf'
  AND cadencia_status = 'replied'
  AND ultima_resposta_em IS NULL;