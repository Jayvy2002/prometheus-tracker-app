#!/usr/bin/env bash
# Two real Postgres sessions: Coach lifecycle mutex must serialize
# close_coach_account vs activate/confirm so a new client C cannot sneak
# past close, and activation after close cannot recreate an active link.
# Waiters must show wait_event=advisory. Does not use dblink.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

COACH='d1eb0000-0000-4000-8000-000000000001'
OTHER='d1eb0000-0000-4000-8000-000000000002'
CLIENT_A='d1eb0000-0000-4000-8000-000000000004'
CLIENT_C='d1eb0000-0000-4000-8000-000000000005'
CLIENT_INV='d1eb0000-0000-4000-8000-000000000006'
CLIENT_X='d1eb0000-0000-4000-8000-000000000007'
PROGRAM_A='d1eb0000-0000-4000-8000-000000000010'
PROGRAM_C='d1eb0000-0000-4000-8000-000000000012'
LINK_A='d1eb0000-0000-4000-8000-0000000000aa'
LINK_SELF='d1eb0000-0000-4000-8000-0000000000ab'
REQUEST_C=''
INVITE='d1eb0000-0000-4000-8000-000000000030'
REQUEST_KEY='d1eb0000-0000-4000-8000-000000000021'
ADV_A=872009200161
ADV_B=872009200162
HOLD_APP='prometheus-coach-life-hold'
T1_APP='prometheus-coach-life-t1'
T2_APP='prometheus-coach-life-t2'
SCOPES="ARRAY['checkins','messages','nutrition','profile','program','progress_photos','questionnaire','workouts']"

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
    DELETE FROM public.workouts
     WHERE user_id IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid)
        OR program_id IN (
          SELECT id FROM public.programs
           WHERE owner_id IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid)
        );
    DELETE FROM public.program_assignments
     WHERE client_id IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid)
        OR program_id IN (
          SELECT id FROM public.programs
           WHERE owner_id IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid)
        );
    DELETE FROM public.program_revisions
     WHERE program_id IN (
       SELECT id FROM public.programs
        WHERE owner_id IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid)
     );
    DELETE FROM public.programs
     WHERE owner_id IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid);
    DELETE FROM public.coaching_relationship_consents
     WHERE coach_id IN ('${COACH}'::uuid, '${OTHER}'::uuid)
        OR client_id IN ('${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid, '${COACH}'::uuid);
    DELETE FROM public.coach_join_requests
     WHERE coach_id IN ('${COACH}'::uuid, '${OTHER}'::uuid)
        OR client_id IN ('${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid);
    DELETE FROM public.coach_invites WHERE coach_id IN ('${COACH}'::uuid, '${OTHER}'::uuid);
    DELETE FROM public.coach_account_closures WHERE coach_id IN ('${COACH}'::uuid, '${OTHER}'::uuid);
    DELETE FROM public.coach_profiles WHERE coach_id IN ('${COACH}'::uuid, '${OTHER}'::uuid);
    DELETE FROM public.coach_relationship_notices
     WHERE coach_id IN ('${COACH}'::uuid, '${OTHER}'::uuid)
        OR client_id IN ('${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid, '${COACH}'::uuid);
    DELETE FROM public.client_tracking_config
     WHERE coach_id IN ('${COACH}'::uuid, '${OTHER}'::uuid)
        OR client_id IN ('${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid, '${COACH}'::uuid);
    DELETE FROM public.coach_client_links
     WHERE coach_id IN ('${COACH}'::uuid, '${OTHER}'::uuid)
        OR client_id IN ('${COACH}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid);
    DELETE FROM public.user_capabilities
     WHERE user_id IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid);
    DELETE FROM public.user_profiles
     WHERE id IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid);
    DELETE FROM public.user_roles
     WHERE user_id IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid);
    DELETE FROM auth.users
     WHERE id IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid);
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
  echo "coach lifecycle backends still live after terminate (${n})" >&2
  exit 1
}

