GRANT INSERT, UPDATE, DELETE ON public.user_api_keys TO authenticated;
GRANT SELECT (id, user_id, provider, extra, created_at, updated_at, is_admin_shared) ON public.user_api_keys TO authenticated;
GRANT ALL ON public.user_api_keys TO service_role;