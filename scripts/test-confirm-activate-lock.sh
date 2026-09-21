#!/usr/bin/env bash
# Two real Postgres sessions: respond_coaching_request(..., 'confirmed')
# vs activate_coaching_relationship(coach, same client) must serialize on
# the Coach lifecycle mutex (class 20014501), not on user_roles first.
# Confirmed takes mutex → user_roles(client) → join_requests, then
# revalidates and activates. Waiters must show wait_event=advisory with
# classid=20014501. Timeout 20 is a deadlock/stall. Does not use dblink.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

COACH='e2eb0000-0000-4000-8000-000000000001'
CLIENT='e2eb0000-0000-4000-8000-000000000002'
REQUEST_KEY='e2eb0000-0000-4000-8000-000000000021'
REQUEST_ID=''
ADV_A=872009200163
ADV_B=872009200164
HOLD_APP='prometheus-confirm-act-hold'
T1_APP='prometheus-confirm-act-t1'
T2_APP='prometheus-confirm-act-t2'

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
    DELETE FROM public.coaching_relationship_consents
     WHERE coach_id = '${COACH}'::uuid OR client_id = '${CLIENT}'::uuid;
    DELETE FROM public.coach_join_requests
     WHERE coach_id = '${COACH}'::uuid OR client_id = '${CLIENT}'::uuid;
    DELETE FROM public.coach_account_closures WHERE coach_id = '${COACH}'::uuid;
    DELETE FROM public.coach_profiles WHERE coach_id = '${COACH}'::uuid;
    DELETE FROM public.coach_relationship_notices
     WHERE coach_id = '${COACH}'::uuid OR client_id = '${CLIENT}'::uuid;
    DELETE FROM public.client_tracking_config
     WHERE coach_id = '${COACH}'::uuid OR client_id = '${CLIENT}'::uuid;
    DELETE FROM public.coach_client_links
     WHERE coach_id = '${COACH}'::uuid OR client_id = '${CLIENT}'::uuid;
    DELETE FROM public.user_capabilities
     WHERE user_id IN ('${COACH}'::uuid, '${CLIENT}'::uuid);
    DELETE FROM public.user_profiles
     WHERE id IN ('${COACH}'::uuid, '${CLIENT}'::uuid);
    DELETE FROM public.user_roles
     WHERE user_id IN ('${COACH}'::uuid, '${CLIENT}'::uuid);
    DELETE FROM auth.users
     WHERE id IN ('${COACH}'::uuid, '${CLIENT}'::uuid);
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
  echo "confirm×activate backends still live after terminate (${n})" >&2
  exit 1
}

seed_users() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users(id, email)
VALUES
  ('${COACH}'::uuid, 'p3h-confact-coach@example.test'),
  ('${CLIENT}'::uuid, 'p3h-confact-client@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles(user_id, role, coaching_role)
VALUES
  ('${COACH}'::uuid, 'free', 'coach'),
  ('${CLIENT}'::uuid, 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = EXCLUDED.coaching_role;
INSERT INTO public.user_capabilities(user_id, capability)
VALUES ('${COACH}'::uuid, 'coach')
ON CONFLICT DO NOTHING;
UPDATE public.user_profiles
   SET timezone = 'America/Toronto'
 WHERE id IN ('${COACH}'::uuid, '${CLIENT}'::uuid);
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
DELETE FROM public.coaching_relationship_consents
 WHERE coach_id = '${COACH}'::uuid OR client_id = '${CLIENT}'::uuid;
DELETE FROM public.coach_join_requests
 WHERE coach_id = '${COACH}'::uuid OR client_id = '${CLIENT}'::uuid;
DELETE FROM public.coach_account_closures WHERE coach_id = '${COACH}'::uuid;
DELETE FROM public.coach_profiles WHERE coach_id = '${COACH}'::uuid;
DELETE FROM public.coach_relationship_notices
 WHERE coach_id = '${COACH}'::uuid OR client_id = '${CLIENT}'::uuid;
DELETE FROM public.client_tracking_config
 WHERE coach_id = '${COACH}'::uuid OR client_id = '${CLIENT}'::uuid;
DELETE FROM public.coach_client_links
 WHERE coach_id = '${COACH}'::uuid OR client_id = '${CLIENT}'::uuid;
UPDATE public.user_roles SET coaching_role = 'coach' WHERE user_id = '${COACH}'::uuid;
UPDATE public.user_roles SET coaching_role = 'none' WHERE user_id = '${CLIENT}'::uuid;
INSERT INTO public.user_capabilities(user_id, capability)
VALUES ('${COACH}'::uuid, 'coach')
ON CONFLICT DO NOTHING;
SQL
}

seed_marketplace_accepted() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.save_my_coach_profile('{"public_name":"Confirm Activate Coach","introduction":"Experience","method":"Weekly contact","offer":"Service terms","disciplines":["strength"],"languages":["en"],"formats":["online"]}');
COMMIT;
UPDATE public.coach_profiles
   SET published = true, accepting_clients = true, updated_at = clock_timestamp()
 WHERE coach_id = '${COACH}'::uuid;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT}","role":"authenticated"}', true);
