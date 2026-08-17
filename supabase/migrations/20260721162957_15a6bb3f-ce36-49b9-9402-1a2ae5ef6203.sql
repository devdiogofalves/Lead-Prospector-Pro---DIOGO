UPDATE public.pipeline_cards p
SET estagio = 'qualificando', updated_at = now()
FROM public.qualification_conversations c
WHERE p.user_id = c.user_id
  AND p.telefone = c.telefone
  AND c.last_inbound_at IS NOT NULL
  AND p.estagio IN ('novo_lead','prospectado','primeiro_contato')
  AND c.qualified = false;