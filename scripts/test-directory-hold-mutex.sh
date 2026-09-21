#!/usr/bin/env bash
# Two real Postgres sessions: restore_directory vs suspend_directory on two
# distinct reports of the same Coach. directory_suspended is the OR of
# active holds after both commits, independent of commit order.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

COACH='d44b0000-0000-4000-8000-000000000001'
REP_A='d44b0000-0000-4000-8000-000000000002'
REP_B='d44b0000-0000-4000-8000-000000000003'
REPORT_A='d44b0000-0000-4000-8000-0000000000aa'
REPORT_B='d44b0000-0000-4000-8000-0000000000bb'
ADV_A=872009210411
ADV_B=872009210412
HOLD_APP='prometheus-hold-mutex-hold'
T1_APP='prometheus-hold-mutex-t1'
T2_APP='prometheus-hold-mutex-t2'

psql_at() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "$1"
}

hold_pid=""
t1_pid=""
t2_pid=""
cleanup() {
  for pid in "${t2_pid}" "${t1_pid}" "${hold_pid}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
  psql "$DATABASE_URL" -X -c "
    SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
     WHERE application_name IN ('${HOLD_APP}', '${T1_APP}', '${T2_APP}')
       AND pid <> pg_backend_pid();
    DELETE FROM public.marketplace_moderation_actions
     WHERE report_id IN ('${REPORT_A}'::uuid, '${REPORT_B}'::uuid);
    DELETE FROM public.marketplace_reports WHERE id IN ('${REPORT_A}'::uuid, '${REPORT_B}'::uuid);
    DELETE FROM public.coach_profiles WHERE coach_id = '${COACH}'::uuid;
    DELETE FROM public.user_capabilities WHERE user_id IN ('${COACH}'::uuid, '${REP_A}'::uuid, '${REP_B}'::uuid);
    DELETE FROM public.user_profiles WHERE id IN ('${COACH}'::uuid, '${REP_A}'::uuid, '${REP_B}'::uuid);
    DELETE FROM public.user_roles WHERE user_id IN ('${COACH}'::uuid, '${REP_A}'::uuid, '${REP_B}'::uuid);
    DELETE FROM auth.users WHERE id IN ('${COACH}'::uuid, '${REP_A}'::uuid, '${REP_B}'::uuid);
  " >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_mutex_backends_gone() {
  local n="0"
  for _ in $(seq 1 50); do
    n="$(psql_at "SELECT count(*) FROM pg_stat_activity WHERE application_name IN ('${HOLD_APP}', '${T1_APP}', '${T2_APP}') AND pid <> pg_backend_pid()")"
    if [[ "${n}" == "0" ]]; then
      return 0
    fi
    sleep 0.1
  done
  echo "directory hold backends still live after terminate (${n})" >&2
  exit 1
}

seed_users() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users(id, email)
VALUES
  ('${COACH}'::uuid, 'p44-hold-coach@example.test'),
  ('${REP_A}'::uuid, 'p44-hold-a@example.test'),
  ('${REP_B}'::uuid, 'p44-hold-b@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles(user_id, role, coaching_role)
VALUES
  ('${COACH}'::uuid, 'free', 'coach'),
  ('${REP_A}'::uuid, 'free', 'none'),
  ('${REP_B}'::uuid, 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = EXCLUDED.coaching_role;
INSERT INTO public.user_capabilities(user_id, capability)
VALUES ('${COACH}'::uuid, 'coach')
ON CONFLICT DO NOTHING;
SQL
}

wipe_state() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "
    SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
     WHERE application_name IN ('${HOLD_APP}', '${T1_APP}', '${T2_APP}')
       AND pid <> pg_backend_pid();
  " >/dev/null
  wait_mutex_backends_gone
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
SET row_security = off;
DELETE FROM public.marketplace_moderation_actions
 WHERE report_id IN ('${REPORT_A}'::uuid, '${REPORT_B}'::uuid);
DELETE FROM public.marketplace_reports WHERE id IN ('${REPORT_A}'::uuid, '${REPORT_B}'::uuid);
DELETE FROM public.coach_account_closures WHERE coach_id = '${COACH}'::uuid;
DELETE FROM public.coach_profiles WHERE coach_id = '${COACH}'::uuid;
INSERT INTO public.user_capabilities(user_id, capability)
VALUES ('${COACH}'::uuid, 'coach')
ON CONFLICT DO NOTHING;
SQL
}