SELECT public.request_coaching(
  '${COACH}'::uuid,
  'Client',
  'Please coach me',
  2,
  '${REQUEST_KEY}'::uuid
);
COMMIT;
SQL
  REQUEST_ID="$(psql_at "SELECT id FROM public.coach_join_requests WHERE client_id = '${CLIENT}'::uuid AND coach_id = '${COACH}'::uuid AND status = 'pending' ORDER BY created_at DESC LIMIT 1")"
  if [[ -z "${REQUEST_ID}" ]]; then
    echo "missing pending directory request" >&2
    exit 1
  fi
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.respond_coaching_request('${REQUEST_ID}'::uuid, 'accepted');
COMMIT;
SQL
  local st
  st="$(psql_at "SELECT status FROM public.coach_join_requests WHERE id = '${REQUEST_ID}'::uuid")"
  if [[ "${st}" != "coach_accepted" ]]; then
    echo "expected coach_accepted request, got ${st}" >&2
    exit 1
  fi
}

hold_advisory() {
  local key="$1"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-confirm-act-hold.out 2>&1 &
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
    cat /tmp/prometheus-confirm-act-hold.out >&2 || true
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
  for _ in $(seq 1 80); do
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

wait_coach_mutex_lock() {
  local app="$1"
  local pid_var="$2"
  local locked=0
  for _ in $(seq 1 80); do
    locked="$(psql_at "
      SELECT count(*)
        FROM pg_stat_activity a
        JOIN pg_locks l ON l.pid = a.pid
       WHERE a.application_name = '${app}'
         AND a.wait_event_type = 'Lock'
         AND a.wait_event = 'advisory'
         AND l.locktype = 'advisory'
         AND l.classid = 20014501
         AND NOT l.granted
    ")"
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

assert_single_active_relationship() {
  local case_name="$1"
  local links pair configs consents req_st client_links
  links="$(psql_at "SELECT count(*) FROM public.coach_client_links WHERE coach_id = '${COACH}'::uuid AND client_id = '${CLIENT}'::uuid AND status = 'active'")"
  if [[ "${links}" != "1" ]]; then
    echo "${case_name} expected exactly one active link, got ${links}" >&2
    exit 1
  fi
  pair="$(psql_at "SELECT count(*) FROM public.coach_client_links WHERE coach_id = '${COACH}'::uuid AND client_id = '${CLIENT}'::uuid")"
  if [[ "${pair}" != "1" ]]; then
    echo "${case_name} duplicated coach_client_links rows (${pair})" >&2
    exit 1
  fi
  client_links="$(psql_at "SELECT count(*) FROM public.coach_client_links WHERE client_id = '${CLIENT}'::uuid AND status = 'active'")"
  if [[ "${client_links}" != "1" ]]; then
    echo "${case_name} client has ${client_links} active links" >&2
    exit 1
  fi
  configs="$(psql_at "SELECT count(*) FROM public.client_tracking_config WHERE coach_id = '${COACH}'::uuid AND client_id = '${CLIENT}'::uuid")"
  if [[ "${configs}" != "1" ]]; then
    echo "${case_name} expected one tracking config, got ${configs}" >&2
    exit 1
  fi
  consents="$(psql_at "SELECT count(*) FROM public.coaching_relationship_consents WHERE coach_id = '${COACH}'::uuid AND client_id = '${CLIENT}'::uuid AND join_request_id = '${REQUEST_ID}'::uuid AND revoked_at IS NULL")"
  if [[ "${consents}" != "1" ]]; then
    echo "${case_name} expected one live consent, got ${consents}" >&2
    exit 1
  fi
  req_st="$(psql_at "SELECT status FROM public.coach_join_requests WHERE id = '${REQUEST_ID}'::uuid")"
  if [[ "${req_st}" != "athlete_confirmed" ]]; then
    echo "${case_name} request status ${req_st}, expected athlete_confirmed" >&2
    exit 1
  fi
}

seed_users
wipe_state
seed_marketplace_accepted

# ---------------------------------------------------------------------------
# Cas A: confirm wins — activate waits on Coach mutex, then upserts
# ---------------------------------------------------------------------------
hold_advisory "${ADV_A}"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-confirm-act-t1.out 2>/tmp/prometheus-confirm-act-t1.err &
SET application_name = '${T1_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT}","role":"authenticated"}', true);
SELECT public.respond_coaching_request('${REQUEST_ID}'::uuid, 'confirmed');
SELECT pg_advisory_xact_lock(${ADV_A});
COMMIT;
SQL
t1_pid=$!

if [[ "$(wait_advisory_waiter "${T1_APP}" t1_pid)" == "0" ]]; then
  echo "Cas A T1 confirm never waited on advisory after activating" >&2
  cat /tmp/prometheus-confirm-act-t1.out /tmp/prometheus-confirm-act-t1.err >&2 || true
  exit 1
fi

timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-confirm-act-t2.out 2>/tmp/prometheus-confirm-act-t2.err &
SET application_name = '${T2_APP}';
SELECT public.activate_coaching_relationship('${COACH}'::uuid, '${CLIENT}'::uuid);
SQL
t2_pid=$!

if [[ "$(wait_coach_mutex_lock "${T2_APP}" t2_pid)" == "0" ]]; then
  echo "Cas A activate did not wait on Coach lifecycle mutex (advisory class 20014501)" >&2
  cat /tmp/prometheus-confirm-act-t2.out /tmp/prometheus-confirm-act-t2.err >&2 || true
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
  echo "Cas A T1 confirm failed: rc ${t1_rc}" >&2
  cat /tmp/prometheus-confirm-act-t1.out /tmp/prometheus-confirm-act-t1.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 124 ]]; then
  echo "Cas A activate deadlocked or stalled" >&2
  cat /tmp/prometheus-confirm-act-t2.out /tmp/prometheus-confirm-act-t2.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -ne 0 ]]; then
  echo "Cas A activate failed: rc ${t2_rc}" >&2
  cat /tmp/prometheus-confirm-act-t2.out /tmp/prometheus-confirm-act-t2.err >&2 || true
  exit 1
