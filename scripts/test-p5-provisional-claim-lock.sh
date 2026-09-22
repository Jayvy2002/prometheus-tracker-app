#!/usr/bin/env bash
# Two confirms of the same provisional token, plus a commit of a second file,
# while the first confirm is paused inside the workout copy.
# Claim and commit share mutex 20014507. The second confirm must not copy a
# second workout. The commit must see the dossier attached and refuse.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

COACH='c5400000-0000-4000-8000-000000000001'
ATHLETE='c5400000-0000-4000-8000-000000000002'
HOLD_KEY=872009221135
HOLD_APP='prometheus-p52-hold'
A_APP='prometheus-p52-claim-a'
B_APP='prometheus-p52-claim-b'
C_APP='prometheus-p52-commit'
MAP='{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2},"ignored":[]}'

psql_at() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "$1"
}

hold_pid=""
a_pid=""
b_pid=""
c_pid=""

cleanup() {
  local code=$?
  if [[ "${code}" != "0" ]]; then
    echo "---- pg_locks ----" >&2
    psql "$DATABASE_URL" -X -c "SELECT a.application_name, a.state, a.wait_event_type, l.locktype, l.mode, l.granted, l.classid FROM pg_stat_activity a LEFT JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name LIKE 'prometheus-p52-%' ORDER BY 1, 4;" >&2 || true
    echo "---- session output ----" >&2
    cat /tmp/p52-claim-a.out /tmp/p52-claim-a.err /tmp/p52-claim-b.out /tmp/p52-claim-b.err /tmp/p52-commit.out /tmp/p52-commit.err >&2 || true
  fi
  for pid in "${c_pid}" "${b_pid}" "${a_pid}" "${hold_pid}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=0 <<SQL >/dev/null 2>&1 || true
SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
 WHERE application_name IN ('${HOLD_APP}', '${A_APP}', '${B_APP}', '${C_APP}')
   AND pid <> pg_backend_pid();
DROP TRIGGER IF EXISTS p52_pause_claim_workout ON public.workouts;
DROP FUNCTION IF EXISTS public.p52_pause_claim_workout();
DELETE FROM public.coach_provisional_claim_workouts
 WHERE claim_id IN (SELECT id FROM public.coach_provisional_claims WHERE user_id = '${ATHLETE}'::uuid);
DELETE FROM public.coach_provisional_claim_weights
 WHERE claim_id IN (SELECT id FROM public.coach_provisional_claims WHERE user_id = '${ATHLETE}'::uuid);
DELETE FROM public.coach_provisional_claims WHERE user_id = '${ATHLETE}'::uuid;
DELETE FROM public.workout_sets
 WHERE exercise_id IN (
   SELECT e.id FROM public.workout_exercises e
   JOIN public.workouts w ON w.id = e.workout_id
   WHERE w.user_id = '${ATHLETE}'::uuid
 );
DELETE FROM public.workout_exercises
 WHERE workout_id IN (SELECT id FROM public.workouts WHERE user_id = '${ATHLETE}'::uuid);
DELETE FROM public.workouts WHERE user_id = '${ATHLETE}'::uuid;
DELETE FROM public.coach_imports WHERE coach_id = '${COACH}'::uuid;
DELETE FROM public.coach_provisional_dossiers WHERE coach_id = '${COACH}'::uuid;
DELETE FROM public.user_capabilities WHERE user_id IN ('${COACH}'::uuid, '${ATHLETE}'::uuid);
DELETE FROM public.user_profiles WHERE id IN ('${COACH}'::uuid, '${ATHLETE}'::uuid);
DELETE FROM public.user_roles WHERE user_id IN ('${COACH}'::uuid, '${ATHLETE}'::uuid);
DELETE FROM auth.users WHERE id IN ('${COACH}'::uuid, '${ATHLETE}'::uuid);
SQL
  if [[ "${code}" != "0" ]]; then
    exit "${code}"
  fi
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
  ('${COACH}'::uuid, 'p52-lock-coach@example.test'),
  ('${ATHLETE}'::uuid, 'p52-lock-athlete@example.test')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
  ('${COACH}'::uuid, 'free', 'coach'),
  ('${ATHLETE}'::uuid, 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = EXCLUDED.coaching_role, role = EXCLUDED.role;
INSERT INTO public.user_capabilities(user_id, capability)
VALUES ('${COACH}'::uuid, 'coach')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.p52_pause_claim_workout()
RETURNS trigger
LANGUAGE plpgsql
AS \$\$
BEGIN
  PERFORM pg_advisory_xact_lock(${HOLD_KEY});
  RETURN NEW;
END;
\$\$;

DROP TRIGGER IF EXISTS p52_pause_claim_workout ON public.workouts;
CREATE TRIGGER p52_pause_claim_workout
  BEFORE INSERT ON public.workouts
  FOR EACH ROW
  WHEN (NEW.user_id = '${ATHLETE}'::uuid)
  EXECUTE FUNCTION public.p52_pause_claim_workout();
SQL

SETUP="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
DO \$body\$
DECLARE
  v_dossier uuid;
  v_first jsonb;
  v_second jsonb;
  v_invite jsonb;
BEGIN
  v_dossier := (public.create_provisional_dossier('Lock'))->>'id';
  v_first := public.preview_provisional_import(
    v_dossier,
    'first.csv',
    \$csv\$Date,Exercise,Reps
2026-09-24,Deadlift,5
\$csv\$,
    '${MAP}'::jsonb,
    'p52-lock-first'
  );
  PERFORM public.commit_coach_import(
    (v_first->>'import_id')::uuid,
    v_first->>'file_sha256',
    '${MAP}'::jsonb
  );
  v_second := public.preview_provisional_import(
    v_dossier,
    'second.csv',
    \$csv\$Date,Exercise,Reps
2026-09-25,Squat,5
\$csv\$,
    '${MAP}'::jsonb,
    'p52-lock-second'
  );
  v_invite := public.invite_provisional_dossier(v_dossier, 'p52-lock-athlete@example.test');
  PERFORM set_config(
    'p52.out',
    (v_invite->>'token') || '|' || (v_second->>'import_id') || '|' || v_dossier::text,
    true
  );
END;
\$body\$;
SELECT current_setting('p52.out');
COMMIT;
SQL
)"
SETUP_LINE="$(printf '%s\n' "${SETUP}" | grep '|' | tail -n 1)"
TOKEN="${SETUP_LINE%%|*}"
REST="${SETUP_LINE#*|}"
SECOND="${REST%%|*}"
DOSSIER="${REST##*|}"

if [[ "${#TOKEN}" -lt 32 || -z "${SECOND}" || -z "${DOSSIER}" ]]; then
  echo "setup failed: ${SETUP}" >&2
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p52-hold.out 2>&1 &
SET application_name = '${HOLD_APP}';
BEGIN;
SELECT pg_advisory_xact_lock(${HOLD_KEY});
SELECT pg_sleep(60);
ROLLBACK;
SQL
hold_pid=$!
wait_state "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${HOLD_APP}' AND l.locktype = 'advisory' AND l.granted" "${hold_pid}"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p52-claim-a.out 2>/tmp/p52-claim-a.err &
SET application_name = '${A_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${ATHLETE}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${ATHLETE}","role":"authenticated"}', true);
SELECT public.confirm_provisional_claim('${TOKEN}', true, false);
COMMIT;
SQL
a_pid=$!
wait_state "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${A_APP}' AND l.locktype = 'advisory' AND l.classid = 20014507 AND l.granted" "${a_pid}"
wait_state "SELECT count(*) FROM pg_stat_activity WHERE application_name = '${A_APP}' AND wait_event_type = 'Lock'" "${a_pid}"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p52-claim-b.out 2>/tmp/p52-claim-b.err &
SET application_name = '${B_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${ATHLETE}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${ATHLETE}","role":"authenticated"}', true);
SELECT public.confirm_provisional_claim('${TOKEN}', true, false);
COMMIT;
SQL
b_pid=$!

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p52-commit.out 2>/tmp/p52-commit.err &
SET application_name = '${C_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.commit_coach_import(
  '${SECOND}'::uuid,
  (SELECT file_sha256 FROM public.coach_imports WHERE id = '${SECOND}'::uuid),
  '${MAP}'::jsonb
);
COMMIT;
SQL
c_pid=$!