seed_reports() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.save_my_coach_profile('{"public_name":"Hold Coach","introduction":"Experience","method":"Weekly contact","offer":"Service terms","disciplines":["strength"],"languages":["en"],"formats":["online"]}');
COMMIT;
UPDATE public.coach_profiles
   SET published = true, accepting_clients = true, directory_suspended = true, updated_at = clock_timestamp()
 WHERE coach_id = '${COACH}'::uuid;
INSERT INTO public.marketplace_reports (
  id, reporter_id, target_user_id, reporter_ref, target_ref,
  subject_type, category, context, status, directory_hold_active
) VALUES
  (
    '${REPORT_A}'::uuid, '${REP_A}'::uuid, '${COACH}'::uuid,
    'user:${REP_A}', 'user:${COACH}',
    'profile', 'spam', 'Hold A is already active.', 'in_review', true
  ),
  (
    '${REPORT_B}'::uuid, '${REP_B}'::uuid, '${COACH}'::uuid,
    'user:${REP_B}', 'user:${COACH}',
    'behavior', 'harassment', 'Hold B starts inactive.', 'open', false
  );
SQL
}

hold_advisory() {
  local key="$1"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-hold-mutex-hold.out 2>&1 &
SET application_name = '${HOLD_APP}';
BEGIN;
SELECT pg_advisory_xact_lock(${key});
SELECT pg_sleep(60);
ROLLBACK;
SQL
  hold_pid=$!
  local got=0
  for _ in $(seq 1 50); do
    got="$(psql_at "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${HOLD_APP}' AND l.locktype = 'advisory' AND l.granted")"
    if [[ "${got}" != "0" ]]; then
      break
    fi
    sleep 0.1
  done
  if [[ "${got}" == "0" ]]; then
    echo "hold session never acquired advisory lock" >&2
    cat /tmp/prometheus-hold-mutex-hold.out >&2 || true
    exit 1
  fi
}

release_hold() {
  kill "${hold_pid}" 2>/dev/null || true
  psql "$DATABASE_URL" -X -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = '${HOLD_APP}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
  wait "${hold_pid}" 2>/dev/null || true
  hold_pid=""
}

wait_advisory_waiter() {
  local app="$1"
  local pid_var="$2"
  local waiting=0
  for _ in $(seq 1 50); do
    waiting="$(psql_at "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${app}' AND l.locktype = 'advisory' AND NOT l.granted")"
    if [[ "${waiting}" != "0" ]]; then
      echo 1
      return 0
    fi
    if ! kill -0 "${!pid_var}" 2>/dev/null; then
      break
    fi
    sleep 0.1
  done
  echo 0
}

wait_lock() {
  local app="$1"
  local pid_var="$2"
  local locked=0
  for _ in $(seq 1 80); do
    locked="$(psql_at "SELECT count(*) FROM pg_stat_activity WHERE application_name = '${app}' AND wait_event_type = 'Lock' AND wait_event = 'advisory'")"
    if [[ "${locked}" != "0" ]]; then
      echo 1
      return 0
    fi
    if ! kill -0 "${!pid_var}" 2>/dev/null; then
      break
    fi
    sleep 0.1
  done
  echo 0
}

