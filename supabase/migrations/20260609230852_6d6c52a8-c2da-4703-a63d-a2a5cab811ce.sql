
-- Recreate SELECT policies WITHOUT admin bypass on data tables.
-- Admin panel uses service_role via edge functions; it does NOT need RLS bypass.

DO $$
DECLARE
  r RECORD;
  tables_to_fix TEXT[] := ARRAY[
    'automation_settings','campaign_recipients','campaigns','company_branding',
    'dados4u_consultas','deleted_leads_log','disparos_humanizados','dispatch_queue',
    'dispatch_settings','empresas_enriquecidas','instagram_contacts','job_board_companies',
    'job_listings','leads','linkedin_contacts','mavi_briefing','mavi_conversation_outcomes',
    'pipeline_cards','pipeline_history','prospecting_profiles','qualification_conversations',
    'qualification_messages','qualification_settings','saved_webhooks','scheduled_meetings',
    'telegram_recipients','whatsapp_instances'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables_to_fix LOOP
    FOR r IN
      SELECT polname
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public' AND c.relname=t AND p.polcmd='r'
        AND pg_get_expr(p.polqual, p.polrelid) LIKE '%has_role%admin%'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', r.polname, t);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY "Users view own %1$s" ON public.%1$I FOR SELECT TO authenticated USING (auth.uid() = user_id)',
      t
    );
  END LOOP;
END $$;
