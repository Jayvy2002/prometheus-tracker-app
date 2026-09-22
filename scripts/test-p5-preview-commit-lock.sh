#!/usr/bin/env bash
# Two real Postgres sessions: preview_coach_import × commit_coach_import.
# Canonical order is Coach lifecycle (20014501), import mutex (20014504),
# then coach_imports FOR UPDATE. Both orders must finish without deadlock.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

COACH='c51e0000-0000-4000-8000-000000000001'
CLIENT='c51e0000-0000-4000-8000-000000000002'
HOLD_KEY=872009201135
HOLD_APP='prometheus-p51-prev-hold'
P_APP='prometheus-p51-preview'
C_APP='prometheus-p51-commit'
MAP='{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2,"exercise_load":3},"ignored":[]}'
CSV='Date,Exercise,Reps,Weight
2026-03-03,Squat,5,100'

psql_at() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "$1"
}

hold_pid=""
p_pid=""
c_pid=""

cleanup() {
  for pid in "${c_pid}" "${p_pid}" "${hold_pid}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=0 <<SQL >/dev/null 2>&1 || true
SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
 WHERE application_name IN ('${HOLD_APP}', '${P_APP}', '${C_APP}')
   AND pid <> pg_backend_pid();
DROP TRIGGER IF EXISTS p51_pause_workout_insert ON public.workouts;
DROP FUNCTION IF EXISTS public.p51_pause_workout_insert();
DELETE FROM public.coach_import_rows
 WHERE import_id IN (SELECT id FROM public.coach_imports WHERE coach_id = '${COACH}'::uuid OR subject_user_id IN ('${COACH}'::uuid, '${CLIENT}'::uuid));
DELETE FROM public.coach_imports
 WHERE coach_id = '${COACH}'::uuid OR subject_user_id IN ('${COACH}'::uuid, '${CLIENT}'::uuid);
DELETE FROM public.workout_sets
 WHERE exercise_id IN (
   SELECT e.id FROM public.workout_exercises e
   JOIN public.workouts w ON w.id = e.workout_id
   WHERE w.user_id IN ('${COACH}'::uuid, '${CLIENT}'::uuid)
 );
DELETE FROM public.workout_exercises
 WHERE workout_id IN (SELECT id FROM public.workouts WHERE user_id IN ('${COACH}'::uuid, '${CLIENT}'::uuid));
DELETE FROM public.workouts WHERE user_id IN ('${COACH}'::uuid, '${CLIENT}'::uuid);
DELETE FROM public.coach_client_links
 WHERE coach_id = '${COACH}'::uuid OR client_id = '${CLIENT}'::uuid;
DELETE FROM public.user_capabilities WHERE user_id IN ('${COACH}'::uuid, '${CLIENT}'::uuid);
DELETE FROM public.user_profiles WHERE id IN ('${COACH}'::uuid, '${CLIENT}'::uuid);
DELETE FROM public.user_roles WHERE user_id IN ('${COACH}'::uuid, '${CLIENT}'::uuid);
DELETE FROM auth.users WHERE id IN ('${COACH}'::uuid, '${CLIENT}'::uuid);
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

seed() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users(id, email) VALUES
  ('${COACH}'::uuid, 'p51-lock-coach@example.test'),
  ('${CLIENT}'::uuid, 'p51-lock-client@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
  ('${COACH}'::uuid, 'free', 'coach'),
  ('${CLIENT}'::uuid, 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = EXCLUDED.coaching_role;
INSERT INTO public.user_capabilities(user_id, capability)
VALUES ('${COACH}'::uuid, 'coach')
ON CONFLICT DO NOTHING;
INSERT INTO public.coach_client_links(coach_id, client_id, status)
VALUES ('${COACH}'::uuid, '${CLIENT}'::uuid, 'active');
SQL
}

preview_import() {
  local key="$1"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.preview_coach_import(
  '${CLIENT}'::uuid,
  'lock.csv',
  \$csv\$${CSV}\$csv\$,
  '${MAP}'::jsonb,
  '${key}'
);
COMMIT;
SQL
}

hold_advisory() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p51-prev-hold.out 2>&1 &
SET application_name = '${HOLD_APP}';
BEGIN;
SELECT pg_advisory_xact_lock(${HOLD_KEY});
SELECT pg_sleep(60);
ROLLBACK;
SQL
  hold_pid=$!
  local got=0
  for _ in $(seq 1 50); do
    got="$(psql_at "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${HOLD_APP}' AND l.locktype = 'advisory' AND l.granted")"
    if [[ "${got}" != "0" ]]; then
      return 0
    fi
    sleep 0.1
  done
  echo "hold session never acquired advisory lock" >&2
  exit 1
}

release_hold() {
  if [[ -n "${hold_pid}" ]]; then
    kill "${hold_pid}" 2>/dev/null || true
    wait "${hold_pid}" 2>/dev/null || true
    hold_pid=""
  fi
  psql "$DATABASE_URL" -X -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = '${HOLD_APP}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
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

seed
preview_import 'preview-first'

# Preview holds lifecycle + import mutex + row lock, then waits. Commit must wait, not deadlock.
hold_advisory
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p51-preview-first.out 2>/tmp/p51-preview-first.err &
SET application_name = '${P_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.preview_coach_import(
  '${CLIENT}'::uuid,
  'lock.csv',
  \$csv\$${CSV}\$csv\$,
  '${MAP}'::jsonb,
  'preview-first'
);
SELECT pg_advisory_xact_lock(${HOLD_KEY});
COMMIT;
SQL
p_pid=$!

if ! wait_state "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${P_APP}' AND l.locktype = 'advisory' AND l.classid = 20014504 AND l.granted" "${p_pid}"; then
  echo "preview-first never held the import mutex" >&2
  cat /tmp/p51-preview-first.out /tmp/p51-preview-first.err >&2 || true
  exit 1
fi

IMPORT_ID="$(psql_at "SELECT id FROM public.coach_imports WHERE coach_id = '${COACH}'::uuid AND idempotency_key = 'preview-first'")"
SHA="$(psql_at "SELECT file_sha256 FROM public.coach_imports WHERE id = '${IMPORT_ID}'::uuid")"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p51-commit-second.out 2>/tmp/p51-commit-second.err &
SET application_name = '${C_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.commit_coach_import('${IMPORT_ID}'::uuid, '${SHA}', '${MAP}'::jsonb);
COMMIT;
SQL
c_pid=$!

if ! wait_state "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${C_APP}' AND l.locktype = 'advisory' AND l.classid = 20014501 AND NOT l.granted" "${c_pid}"; then
  echo "commit did not wait on the Coach lifecycle mutex behind preview" >&2
  cat /tmp/p51-commit-second.out /tmp/p51-commit-second.err /tmp/p51-preview-first.err >&2 || true
  exit 1
fi
sleep 2
if ! kill -0 "${p_pid}" 2>/dev/null || ! kill -0 "${c_pid}" 2>/dev/null; then
  echo "preview-first session died while both locks were held" >&2
  assert_no_deadlock /tmp/p51-preview-first.err /tmp/p51-commit-second.err
  exit 1
fi
assert_no_deadlock /tmp/p51-preview-first.err /tmp/p51-commit-second.err
release_hold
wait "${p_pid}"
wait "${c_pid}"
assert_no_deadlock /tmp/p51-preview-first.err /tmp/p51-commit-second.err
p_pid=""
c_pid=""
WORKOUTS="$(psql_at "SELECT count(*) FROM public.workouts WHERE user_id = '${CLIENT}'::uuid AND name = '2026-03-03'")"
if [[ "${WORKOUTS}" != "1" ]]; then
  echo "preview-first commit did not write exactly one workout (${WORKOUTS})" >&2
  exit 1
fi

# Commit holds the canonical locks inside the workout insert, preview waits behind it.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
CREATE OR REPLACE FUNCTION public.p51_pause_workout_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS \$\$
BEGIN
  IF NEW.user_id = '${CLIENT}'::uuid THEN
    PERFORM pg_catalog.pg_sleep(20);
  END IF;
  RETURN NEW;
END;
\$\$;
DROP TRIGGER IF EXISTS p51_pause_workout_insert ON public.workouts;
CREATE TRIGGER p51_pause_workout_insert
  BEFORE INSERT ON public.workouts
  FOR EACH ROW
  EXECUTE FUNCTION public.p51_pause_workout_insert();
SQL

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
DELETE FROM public.coach_import_rows WHERE import_id = '${IMPORT_ID}'::uuid;
DELETE FROM public.workouts WHERE user_id = '${CLIENT}'::uuid;
DELETE FROM public.coach_imports WHERE id = '${IMPORT_ID}'::uuid;
SQL
preview_import 'commit-first'
IMPORT_ID="$(psql_at "SELECT id FROM public.coach_imports WHERE coach_id = '${COACH}'::uuid AND idempotency_key = 'commit-first'")"
SHA="$(psql_at "SELECT file_sha256 FROM public.coach_imports WHERE id = '${IMPORT_ID}'::uuid")"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p51-commit-first.out 2>/tmp/p51-commit-first.err &
SET application_name = '${C_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.commit_coach_import('${IMPORT_ID}'::uuid, '${SHA}', '${MAP}'::jsonb);
COMMIT;
SQL
c_pid=$!

if ! wait_state "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${C_APP}' AND l.locktype = 'advisory' AND l.classid = 20014504 AND l.granted" "${c_pid}"; then
  echo "commit-first never held the import mutex" >&2
  cat /tmp/p51-commit-first.out /tmp/p51-commit-first.err >&2 || true
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p51-preview-second.out 2>/tmp/p51-preview-second.err &
SET application_name = '${P_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.preview_coach_import(
  '${CLIENT}'::uuid,
  'lock.csv',
  \$csv\$${CSV}\$csv\$,
  '${MAP}'::jsonb,
  'commit-first'
);
COMMIT;
SQL
p_pid=$!

