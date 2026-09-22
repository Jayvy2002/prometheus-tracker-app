#!/usr/bin/env bash
# Two merges of the same pair. Row locks serialize them.
# The second call is idempotent. The written workout name stays.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

ATHLETE='c5600000-0000-4000-8000-000000000002'
WINNER='c5600000-0000-4000-8000-000000000010'
LOSER='c5600000-0000-4000-8000-000000000011'
HOLD_CLASS=872009
HOLD_OBJ=231135
HOLD_APP='prometheus-p53-hold'
A_APP='prometheus-p53-merge-a'
B_APP='prometheus-p53-merge-b'

psql_at() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "$1"
}

hold_pid=""
a_pid=""
b_pid=""

cleanup() {
  local code=$?
  if [[ "${code}" != "0" ]]; then
    echo "---- session output ----" >&2
    cat /tmp/p53-merge-a.out /tmp/p53-merge-a.err /tmp/p53-merge-b.out /tmp/p53-merge-b.err >&2 || true
  fi
  for pid in "${b_pid}" "${a_pid}" "${hold_pid}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=0 <<SQL >/dev/null 2>&1 || true
SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
 WHERE application_name IN ('${HOLD_APP}', '${A_APP}', '${B_APP}')
   AND pid <> pg_backend_pid();
DROP TRIGGER IF EXISTS p53_pause_merge ON public.exercise_merges;
DROP FUNCTION IF EXISTS public.p53_pause_merge();
DELETE FROM public.workout_sets
 WHERE exercise_id IN (
   SELECT e.id FROM public.workout_exercises e
   JOIN public.workouts w ON w.id = e.workout_id
   WHERE w.user_id = '${ATHLETE}'::uuid
 );
DELETE FROM public.workout_exercises
 WHERE workout_id IN (SELECT id FROM public.workouts WHERE user_id = '${ATHLETE}'::uuid);
DELETE FROM public.workouts WHERE user_id = '${ATHLETE}'::uuid;
DELETE FROM public.exercise_merges WHERE loser_id = '${LOSER}'::uuid;
DELETE FROM public.exercise_aliases WHERE exercise_id IN ('${WINNER}'::uuid, '${LOSER}'::uuid);
DELETE FROM public.exercises WHERE id IN ('${WINNER}'::uuid, '${LOSER}'::uuid);
DELETE FROM public.user_roles WHERE user_id = '${ATHLETE}'::uuid;
DELETE FROM auth.users WHERE id = '${ATHLETE}'::uuid;
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
  ('${ATHLETE}'::uuid, 'p53-lock-athlete@example.test')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
  ('${ATHLETE}'::uuid, 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = EXCLUDED.coaching_role;

INSERT INTO public.exercises (id, name, name_fr, verified)
VALUES
  ('${WINNER}'::uuid, 'P53 Winner Row', 'Row gagnant', true),
  ('${LOSER}'::uuid, 'P53 Loser Row', 'Row perdant', true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.exercise_aliases (exercise_id, alias, locale, normalized, source)
VALUES
  ('${WINNER}'::uuid, 'P53 Winner Row', 'en', public.exercise_normalize_name('P53 Winner Row'), 'canonical'),
  ('${LOSER}'::uuid, 'P53 Loser Row', 'en', public.exercise_normalize_name('P53 Loser Row'), 'canonical')
ON CONFLICT (normalized) DO NOTHING;

INSERT INTO public.workouts (user_id, name, date, completed)
VALUES ('${ATHLETE}'::uuid, 'P53 hist', '2020-05-01', true);
INSERT INTO public.workout_exercises (workout_id, name, order_index, catalog_exercise_id)
SELECT id, 'P53 Loser Row', 0, '${LOSER}'::uuid
  FROM public.workouts
 WHERE user_id = '${ATHLETE}'::uuid AND name = 'P53 hist';
INSERT INTO public.workout_sets (exercise_id, order_index, weight_kg, reps, completed)
SELECT e.id, 0, 80, 8, true
  FROM public.workout_exercises e
  JOIN public.workouts w ON w.id = e.workout_id
 WHERE w.user_id = '${ATHLETE}'::uuid AND e.name = 'P53 Loser Row';

CREATE OR REPLACE FUNCTION public.p53_pause_merge()
RETURNS trigger
LANGUAGE plpgsql
AS \$\$
BEGIN
  PERFORM pg_advisory_xact_lock(${HOLD_CLASS}, ${HOLD_OBJ});
  RETURN NEW;
END;
\$\$;

DROP TRIGGER IF EXISTS p53_pause_merge ON public.exercise_merges;
CREATE TRIGGER p53_pause_merge
  BEFORE INSERT ON public.exercise_merges
  FOR EACH ROW
  WHEN (NEW.loser_id = '${LOSER}'::uuid)
  EXECUTE FUNCTION public.p53_pause_merge();
SQL

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p53-hold.out 2>&1 &
SET application_name = '${HOLD_APP}';
BEGIN;
SELECT pg_advisory_xact_lock(${HOLD_CLASS}, ${HOLD_OBJ});
SELECT pg_sleep(60);
COMMIT;
SQL
hold_pid=$!

if ! wait_state "SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND classid = ${HOLD_CLASS} AND objid = ${HOLD_OBJ} AND granted" "${hold_pid}"; then
  echo "hold lock was not taken" >&2
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p53-merge-a.out 2>/tmp/p53-merge-a.err &
SET application_name = '${A_APP}';
SELECT public.merge_exercises('${WINNER}'::uuid, '${LOSER}'::uuid, true)->>'status';
SQL
a_pid=$!

if ! wait_state "SELECT count(*) FROM pg_stat_activity WHERE application_name = '${A_APP}' AND wait_event_type = 'Lock'" "${a_pid}"; then
  echo "merge A did not wait" >&2
  cat /tmp/p53-merge-a.out /tmp/p53-merge-a.err >&2 || true
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p53-merge-b.out 2>/tmp/p53-merge-b.err &
SET application_name = '${B_APP}';
SELECT public.merge_exercises('${WINNER}'::uuid, '${LOSER}'::uuid, true)->>'status';
SQL
b_pid=$!
sleep 0.4

psql "$DATABASE_URL" -X -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = '${HOLD_APP}' AND pid <> pg_backend_pid();" >/dev/null
wait "${a_pid}" || { echo "merge A failed" >&2; cat /tmp/p53-merge-a.err >&2; exit 1; }
wait "${b_pid}" || { echo "merge B failed" >&2; cat /tmp/p53-merge-b.err >&2; exit 1; }
hold_pid=""
a_pid=""
b_pid=""

assert_no_deadlock /tmp/p53-merge-a.err /tmp/p53-merge-b.err /tmp/p53-merge-a.out /tmp/p53-merge-b.out

A_STATUS="$(grep -oE 'already_merged|merged' /tmp/p53-merge-a.out | head -n 1 || true)"
B_STATUS="$(grep -oE 'already_merged|merged' /tmp/p53-merge-b.out | head -n 1 || true)"
STATUSES="$(printf '%s\n%s\n' "${A_STATUS}" "${B_STATUS}" | sort | tr '\n' ',')"
if [[ "${STATUSES}" != "already_merged,merged," ]]; then
  echo "unexpected merge statuses: ${STATUSES}" >&2
  exit 1
fi

CHECK="$(psql_at "SELECT e.name || '|' || e.catalog_exercise_id::text || '|' || (SELECT count(*) FROM public.workout_sets s WHERE s.exercise_id = e.id)::text FROM public.workout_exercises e JOIN public.workouts w ON w.id = e.workout_id WHERE w.user_id = '${ATHLETE}'::uuid AND e.name = 'P53 Loser Row'")"
if [[ "${CHECK}" != "P53 Loser Row|${WINNER}|1" ]]; then
  echo "history changed: ${CHECK}" >&2
  exit 1
fi

echo "p5.3 merge × merge: one merge, second idempotent, written name kept, no deadlock"
