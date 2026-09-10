-- Ranked food search: trigram + word_similarity, brand prefix, escaped wildcards.
-- Authenticated only (same contract as 20260824233846 / 20260905135151).

CREATE OR REPLACE FUNCTION public.search_food_products(query text, max_results int DEFAULT 20)
RETURNS SETOF food_products
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT
      btrim(query) AS raw,
      replace(replace(btrim(query), '%', ''), '_', '') AS safe
  )
  SELECT fp.*
  FROM food_products fp, q
  WHERE length(q.safe) >= 1
    AND (
      fp.name ILIKE '%' || q.safe || '%'
      OR (fp.brand IS NOT NULL AND fp.brand ILIKE '%' || q.safe || '%')
      OR similarity(fp.name, q.raw) > 0.22
      OR (fp.brand IS NOT NULL AND similarity(fp.brand, q.raw) > 0.3)
      OR word_similarity(q.raw, fp.name) > 0.4
    )
  ORDER BY
    CASE
      WHEN fp.name ILIKE q.safe THEN 0
      WHEN fp.name ILIKE q.safe || '%' THEN 1
      WHEN fp.brand ILIKE q.safe || '%' THEN 2
      WHEN fp.name ILIKE '%' || q.safe || '%' THEN 3
      WHEN fp.brand ILIKE '%' || q.safe || '%' THEN 4
      ELSE 5
    END,
    GREATEST(
      similarity(fp.name, q.raw),
      COALESCE(similarity(fp.brand, q.raw), 0),
      word_similarity(q.raw, fp.name)
    ) DESC,
    fp.name ASC
  LIMIT GREATEST(1, LEAST(COALESCE(max_results, 20), 50));
$$;

REVOKE ALL ON FUNCTION public.search_food_products(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_food_products(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_food_products(text, int) TO service_role;
