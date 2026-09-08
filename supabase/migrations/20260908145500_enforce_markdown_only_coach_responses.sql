-- L'interface rend le Markdown et échappe volontairement le HTML brut.
-- On évite donc que des balises comme <br> deviennent visibles aux utilisateurs.
UPDATE public.ai_prompts
SET content = replace(
  content,
  '- Use short paragraphs and clear structure',
  E'- Use short paragraphs and clear structure\n- Use Markdown only. Never output raw HTML tags such as <br>, <p>, <table>, or <div>.'
)
WHERE name = 'coach_main'
  AND content NOT ILIKE '%Never output raw HTML tags%';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.ai_prompts
    WHERE name = 'coach_main'
      AND content ILIKE '%Never output raw HTML tags%'
  ) THEN
    RAISE EXCEPTION 'coach_main is missing the Markdown-only output rule';
  END IF;
END
$$;
