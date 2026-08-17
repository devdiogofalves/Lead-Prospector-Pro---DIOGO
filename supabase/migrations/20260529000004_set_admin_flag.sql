-- Marca o usuário admin com is_admin: true no user_metadata.
-- Necessário após remover o hardcode do email do bundle JS do frontend.
-- O backend (edge functions) ainda valida por email — este flag é apenas
-- para o guard de rota no frontend sem expor o email no código.

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"is_admin": true}'::jsonb
WHERE email = 'nucleodameta@gmail.com';
