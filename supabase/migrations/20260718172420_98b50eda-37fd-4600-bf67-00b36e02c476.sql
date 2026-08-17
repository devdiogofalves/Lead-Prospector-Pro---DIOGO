
UPDATE public.automation_settings
   SET auto_linkedin_dm_enabled = true,
       auto_email_enabled = true,
       auto_instagram_enabled = true,
       auto_whatsapp_enabled = true,
       ig_hashtags = ARRAY['gestordetrafego','agenciademarketing','marketingdigital','vendasb2b','saasbrasil','empreendedorismo','consultoriaempresarial','contabilidadedigital','ecommercebrasil','vendasconsultivas'],
       ig_target_accounts = COALESCE(NULLIF(ig_target_accounts, '{}'), ARRAY[]::text[])
 WHERE user_id = 'cef22c4a-7c74-4892-b2f6-4047e02cfeda'::uuid;
