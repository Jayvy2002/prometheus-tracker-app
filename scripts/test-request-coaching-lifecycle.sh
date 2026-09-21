#!/usr/bin/env bash
# Two real Postgres sessions: request_coaching vs close_coach_account and
# vs suspend_directory. Waiters must show Lock waits. Does not use dblink.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

COACH='d4a10000-0000-4000-8000-000000000001'
CLIENT_A='d4a10000-0000-4000-8000-000000000002'
CLIENT_B='d4a10000-0000-4000-8000-000000000003'
CLIENT_C='d4a10000-0000-4000-8000-000000000004'
CLIENT_D='d4a10000-0000-4000-8000-000000000005'
REPORT='d4a10000-0000-4000-8000-0000000000aa'
KEY_A='d4a10000-0000-4000-8000-000000000021'
KEY_B='d4a10000-0000-4000-8000-000000000022'
KEY_C='d4a10000-0000-4000-8000-000000000023'
KEY_D='d4a10000-0000-4000-8000-000000000024'
ADV_A=872009210401
ADV_B=872009210402
ADV_C=872009210403
ADV_D=872009210404
HOLD_APP='prometheus-req-life-hold'
T1_APP='prometheus-req-life-t1'
T2_APP='prometheus-req-life-t2'

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
     WHERE report_id IN (SELECT id FROM public.marketplace_reports WHERE target_user_id = '${COACH}'::uuid);
    DELETE FROM public.marketplace_reports WHERE target_user_id = '${COACH}'::uuid OR reporter_id IN ('${CLIENT_A}'::uuid, '${CLIENT_B}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_D}'::uuid);
    DELETE FROM public.coach_messages WHERE coach_id = '${COACH}'::uuid;
    DELETE FROM public.coach_join_requests WHERE coach_id = '${COACH}'::uuid;
    DELETE FROM public.coach_account_closures WHERE coach_id = '${COACH}'::uuid;
    DELETE FROM public.coach_profiles WHERE coach_id = '${COACH}'::uuid;
    DELETE FROM public.user_capabilities WHERE user_id IN ('${COACH}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_B}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_D}'::uuid);
    DELETE FROM public.user_profiles WHERE id IN ('${COACH}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_B}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_D}'::uuid);
    DELETE FROM public.user_roles WHERE user_id IN ('${COACH}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_B}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_D}'::uuid);
    DELETE FROM auth.users WHERE id IN ('${COACH}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_B}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_D}'::uuid);
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
  echo "request lifecycle backends still live after terminate (${n})" >&2
  exit 1
}

seed_users() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users(id, email)
VALUES
  ('${COACH}'::uuid, 'p4-req-coach@example.test'),
  ('${CLIENT_A}'::uuid, 'p4-req-a@example.test'),
  ('${CLIENT_B}'::uuid, 'p4-req-b@example.test'),
  ('${CLIENT_C}'::uuid, 'p4-req-c@example.test'),
  ('${CLIENT_D}'::uuid, 'p4-req-d@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles(user_id, role, coaching_role)
VALUES
  ('${COACH}'::uuid, 'free', 'coach'),
  ('${CLIENT_A}'::uuid, 'free', 'none'),
  ('${CLIENT_B}'::uuid, 'free', 'none'),
  ('${CLIENT_C}'::uuid, 'free', 'none'),
  ('${CLIENT_D}'::uuid, 'free', 'none')
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
 WHERE report_id IN (SELECT id FROM public.marketplace_reports WHERE target_user_id = '${COACH}'::uuid);
DELETE FROM public.marketplace_reports
 WHERE target_user_id = '${COACH}'::uuid
    OR reporter_id IN ('${CLIENT_A}'::uuid, '${CLIENT_B}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_D}'::uuid);
DELETE FROM public.coach_messages WHERE coach_id = '${COACH}'::uuid;
DELETE FROM public.coach_join_requests WHERE coach_id = '${COACH}'::uuid;
DELETE FROM public.coach_account_closures WHERE coach_id = '${COACH}'::uuid;
DELETE FROM public.coach_client_links WHERE coach_id = '${COACH}'::uuid;
DELETE FROM public.coach_profiles WHERE coach_id = '${COACH}'::uuid;
INSERT INTO public.user_capabilities(user_id, capability)
VALUES ('${COACH}'::uuid, 'coach')
ON CONFLICT DO NOTHING;
SQL
}

