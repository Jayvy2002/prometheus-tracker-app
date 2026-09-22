#!/usr/bin/env bash
# Two real Postgres sessions: commit import A × commit import B for the same
# athlete and two different files that describe the same session.
# Self-import skips the Coach lifecycle mutex. The subject mutex (20014506)
# is taken before the duplicate check and the business writes. After A
# inserts, B must see that workout and return potential_duplicate.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

COACH='c5200000-0000-4000-8000-000000000001'
A_APP='prometheus-p51-subj-a'
B_APP='prometheus-p51-subj-b'
MAP='{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2},"ignored":[]}'

psql_at() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "$1"
}

a_pid=""
b_pid=""

cleanup() {
  local code=$?
  if [[ "${code}" != "0" ]]; then
    echo "---- pg_locks ----" >&2
    psql "$DATABASE_URL" -X -c "SELECT a.application_name, a.state, l.locktype, l.mode, l.granted, l.classid FROM pg_stat_activity a LEFT JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name LIKE 'prometheus-p51-subj%' ORDER BY 1, 3, 4;" >&2 || true
    echo "---- session output ----" >&2
    cat /tmp/p51-subj-a.out /tmp/p51-subj-a.err /tmp/p51-subj-b.out /tmp/p51-subj-b.err >&2 || true
  fi
  for pid in "${b_pid}" "${a_pid}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=0 <<SQL >/dev/null 2>&1 || true
SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
 WHERE application_name IN ('${A_APP}', '${B_APP}')
   AND pid <> pg_backend_pid();
DROP TRIGGER IF EXISTS p51_pause_subject_commit ON public.workouts;
DROP FUNCTION IF EXISTS public.p51_pause_subject_commit();
DELETE FROM public.coach_import_rows
 WHERE import_id IN (
   SELECT id FROM public.coach_imports
   WHERE coach_id = '${COACH}'::uuid OR subject_user_id = '${COACH}'::uuid
 );
DELETE FROM public.coach_imports
 WHERE coach_id = '${COACH}'::uuid OR subject_user_id = '${COACH}'::uuid;
DELETE FROM public.workout_sets
 WHERE exercise_id IN (
   SELECT e.id FROM public.workout_exercises e
   JOIN public.workouts w ON w.id = e.workout_id
   WHERE w.user_id = '${COACH}'::uuid
 );
DELETE FROM public.workout_exercises
 WHERE workout_id IN (SELECT id FROM public.workouts WHERE user_id = '${COACH}'::uuid);
DELETE FROM public.workouts WHERE user_id = '${COACH}'::uuid;
DELETE FROM public.user_capabilities WHERE user_id = '${COACH}'::uuid;
DELETE FROM public.user_profiles WHERE id = '${COACH}'::uuid;
DELETE FROM public.user_roles WHERE user_id = '${COACH}'::uuid;
DELETE FROM auth.users WHERE id = '${COACH}'::uuid;
SQL
}
trap cleanup EXIT

assert_no_deadlock() {
  local file
  for file in "$@"; do
    if [[ -f "${file}" ]] && grep -qi 'deadlock' "${file}"; then
      echo "deadlock detected in ${file}" >&2
      cat "${file}" >&2 || true
      exit 1
    fi
  done
}

