
ALTER TABLE public.empresas_enriquecidas
  ADD COLUMN IF NOT EXISTS instagram_searched_at timestamptz,
  ADD COLUMN IF NOT EXISTS dados4u_searched_at timestamptz,
  ADD COLUMN IF NOT EXISTS socio_linkedin_searched_at timestamptz;

ALTER TABLE public.linkedin_contacts
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

CREATE OR REPLACE FUNCTION public.finalize_qualification_response(
  _user_id uuid,
  _conversation_id uuid,
  _telefone text,
  _content text,
  _audio_url text,
  _evolution_response jsonb,
  _pending_ids uuid[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.qualification_messages(
    user_id, conversation_id, telefone, role, content, audio_url, processed, evolution_response
  ) VALUES (
    _user_id, _conversation_id, _telefone, 'assistant', _content, _audio_url, true, _evolution_response
  );

  UPDATE public.qualification_messages
     SET processed = true
   WHERE id = ANY(_pending_ids);

  UPDATE public.qualification_conversations
     SET last_message_at = now()
   WHERE id = _conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_qualification_response(uuid, uuid, text, text, text, jsonb, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_qualification_response(uuid, uuid, text, text, text, jsonb, uuid[]) TO service_role;
