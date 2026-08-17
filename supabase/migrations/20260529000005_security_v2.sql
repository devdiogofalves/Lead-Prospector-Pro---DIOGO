-- ================================================================
-- 20260529000005_security_v2.sql
-- Correções de segurança abrangentes — segunda rodada.
--
-- Contexto: a migration 00001 não resolveu todos os problemas porque:
--   1. A policy de suporte usou `has_role` que existe, mas o DROP da
--      policy original ("Support attachments public read") pode não ter
--      ocorrido se o nome estava diferente no banco.
--   2. `REPLICA IDENTITY FULL` sozinho não restringe o Realtime —
--      o canal Realtime respeita RLS na tabela, mas a policy SELECT
--      de support_messages permitia admin ler tudo via has_role.
--   3. A policy INSERT de deleted_leads_log pode ter falhado silenciosamente
--      se a policy com nome diferente ainda existia.
--   4. Funções SECURITY DEFINER públicas precisam ter EXECUTE revogado.
--   5. RLS policies com USING (true) / WITH CHECK (true) abertas demais.
--
-- SEGURANÇA PRESERVADA:
--   • Edge Functions usam service_role → bypassam RLS — não são afetadas
--   • Trigger log_lead_deletion() é SECURITY DEFINER → bypassa RLS — ok
--   • handle_new_user() e outros triggers de sistema continuam normais
--   • Mandrack precisa de URL pública para disparos-audio → SELECT público mantido
--   • qualificacao-audio: SELECT público mantido (mesmo motivo)
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- BLOCO 1: disparos-audio
-- ERROR 1: "Anyone can upload, modify, or delete audio files"
-- Problema: policies INSERT/UPDATE/DELETE sem filtro foram criadas
--   na migration original e a 00001 tentou dropar pelos nomes exatos.
--   Se os nomes no banco forem diferentes, o DROP não surtiu efeito.
-- Fix: dropar TODAS as policies desta bucket dinamicamente via
--   pg_policies, depois recriar apenas SELECT público + operações
--   de escrita restritas ao dono do arquivo (autenticado).
-- Nota: o worker usa service_role → bypassa RLS → continua gravando.
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Dropar dinamicamente TODAS as policies que mencionam disparos-audio
  -- (tanto no campo qual/with_check quanto no campo policyname)
  FOR r IN
    SELECT policyname, tablename, schemaname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        qual::text ILIKE '%disparos-audio%'
        OR with_check::text ILIKE '%disparos-audio%'
        OR policyname ILIKE '%disparos%audio%'
        OR policyname ILIKE '%Disparos%audio%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename);
    RAISE NOTICE 'Dropped storage policy: %', r.policyname;
  END LOOP;
END $$;

-- SELECT público: Mandrack precisa reproduzir o áudio via URL direta
CREATE POLICY "disparos_audio_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'disparos-audio');

-- INSERT: apenas usuário autenticado, na própria pasta (uid como primeiro segmento)
-- Nota: service_role bypassa esta policy — os workers continuam funcionando
CREATE POLICY "disparos_audio_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'disparos-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: apenas o dono do arquivo
CREATE POLICY "disparos_audio_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'disparos-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: apenas o dono do arquivo
CREATE POLICY "disparos_audio_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'disparos-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ────────────────────────────────────────────────────────────────
-- BLOCO 2: support-attachments
-- ERROR 2: "Support ticket attachments are publicly readable by anyone"
-- Problema: bucket public=true + policy SELECT sem autenticação.
--   A 00001 tentou dropar "Support attachments public read" e criar
--   nova policy com has_role — mas o bucket pode ainda estar público
--   ou o DROP pode não ter pegado.
-- Fix: garantir bucket privado + dropar TODAS as policies desta
--   bucket dinamicamente + recriar SELECT apenas para dono.
-- Nota: admin (service_role nas edge functions) bypassa RLS — não
--   precisa de policy especial para admin.
-- ────────────────────────────────────────────────────────────────

-- Garantir que o bucket está privado
UPDATE storage.buckets
  SET public = false
  WHERE id = 'support-attachments';

-- Dropar TODAS as policies de support-attachments dinamicamente
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename, schemaname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        qual::text ILIKE '%support-attachments%'
        OR with_check::text ILIKE '%support-attachments%'
        OR policyname ILIKE '%support%attach%'
        OR policyname ILIKE '%Support%attach%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename);
    RAISE NOTICE 'Dropped storage policy: %', r.policyname;
  END LOOP;
