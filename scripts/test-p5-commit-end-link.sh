#!/usr/bin/env bash
# Two real Postgres sessions: commit_coach_import × client_end_coach_link
# and commit_coach_import × end_coach_client_link.
# Commit holds the active coach_client_links row FOR SHARE after the import
# locks and before business writes. End takes that row FOR UPDATE.
# Commit wins → the departure waits and the import finishes while the link
# is still active. Departure wins → commit waits, then not_your_client, and
# no client workout is written. Neither order deadlocks.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

COACH='c51f0000-0000-4000-8000-000000000001'
CLIENT='c51f0000-0000-4000-8000-000000000002'
HOLD_KEY=872009201136
HOLD_APP='prometheus-p51-end-hold'
COMMIT_APP='prometheus-p51-end-commit'
END_APP='prometheus-p51-end-link'
MAP='{"kind":"workout","delimiter":",","date_format":"iso","load_unit":"kg","body_weight_unit":"kg","rpe_mode":"notes","columns":{"date":0,"exercise":1,"reps":2,"exercise_load":3},"ignored":[]}'

psql_at() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "$1"
}

hold_pid=""
commit_pid=""
end_pid=""

cleanup() {
  local code=$?
  if [[ "${code}" != "0" ]]; then
    echo "---- pg_locks ----" >&2
    psql "$DATABASE_URL" -X -c "SELECT a.application_name, a.state, l.locktype, l.mode, l.granted, l.classid FROM pg_stat_activity a LEFT JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name LIKE 'prometheus-p51%' ORDER BY 1, 3, 4;" >&2 || true
    echo "---- session output ----" >&2
    cat /tmp/end-*.out /tmp/end-*.err /tmp/p51-end-hold.out /tmp/p51-end-hold.err >&2 || true
  fi
  for pid in "${end_pid}" "${commit_pid}" "${hold_pid}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=0 <<SQL >/dev/null 2>&1 || true
SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
 WHERE application_name IN ('${HOLD_APP}', '${COMMIT_APP}', '${END_APP}')
   AND pid <> pg_backend_pid();
DELETE FROM public.coach_import_rows
 WHERE import_id IN (
   SELECT id FROM public.coach_imports
   WHERE coach_id = '${COACH}'::uuid OR subject_user_id IN ('${COACH}'::uuid, '${CLIENT}'::uuid)
 );
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
DELETE FROM public.coach_relationship_notices
 WHERE coach_id = '${COACH}'::uuid OR client_id = '${CLIENT}'::uuid;
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

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users(id, email) VALUES
  ('${COACH}'::uuid, 'p51-end-coach@example.test'),
  ('${CLIENT}'::uuid, 'p51-end-client@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
  ('${COACH}'::uuid, 'free', 'coach'),
  ('${CLIENT}'::uuid, 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = EXCLUDED.coaching_role, role = EXCLUDED.role;
INSERT INTO public.user_capabilities(user_id, capability)
VALUES ('${COACH}'::uuid, 'coach')
ON CONFLICT DO NOTHING;
INSERT INTO public.coach_client_links(coach_id, client_id, status)
VALUES ('${COACH}'::uuid, '${CLIENT}'::uuid, 'active')
ON CONFLICT DO NOTHING;
UPDATE public.coach_client_links
   SET status = 'active'
 WHERE coach_id = '${COACH}'::uuid AND client_id = '${CLIENT}'::uuid;
SQL

make_preview() {
  local key="$1"
  local day="$2"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.preview_coach_import(
  '${CLIENT}'::uuid,
  'end.csv',
  \$csv\$Date,Exercise,Reps,Weight
${day},Squat,5,100\$csv\$,
  '${MAP}'::jsonb,
  '${key}'
);
COMMIT;
SQL
}

relink() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "
    UPDATE public.user_roles SET coaching_role = 'none' WHERE user_id = '${CLIENT}'::uuid;
    UPDATE public.coach_client_links
       SET status = 'active'
     WHERE coach_id = '${COACH}'::uuid AND client_id = '${CLIENT}'::uuid;
  " >/dev/null
}

hold_advisory() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p51-end-hold.out 2>&1 &
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

tuple_lock() {
  local app="$1"
  local mode="$2"
  local granted="$3"
  echo "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${app}' AND l.locktype = 'tuple' AND l.mode = '${mode}' AND l.relation = 'public.coach_client_links'::regclass AND l.granted = ${granted}"
}

start_commit() {
  local key="$1"
  local outfile="$2"
  local import_id sha
  import_id="$(psql_at "SELECT id FROM public.coach_imports WHERE coach_id = '${COACH}'::uuid AND idempotency_key = '${key}'")"
  sha="$(psql_at "SELECT file_sha256 FROM public.coach_imports WHERE id = '${import_id}'::uuid")"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >"${outfile}.out" 2>"${outfile}.err" &
SET application_name = '${COMMIT_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.commit_coach_import('${import_id}'::uuid, '${sha}', '${MAP}'::jsonb);
SELECT pg_advisory_xact_lock(${HOLD_KEY});
COMMIT;
SQL
  commit_pid=$!
}

start_commit_expect_denied() {
  local key="$1"
  local outfile="$2"
  local import_id sha
  import_id="$(psql_at "SELECT id FROM public.coach_imports WHERE coach_id = '${COACH}'::uuid AND idempotency_key = '${key}'")"
  sha="$(psql_at "SELECT file_sha256 FROM public.coach_imports WHERE id = '${import_id}'::uuid")"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >"${outfile}.out" 2>"${outfile}.err" &
SET application_name = '${COMMIT_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
DO \$deny\$
BEGIN
  PERFORM public.commit_coach_import('${import_id}'::uuid, '${sha}', '${MAP}'::jsonb);
  RAISE EXCEPTION 'commit wrote after authority was lost';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'not_your_client' THEN RAISE; END IF;
END;
\$deny\$;
COMMIT;
SQL
  commit_pid=$!
}

start_end() {
  local who="$1"
  local outfile="$2"
  if [[ "${who}" == "client" ]]; then
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >"${outfile}.out" 2>"${outfile}.err" &
SET application_name = '${END_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT}","role":"authenticated"}', true);
DO \$end\$
DECLARE
  v jsonb;
BEGIN
  v := public.client_end_coach_link();
  IF v->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'client_end failed %', v;
  END IF;
END;
\$end\$;
SELECT pg_advisory_xact_lock(${HOLD_KEY});
COMMIT;
SQL
  else
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >"${outfile}.out" 2>"${outfile}.err" &
SET application_name = '${END_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
DO \$end\$
DECLARE
  v jsonb;
BEGIN
  v := public.end_coach_client_link('${CLIENT}'::uuid);
  IF v->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'coach_end failed %', v;
  END IF;
END;
\$end\$;
SELECT pg_advisory_xact_lock(${HOLD_KEY});
COMMIT;
SQL
  fi
  end_pid=$!
}

finish_pair() {
  local label="$1"
  release_hold
  wait "${commit_pid}"
  wait "${end_pid}"
  assert_no_deadlock "/tmp/${label}-commit.err" "/tmp/${label}-end.err"
  commit_pid=""
  end_pid=""
}

# Commit wins against client_end_coach_link.
relink
make_preview 'end-commit-wins-client' '2026-04-01'
hold_advisory
start_commit 'end-commit-wins-client' /tmp/end-commit-wins-client-commit
if ! wait_state "$(tuple_lock "${COMMIT_APP}" ForShare true)" "${commit_pid}"; then
  echo "commit never held the active link FOR SHARE" >&2
  cat /tmp/end-commit-wins-client-commit.out /tmp/end-commit-wins-client-commit.err >&2 || true
  exit 1
fi
ACTIVE="$(psql_at "SELECT status FROM public.coach_client_links WHERE coach_id = '${COACH}'::uuid AND client_id = '${CLIENT}'::uuid")"
if [[ "${ACTIVE}" != "active" ]]; then
  echo "link was not active while commit held it (${ACTIVE})" >&2
  exit 1
fi
start_end client /tmp/end-commit-wins-client-end
if ! wait_state "$(tuple_lock "${END_APP}" ForUpdate false)" "${end_pid}"; then
  echo "client_end_coach_link did not wait on the link row" >&2
  cat /tmp/end-commit-wins-client-end.out /tmp/end-commit-wins-client-end.err >&2 || true
  exit 1
fi
sleep 1
assert_no_deadlock /tmp/end-commit-wins-client-commit.err /tmp/end-commit-wins-client-end.err
if ! kill -0 "${commit_pid}" 2>/dev/null || ! kill -0 "${end_pid}" 2>/dev/null; then
  echo "commit × client_end died while serialized" >&2
  exit 1
fi
finish_pair end-commit-wins-client
COUNT="$(psql_at "SELECT count(*) FROM public.workouts WHERE user_id = '${CLIENT}'::uuid AND name = '2026-04-01'")"
STATUS="$(psql_at "SELECT status FROM public.coach_client_links WHERE coach_id = '${COACH}'::uuid AND client_id = '${CLIENT}'::uuid")"
if [[ "${COUNT}" != "1" || "${STATUS}" != "ended" ]]; then
  echo "commit-wins client_end expected 1 workout and ended link, got ${COUNT} ${STATUS}" >&2
  exit 1
fi

# client_end wins, commit must fail closed.
relink
make_preview 'end-client-wins' '2026-04-02'
hold_advisory
start_end client /tmp/end-client-wins-end
if ! wait_state "$(tuple_lock "${END_APP}" ForUpdate true)" "${end_pid}"; then
  echo "client_end never held the link FOR UPDATE" >&2
  cat /tmp/end-client-wins-end.out /tmp/end-client-wins-end.err >&2 || true
  exit 1
fi
BEFORE="$(psql_at "SELECT count(*) FROM public.workouts WHERE user_id = '${CLIENT}'::uuid AND name = '2026-04-02'")"
start_commit_expect_denied 'end-client-wins' /tmp/end-client-wins-commit
if ! wait_state "$(tuple_lock "${COMMIT_APP}" ForShare false)" "${commit_pid}"; then
  echo "commit did not wait on the link held by client_end" >&2
  cat /tmp/end-client-wins-commit.out /tmp/end-client-wins-commit.err >&2 || true
  exit 1
fi
MID="$(psql_at "SELECT count(*) FROM public.workouts WHERE user_id = '${CLIENT}'::uuid AND name = '2026-04-02'")"
if [[ "${BEFORE}" != "0" || "${MID}" != "0" ]]; then
  echo "commit wrote a workout while waiting on a departing client" >&2
  exit 1
fi
sleep 1
assert_no_deadlock /tmp/end-client-wins-commit.err /tmp/end-client-wins-end.err
finish_pair end-client-wins
COUNT="$(psql_at "SELECT count(*) FROM public.workouts WHERE user_id = '${CLIENT}'::uuid AND name = '2026-04-02'")"
if [[ "${COUNT}" != "0" ]]; then
  echo "client_end win still wrote ${COUNT} workouts" >&2
  exit 1
fi

# Commit wins against end_coach_client_link.
relink
make_preview 'end-commit-wins-coach' '2026-04-03'
hold_advisory
start_commit 'end-commit-wins-coach' /tmp/end-commit-wins-coach-commit
if ! wait_state "$(tuple_lock "${COMMIT_APP}" ForShare true)" "${commit_pid}"; then
  echo "commit never held the link before end_coach_client_link" >&2
  cat /tmp/end-commit-wins-coach-commit.err >&2 || true
  exit 1
fi
start_end coach /tmp/end-commit-wins-coach-end
if ! wait_state "$(tuple_lock "${END_APP}" ForUpdate false)" "${end_pid}"; then
  echo "end_coach_client_link did not wait on the link row" >&2
  cat /tmp/end-commit-wins-coach-end.out /tmp/end-commit-wins-coach-end.err >&2 || true
  exit 1
fi
sleep 1
assert_no_deadlock /tmp/end-commit-wins-coach-commit.err /tmp/end-commit-wins-coach-end.err
finish_pair end-commit-wins-coach
COUNT="$(psql_at "SELECT count(*) FROM public.workouts WHERE user_id = '${CLIENT}'::uuid AND name = '2026-04-03'")"
STATUS="$(psql_at "SELECT status FROM public.coach_client_links WHERE coach_id = '${COACH}'::uuid AND client_id = '${CLIENT}'::uuid")"
if [[ "${COUNT}" != "1" || "${STATUS}" != "ended" ]]; then
  echo "commit-wins end_coach_client_link expected 1 workout and ended link, got ${COUNT} ${STATUS}" >&2
  exit 1
fi

# end_coach_client_link wins.
relink
make_preview 'end-coach-wins' '2026-04-04'
hold_advisory
start_end coach /tmp/end-coach-wins-end
if ! wait_state "$(tuple_lock "${END_APP}" ForUpdate true)" "${end_pid}"; then
  echo "end_coach_client_link never held the link FOR UPDATE" >&2
  cat /tmp/end-coach-wins-end.err >&2 || true
  exit 1
fi
start_commit_expect_denied 'end-coach-wins' /tmp/end-coach-wins-commit
if ! wait_state "$(tuple_lock "${COMMIT_APP}" ForShare false)" "${commit_pid}"; then
  echo "commit did not wait on the link held by end_coach_client_link" >&2
  cat /tmp/end-coach-wins-commit.out /tmp/end-coach-wins-commit.err >&2 || true
  exit 1
fi
MID="$(psql_at "SELECT count(*) FROM public.workouts WHERE user_id = '${CLIENT}'::uuid AND name = '2026-04-04'")"
if [[ "${MID}" != "0" ]]; then
  echo "commit wrote before losing authority to end_coach_client_link" >&2
  exit 1
fi
sleep 1
assert_no_deadlock /tmp/end-coach-wins-commit.err /tmp/end-coach-wins-end.err
finish_pair end-coach-wins
COUNT="$(psql_at "SELECT count(*) FROM public.workouts WHERE user_id = '${CLIENT}'::uuid AND name = '2026-04-04'")"
if [[ "${COUNT}" != "0" ]]; then
  echo "end_coach_client_link win still wrote ${COUNT} workouts" >&2
  exit 1
fi

echo "p5.1 commit × end link: commit wins while active, end wins not_your_client, no client write after, no deadlock"
