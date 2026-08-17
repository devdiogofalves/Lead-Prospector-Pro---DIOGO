ALTER TABLE public.user_api_keys ADD COLUMN IF NOT EXISTS is_admin_shared BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_user_api_keys_shared ON public.user_api_keys(user_id, is_admin_shared);
GRANT SELECT (is_admin_shared) ON public.user_api_keys TO authenticated;