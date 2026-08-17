UPDATE auth.users
SET email = 'iaagrega@gmail.com',
    encrypted_password = crypt('25087sj1aF65@', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE email = 'nucleodameta@gmail.com';

UPDATE auth.identities
SET identity_data = jsonb_set(identity_data, '{email}', '"iaagrega@gmail.com"'),
    updated_at = now()
WHERE provider = 'email'
  AND user_id = (SELECT id FROM auth.users WHERE email = 'iaagrega@gmail.com');