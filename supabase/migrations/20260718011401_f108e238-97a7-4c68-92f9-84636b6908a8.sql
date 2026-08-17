
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz;

ALTER TABLE public.dispatch_settings
  ADD COLUMN IF NOT EXISTS crm_move_on text NOT NULL DEFAULT 'sent'
    CHECK (crm_move_on IN ('sent','delivered'));

-- Trigger revisado: por padrão mantém comportamento antigo (dispara em status='sent').
-- Se o tenant configurar crm_move_on='delivered', só dispara quando delivered_at for populado
-- (o novo mandrack-status-webhook seta essa coluna via ACK).
CREATE OR REPLACE FUNCTION public.auto_crm_on_dispatch_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_source TEXT;
  v_source_id UUID;
  v_card_id UUID;
  v_existing UUID;
  v_nome TEXT;
  v_contato TEXT;
  v_move_on TEXT;
  v_should_fire BOOLEAN := false;
BEGIN
  SELECT crm_move_on INTO v_move_on
    FROM public.dispatch_settings
   WHERE user_id = NEW.user_id
   LIMIT 1;
  v_move_on := COALESCE(v_move_on, 'sent');

  IF v_move_on = 'delivered' THEN
    -- Só move quando delivered_at transiciona de NULL para populado
    IF NEW.delivered_at IS NOT NULL AND (OLD.delivered_at IS NULL) THEN
      v_should_fire := true;
    END IF;
  ELSE
    -- Comportamento clássico: dispara na transição para status='sent'
    IF NEW.status = 'sent' AND COALESCE(OLD.status,'') <> 'sent' THEN
      v_should_fire := true;
    END IF;
  END IF;

  IF NOT v_should_fire THEN
    RETURN NEW;
  END IF;

  v_source := NEW.source;
  v_source_id := NEW.source_id;
  IF v_source IS NULL OR v_source_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pipeline_card_id INTO v_existing
  FROM public.lead_pipeline_status
  WHERE source = v_source AND source_id = v_source_id;

  IF v_existing IS NULL THEN
    SELECT nome, identificador INTO v_nome, v_contato
    FROM public.leads_unified
    WHERE source = v_source AND source_id = v_source_id
    LIMIT 1;

    INSERT INTO public.pipeline_cards
      (user_id, nome_empresa, contato, telefone, origem, estagio, observacoes)
    VALUES
      (NEW.user_id, COALESCE(v_nome, NEW.nome_empresa), v_contato, NEW.telefone,
       v_source, 'novo_lead',
       'Criado automaticamente após ' || CASE WHEN v_move_on = 'delivered' THEN 'confirmação de entrega' ELSE 'disparo' END || ' via ' || COALESCE(NEW.channel,'whatsapp'))
    RETURNING id INTO v_card_id;

    INSERT INTO public.lead_pipeline_status
      (user_id, source, source_id, status, pipeline_card_id,
       last_dispatched_at, last_dispatched_channel)
    VALUES
      (NEW.user_id, v_source, v_source_id, 'contactado', v_card_id, now(), NEW.channel)
    ON CONFLICT (source, source_id) DO UPDATE
      SET status = 'contactado',
          pipeline_card_id = EXCLUDED.pipeline_card_id,
          last_dispatched_at = now(),
          last_dispatched_channel = EXCLUDED.last_dispatched_channel,
          updated_at = now();
  ELSE
    UPDATE public.lead_pipeline_status
       SET last_dispatched_at = now(),
           last_dispatched_channel = NEW.channel,
           status = CASE WHEN status = 'novo' THEN 'contactado' ELSE status END,
           updated_at = now()
     WHERE source = v_source AND source_id = v_source_id;
  END IF;

  RETURN NEW;
END;
$function$;