run_pair() {
  local hold_key="$1"
  local t1_action="$2"
  local t1_report="$3"
  local t2_action="$4"
  local t2_report="$5"
  local label="$6"

  hold_advisory "${hold_key}"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-hold-mutex-t1.out 2>/tmp/prometheus-hold-mutex-t1.err &
SET application_name = '${T1_APP}';
BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT public.review_marketplace_report('${t1_report}'::uuid, '${t1_action}', '${label} t1');
SELECT pg_advisory_xact_lock(${hold_key});
COMMIT;
SQL
  t1_pid=$!

  if [[ "$(wait_advisory_waiter "${T1_APP}" t1_pid)" == "0" ]]; then
    echo "${label}: T1 never waited on advisory after hold mutation" >&2
    cat /tmp/prometheus-hold-mutex-t1.out /tmp/prometheus-hold-mutex-t1.err >&2 || true
    exit 1
  fi

  timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-hold-mutex-t2.out 2>/tmp/prometheus-hold-mutex-t2.err &
SET application_name = '${T2_APP}';
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SELECT public.review_marketplace_report('${t2_report}'::uuid, '${t2_action}', '${label} t2');
SQL
  t2_pid=$!

  if [[ "$(wait_lock "${T2_APP}" t2_pid)" == "0" ]]; then
    echo "${label}: T2 did not wait on directory hold advisory" >&2
    cat /tmp/prometheus-hold-mutex-t2.out /tmp/prometheus-hold-mutex-t2.err >&2 || true
    exit 1
  fi

  release_hold
  local t1_rc=0 t2_rc=0
  wait "${t1_pid}" || t1_rc=$?
  wait "${t2_pid}" || t2_rc=$?
  t1_pid=""
  t2_pid=""

  if [[ "${t1_rc}" -ne 0 ]]; then
    echo "${label}: T1 failed rc ${t1_rc}" >&2
    cat /tmp/prometheus-hold-mutex-t1.out /tmp/prometheus-hold-mutex-t1.err >&2 || true
    exit 1
  fi
  if [[ "${t2_rc}" -eq 124 ]]; then
    echo "${label}: T2 deadlocked or stalled" >&2
    cat /tmp/prometheus-hold-mutex-t2.out /tmp/prometheus-hold-mutex-t2.err >&2 || true
    exit 1
  fi
  if [[ "${t2_rc}" -ne 0 ]]; then
    echo "${label}: T2 failed rc ${t2_rc}" >&2
    cat /tmp/prometheus-hold-mutex-t2.out /tmp/prometheus-hold-mutex-t2.err >&2 || true
    exit 1
  fi

  local a_hold b_hold suspended
  a_hold="$(psql_at "SELECT directory_hold_active FROM public.marketplace_reports WHERE id = '${REPORT_A}'::uuid")"
  b_hold="$(psql_at "SELECT directory_hold_active FROM public.marketplace_reports WHERE id = '${REPORT_B}'::uuid")"
  suspended="$(psql_at "SELECT directory_suspended FROM public.coach_profiles WHERE coach_id = '${COACH}'::uuid")"
  if [[ "${a_hold}" != "f" ]]; then
    echo "${label}: report A hold_active=${a_hold}, expected false after restore" >&2
    exit 1
  fi
  if [[ "${b_hold}" != "t" ]]; then
    echo "${label}: report B hold_active=${b_hold}, expected true after suspend" >&2
    exit 1
  fi
  if [[ "${suspended}" != "t" ]]; then
    echo "${label}: lost update, directory_suspended=${suspended} while B hold is active" >&2
    exit 1
  fi
}

seed_users
wipe_state
seed_reports
run_pair "${ADV_A}" "restore_directory" "${REPORT_A}" "suspend_directory" "${REPORT_B}" "Cas 1 restore pendant B suspend"

wipe_state
seed_reports
run_pair "${ADV_B}" "suspend_directory" "${REPORT_B}" "restore_directory" "${REPORT_A}" "Cas 2 suspend pendant A restore"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SELECT public.review_marketplace_report('${REPORT_B}'::uuid, 'restore_directory', 'lift last hold');
SQL
last="$(psql_at "SELECT directory_suspended FROM public.coach_profiles WHERE coach_id = '${COACH}'::uuid")"
if [[ "${last}" != "f" ]]; then
  echo "last hold off left directory_suspended=${last}" >&2
  exit 1
fi

echo "directory hold mutex: restore×suspend two-session, remaining hold keeps directory_suspended, last hold off clears it"
