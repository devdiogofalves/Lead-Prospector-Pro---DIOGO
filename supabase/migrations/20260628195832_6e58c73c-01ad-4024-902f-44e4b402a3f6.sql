
CREATE TABLE IF NOT EXISTS public.social_post_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  format text NOT NULL,
  slide_count int DEFAULT 7,
  structure jsonb NOT NULL DEFAULT '{}'::jsonb,
  icon text,
  sort_order int DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.social_post_templates TO authenticated, anon;
GRANT ALL ON public.social_post_templates TO service_role;
ALTER TABLE public.social_post_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read templates public" ON public.social_post_templates;
CREATE POLICY "read templates public" ON public.social_post_templates FOR SELECT USING (true);

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS template_slug text,
  ADD COLUMN IF NOT EXISTS slide_data jsonb;

INSERT INTO public.social_post_templates (slug, name, description, format, slide_count, structure, icon, sort_order) VALUES
('listicle', 'Listicle "X coisas que…"', 'Lista numerada de 5-10 itens. Ex.: "7 workflows do n8n que toda agência precisa salvar".', 'listicle', 9, '{"cover":true,"items":7,"cta":true,"slide_pattern":"numbered_card"}', '📋', 1),
('myth_vs_truth', 'Mito vs Verdade', 'Quebra 5 mitos do nicho. Slide alterna vermelho (mito) / verde (verdade).', 'myth_vs_truth', 7, '{"cover":true,"pairs":5,"cta":true,"slide_pattern":"split_compare"}', '⚖️', 2),
('steps', 'Tutorial em 5 passos', 'Passo-a-passo executável. Cada slide = 1 passo com micro-bullet.', 'steps', 7, '{"cover":true,"steps":5,"cta":true,"slide_pattern":"numbered_step"}', '🪜', 3),
('before_after', 'Antes vs Depois', 'Mostra cenário caótico antes da solução vs cenário organizado depois.', 'before_after', 5, '{"cover":true,"pairs":3,"cta":true,"slide_pattern":"split_compare"}', '🔄', 4),
('case_study', 'Case de cliente', 'Resultado real de cliente: contexto → ação → resultado → take-away.', 'case_study', 6, '{"cover":true,"stages":4,"cta":true,"slide_pattern":"big_headline"}', '🏆', 5),
('hot_take', 'Hot Take / Opinião', 'Posicionamento polêmico em 1 frase + 3 slides de argumento.', 'hot_take', 5, '{"cover":true,"arguments":3,"cta":true,"slide_pattern":"bold_centered"}', '🔥', 6),
('checklist', 'Checklist acionável', 'Lista de itens com ✓ que o lead pode salvar e usar hoje.', 'checklist', 8, '{"cover":true,"items":6,"cta":true,"slide_pattern":"checklist_card"}', '✅', 7),
('faq', 'FAQ / Dúvidas frequentes', 'Responde 4 dúvidas comuns do ICP. Slide alterna pergunta/resposta.', 'faq', 9, '{"cover":true,"questions":4,"cta":true,"slide_pattern":"qa_card"}', '❓', 8)
ON CONFLICT (slug) DO NOTHING;