seed_users() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users(id, email)
VALUES
  ('${COACH}'::uuid, 'p3h-life-coach@example.test'),
  ('${OTHER}'::uuid, 'p3h-life-other@example.test'),
  ('${CLIENT_A}'::uuid, 'p3h-life-a@example.test'),
  ('${CLIENT_C}'::uuid, 'p3h-life-c@example.test'),
  ('${CLIENT_INV}'::uuid, 'p3h-life-inv@example.test'),
  ('${CLIENT_X}'::uuid, 'p3h-life-x@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles(user_id, role, coaching_role)
VALUES
  ('${COACH}'::uuid, 'free', 'coach'),
  ('${OTHER}'::uuid, 'free', 'coach'),
  ('${CLIENT_A}'::uuid, 'free', 'none'),
  ('${CLIENT_C}'::uuid, 'free', 'none'),
  ('${CLIENT_INV}'::uuid, 'free', 'none'),
  ('${CLIENT_X}'::uuid, 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = EXCLUDED.coaching_role;
INSERT INTO public.user_capabilities(user_id, capability)
VALUES ('${COACH}'::uuid, 'coach'), ('${OTHER}'::uuid, 'coach')
ON CONFLICT DO NOTHING;
UPDATE public.user_profiles
   SET timezone = 'America/Toronto'
 WHERE id IN (
   '${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid,
   '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid
 );
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
DELETE FROM public.workouts
 WHERE user_id IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid)
    OR program_id IN (
      SELECT id FROM public.programs
       WHERE owner_id IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid)
    );
DELETE FROM public.program_assignments
 WHERE client_id IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid)
    OR assigned_by IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid)
    OR program_id IN (
      SELECT id FROM public.programs
       WHERE owner_id IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid)
    );
DELETE FROM public.program_revisions
 WHERE program_id IN (
   SELECT id FROM public.programs
    WHERE owner_id IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid)
 );