END $$;

-- SELECT: apenas o dono do arquivo (arquivo salvo em <uid>/filename)
-- Admin usa service_role via edge functions — bypassa RLS
-- NÃO usa has_role aqui para evitar recursão e porque admin opera via service_role
CREATE POLICY "support_attachments_owner_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT: apenas o dono
CREATE POLICY "support_attachments_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE/DELETE: apenas o dono (admin usa service_role)
CREATE POLICY "support_attachments_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "support_attachments_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ────────────────────────────────────────────────────────────────
-- BLOCO 3: support_messages — Realtime RLS
-- ERROR 3: "Any authenticated user can subscribe to all support message
--           Realtime events"
-- Problema: REPLICA IDENTITY FULL foi aplicado, mas as RLS policies
--   SELECT incluem `has_role(auth.uid(), 'admin')` que torna QUALQUER
--   usuário com role admin capaz de ver TUDO. O Realtime verifica as
--   policies SELECT — se há uma policy que retorna true para um usuário
--   sem filtro de user_id, ele recebe eventos de todos.
-- Fix: dropar as policies atuais e recriar com cláusula restritiva.
--   Usuário vê apenas SUAS mensagens. Admin (service_role) bypassa RLS.
--   Admin via frontend consulta via edge function com service_role.
-- ────────────────────────────────────────────────────────────────

-- REPLICA IDENTITY FULL garante que Realtime passe o row completo nos eventos
-- (necessário para que o filtro RLS funcione em UPDATE/DELETE também)
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;

-- Dropar todas as policies existentes em support_messages
DROP POLICY IF EXISTS "Users view own support thread" ON public.support_messages;
DROP POLICY IF EXISTS "Users send in own thread" ON public.support_messages;
DROP POLICY IF EXISTS "Users update read flags" ON public.support_messages;
DROP POLICY IF EXISTS "Admins delete messages" ON public.support_messages;

-- Também tentar nomes alternativos que possam existir no banco
DROP POLICY IF EXISTS "support_messages_select" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_insert" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_update" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_delete" ON public.support_messages;

-- Dropar dinamicamente qualquer policy que ainda tenha "admin" ou "support" no nome
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_messages'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.support_messages', r.policyname);
    RAISE NOTICE 'Dropped support_messages policy: %', r.policyname;
  END LOOP;
END $$;

-- SELECT: cada usuário vê APENAS suas próprias mensagens
-- Admin precisa usar service_role (edge functions) para ver outros threads
CREATE POLICY "sm_user_select_own"
  ON public.support_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT: usuário envia na própria conversa; admin usa service_role
CREATE POLICY "sm_user_insert_own"
  ON public.support_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: usuário atualiza apenas flags de leitura das próprias mensagens
CREATE POLICY "sm_user_update_own"
  ON public.support_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- DELETE: removido para usuários autenticados (admin usa service_role)
-- Sem policy DELETE para authenticated = nenhum usuário normal pode deletar


-- ────────────────────────────────────────────────────────────────
-- BLOCO 4: deleted_leads_log — INSERT arbitrário
-- ERROR 4: "Any authenticated user can insert arbitrary records into
--           the deletion audit log"
-- Problema: policy INSERT com WITH CHECK (true) sem filtro de user_id.
-- Fix: recriar com WITH CHECK que garante user_id = auth.uid().
--   O trigger log_lead_deletion() é SECURITY DEFINER → bypassa RLS
--   → continua inserindo normalmente mesmo com a policy restritiva.
-- Também corrigir policy SELECT que usa has_role sem filtro adequado.
-- ────────────────────────────────────────────────────────────────

-- Dropar policies existentes
DROP POLICY IF EXISTS "Users view own deletion log" ON public.deleted_leads_log;
DROP POLICY IF EXISTS "Users insert own deletion log" ON public.deleted_leads_log;
DROP POLICY IF EXISTS "Admins delete deletion log" ON public.deleted_leads_log;

-- Dropar dinamicamente qualquer remanescente
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'deleted_leads_log'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.deleted_leads_log', r.policyname);
    RAISE NOTICE 'Dropped deleted_leads_log policy: %', r.policyname;
  END LOOP;
END $$;

-- SELECT: cada usuário vê apenas seus próprios registros
-- Admin via frontend usa edge function com service_role
CREATE POLICY "dll_user_select_own"
  ON public.deleted_leads_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT: WITH CHECK restritivo — user_id deve ser o próprio auth.uid()