wait_state "SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE a.application_name = '${B_APP}' AND l.locktype = 'advisory' AND l.classid = 20014507 AND NOT l.granted" "${b_pid}"
wait_state "SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE a.application_name = '${C_APP}' AND l.locktype = 'advisory' AND l.classid = 20014507 AND NOT l.granted" "${c_pid}"

kill "${hold_pid}" 2>/dev/null || true
wait "${hold_pid}" 2>/dev/null || true
hold_pid=""
psql "$DATABASE_URL" -X -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = '${HOLD_APP}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true

set +e
wait "${a_pid}"
a_code=$?
wait "${b_pid}"
b_code=$?
wait "${c_pid}"
c_code=$?
set -e
a_pid=""
b_pid=""
c_pid=""

assert_no_deadlock /tmp/p52-claim-a.err /tmp/p52-claim-b.err /tmp/p52-commit.err /tmp/p52-claim-a.out /tmp/p52-claim-b.out /tmp/p52-commit.out

if [[ "${a_code}" != "0" || "${b_code}" != "0" ]]; then
  echo "claim sessions failed a=${a_code} b=${b_code}" >&2
  cat /tmp/p52-claim-a.out /tmp/p52-claim-a.err /tmp/p52-claim-b.out /tmp/p52-claim-b.err >&2
  exit 1
fi
if ! grep -q 'already_attached' /tmp/p52-claim-b.out; then
  echo "second confirm was not idempotent" >&2
  cat /tmp/p52-claim-b.out >&2
  exit 1
fi
if [[ "${c_code}" == "0" ]] || ! grep -q 'dossier_closed' /tmp/p52-commit.err; then
  echo "commit during claim did not fail closed" >&2
  cat /tmp/p52-commit.out /tmp/p52-commit.err >&2
  exit 1
fi

COUNT="$(psql_at "SELECT count(*) FROM public.workouts WHERE user_id = '${ATHLETE}'::uuid")"
if [[ "${COUNT}" != "1" ]]; then
  echo "expected one attached workout, got ${COUNT}" >&2
  exit 1
fi
STATUS="$(psql_at "SELECT status FROM public.coach_provisional_dossiers WHERE id = '${DOSSIER}'::uuid")"
if [[ "${STATUS}" != "attached" ]]; then
  echo "dossier status ${STATUS}" >&2
  exit 1
fi

echo "p5.2 claim × claim × commit: dossier mutex, one workout, second confirm idempotent, commit fail-closed, no deadlock"