DELETE FROM public.programs
 WHERE owner_id IN ('${COACH}'::uuid, '${OTHER}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid);
DELETE FROM public.coaching_relationship_consents
 WHERE coach_id IN ('${COACH}'::uuid, '${OTHER}'::uuid)
    OR client_id IN ('${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid, '${COACH}'::uuid);
DELETE FROM public.coach_join_requests
 WHERE coach_id IN ('${COACH}'::uuid, '${OTHER}'::uuid)
    OR client_id IN ('${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid);
DELETE FROM public.coach_invites WHERE coach_id IN ('${COACH}'::uuid, '${OTHER}'::uuid);
DELETE FROM public.coach_account_closures WHERE coach_id IN ('${COACH}'::uuid, '${OTHER}'::uuid);
DELETE FROM public.coach_profiles WHERE coach_id IN ('${COACH}'::uuid, '${OTHER}'::uuid);
DELETE FROM public.coach_relationship_notices
 WHERE coach_id IN ('${COACH}'::uuid, '${OTHER}'::uuid)
    OR client_id IN ('${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid, '${COACH}'::uuid);
DELETE FROM public.client_tracking_config
 WHERE coach_id IN ('${COACH}'::uuid, '${OTHER}'::uuid)
    OR client_id IN ('${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid, '${COACH}'::uuid);
DELETE FROM public.coach_client_links
 WHERE coach_id IN ('${COACH}'::uuid, '${OTHER}'::uuid)
    OR client_id IN ('${COACH}'::uuid, '${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid);
INSERT INTO public.coach_client_links(id, coach_id, client_id, status)
VALUES
  ('${LINK_A}'::uuid, '${COACH}'::uuid, '${CLIENT_A}'::uuid, 'active'),
  ('${LINK_SELF}'::uuid, '${OTHER}'::uuid, '${COACH}'::uuid, 'active')
ON CONFLICT (id) DO UPDATE SET status = 'active', coach_id = EXCLUDED.coach_id, client_id = EXCLUDED.client_id;
UPDATE public.user_roles SET coaching_role = 'coach' WHERE user_id IN ('${COACH}'::uuid, '${OTHER}'::uuid);
UPDATE public.user_roles SET coaching_role = 'none' WHERE user_id IN ('${CLIENT_A}'::uuid, '${CLIENT_C}'::uuid, '${CLIENT_INV}'::uuid, '${CLIENT_X}'::uuid);
INSERT INTO public.user_capabilities(user_id, capability)
VALUES ('${COACH}'::uuid, 'coach'), ('${OTHER}'::uuid, 'coach')
ON CONFLICT DO NOTHING;
SQL
}

seed_library_program() {
  local program="$1"
  local name="$2"
  local assign_to="${3:-}"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO public.programs(id, owner_id, name, description, duration_weeks)
VALUES ('${program}'::uuid, '${COACH}'::uuid, '${name}', 'lifecycle library', 8);
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.save_program(
  '${program}'::uuid,
  '${name}',
  'lifecycle library',
  8,
  '[{"weekday":1,"name":"Push A","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
  null
);
SELECT public.activate_program_version(
  '${program}'::uuid,
  public.save_program_version(
    '${program}'::uuid,
    '${name}',
    'lifecycle library',
    8,
    '[{"weekday":1,"name":"Push A","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
    null
  )
);
$([ -n "${assign_to}" ] && echo "SELECT public.assign_program_secure('${program}'::uuid, '${assign_to}'::uuid, CURRENT_DATE);")
COMMIT;
SQL
  if [[ "$(psql_at "SELECT active_revision_no FROM public.programs WHERE id = '${program}'::uuid")" == "" ]]; then
    echo "seed program ${program} missing active_revision_no" >&2
    exit 1
  fi
}

seed_marketplace_and_pending_c() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.save_my_coach_profile('{"public_name":"Lifecycle Coach","introduction":"Experience","method":"Weekly contact","offer":"Service terms","disciplines":["strength"],"languages":["en"],"formats":["online"]}');
COMMIT;
UPDATE public.coach_profiles
   SET published = true, accepting_clients = true, updated_at = clock_timestamp()
 WHERE coach_id = '${COACH}'::uuid;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT_C}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT_C}","role":"authenticated"}', true);
SELECT public.request_coaching(
  '${COACH}'::uuid,
  'Client C',
  'Please coach me',
  2,
  '${REQUEST_KEY}'::uuid
);
COMMIT;
SQL
  REQUEST_C="$(psql_at "SELECT id FROM public.coach_join_requests WHERE client_id = '${CLIENT_C}'::uuid AND coach_id = '${COACH}'::uuid AND status = 'pending' ORDER BY created_at DESC LIMIT 1")"
  if [[ -z "${REQUEST_C}" ]]; then
    echo "missing pending directory request for C" >&2
    exit 1
  fi
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.respond_coaching_request('${REQUEST_C}'::uuid, 'accepted');
COMMIT;
INSERT INTO public.coach_invites(id, coach_id, token, expires_at, max_uses)
VALUES ('${INVITE}'::uuid, '${COACH}'::uuid, 'p3h-life-invite', now() + interval '1 hour', 1)
ON CONFLICT (id) DO UPDATE SET use_count = 0, expires_at = now() + interval '1 hour';
SQL
  local st
  st="$(psql_at "SELECT status FROM public.coach_join_requests WHERE id = '${REQUEST_C}'::uuid")"
  if [[ "${st}" != "coach_accepted" ]]; then
    echo "expected coach_accepted request for C, got ${st}" >&2
    exit 1
  fi
}

hold_advisory() {
  local key="$1"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-coach-life-hold.out 2>&1 &
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
    cat /tmp/prometheus-coach-life-hold.out >&2 || true
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

wait_mutex_lock() {
  local app="$1"
  local pid_var="$2"
  local locked=0
  for _ in $(seq 1 50); do
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

seed_users
wipe_state
seed_library_program "${PROGRAM_A}" "Life A" "${CLIENT_A}"
seed_library_program "${PROGRAM_C}" "Life C" ""

# ---------------------------------------------------------------------------
# Cas A: activation wins — close must include C
# ---------------------------------------------------------------------------
hold_advisory "${ADV_A}"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-coach-life-t1.out 2>/tmp/prometheus-coach-life-t1.err &
SET application_name = '${T1_APP}';
BEGIN;
SELECT public.activate_coaching_relationship('${COACH}'::uuid, '${CLIENT_C}'::uuid);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.assign_program_secure('${PROGRAM_C}'::uuid, '${CLIENT_C}'::uuid, CURRENT_DATE);
SELECT pg_advisory_xact_lock(${ADV_A});
COMMIT;
SQL
t1_pid=$!

if [[ "$(wait_advisory_waiter "${T1_APP}" t1_pid)" == "0" ]]; then
  echo "Cas A T1 activate never waited on advisory after assigning C" >&2
  cat /tmp/prometheus-coach-life-t1.out /tmp/prometheus-coach-life-t1.err >&2 || true
  exit 1
fi

timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-coach-life-t2.out 2>/tmp/prometheus-coach-life-t2.err &
SET application_name = '${T2_APP}';
SELECT public.close_coach_account('${COACH}'::uuid);
SQL
t2_pid=$!

if [[ "$(wait_mutex_lock "${T2_APP}" t2_pid)" == "0" ]]; then
  echo "Cas A close_coach_account did not wait on Coach lifecycle mutex (advisory)" >&2
  cat /tmp/prometheus-coach-life-t2.out /tmp/prometheus-coach-life-t2.err >&2 || true
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
  echo "Cas A T1 activate/assign failed: rc ${t1_rc}" >&2
  cat /tmp/prometheus-coach-life-t1.out /tmp/prometheus-coach-life-t1.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 124 ]]; then
  echo "Cas A close_coach_account deadlocked or stalled" >&2
  cat /tmp/prometheus-coach-life-t2.out /tmp/prometheus-coach-life-t2.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -ne 0 ]]; then
  echo "Cas A close_coach_account failed: rc ${t2_rc}" >&2
  cat /tmp/prometheus-coach-life-t2.out /tmp/prometheus-coach-life-t2.err >&2 || true
  exit 1
