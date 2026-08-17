REVOKE SELECT ON public.user_api_keys FROM anon, authenticated;
GRANT SELECT (id, user_id, provider, extra, created_at, updated_at) ON public.user_api_keys TO authenticated;