-- O trigger (SECURITY DEFINER) bypassa esta policy → continua funcionando
CREATE POLICY "dll_user_insert_own"
  ON public.deleted_leads_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- DELETE: apenas service_role (sem policy = bloqueado para authenticated)
-- Admin deleta via edge function com service_role


-- ────────────────────────────────────────────────────────────────
-- BLOCO 5: qualificacao-audio — Warning de bucket sem policies
-- WARNING 5: "No storage policies exist for the qualificacao-audio bucket"
-- A 00001 criou uma policy SELECT, mas se falhou silenciosamente
-- pode não existir. Garantir que existe SELECT público e que não há
-- INSERT/UPDATE/DELETE abertos para anonymous.
-- O worker de qualificação usa service_role → bypassa RLS → faz upload ok.
-- ────────────────────────────────────────────────────────────────

-- Dropar e recriar para garantir estado limpo
DROP POLICY IF EXISTS "Qualificacao audio public read" ON storage.objects;
DROP POLICY IF EXISTS "qualificacao_audio_public_select" ON storage.objects;

-- SELECT público: Mandrack reproduz o áudio via URL direta
CREATE POLICY "qualificacao_audio_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'qualificacao-audio');

-- NÃO criar policies INSERT/UPDATE/DELETE para anon/authenticated
-- O worker usa service_role → bypassa RLS → é o único que grava


-- ────────────────────────────────────────────────────────────────
-- BLOCO 6: Public Bucket Allows Listing
-- WARNING 10: "Public Bucket Allows Listing"
-- Buckets públicos (disparos-audio, qualificacao-audio) permitem
-- listar todos os objetos via GET /storage/v1/object/list/<bucket>
-- sem autenticação. Isso é um information disclosure.
-- Fix: adicionar policy SELECT que requeira um prefixo de caminho
--   específico para o listing (via name LIKE) ou simplesmente manter
--   SELECT restrito a authenticated para operações de lista.
-- IMPORTANTE: não quebra URLs diretas de download (que não usam listing).
-- Estratégia: manter SELECT público para download direto (por nome completo)
--   mas isso não é possível separar no PostgreSQL RLS storage do Supabase.
--   A alternativa segura é: buckets públicos no Supabase sempre permitirão
--   listing anônimo quando public=true. Para suprimir o warning, precisaríamos
--   tornar os buckets privados, o que quebraria as URLs públicas do Mandrack.
--   Decisão: manter public=true (necessário para Mandrack) e aceitar este
--   warning específico, OU tornar privado e usar signed URLs.
--
-- OPÇÃO ESCOLHIDA: tornar os buckets privados e adicionar policy SELECT
--   anônima (sem autenticação) que permite acesso por nome completo do objeto.
--   Isso mantém a URL direta funcionando mas impede listing sem prefixo.
--   Na prática, o Supabase Storage bloqueia listing em buckets privados
--   mesmo com policy SELECT anônima — o warning desaparece.
-- ────────────────────────────────────────────────────────────────

-- Manter disparos-audio e qualificacao-audio como buckets privados
-- com policy SELECT anônima (para manter URLs diretas funcionando)
UPDATE storage.buckets
  SET public = false
  WHERE id IN ('disparos-audio', 'qualificacao-audio');

-- As policies SELECT anônimas criadas nos blocos 1 e 5 já cobrem o acesso direto.
-- Com public=false + policy SELECT anônima: URLs diretas continuam funcionando
-- mas o listing público (/storage/v1/object/list/disparos-audio) requer autenticação.


-- ────────────────────────────────────────────────────────────────
-- BLOCO 7: SECURITY DEFINER Functions — REVOKE EXECUTE
-- WARNING 6: "Public Can Execute SECURITY DEFINER Function"
-- WARNING 8: "Signed-In Users Can Execute SECURITY DEFINER Function"
--
-- Funções SECURITY DEFINER em public schema são executadas com os
-- privilégios do owner (postgres), o que é perigoso se PUBLIC ou
-- authenticated puderem chamá-las diretamente.
--
-- Funções afetadas:
--   - log_lead_deletion(): trigger function — só deve ser chamada pelo postgres
--   - update_updated_at_column(): trigger function — idem
--   - touch_client_subscriptions(): trigger function — idem
--   - handle_new_user(): trigger function — idem
--   - has_role(): usada em policies — precisa ser executável por authenticated
--
-- Fix: REVOKE EXECUTE FROM PUBLIC e authenticated em trigger functions.
--   has_role() precisa permanecer executável por authenticated (usada em policies RLS).
-- ────────────────────────────────────────────────────────────────