if ! wait_state "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${P_APP}' AND l.locktype = 'advisory' AND l.classid = 20014501 AND NOT l.granted" "${p_pid}"; then
  echo "preview did not wait on the Coach lifecycle mutex behind commit" >&2
  cat /tmp/p51-preview-second.out /tmp/p51-preview-second.err /tmp/p51-commit-first.err >&2 || true
  exit 1
fi
sleep 2
if ! kill -0 "${p_pid}" 2>/dev/null || ! kill -0 "${c_pid}" 2>/dev/null; then
  echo "commit-first session died while preview was waiting" >&2
  assert_no_deadlock /tmp/p51-preview-second.err /tmp/p51-commit-first.err
  exit 1
fi
assert_no_deadlock /tmp/p51-preview-second.err /tmp/p51-commit-first.err
wait "${c_pid}"
wait "${p_pid}"
assert_no_deadlock /tmp/p51-preview-second.err /tmp/p51-commit-first.err
c_pid=""
p_pid=""
WORKOUTS="$(psql_at "SELECT count(*) FROM public.workouts WHERE user_id = '${CLIENT}'::uuid AND name = '2026-03-03'")"
if [[ "${WORKOUTS}" != "1" ]]; then
  echo "commit-first did not write exactly one workout (${WORKOUTS})" >&2
  exit 1