seed_published_coach() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.save_my_coach_profile('{"public_name":"Request Coach","introduction":"Experience","method":"Weekly contact","offer":"Service terms","disciplines":["strength"],"languages":["en"],"formats":["online"]}');
COMMIT;
UPDATE public.coach_profiles
   SET published = true, accepting_clients = true, directory_suspended = false, updated_at = clock_timestamp()
 WHERE coach_id = '${COACH}'::uuid;
SQL
}

seed_open_report() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO public.marketplace_reports (
  id, reporter_id, target_user_id, reporter_ref, target_ref,
  subject_type, category, context, status, directory_hold_active
) VALUES (
  '${REPORT}'::uuid,
  '${CLIENT_A}'::uuid,
  '${COACH}'::uuid,
  'user:${CLIENT_A}',
  'user:${COACH}',
  'profile',
  'spam',
  'Fixture hold for request vs suspend.',
  'open',
  false
);
SQL
}

hold_advisory() {
  local key="$1"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-req-life-hold.out 2>&1 &
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
    cat /tmp/prometheus-req-life-hold.out >&2 || true
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
    locked="$(psql_at "SELECT count(*) FROM pg_stat_activity WHERE application_name = '${app}' AND wait_event_type = 'Lock'")"
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

seed_users
wipe_state
seed_published_coach

# ---------------------------------------------------------------------------
# request_coaching × close_coach_account — request gagne
# ---------------------------------------------------------------------------
hold_advisory "${ADV_A}"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-req-life-t1.out 2>/tmp/prometheus-req-life-t1.err &
SET application_name = '${T1_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT_A}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT_A}","role":"authenticated"}', true);
SELECT public.request_coaching(
  '${COACH}'::uuid,
  'Athlete A',
  'Please coach me',
  2,
  '${KEY_A}'::uuid
);
SELECT pg_advisory_xact_lock(${ADV_A});
COMMIT;
SQL
t1_pid=$!

if [[ "$(wait_advisory_waiter "${T1_APP}" t1_pid)" == "0" ]]; then
  echo "Cas A request never waited on advisory after INSERT" >&2
  cat /tmp/prometheus-req-life-t1.out /tmp/prometheus-req-life-t1.err >&2 || true
  exit 1
fi

timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-req-life-t2.out 2>/tmp/prometheus-req-life-t2.err &
SET application_name = '${T2_APP}';
SELECT public.close_coach_account('${COACH}'::uuid);
SQL
t2_pid=$!

if [[ "$(wait_lock "${T2_APP}" t2_pid)" == "0" ]]; then
  echo "Cas A close_coach_account did not wait on Coach lifecycle mutex" >&2
  cat /tmp/prometheus-req-life-t2.out /tmp/prometheus-req-life-t2.err >&2 || true
  exit 1
fi

release_hold
t1_rc=0
t2_rc=0
wait "${t1_pid}" || t1_rc=$?
wait "${t2_pid}" || t2_rc=$?
t1_pid=""
t2_pid=""

if [[ "${t1_rc}" -ne 0 ]]; then
  echo "Cas A request_coaching failed: rc ${t1_rc}" >&2
  cat /tmp/prometheus-req-life-t1.out /tmp/prometheus-req-life-t1.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 124 ]]; then
  echo "Cas A close_coach_account deadlocked or stalled" >&2
  cat /tmp/prometheus-req-life-t2.out /tmp/prometheus-req-life-t2.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -ne 0 ]]; then
  echo "Cas A close_coach_account failed: rc ${t2_rc}" >&2
  cat /tmp/prometheus-req-life-t2.out /tmp/prometheus-req-life-t2.err >&2 || true
  exit 1
fi

req_st="$(psql_at "SELECT status FROM public.coach_join_requests WHERE client_id = '${CLIENT_A}'::uuid AND client_request_id = '${KEY_A}'::uuid")"
if [[ "${req_st}" != "withdrawn" ]]; then
  echo "Cas A request that won was not withdrawn by close (${req_st})" >&2
  exit 1
fi
closed="$(psql_at "SELECT count(*) FROM public.coach_account_closures WHERE coach_id = '${COACH}'::uuid")"
if [[ "${closed}" != "1" ]]; then
  echo "Cas A missing coach_account_closures stamp" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# request_coaching × close_coach_account — close gagne
# ---------------------------------------------------------------------------
wipe_state
seed_published_coach

hold_advisory "${ADV_B}"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-req-life-t1.out 2>/tmp/prometheus-req-life-t1.err &
SET application_name = '${T1_APP}';
BEGIN;
SELECT public.close_coach_account('${COACH}'::uuid);
SELECT pg_advisory_xact_lock(${ADV_B});
COMMIT;
SQL
t1_pid=$!

