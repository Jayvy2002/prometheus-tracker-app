-- Vision §26 : démarrer une séance hors ligne, synchroniser plus tard sans doublon.
--
-- start_workout_from_template reste l'unique chemin qui pose la provenance
-- programme (trigger workouts_protect_program_provenance). Cette commande
-- l'enveloppe avec l'identifiant stable de l'opération hors ligne :
--   * premier appel  : démarre la séance, pose client_op_id, rend sa forme ;
--   * rejeu (réponse perdue, double onglet) : rend la même séance, rien de neuf.
-- La forme rendue (exercices et séries dans l'ordre) permet au client de
-- relier ses identifiants temporaires aux identifiants serveur.

CREATE OR REPLACE FUNCTION public.workout_start_shape(p_workout_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'workout_id', w.id,
    'exercises', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'order_index', e.order_index,
        'sets', COALESCE((
          SELECT jsonb_agg(s.id ORDER BY s.order_index, s.created_at, s.id)
          FROM public.workout_sets s
          WHERE s.exercise_id = e.id
        ), '[]'::jsonb)
      ) ORDER BY e.order_index, e.created_at, e.id)
      FROM public.workout_exercises e
      WHERE e.workout_id = w.id
    ), '[]'::jsonb)
  )
  FROM public.workouts w
  WHERE w.id = p_workout_id;
$$;

REVOKE ALL ON FUNCTION public.workout_start_shape(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_workout_from_template_op(
  p_client_op_id text,
  p_name text,
  p_date timestamptz,
  p_routine_id uuid DEFAULT NULL,
  p_program_assignment_id uuid DEFAULT NULL,
  p_program_day_id uuid DEFAULT NULL,
  p_exercises jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_op text := btrim(COALESCE(p_client_op_id, ''));
  v_existing uuid;
  v_owner uuid;
  v_workout_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF v_op = '' OR length(v_op) > 100 THEN
    RAISE EXCEPTION 'invalid_client_op_id';
  END IF;

  -- Two replays of the same op (tabs, retries) serialize here.
  PERFORM pg_advisory_xact_lock(hashtextextended('workout_start_op:' || v_op, 0));

  SELECT w.id, w.user_id INTO v_existing, v_owner
  FROM public.workouts w
  WHERE w.client_op_id = v_op;
  IF v_existing IS NOT NULL THEN
    IF v_owner IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'client_op_conflict';
    END IF;
    RETURN public.workout_start_shape(v_existing);
  END IF;

  v_workout_id := public.start_workout_from_template(
    p_name, p_date, p_routine_id, p_program_assignment_id, p_program_day_id, p_exercises
  );
  UPDATE public.workouts SET client_op_id = v_op WHERE id = v_workout_id;
  RETURN public.workout_start_shape(v_workout_id);
END;
$$;

REVOKE ALL ON FUNCTION public.start_workout_from_template_op(text, text, timestamptz, uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_workout_from_template_op(text, text, timestamptz, uuid, uuid, uuid, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.start_workout_from_template_op(text, text, timestamptz, uuid, uuid, uuid, jsonb) IS
  'Offline-safe start: idempotent on client_op_id, same provenance rules as start_workout_from_template.';