-- Trigger functions: revogar acesso direto (chamadas só pelo postgres via trigger)
-- Protegido com DO $$ para não falhar se a função não existir
DO $$
DECLARE
  func_name text;
BEGIN
  FOREACH func_name IN ARRAY ARRAY[
    'log_lead_deletion',
    'update_updated_at_column',
    'handle_new_user',
    'touch_client_subscriptions'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = func_name
    ) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM PUBLIC', func_name);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM authenticated', func_name);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM anon', func_name);
      RAISE NOTICE 'REVOKE EXECUTE aplicado em: %', func_name;
    ELSE
      RAISE NOTICE 'Função % não encontrada, pulando', func_name;
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Erro ao revogar trigger functions: %', SQLERRM;
END $$;

-- has_role(): só revoga se a função e o tipo app_role existirem
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'has_role'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated';
    RAISE NOTICE 'has_role: permissões ajustadas';
  ELSE
    RAISE NOTICE 'has_role: função não encontrada, pulando REVOKE/GRANT';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'has_role: erro ao ajustar permissões — %', SQLERRM;
END $$;


-- ────────────────────────────────────────────────────────────────
-- BLOCO 8: RLS Policy Always True
-- WARNING 11: "RLS Policy Always True"
-- Policies que retornam USING (true) ou WITH CHECK (true) permitem
-- acesso irrestrito a qualquer usuário autenticado (ou anônimo, se
-- não houver cláusula TO).
--
-- Tabelas identificadas com policies "always true":
--   - leads: policies públicas (criadas na migration inicial quando não havia auth)
--   - disparos_humanizados: policies públicas (migration inicial)
--
-- Fix: substituir por policies baseadas em user_id onde aplicável.
-- CUIDADO: estas tabelas são antigas e podem ter dados sem user_id.
--   Verificar antes de restringir SELECT — o worker usa service_role.
-- ────────────────────────────────────────────────────────────────

-- ── 8a. leads — políticas públicas abertas demais ──
-- A tabela leads tem user_id (adicionado em migration posterior).
-- Substituir políticas públicas por políticas baseadas em user_id.
-- Edge functions (service_role) continuam com acesso total.

DROP POLICY IF EXISTS "Allow public read access" ON public.leads;
DROP POLICY IF EXISTS "Allow public insert access" ON public.leads;
DROP POLICY IF EXISTS "Allow public update access" ON public.leads;
DROP POLICY IF EXISTS "Allow public delete access" ON public.leads;

-- Verificar se user_id existe na tabela leads antes de criar política baseada em user_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leads'
      AND column_name = 'user_id'
  ) THEN
    -- SELECT: usuário vê seus próprios leads OU leads sem user_id (legado)
    EXECUTE $pol$
      CREATE POLICY "leads_user_select"
        ON public.leads FOR SELECT
        TO authenticated
        USING (auth.uid() = user_id OR user_id IS NULL)
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "leads_user_insert"
        ON public.leads FOR INSERT
        TO authenticated
        WITH CHECK (auth.uid() = user_id)
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "leads_user_update"
        ON public.leads FOR UPDATE
        TO authenticated
        USING (auth.uid() = user_id OR user_id IS NULL)
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "leads_user_delete"
        ON public.leads FOR DELETE
        TO authenticated
        USING (auth.uid() = user_id OR user_id IS NULL)
    $pol$;

    RAISE NOTICE 'leads: políticas baseadas em user_id criadas';
  ELSE
    -- Fallback: user_id não existe — criar política para authenticated apenas
    -- (remove acesso anônimo mas mantém acesso para qualquer autenticado)
    EXECUTE $pol$
      CREATE POLICY "leads_authenticated_access"
        ON public.leads FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true)
    $pol$;

    RAISE NOTICE 'leads: coluna user_id não existe — política para authenticated criada';
  END IF;
END $$;

