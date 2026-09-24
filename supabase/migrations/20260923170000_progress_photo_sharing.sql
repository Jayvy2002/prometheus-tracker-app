-- Vision §14.4 / §22.2 : les photos de progression sont privées par défaut.
-- Le Coach actif ne les voit que si l'athlète a choisi de les partager.
--
-- Avant : « Coaches read client progress photos » = is_coach_of(user_id),
-- donc tout Coach actif lisait toutes les photos, y compris antérieures au suivi.
-- Après : is_coach_of(user_id) ET un partage explicite de l'athlète vers ce Coach.
--
-- Le scope de consentement `progress_photos` reste le plafond (ce que le Coach
-- PEUT recevoir) ; le partage est l'acte volontaire de l'athlète. Fin de
-- relation = fin du partage : un nouveau cycle repart privé.

CREATE TABLE IF NOT EXISTS public.progress_photo_shares (
  client_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_at timestamptz NOT NULL DEFAULT now(),
  CHECK (client_id <> coach_id)
);

CREATE INDEX IF NOT EXISTS progress_photo_shares_coach_idx
  ON public.progress_photo_shares (coach_id);

ALTER TABLE public.progress_photo_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Athlete reads own photo share" ON public.progress_photo_shares;
CREATE POLICY "Athlete reads own photo share"
  ON public.progress_photo_shares FOR SELECT TO authenticated
  USING (client_id = (select auth.uid()));

DROP POLICY IF EXISTS "Active coach reads photo share" ON public.progress_photo_shares;
CREATE POLICY "Active coach reads photo share"
  ON public.progress_photo_shares FOR SELECT TO authenticated
  USING (coach_id = (select auth.uid()) AND public.is_coach_of(client_id));

-- Écriture uniquement par RPC : pas d'INSERT/UPDATE/DELETE direct.
REVOKE ALL ON TABLE public.progress_photo_shares FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.progress_photo_shares TO authenticated;
GRANT ALL ON TABLE public.progress_photo_shares TO service_role;

-- Le Coach courant voit les photos d'un athlète seulement si celui-ci les partage.
CREATE OR REPLACE FUNCTION public.coach_can_see_progress_photos(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_coach_of(p_client_id)
    AND EXISTS (
      SELECT 1
      FROM public.progress_photo_shares s
      WHERE s.client_id = p_client_id
        AND s.coach_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.coach_can_see_progress_photos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_can_see_progress_photos(uuid) TO authenticated;

-- L'athlète active ou retire le partage vers son Coach actif.
CREATE OR REPLACE FUNCTION public.set_progress_photo_sharing(p_share boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_coach uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_share IS NULL THEN
    RAISE EXCEPTION 'invalid_share';
  END IF;

  IF NOT p_share THEN
    DELETE FROM public.progress_photo_shares WHERE client_id = v_uid;
    RETURN false;
  END IF;

  SELECT l.coach_id INTO v_coach
  FROM public.coach_client_links l
  WHERE l.client_id = v_uid
    AND l.status = 'active'
  FOR SHARE;

  IF v_coach IS NULL THEN
    RAISE EXCEPTION 'no_active_coach';
  END IF;

  INSERT INTO public.progress_photo_shares (client_id, coach_id, shared_at)
  VALUES (v_uid, v_coach, now())
  ON CONFLICT (client_id) DO UPDATE
    SET coach_id = EXCLUDED.coach_id,
        shared_at = CASE
          WHEN public.progress_photo_shares.coach_id = EXCLUDED.coach_id
            THEN public.progress_photo_shares.shared_at
          ELSE EXCLUDED.shared_at
        END;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_progress_photo_sharing(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_progress_photo_sharing(boolean) TO authenticated;

-- Fin de relation (ou lien supprimé) = fin du partage vers ce Coach.
CREATE OR REPLACE FUNCTION public.progress_photo_share_follow_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.progress_photo_shares
    WHERE client_id = OLD.client_id AND coach_id = OLD.coach_id;
    RETURN OLD;
  END IF;
  IF OLD.status = 'active' AND NEW.status <> 'active' THEN
    DELETE FROM public.progress_photo_shares
    WHERE client_id = OLD.client_id AND coach_id = OLD.coach_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.progress_photo_share_follow_link() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS progress_photo_share_follow_link ON public.coach_client_links;
CREATE TRIGGER progress_photo_share_follow_link
  AFTER UPDATE OF status OR DELETE ON public.coach_client_links
  FOR EACH ROW EXECUTE FUNCTION public.progress_photo_share_follow_link();

-- Lecture Coach : ligne ET fichier suivent le partage.
DROP POLICY IF EXISTS "Coaches read client progress photos" ON public.progress_photos;
CREATE POLICY "Coaches read client progress photos"
  ON public.progress_photos FOR SELECT TO authenticated
  USING (public.coach_can_see_progress_photos(user_id));

DROP POLICY IF EXISTS "Owner or coach can read progress photos" ON storage.objects;
CREATE POLICY "Owner or coach can read progress photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'progress-photos'
    AND (
      (storage.foldername(name))[1] = (select auth.uid())::text
      OR public.coach_can_see_progress_photos(((storage.foldername(name))[1])::uuid)
    )
  );

-- Relations actives existantes : elles ont consenti (version 2) à un accès
-- incluant les photos antérieures. On conserve cet accès ; l'athlète peut le
-- retirer. Toute nouvelle relation démarre privée.
INSERT INTO public.progress_photo_shares (client_id, coach_id, shared_at)
SELECT l.client_id, l.coach_id, now()
FROM public.coach_client_links l
WHERE l.status = 'active'
ON CONFLICT (client_id) DO NOTHING;