fi

assert_single_active_relationship "Cas A"

# ---------------------------------------------------------------------------
# Cas B: activate wins — confirm waits on Coach mutex (not user_roles),
# then revalidates and confirms the already-active link
# ---------------------------------------------------------------------------
wipe_state
seed_marketplace_accepted

hold_advisory "${ADV_B}"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-confirm-act-t1.out 2>/tmp/prometheus-confirm-act-t1.err &
SET application_name = '${T1_APP}';
BEGIN;
SELECT public.activate_coaching_relationship('${COACH}'::uuid, '${CLIENT}'::uuid);
SELECT pg_advisory_xact_lock(${ADV_B});
COMMIT;
SQL
t1_pid=$!

if [[ "$(wait_advisory_waiter "${T1_APP}" t1_pid)" == "0" ]]; then
  echo "Cas B T1 activate never waited on advisory" >&2
  cat /tmp/prometheus-confirm-act-t1.out /tmp/prometheus-confirm-act-t1.err >&2 || true
  exit 1
fi

timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-confirm-act-t2.out 2>/tmp/prometheus-confirm-act-t2.err &
SET application_name = '${T2_APP}';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT}","role":"authenticated"}', false);
SELECT public.respond_coaching_request('${REQUEST_ID}'::uuid, 'confirmed');
SQL
t2_pid=$!

if [[ "$(wait_coach_mutex_lock "${T2_APP}" t2_pid)" == "0" ]]; then
  echo "Cas B confirm did not wait on Coach lifecycle mutex (advisory class 20014501)" >&2
  cat /tmp/prometheus-confirm-act-t2.out /tmp/prometheus-confirm-act-t2.err >&2 || true
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
  echo "Cas B T1 activate failed: rc ${t1_rc}" >&2
  cat /tmp/prometheus-confirm-act-t1.out /tmp/prometheus-confirm-act-t1.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 124 ]]; then
  echo "Cas B confirm deadlocked or stalled" >&2
  cat /tmp/prometheus-confirm-act-t2.out /tmp/prometheus-confirm-act-t2.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -ne 0 ]]; then
  echo "Cas B confirm failed after waiting on Coach mutex: rc ${t2_rc}" >&2
  cat /tmp/prometheus-confirm-act-t2.out /tmp/prometheus-confirm-act-t2.err >&2 || true
  exit 1
fi

assert_single_active_relationship "Cas B"

echo "confirm×activate lock order: Cas A confirm holds Coach mutex, Cas B activate holds Coach mutex; both serialize without deadlock; one active link"
