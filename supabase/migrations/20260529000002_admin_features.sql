-- ================================================================
-- 20260529000002_admin_features.sql
-- Suporte a credenciais compartilhadas (admin → trial) e
-- número de contato do cliente para boas-vindas via WhatsApp.
-- ================================================================

-- Coluna: admin pode ligar/desligar uso das suas credenciais para um cliente
ALTER TABLE public.client_subscriptions
  ADD COLUMN IF NOT EXISTS use_admin_credentials BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;  -- número WhatsApp do cliente para boas-vindas

-- Coluna: marca chaves copiadas do admin (ocultas na UI do cliente)
ALTER TABLE public.user_api_keys
  ADD COLUMN IF NOT EXISTS is_admin_shared BOOLEAN NOT NULL DEFAULT false;

-- Índice para eficiência ao buscar chaves compartilhadas
CREATE INDEX IF NOT EXISTS idx_user_api_keys_shared
  ON public.user_api_keys(user_id, is_admin_shared);
