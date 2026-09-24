-- Import CSV « pour moi » (Vision §24.1).
--
-- Le moteur d'import P5.1 (aperçu obligatoire, revalidation au commit,
-- doublons, même fichier jamais importé deux fois) sert aussi à la personne
-- qui importe son propre historique. Importer pour soi relève de l'espace
-- personnel : aucune capacité Coach requise. Importer pour quelqu'un d'autre
-- exige toujours la capacité Coach et une relation active.
--
-- Colonne `coach_id` = auteur de l'import (Coach ou la personne elle-même),
-- inchangée pour ne pas créer un second moteur.

CREATE OR REPLACE FUNCTION public.coach_import_assert_actor(p_subject uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_subject IS NULL THEN RAISE EXCEPTION 'invalid_subject'; END IF;
  -- One's own history: personal space, no Coach capability needed.
  IF p_subject = v_uid THEN RETURN v_uid; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_capabilities c
    WHERE c.user_id = v_uid AND c.capability = 'coach'
  ) THEN
    RAISE EXCEPTION 'coach_capability_required';
  END IF;
  PERFORM public.lock_coach_relationship_lifecycle(v_uid);
  IF NOT public.coach_relationship_is_open(v_uid) THEN
    RAISE EXCEPTION 'coach_account_closed';
  END IF;
  IF NOT public.is_coach_of(p_subject) THEN
    RAISE EXCEPTION 'not_your_client';
  END IF;
  RETURN v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_import_assert_actor(uuid) FROM PUBLIC, anon, authenticated;

-- Failure traces: any signed-in importer (code only, 50 per day, never the CSV).
CREATE OR REPLACE FUNCTION public.record_coach_import_incident(p_kind text, p_error_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_kind text := NULLIF(btrim(coalesce(p_kind, '')), '');
  v_code text := btrim(coalesce(p_error_code, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  -- A code, never free text: operators read it.
  IF v_code !~ '^[a-z][a-z0-9_]{0,59}$' THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;
  IF v_kind IS NOT NULL AND v_kind NOT IN ('workout', 'body_weight') THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;
  IF (
    SELECT count(*) FROM public.coach_import_incidents i
    WHERE i.coach_id = v_uid
      AND i.created_at > clock_timestamp() - interval '1 day'
  ) >= 50 THEN
    RETURN jsonb_build_object('status', 'dropped');
  END IF;
  INSERT INTO public.coach_import_incidents (coach_id, coach_ref, kind, error_code)
  VALUES (v_uid, 'user:' || v_uid::text, v_kind, v_code);
  RETURN jsonb_build_object('status', 'recorded');
END;
$$;

REVOKE ALL ON FUNCTION public.record_coach_import_incident(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_coach_import_incident(text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.coach_import_assert_actor(uuid) IS
  'Import actor check. Self: any signed-in user (personal history, Vision §24.1). Someone else: Coach capability, open Coach lifecycle and an active relationship.';