if [[ "$(wait_advisory_waiter "${T1_APP}" t1_pid)" == "0" ]]; then
  echo "Cas B close never waited on advisory" >&2
  cat /tmp/prometheus-req-life-t1.out /tmp/prometheus-req-life-t1.err >&2 || true
  exit 1
fi

timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-req-life-t2.out 2>/tmp/prometheus-req-life-t2.err &
SET application_name = '${T2_APP}';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT_B}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT_B}","role":"authenticated"}', false);
SELECT public.request_coaching(
  '${COACH}'::uuid,
  'Athlete B',
  'After close',
  2,
  '${KEY_B}'::uuid
);
SQL
t2_pid=$!

if [[ "$(wait_lock "${T2_APP}" t2_pid)" == "0" ]]; then
  echo "Cas B request_coaching did not wait on Coach lifecycle mutex" >&2
  cat /tmp/prometheus-req-life-t2.out /tmp/prometheus-req-life-t2.err >&2 || true
  exit 1
fi

release_hold
t1_rc=0
t2_rc=0
wait "${t1_pid}" || t1_rc=$?
wait "${t2_pid}" || t2_rc=$?
t1_pid=""
t2_pid=""

if [[ "${t1_rc}" -ne 0 ]]; then
  echo "Cas B close failed: rc ${t1_rc}" >&2
  cat /tmp/prometheus-req-life-t1.out /tmp/prometheus-req-life-t1.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 124 ]]; then
  echo "Cas B request_coaching deadlocked or stalled" >&2
  cat /tmp/prometheus-req-life-t2.out /tmp/prometheus-req-life-t2.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 0 ]]; then
  echo "Cas B request_coaching succeeded after close_coach_account" >&2
  cat /tmp/prometheus-req-life-t2.out /tmp/prometheus-req-life-t2.err >&2 || true
  exit 1
fi
if ! grep -Eqi 'coach_unavailable' /tmp/prometheus-req-life-t2.err /tmp/prometheus-req-life-t2.out; then
  echo "Cas B request failed for the wrong reason" >&2
  cat /tmp/prometheus-req-life-t2.out /tmp/prometheus-req-life-t2.err >&2 || true
  exit 1
fi
new_req="$(psql_at "SELECT count(*) FROM public.coach_join_requests WHERE client_id = '${CLIENT_B}'::uuid AND client_request_id = '${KEY_B}'::uuid")"
if [[ "${new_req}" != "0" ]]; then
  echo "Cas B created a request after close" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# request_coaching × suspend_directory — request gagne
# ---------------------------------------------------------------------------
wipe_state
seed_published_coach
seed_open_report

hold_advisory "${ADV_C}"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-req-life-t1.out 2>/tmp/prometheus-req-life-t1.err &
SET application_name = '${T1_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT_C}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT_C}","role":"authenticated"}', true);
SELECT public.request_coaching(
  '${COACH}'::uuid,
  'Athlete C',
  'In flight',
  2,
  '${KEY_C}'::uuid
);
SELECT pg_advisory_xact_lock(${ADV_C});
COMMIT;
SQL
t1_pid=$!

if [[ "$(wait_advisory_waiter "${T1_APP}" t1_pid)" == "0" ]]; then
  echo "Cas C request never waited on advisory after INSERT" >&2
  cat /tmp/prometheus-req-life-t1.out /tmp/prometheus-req-life-t1.err >&2 || true
  exit 1
fi

timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-req-life-t2.out 2>/tmp/prometheus-req-life-t2.err &
SET application_name = '${T2_APP}';
BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT public.review_marketplace_report('${REPORT}'::uuid, 'suspend_directory', 'visibility hold');
COMMIT;
SQL
t2_pid=$!

if [[ "$(wait_lock "${T2_APP}" t2_pid)" == "0" ]]; then
  echo "Cas C suspend_directory did not wait on the request profile lock" >&2
  cat /tmp/prometheus-req-life-t2.out /tmp/prometheus-req-life-t2.err >&2 || true
  exit 1
fi

release_hold
t1_rc=0
t2_rc=0
wait "${t1_pid}" || t1_rc=$?
wait "${t2_pid}" || t2_rc=$?
t1_pid=""
t2_pid=""