fi

active_links="$(psql_at "SELECT count(*) FROM public.coach_client_links WHERE coach_id = '${COACH}'::uuid AND status = 'active'")"
if [[ "${active_links}" != "0" ]]; then
  echo "Cas A left an active Coach link (${active_links})" >&2
  exit 1
fi
self_link="$(psql_at "SELECT count(*) FROM public.coach_client_links WHERE id = '${LINK_SELF}'::uuid AND status = 'active'")"
if [[ "${self_link}" != "1" ]]; then
  echo "Cas A ended the Coach-as-client link with OTHER" >&2
  exit 1
fi
c_fork="$(psql_at "
  SELECT count(*)
    FROM public.program_assignments pa
    JOIN public.programs p ON p.id = pa.program_id
   WHERE pa.client_id = '${CLIENT_C}'::uuid
     AND p.owner_id = '${CLIENT_C}'::uuid
     AND pa.status = 'paused'
     AND pa.frozen_revision_no IS NOT NULL
")"
if [[ "${c_fork}" != "1" ]]; then
  echo "Cas A C was not transferred through close (forks=${c_fork})" >&2
  cat /tmp/prometheus-coach-life-t1.out /tmp/prometheus-coach-life-t1.err >&2 || true
  cat /tmp/prometheus-coach-life-t2.out /tmp/prometheus-coach-life-t2.err >&2 || true
  exit 1
fi
a_fork="$(psql_at "
  SELECT count(*)
    FROM public.program_assignments pa
    JOIN public.programs p ON p.id = pa.program_id
   WHERE pa.client_id = '${CLIENT_A}'::uuid
     AND p.owner_id = '${CLIENT_A}'::uuid
     AND pa.status = 'paused'
     AND pa.frozen_revision_no IS NOT NULL
")"
if [[ "${a_fork}" != "1" ]]; then
  echo "Cas A A was not transferred through close (forks=${a_fork})" >&2
  exit 1
fi
closed="$(psql_at "SELECT count(*) FROM public.coach_account_closures WHERE coach_id = '${COACH}'::uuid")"
if [[ "${closed}" != "1" ]]; then
  echo "Cas A missing coach_account_closures stamp" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Cas B: close wins — confirm/activate/invite must fail after mutex
# ---------------------------------------------------------------------------
wipe_state
seed_library_program "${PROGRAM_A}" "Life A" "${CLIENT_A}"
seed_library_program "${PROGRAM_C}" "Life C" ""
seed_marketplace_and_pending_c

hold_advisory "${ADV_B}"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-coach-life-t1.out 2>/tmp/prometheus-coach-life-t1.err &
SET application_name = '${T1_APP}';
BEGIN;
SELECT public.close_coach_account('${COACH}'::uuid);
SELECT pg_advisory_xact_lock(${ADV_B});
COMMIT;
SQL
t1_pid=$!

if [[ "$(wait_advisory_waiter "${T1_APP}" t1_pid)" == "0" ]]; then
  echo "Cas B T1 close never waited on advisory" >&2
  cat /tmp/prometheus-coach-life-t1.out /tmp/prometheus-coach-life-t1.err >&2 || true
  exit 1
fi

timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-coach-life-t2.out 2>/tmp/prometheus-coach-life-t2.err &
SET application_name = '${T2_APP}';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT_C}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT_C}","role":"authenticated"}', false);
SELECT public.respond_coaching_request('${REQUEST_C}'::uuid, 'confirmed');
SQL
t2_pid=$!

if [[ "$(wait_mutex_lock "${T2_APP}" t2_pid)" == "0" ]]; then
  echo "Cas B confirm did not wait on Coach lifecycle mutex (advisory)" >&2
  cat /tmp/prometheus-coach-life-t2.out /tmp/prometheus-coach-life-t2.err >&2 || true
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
  echo "Cas B T1 close failed: rc ${t1_rc}" >&2
  cat /tmp/prometheus-coach-life-t1.out /tmp/prometheus-coach-life-t1.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 124 ]]; then
  echo "Cas B confirm deadlocked or stalled" >&2
  cat /tmp/prometheus-coach-life-t2.out /tmp/prometheus-coach-life-t2.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 0 ]]; then
  echo "Cas B confirm succeeded after close_coach_account" >&2
  cat /tmp/prometheus-coach-life-t2.out /tmp/prometheus-coach-life-t2.err >&2 || true
  exit 1
