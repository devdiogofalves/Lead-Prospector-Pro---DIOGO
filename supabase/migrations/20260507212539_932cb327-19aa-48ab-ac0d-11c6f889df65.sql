
-- Google Calendar OAuth tokens per user
CREATE TABLE public.google_calendar_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  email TEXT,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own gcal tokens" ON public.google_calendar_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own gcal tokens" ON public.google_calendar_tokens
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own gcal tokens" ON public.google_calendar_tokens
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own gcal tokens" ON public.google_calendar_tokens
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_gcal_tokens_updated_at
  BEFORE UPDATE ON public.google_calendar_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Scheduled meetings (agendamentos vinculados a uma conversa)
CREATE TABLE public.scheduled_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  conversation_id UUID,
  lead_nome TEXT,
  lead_telefone TEXT NOT NULL,
  lead_email TEXT,
  titulo TEXT NOT NULL DEFAULT 'Reunião AGREGA',
  descricao TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  meet_link TEXT,
  google_event_id TEXT,
  status TEXT NOT NULL DEFAULT 'agendado', -- agendado | realizado | cancelado | no_show
  notified_lead BOOLEAN NOT NULL DEFAULT false,
  notified_group BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own meetings" ON public.scheduled_meetings
  FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users insert own meetings" ON public.scheduled_meetings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own meetings" ON public.scheduled_meetings
  FOR UPDATE TO authenticated USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users delete own meetings" ON public.scheduled_meetings
  FOR DELETE TO authenticated USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON public.scheduled_meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_meetings_user_start ON public.scheduled_meetings(user_id, start_at);
CREATE INDEX idx_meetings_conversation ON public.scheduled_meetings(conversation_id);
