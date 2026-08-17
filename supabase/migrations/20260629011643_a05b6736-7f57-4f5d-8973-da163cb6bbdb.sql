ALTER TABLE public.social_post_interactions
  DROP CONSTRAINT IF EXISTS social_post_interactions_type_check;

ALTER TABLE public.social_post_interactions
  ADD CONSTRAINT social_post_interactions_type_check
  CHECK (type = ANY (ARRAY['comment'::text, 'like'::text, 'follow'::text, 'dm'::text, 'story_reply'::text]));