fi
if ! grep -Eqi 'coach_unavailable' /tmp/prometheus-coach-life-t2.err /tmp/prometheus-coach-life-t2.out; then
  echo "Cas B confirm failed for the wrong reason" >&2
  cat /tmp/prometheus-coach-life-t2.out /tmp/prometheus-coach-life-t2.err >&2 || true
  exit 1
fi

active_links="$(psql_at "SELECT count(*) FROM public.coach_client_links WHERE coach_id = '${COACH}'::uuid AND status = 'active'")"
if [[ "${active_links}" != "0" ]]; then
  echo "Cas B recreated an active Coach link (${active_links})" >&2
  exit 1
fi
c_link="$(psql_at "SELECT count(*) FROM public.coach_client_links WHERE coach_id = '${COACH}'::uuid AND client_id = '${CLIENT_C}'::uuid AND status = 'active'")"
if [[ "${c_link}" != "0" ]]; then
  echo "Cas B C became an active client of the closed Coach" >&2
  exit 1
fi
req_st="$(psql_at "SELECT status FROM public.coach_join_requests WHERE id = '${REQUEST_C}'::uuid")"
if [[ "${req_st}" == "athlete_confirmed" ]]; then
  echo "Cas B confirm marked the request athlete_confirmed after close" >&2
  exit 1
fi
self_link="$(psql_at "SELECT count(*) FROM public.coach_client_links WHERE id = '${LINK_SELF}'::uuid AND status = 'active'")"
if [[ "${self_link}" != "1" ]]; then
  echo "Cas B ended the Coach-as-client link with OTHER" >&2
  exit 1
fi

# Sequential revalidation after close: invite, activate, directory request, OTHER still open.
inv_err="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT_INV}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT_INV}","role":"authenticated"}', true);
SELECT public.accept_coach_invite(
  'p3h-life-invite',
  1,
  ${SCOPES}
)->>'error';
COMMIT;
SQL
)"
if [[ "${inv_err}" != "coach_unavailable" ]]; then
  echo "Cas B historical invite did not return coach_unavailable (${inv_err})" >&2
  exit 1
fi
inv_link="$(psql_at "SELECT count(*) FROM public.coach_client_links WHERE coach_id = '${COACH}'::uuid AND client_id = '${CLIENT_INV}'::uuid AND status = 'active'")"
if [[ "${inv_link}" != "0" ]]; then
  echo "Cas B invite created an active link to the closed Coach" >&2
  exit 1
fi

act_err="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At <<SQL
DO \$\$
BEGIN
  PERFORM public.activate_coaching_relationship('${COACH}'::uuid, '${CLIENT_C}'::uuid);
  RAISE EXCEPTION 'activate succeeded after close';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%activate succeeded after close%' THEN RAISE; END IF;
    IF SQLERRM <> 'coach_unavailable' THEN RAISE; END IF;
END
\$\$;
SELECT 'coach_unavailable';
SQL
)"
if ! grep -q 'coach_unavailable' <<<"${act_err}"; then
  echo "Cas B activate after close did not fail closed: ${act_err}" >&2
  exit 1
fi

req_err="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT_INV}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT_INV}","role":"authenticated"}', true);
DO \$\$
BEGIN
  PERFORM public.request_coaching(
    '${COACH}'::uuid,
    'Invitee',
    'After close',
    2,
    'd1eb0000-0000-4000-8000-000000000022'::uuid
  );
  RAISE EXCEPTION 'request_coaching succeeded after close';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%request_coaching succeeded after close%' THEN RAISE; END IF;
    IF SQLERRM <> 'coach_unavailable' THEN RAISE; END IF;
END
\$\$;
COMMIT;
SELECT 'coach_unavailable';
SQL
)"
if ! grep -q 'coach_unavailable' <<<"${req_err}"; then
  echo "Cas B marketplace request after close did not fail: ${req_err}" >&2
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
SELECT public.activate_coaching_relationship('${OTHER}'::uuid, '${CLIENT_X}'::uuid);
SQL
other_link="$(psql_at "SELECT count(*) FROM public.coach_client_links WHERE coach_id = '${OTHER}'::uuid AND client_id = '${CLIENT_X}'::uuid AND status = 'active'")"
if [[ "${other_link}" != "1" ]]; then
  echo "Cas B OTHER coach could not activate a new client after closing the coached Coach" >&2
  exit 1
fi

echo "coach lifecycle mutex: close×activate Cas A includes C; Cas B confirm/invite refuse closed Coach without deadlock"