fi

# Same new idempotency key from two sessions: one insert wins, the other
# unique_violation path must return that same import and not a second row.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p51-race-a.out 2>/tmp/p51-race-a.err &
SET application_name = '${P_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.preview_coach_import(
  '${CLIENT}'::uuid,
  'race.csv',
  \$csv\$${CSV}\$csv\$,
  '${MAP}'::jsonb,
  'race-same'
);
COMMIT;
SQL
p_pid=$!
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p51-race-b.out 2>/tmp/p51-race-b.err &
SET application_name = '${C_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.preview_coach_import(
  '${CLIENT}'::uuid,
  'race.csv',
  \$csv\$${CSV}\$csv\$,
  '${MAP}'::jsonb,
  'race-same'
);
COMMIT;
SQL
c_pid=$!
wait "${p_pid}"
wait "${c_pid}"
assert_no_deadlock /tmp/p51-race-a.err /tmp/p51-race-b.err
p_pid=""
c_pid=""
RACE_COUNT="$(psql_at "SELECT count(*) FROM public.coach_imports WHERE coach_id = '${COACH}'::uuid AND idempotency_key = 'race-same'")"
if [[ "${RACE_COUNT}" != "1" ]]; then
  echo "concurrent same-intent preview created ${RACE_COUNT} imports" >&2
  cat /tmp/p51-race-a.err /tmp/p51-race-b.err >&2 || true
  exit 1
fi

echo "p5.1 preview × commit: two-session lock order, no deadlock"