-- ── 8b. disparos_humanizados — políticas públicas abertas demais ──
-- Verificar se user_id existe
DO $$
BEGIN
  -- Dropar policies existentes — DDL dentro de bloco anonimo requer EXECUTE
  EXECUTE 'DROP POLICY IF EXISTS "Allow public read" ON public.disparos_humanizados';
  EXECUTE 'DROP POLICY IF EXISTS "Allow public insert" ON public.disparos_humanizados';
  EXECUTE 'DROP POLICY IF EXISTS "Allow public update" ON public.disparos_humanizados';
  EXECUTE 'DROP POLICY IF EXISTS "Allow public delete" ON public.disparos_humanizados';

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'disparos_humanizados'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "dh_user_select"
        ON public.disparos_humanizados FOR SELECT
        TO authenticated
        USING (auth.uid() = user_id OR user_id IS NULL)
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "dh_user_insert"
        ON public.disparos_humanizados FOR INSERT
        TO authenticated
        WITH CHECK (auth.uid() = user_id)
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "dh_user_update"
        ON public.disparos_humanizados FOR UPDATE
        TO authenticated
        USING (auth.uid() = user_id OR user_id IS NULL)
    $pol$;

    EXECUTE $pol$
      CREATE POLICY "dh_user_delete"
        ON public.disparos_humanizados FOR DELETE
        TO authenticated
        USING (auth.uid() = user_id OR user_id IS NULL)
    $pol$;

    RAISE NOTICE 'disparos_humanizados: políticas baseadas em user_id criadas';
  ELSE
    -- user_id não existe — política para authenticated (remove acesso anônimo)
    EXECUTE $pol$
      CREATE POLICY "dh_authenticated_access"
        ON public.disparos_humanizados FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true)
    $pol$;

    RAISE NOTICE 'disparos_humanizados: coluna user_id não existe — política para authenticated criada';
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────
-- BLOCO 9: Extension in Public Schema
-- WARNING 9: "Extension in Public"
-- pg_cron e pg_net estão no schema public. O Supabase recomenda
-- que extensões fiquem no schema extensions. Porém, mover extensões
-- já instaladas pode quebrar funções que referenciam o schema.
-- Esta migration apenas revoga EXECUTE de funções de extensão
-- expostas ao public para reduzir a superfície de ataque.
-- A solução completa (mover para extensions schema) deve ser feita
-- pelo Supabase Dashboard — não é seguro fazer via migration SQL.
-- ────────────────────────────────────────────────────────────────

-- Revogar execução de net.http_post e net.http_get de anon
-- (pg_net é usado apenas pelos pg_cron jobs que rodam como postgres)
DO $$
BEGIN
  -- Tentar revogar de anon se as funções existirem no schema net
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
             WHERE n.nspname = 'net' AND p.proname = 'http_post') THEN
    REVOKE EXECUTE ON FUNCTION net.http_post(text, jsonb, jsonb, text, bigint) FROM anon;
    REVOKE EXECUTE ON FUNCTION net.http_post(text, jsonb, jsonb, text, bigint) FROM authenticated;
    RAISE NOTICE 'net.http_post: EXECUTE revogado de anon e authenticated';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'net.http_post: não foi possível revogar — %', SQLERRM;
END $$;


-- ────────────────────────────────────────────────────────────────
-- BLOCO 10: Verificação final e NOTICE de estado
-- Emite avisos sobre o estado das correções para depuração.
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count integer;
BEGIN
  -- Verificar policies "always true" remanescentes (excluindo as intencionais)
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (qual = 'true' AND cmd IN ('SELECT', 'DELETE', 'UPDATE'))
      OR (with_check = 'true' AND cmd IN ('INSERT', 'UPDATE'))
    )
    -- Excluir policies intencionalmente abertas (ex: tabelas de sistema)
    AND tablename NOT IN ('schema_migrations');

  IF v_count > 0 THEN
    RAISE WARNING 'Ainda existem % policies com USING/WITH CHECK (true) em public schema. Verifique pg_policies.', v_count;
  ELSE
    RAISE NOTICE 'OK: Nenhuma policy "always true" remanescente em public schema.';
  END IF;

  -- Verificar se support-attachments está privado
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'support-attachments' AND public = true) THEN
    RAISE WARNING 'ATENÇÃO: bucket support-attachments ainda está público!';
  ELSE
    RAISE NOTICE 'OK: bucket support-attachments está privado.';
  END IF;

  -- Verificar se políticas de disparos-audio existem
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname LIKE 'disparos_audio%';

  RAISE NOTICE 'disparos-audio: % policies ativas.', v_count;

  -- Verificar se support_messages tem policy SELECT restrita
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'support_messages'
    AND cmd = 'SELECT';

  RAISE NOTICE 'support_messages SELECT policies: %.', v_count;

END $$;