if [[ "${t1_rc}" -ne 0 ]]; then
  echo "Cas C request_coaching failed: rc ${t1_rc}" >&2
  cat /tmp/prometheus-req-life-t1.out /tmp/prometheus-req-life-t1.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 124 ]]; then
  echo "Cas C suspend deadlocked or stalled" >&2
  cat /tmp/prometheus-req-life-t2.out /tmp/prometheus-req-life-t2.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -ne 0 ]]; then
  echo "Cas C suspend failed: rc ${t2_rc}" >&2
  cat /tmp/prometheus-req-life-t2.out /tmp/prometheus-req-life-t2.err >&2 || true
  exit 1
fi
req_st="$(psql_at "SELECT status FROM public.coach_join_requests WHERE client_id = '${CLIENT_C}'::uuid AND client_request_id = '${KEY_C}'::uuid")"
if [[ "${req_st}" != "pending" ]]; then
  echo "Cas C in-flight request was not kept pending (${req_st})" >&2
  exit 1
fi
hold_active="$(psql_at "SELECT directory_hold_active FROM public.marketplace_reports WHERE id = '${REPORT}'::uuid")"
suspended="$(psql_at "SELECT directory_suspended FROM public.coach_profiles WHERE coach_id = '${COACH}'::uuid")"
if [[ "${hold_active}" != "t" || "${suspended}" != "t" ]]; then
  echo "Cas C directory was not suspended after the request won (hold=${hold_active} suspended=${suspended})" >&2
  cat /tmp/prometheus-req-life-t2.out /tmp/prometheus-req-life-t2.err >&2 || true
  exit 1
fi

# ---------------------------------------------------------------------------
# request_coaching × suspend_directory — suspension gagne
# ---------------------------------------------------------------------------
wipe_state
seed_published_coach
seed_open_report

hold_advisory "${ADV_D}"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-req-life-t1.out 2>/tmp/prometheus-req-life-t1.err &
SET application_name = '${T1_APP}';
BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT public.review_marketplace_report('${REPORT}'::uuid, 'suspend_directory', 'visibility hold');
SELECT pg_advisory_xact_lock(${ADV_D});
COMMIT;
SQL
t1_pid=$!

if [[ "$(wait_advisory_waiter "${T1_APP}" t1_pid)" == "0" ]]; then
  echo "Cas D suspend never waited on advisory" >&2
  cat /tmp/prometheus-req-life-t1.out /tmp/prometheus-req-life-t1.err >&2 || true
  exit 1
fi

timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-req-life-t2.out 2>/tmp/prometheus-req-life-t2.err &
SET application_name = '${T2_APP}';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT_D}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT_D}","role":"authenticated"}', false);
SELECT public.request_coaching(
  '${COACH}'::uuid,
  'Athlete D',
  'After suspend',
  2,
  '${KEY_D}'::uuid
);
SQL
t2_pid=$!

if [[ "$(wait_lock "${T2_APP}" t2_pid)" == "0" ]]; then
  echo "Cas D request_coaching did not wait/revalidate against suspend" >&2
  cat /tmp/prometheus-req-life-t2.out /tmp/prometheus-req-life-t2.err >&2 || true
  exit 1
fi

release_hold
t1_rc=0
t2_rc=0
wait "${t1_pid}" || t1_rc=$?
wait "${t2_pid}" || t2_rc=$?
t1_pid=""
t2_pid=""

if [[ "${t1_rc}" -ne 0 ]]; then
  echo "Cas D suspend failed: rc ${t1_rc}" >&2
  cat /tmp/prometheus-req-life-t1.out /tmp/prometheus-req-life-t1.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 124 ]]; then
  echo "Cas D request deadlocked or stalled" >&2
  cat /tmp/prometheus-req-life-t2.out /tmp/prometheus-req-life-t2.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 0 ]]; then
  echo "Cas D request_coaching succeeded after suspend_directory" >&2
  cat /tmp/prometheus-req-life-t2.out /tmp/prometheus-req-life-t2.err >&2 || true
  exit 1
fi
if ! grep -Eqi 'coach_unavailable' /tmp/prometheus-req-life-t2.err /tmp/prometheus-req-life-t2.out; then
  echo "Cas D request failed for the wrong reason" >&2
  cat /tmp/prometheus-req-life-t2.out /tmp/prometheus-req-life-t2.err >&2 || true
  exit 1
fi
new_req="$(psql_at "SELECT count(*) FROM public.coach_join_requests WHERE client_id = '${CLIENT_D}'::uuid AND client_request_id = '${KEY_D}'::uuid")"
if [[ "${new_req}" != "0" ]]; then
  echo "Cas D created a request after suspend" >&2
  exit 1
fi

echo "request_coaching × close_coach_account / request_coaching × suspend_directory: two-session serialize without stale discovery"
