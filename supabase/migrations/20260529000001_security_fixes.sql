-- ================================================================
-- 20260529000001_security_fixes.sql
-- Corrige 4 Errors + 1 Warning do Supabase Security Advisor.
-- Nenhuma mudança afeta o comportamento funcional existente:
--   • disparos-audio: leitura pública mantida (Mandrack usa URL direta)
--   • qualificacao-audio: leitura pública adicionada (mesmo motivo)
--   • edge functions usam service_role → bypassam RLS, não são afetadas
--   • trigger log_lead_deletion é SECURITY DEFINER → bypassa RLS
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- ERROR 1: disparos-audio — qualquer um pode fazer upload/delete
-- Causa: policies INSERT/UPDATE/DELETE sem filtro algum
-- Fix:   remover essas 3 policies; SELECT público permanece
--        (Mandrack precisa da URL pública para reproduzir o áudio)
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Disparos audio public upload" ON storage.objects;
DROP POLICY IF EXISTS "Disparos audio public update" ON storage.objects;
DROP POLICY IF EXISTS "Disparos audio public delete" ON storage.objects;


-- ────────────────────────────────────────────────────────────────
-- WARNING 5: qualificacao-audio — nenhuma policy definida
-- Fix:   adicionar SELECT público (qualification-worker faz upload
--        via service_role que bypassa RLS; Mandrack lê via URL)
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Qualificacao audio public read" ON storage.objects;
CREATE POLICY "Qualificacao audio public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'qualificacao-audio');


-- ────────────────────────────────────────────────────────────────
-- ERROR 2: support-attachments — qualquer um (sem login) pode ler
-- Causa: bucket public=true + policy SELECT sem verificação de auth
-- Fix:   bucket → private; SELECT restrito ao dono do arquivo ou admin
--        O frontend usa supabase.storage (sessão autenticada) → ok
-- ────────────────────────────────────────────────────────────────
UPDATE storage.buckets SET public = false WHERE id = 'support-attachments';

DROP POLICY IF EXISTS "Support attachments public read" ON storage.objects;
CREATE POLICY "Support attachments auth read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);


-- ────────────────────────────────────────────────────────────────
-- ERROR 3: support_messages Realtime — qualquer autenticado escuta
--          eventos de outros usuários
-- Causa:   sem REPLICA IDENTITY FULL o Supabase Realtime não aplica
--          RLS em eventos UPDATE/DELETE (só INSERT filtrava)
-- Fix:     REPLICA IDENTITY FULL → Realtime aplica RLS em tudo
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;


-- ────────────────────────────────────────────────────────────────
-- ERROR 4: deleted_leads_log — autenticado pode inserir registro falso
-- Causa:   INSERT policy com WITH CHECK (true) sem filtro de user_id
-- Fix:     WITH CHECK (auth.uid() = user_id)
--          O trigger log_lead_deletion() é SECURITY DEFINER e
--          bypassa RLS → continua funcionando normalmente
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users insert own deletion log" ON public.deleted_leads_log;
CREATE POLICY "Users insert own deletion log"
  ON public.deleted_leads_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