wait_state() {
  local query="$1"
  local pid="$2"
  local n=0
  for _ in $(seq 1 80); do
    n="$(psql_at "${query}")"
    if [[ "${n}" != "0" ]]; then
      return 0
    fi
    if ! kill -0 "${pid}" 2>/dev/null; then
      return 1
    fi
    sleep 0.1
  done
  return 1
}

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users(id, email) VALUES
  ('${COACH}'::uuid, 'p51-subject-coach@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
  ('${COACH}'::uuid, 'free', 'coach')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = EXCLUDED.coaching_role, role = EXCLUDED.role;
INSERT INTO public.user_capabilities(user_id, capability)
VALUES ('${COACH}'::uuid, 'coach')
ON CONFLICT DO NOTHING;
SQL

preview_one() {
  local key="$1"
  local reps="$2"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.preview_coach_import(
  '${COACH}'::uuid,
  '${key}.csv',
  \$csv\$Date,Exercise,Reps
2026-04-01,Bench,${reps}\$csv\$,
  '${MAP}'::jsonb,
  '${key}'
);
COMMIT;
SQL
}

preview_one 'subj-a' '5'
preview_one 'subj-b' '8'

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
CREATE OR REPLACE FUNCTION public.p51_pause_subject_commit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS \$\$
BEGIN
  IF NEW.user_id = '${COACH}'::uuid THEN
    PERFORM pg_catalog.pg_sleep(20);
  END IF;
  RETURN NEW;
END;
\$\$;
DROP TRIGGER IF EXISTS p51_pause_subject_commit ON public.workouts;
CREATE TRIGGER p51_pause_subject_commit
  BEFORE INSERT ON public.workouts
  FOR EACH ROW
  EXECUTE FUNCTION public.p51_pause_subject_commit();
SQL

A_ID="$(psql_at "SELECT id FROM public.coach_imports WHERE coach_id = '${COACH}'::uuid AND idempotency_key = 'subj-a'")"
A_SHA="$(psql_at "SELECT file_sha256 FROM public.coach_imports WHERE id = '${A_ID}'::uuid")"
B_ID="$(psql_at "SELECT id FROM public.coach_imports WHERE coach_id = '${COACH}'::uuid AND idempotency_key = 'subj-b'")"
B_SHA="$(psql_at "SELECT file_sha256 FROM public.coach_imports WHERE id = '${B_ID}'::uuid")"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p51-subj-a.out 2>/tmp/p51-subj-a.err &
SET application_name = '${A_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.commit_coach_import('${A_ID}'::uuid, '${A_SHA}', '${MAP}'::jsonb);
COMMIT;
SQL
a_pid=$!

if ! wait_state "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${A_APP}' AND l.locktype = 'advisory' AND l.classid = 20014506 AND l.granted" "${a_pid}"; then
  echo "first commit never held the subject mutex" >&2
  cat /tmp/p51-subj-a.out /tmp/p51-subj-a.err >&2 || true
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p51-subj-b.out 2>/tmp/p51-subj-b.err &
SET application_name = '${B_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
DO \$body\$
BEGIN
  PERFORM public.commit_coach_import('${B_ID}'::uuid, '${B_SHA}', '${MAP}'::jsonb);
  RAISE EXCEPTION 'second commit wrote a duplicate session';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'potential_duplicate' THEN RAISE; END IF;
END;
\$body\$;
COMMIT;
SQL
b_pid=$!

if ! wait_state "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${B_APP}' AND l.locktype = 'advisory' AND l.classid = 20014506 AND NOT l.granted" "${b_pid}"; then
  echo "second commit did not wait on the subject mutex" >&2
  cat /tmp/p51-subj-a.out /tmp/p51-subj-a.err /tmp/p51-subj-b.out /tmp/p51-subj-b.err >&2 || true
  exit 1
fi
sleep 2
if ! kill -0 "${a_pid}" 2>/dev/null || ! kill -0 "${b_pid}" 2>/dev/null; then
  echo "a commit session died while the subject mutex was held" >&2
  assert_no_deadlock /tmp/p51-subj-a.err /tmp/p51-subj-b.err
  exit 1
fi
assert_no_deadlock /tmp/p51-subj-a.err /tmp/p51-subj-b.err
wait "${a_pid}"
wait "${b_pid}"
assert_no_deadlock /tmp/p51-subj-a.err /tmp/p51-subj-b.err
a_pid=""
b_pid=""

WORKOUTS="$(psql_at "SELECT count(*) FROM public.workouts WHERE user_id = '${COACH}'::uuid AND name = '2026-04-01'")"
A_STATUS="$(psql_at "SELECT status FROM public.coach_imports WHERE id = '${A_ID}'::uuid")"
B_STATUS="$(psql_at "SELECT status FROM public.coach_imports WHERE id = '${B_ID}'::uuid")"
if [[ "${WORKOUTS}" != "1" || "${A_STATUS}" != "committed" || "${B_STATUS}" != "previewed" ]]; then
  echo "subject race result workouts=${WORKOUTS} a=${A_STATUS} b=${B_STATUS}" >&2
  cat /tmp/p51-subj-a.out /tmp/p51-subj-a.err /tmp/p51-subj-b.out /tmp/p51-subj-b.err >&2 || true
  exit 1
fi

echo "p5.1 commit × commit: subject mutex, second sees the workout, potential_duplicate, no deadlock"
