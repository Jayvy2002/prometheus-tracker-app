#!/usr/bin/env bash
# Two real Postgres sessions: client assignment mutex must serialize
# assign/create/end/close so a waiter never snapshots a stale active
# lock-set. Waiters must show wait_event=advisory (not a leftover tuple
# lock on the old program). Does not use dblink.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

OWNER='d1ea0000-0000-4000-8000-000000000001'
CLIENT='d1ea0000-0000-4000-8000-000000000004'
PROGRAM_A='d1ea0000-0000-4000-8000-000000000010'
PROGRAM_B='d1ea0000-0000-4000-8000-000000000011'
PROGRAM_C='d1ea0000-0000-4000-8000-000000000012'
LINK='d1ea0000-0000-4000-8000-0000000000aa'
ADV_1=872009200151
ADV_2=872009200152
ADV_3A=872009200153
ADV_3B=872009200154
ADV_4A=872009200155
ADV_4B=872009200156
HOLD_APP='prometheus-asg-mutex-hold'
T1_APP='prometheus-asg-mutex-t1'
T2_APP='prometheus-asg-mutex-t2'

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
     WHERE user_id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid)
        OR program_id IN (
          SELECT id FROM public.programs
           WHERE owner_id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid)
        );
    DELETE FROM public.program_assignments
     WHERE client_id = '${CLIENT}'::uuid
        OR program_id IN (
          SELECT id FROM public.programs
           WHERE owner_id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid)
        );
    DELETE FROM public.program_revisions
     WHERE program_id IN (
       SELECT id FROM public.programs
        WHERE owner_id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid)
     );
    DELETE FROM public.programs
     WHERE owner_id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid);
    DELETE FROM public.coach_relationship_notices
     WHERE coach_id = '${OWNER}'::uuid OR client_id = '${CLIENT}'::uuid;
    DELETE FROM public.coach_client_links
     WHERE coach_id = '${OWNER}'::uuid OR client_id = '${CLIENT}'::uuid;
    DELETE FROM public.user_capabilities
     WHERE user_id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid);
    DELETE FROM public.user_profiles
     WHERE id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid);
    DELETE FROM public.user_roles
     WHERE user_id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid);
    DELETE FROM auth.users WHERE id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid);
  " >/dev/null 2>&1 || true
}
trap cleanup EXIT

seed_users() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users(id, email)
VALUES
  ('${OWNER}'::uuid, 'p3h-asg-mutex-owner@example.test'),
  ('${CLIENT}'::uuid, 'p3h-asg-mutex-client@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles(user_id, role, coaching_role)
VALUES
  ('${OWNER}'::uuid, 'free', 'coach'),
  ('${CLIENT}'::uuid, 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = EXCLUDED.coaching_role;
INSERT INTO public.user_capabilities(user_id, capability)
VALUES ('${OWNER}'::uuid, 'coach')
ON CONFLICT DO NOTHING;
UPDATE public.user_profiles
   SET timezone = 'America/Toronto'
 WHERE id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid);
SQL
}

wipe_programs() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
DELETE FROM public.workouts
 WHERE user_id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid)
    OR program_id IN (
      SELECT id FROM public.programs
       WHERE owner_id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid)
    );
DELETE FROM public.program_assignments
 WHERE client_id = '${CLIENT}'::uuid
    OR program_id IN (
      SELECT id FROM public.programs
       WHERE owner_id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid)
    );
DELETE FROM public.program_revisions
 WHERE program_id IN (
   SELECT id FROM public.programs
    WHERE owner_id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid)
 );
DELETE FROM public.programs
 WHERE owner_id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid);
DELETE FROM public.coach_relationship_notices
 WHERE coach_id = '${OWNER}'::uuid OR client_id = '${CLIENT}'::uuid;
DELETE FROM public.coach_client_links
 WHERE coach_id = '${OWNER}'::uuid OR client_id = '${CLIENT}'::uuid;
INSERT INTO public.coach_client_links(id, coach_id, client_id, status)
VALUES ('${LINK}'::uuid, '${OWNER}'::uuid, '${CLIENT}'::uuid, 'active')
ON CONFLICT (id) DO UPDATE SET status = 'active', coach_id = EXCLUDED.coach_id, client_id = EXCLUDED.client_id;
UPDATE public.user_roles SET coaching_role = 'none' WHERE user_id = '${CLIENT}'::uuid;
SQL
}

seed_library_program() {
  local program="$1"
  local name="$2"
  local assign="$3"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO public.programs(id, owner_id, name, description, duration_weeks)
VALUES ('${program}'::uuid, '${OWNER}'::uuid, '${name}', 'mutex library', 8);
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', true);
SELECT public.save_program(
  '${program}'::uuid,
  '${name}',
  'mutex library',
  8,
  '[{"weekday":1,"name":"Push A","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
  null
);
SELECT public.activate_program_version(
  '${program}'::uuid,
  public.save_program_version(
    '${program}'::uuid,
    '${name}',
    'mutex library',
    8,
    '[{"weekday":1,"name":"Push A","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
    null
  ),
  null
);
$([ "${assign}" = "1" ] && echo "SELECT public.assign_program_secure('${program}'::uuid, '${CLIENT}'::uuid, CURRENT_DATE);")
COMMIT;
SQL
}

reset_fixture() {
  wipe_programs
  seed_library_program "${PROGRAM_A}" "Mutex A" 1
  seed_library_program "${PROGRAM_B}" "Mutex B" 0
  seed_library_program "${PROGRAM_C}" "Mutex C" 0
}

hold_advisory() {
  local key="$1"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-asg-mutex-hold.out 2>&1 &
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
    cat /tmp/prometheus-asg-mutex-hold.out >&2 || true
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

active_assignment() {
  local program="$1"
  psql_at "SELECT id FROM public.program_assignments WHERE program_id = '${program}'::uuid AND client_id = '${CLIENT}'::uuid AND status = 'active'"
}

active_count() {
  psql_at "SELECT count(*) FROM public.program_assignments WHERE client_id = '${CLIENT}'::uuid AND status = 'active'"
}

active_program_name() {
  psql_at "SELECT p.name FROM public.program_assignments pa JOIN public.programs p ON p.id = pa.program_id WHERE pa.client_id = '${CLIENT}'::uuid AND pa.status = 'active' LIMIT 1"
}

asg_status() {
  local id="$1"
  psql_at "SELECT status || ':' || COALESCE(frozen_revision_no::text, 'null') FROM public.program_assignments WHERE id = '${id}'::uuid"
}

seed_users
reset_fixture

# ---------------------------------------------------------------------------
# Cas 1: assign × assign
# ---------------------------------------------------------------------------
asg_a="$(active_assignment "${PROGRAM_A}")"
if [[ -z "${asg_a}" ]]; then
  echo "Cas 1 missing active assignment on PROGRAM_A" >&2
  exit 1
fi

hold_advisory "${ADV_1}"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-asg-mutex-t1.out 2>/tmp/prometheus-asg-mutex-t1.err &
SET application_name = '${T1_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', true);
SELECT public.assign_program_secure('${PROGRAM_B}'::uuid, '${CLIENT}'::uuid, CURRENT_DATE);
SELECT pg_advisory_xact_lock(${ADV_1});
COMMIT;
SQL
t1_pid=$!

if [[ "$(wait_advisory_waiter "${T1_APP}" t1_pid)" == "0" ]]; then
  echo "Cas 1 T1 assign never waited on advisory after switching to B" >&2
  cat /tmp/prometheus-asg-mutex-t1.out /tmp/prometheus-asg-mutex-t1.err >&2 || true
  exit 1
fi

timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-asg-mutex-t2.out 2>/tmp/prometheus-asg-mutex-t2.err &
SET application_name = '${T2_APP}';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', false);
SELECT public.assign_program_secure('${PROGRAM_C}'::uuid, '${CLIENT}'::uuid, CURRENT_DATE);
SQL
t2_pid=$!

if [[ "$(wait_mutex_lock "${T2_APP}" t2_pid)" == "0" ]]; then
  echo "Cas 1 T2 assign did not wait on client mutex (advisory)" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
  exit 1
fi

still_a="$(psql_at "SELECT status FROM public.program_assignments WHERE id = '${asg_a}'::uuid")"
if [[ "${still_a}" != "active" ]]; then
  echo "Cas 1 T1 assigned B before T2 acquired the client mutex" >&2
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
  echo "Cas 1 T1 assign failed: rc ${t1_rc}" >&2
  cat /tmp/prometheus-asg-mutex-t1.out /tmp/prometheus-asg-mutex-t1.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 124 ]]; then
  echo "Cas 1 T2 assign deadlocked or stalled on T1" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -ne 0 ]]; then
  echo "Cas 1 T2 assign failed: rc ${t2_rc}" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
  exit 1
fi

if [[ "$(active_count)" != "1" ]]; then
  echo "Cas 1 expected exactly one active, got $(active_count)" >&2
  exit 1
fi
if [[ "$(active_assignment "${PROGRAM_C}")" == "" ]]; then
  echo "Cas 1 final active is not PROGRAM_C (T2 did not see T1's new active)" >&2
  exit 1
fi
paused_b="$(psql_at "SELECT status FROM public.program_assignments WHERE program_id = '${PROGRAM_B}'::uuid AND client_id = '${CLIENT}'::uuid ORDER BY updated_at DESC LIMIT 1")"
if [[ "${paused_b}" != "paused" ]]; then
  echo "Cas 1 T1's PROGRAM_B was not paused by T2, status ${paused_b}" >&2
  exit 1
fi
frozen_b="$(psql_at "SELECT frozen_revision_no IS NOT NULL FROM public.program_assignments WHERE program_id = '${PROGRAM_B}'::uuid AND client_id = '${CLIENT}'::uuid AND status = 'paused'")"
if [[ "${frozen_b}" != "t" ]]; then
  echo "Cas 1 T1's PROGRAM_B freeze pin is null" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Cas 2: create+assign × create+assign
# ---------------------------------------------------------------------------
reset_fixture
asg_a="$(active_assignment "${PROGRAM_A}")"

hold_advisory "${ADV_2}"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-asg-mutex-t1.out 2>/tmp/prometheus-asg-mutex-t1.err &
SET application_name = '${T1_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', true);
SELECT public.create_program_complete(
  'Mutex Create One',
  't1',
  8,
  '[{"weekday":1,"name":"Push T1","exercises":[{"name":"Press","default_sets":4,"default_reps":6}]}]'::jsonb,
  '${CLIENT}'::uuid,
  CURRENT_DATE
);
SELECT pg_advisory_xact_lock(${ADV_2});
COMMIT;
SQL
t1_pid=$!

if [[ "$(wait_advisory_waiter "${T1_APP}" t1_pid)" == "0" ]]; then
  echo "Cas 2 T1 create+assign never waited on advisory" >&2
  cat /tmp/prometheus-asg-mutex-t1.out /tmp/prometheus-asg-mutex-t1.err >&2 || true
  exit 1
fi

timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-asg-mutex-t2.out 2>/tmp/prometheus-asg-mutex-t2.err &
SET application_name = '${T2_APP}';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', false);
SELECT public.create_program_complete(
  'Mutex Create Two',
  't2',
  8,
  '[{"weekday":1,"name":"Push T2","exercises":[{"name":"Press","default_sets":4,"default_reps":6}]}]'::jsonb,
  '${CLIENT}'::uuid,
  CURRENT_DATE
);
SQL
t2_pid=$!

if [[ "$(wait_mutex_lock "${T2_APP}" t2_pid)" == "0" ]]; then
  echo "Cas 2 T2 create+assign did not wait on client mutex (advisory)" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
  exit 1
fi

still_a="$(psql_at "SELECT status FROM public.program_assignments WHERE id = '${asg_a}'::uuid")"
if [[ "${still_a}" != "active" ]]; then
  echo "Cas 2 T1 created a program before T2 acquired the client mutex" >&2
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
  echo "Cas 2 T1 create+assign failed: rc ${t1_rc}" >&2
  cat /tmp/prometheus-asg-mutex-t1.out /tmp/prometheus-asg-mutex-t1.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 124 ]]; then
  echo "Cas 2 T2 create+assign deadlocked or stalled on T1" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -ne 0 ]]; then
  echo "Cas 2 T2 create+assign failed: rc ${t2_rc}" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
  exit 1
fi

if [[ "$(active_count)" != "1" ]]; then
  echo "Cas 2 expected exactly one active, got $(active_count)" >&2
  exit 1
fi
if [[ "$(active_program_name)" != "Mutex Create Two" ]]; then
  echo "Cas 2 final active is $(active_program_name), expected Mutex Create Two" >&2
  exit 1
fi
paused_one="$(psql_at "
  SELECT pa.status
    FROM public.program_assignments pa
    JOIN public.programs p ON p.id = pa.program_id
   WHERE pa.client_id = '${CLIENT}'::uuid
     AND p.name = 'Mutex Create One'
   LIMIT 1
")"
if [[ "${paused_one}" != "paused" ]]; then
  echo "Cas 2 T1 created program was not paused by T2, status ${paused_one}" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Cas 3a: assign wins, then client_end freezes the new active
# ---------------------------------------------------------------------------
reset_fixture
asg_a="$(active_assignment "${PROGRAM_A}")"

hold_advisory "${ADV_3A}"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-asg-mutex-t1.out 2>/tmp/prometheus-asg-mutex-t1.err &
SET application_name = '${T1_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', true);
SELECT public.assign_program_secure('${PROGRAM_B}'::uuid, '${CLIENT}'::uuid, CURRENT_DATE);
SELECT pg_advisory_xact_lock(${ADV_3A});
COMMIT;
SQL
t1_pid=$!

if [[ "$(wait_advisory_waiter "${T1_APP}" t1_pid)" == "0" ]]; then
  echo "Cas 3a T1 assign never waited on advisory" >&2
  cat /tmp/prometheus-asg-mutex-t1.out /tmp/prometheus-asg-mutex-t1.err >&2 || true
  exit 1
fi

timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-asg-mutex-t2.out 2>/tmp/prometheus-asg-mutex-t2.err &
SET application_name = '${T2_APP}';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT}","role":"authenticated"}', false);
SELECT public.client_end_coach_link();
SQL
t2_pid=$!

if [[ "$(wait_mutex_lock "${T2_APP}" t2_pid)" == "0" ]]; then
  echo "Cas 3a client_end did not wait on client mutex (advisory)" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
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
  echo "Cas 3a T1 assign failed: rc ${t1_rc}" >&2
  cat /tmp/prometheus-asg-mutex-t1.out /tmp/prometheus-asg-mutex-t1.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 124 ]]; then
  echo "Cas 3a client_end deadlocked or stalled" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -ne 0 ]]; then
  echo "Cas 3a client_end failed: rc ${t2_rc}" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
  exit 1
fi

if [[ "$(active_count)" != "0" ]]; then
  echo "Cas 3a expected no active after departure, got $(active_count)" >&2
  exit 1
fi
paused_b="$(psql_at "SELECT status || ':' || COALESCE(frozen_revision_no::text, 'null') FROM public.program_assignments WHERE program_id = '${PROGRAM_B}'::uuid AND client_id = '${CLIENT}'::uuid ORDER BY updated_at DESC LIMIT 1")"
if [[ "${paused_b}" != paused:* || "${paused_b}" == paused:null ]]; then
  echo "Cas 3a departure did not freeze T1's new active PROGRAM_B (${paused_b})" >&2
  exit 1
fi
link_status="$(psql_at "SELECT status FROM public.coach_client_links WHERE id = '${LINK}'::uuid")"
if [[ "${link_status}" == "active" ]]; then
  echo "Cas 3a link still active" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Cas 3b: client_end wins, then assign fails after revalidation
# ---------------------------------------------------------------------------
reset_fixture

hold_advisory "${ADV_3B}"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-asg-mutex-t1.out 2>/tmp/prometheus-asg-mutex-t1.err &
SET application_name = '${T1_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT}","role":"authenticated"}', true);
SELECT public.client_end_coach_link();
SELECT pg_advisory_xact_lock(${ADV_3B});
COMMIT;
SQL
t1_pid=$!

if [[ "$(wait_advisory_waiter "${T1_APP}" t1_pid)" == "0" ]]; then
  echo "Cas 3b T1 client_end never waited on advisory" >&2
  cat /tmp/prometheus-asg-mutex-t1.out /tmp/prometheus-asg-mutex-t1.err >&2 || true
  exit 1
fi

timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-asg-mutex-t2.out 2>/tmp/prometheus-asg-mutex-t2.err &
SET application_name = '${T2_APP}';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', false);
SELECT public.assign_program_secure('${PROGRAM_B}'::uuid, '${CLIENT}'::uuid, CURRENT_DATE);
SQL
t2_pid=$!

if [[ "$(wait_mutex_lock "${T2_APP}" t2_pid)" == "0" ]]; then
  echo "Cas 3b assign did not wait on client mutex (advisory)" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
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
  echo "Cas 3b T1 client_end failed: rc ${t1_rc}" >&2
  cat /tmp/prometheus-asg-mutex-t1.out /tmp/prometheus-asg-mutex-t1.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 124 ]]; then
  echo "Cas 3b assign deadlocked or stalled" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 0 ]]; then
  echo "Cas 3b assign succeeded after the relation ended" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
  exit 1
fi
if ! grep -Eqi 'Not authorized for this client|Not your client' /tmp/prometheus-asg-mutex-t2.err /tmp/prometheus-asg-mutex-t2.out; then
  echo "Cas 3b assign failed for the wrong reason" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
  exit 1
fi
if [[ "$(active_assignment "${PROGRAM_B}")" != "" ]]; then
  echo "Cas 3b PROGRAM_B became active after a refused assign" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Cas 4a: assign wins, close must fork the new active
# ---------------------------------------------------------------------------
reset_fixture

hold_advisory "${ADV_4A}"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-asg-mutex-t1.out 2>/tmp/prometheus-asg-mutex-t1.err &
SET application_name = '${T1_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', true);
SELECT public.assign_program_secure('${PROGRAM_B}'::uuid, '${CLIENT}'::uuid, CURRENT_DATE);
SELECT pg_advisory_xact_lock(${ADV_4A});
COMMIT;
SQL
t1_pid=$!

if [[ "$(wait_advisory_waiter "${T1_APP}" t1_pid)" == "0" ]]; then
  echo "Cas 4a T1 assign never waited on advisory" >&2
  cat /tmp/prometheus-asg-mutex-t1.out /tmp/prometheus-asg-mutex-t1.err >&2 || true
  exit 1
fi

timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-asg-mutex-t2.out 2>/tmp/prometheus-asg-mutex-t2.err &
SET application_name = '${T2_APP}';
SELECT public.close_coach_account('${OWNER}'::uuid);
SQL
t2_pid=$!

if [[ "$(wait_mutex_lock "${T2_APP}" t2_pid)" == "0" ]]; then
  echo "Cas 4a close_coach_account did not wait on client mutex (advisory)" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
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
  echo "Cas 4a T1 assign failed: rc ${t1_rc}" >&2
  cat /tmp/prometheus-asg-mutex-t1.out /tmp/prometheus-asg-mutex-t1.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 124 ]]; then
  echo "Cas 4a close_coach_account deadlocked or stalled" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -ne 0 ]]; then
  echo "Cas 4a close_coach_account failed: rc ${t2_rc}" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
  exit 1
fi

forked="$(psql_at "
  SELECT count(*)
    FROM public.program_assignments pa
    JOIN public.programs p ON p.id = pa.program_id
   WHERE pa.client_id = '${CLIENT}'::uuid
     AND p.owner_id = '${CLIENT}'::uuid
     AND pa.status = 'paused'
     AND pa.frozen_revision_no IS NOT NULL
")"
if [[ "${forked}" != "2" ]]; then
  echo "Cas 4a expected two client-owned frozen forks (A+B), got ${forked}" >&2
  exit 1
fi
left_active_coach="$(psql_at "
  SELECT count(*)
    FROM public.program_assignments pa
    JOIN public.programs p ON p.id = pa.program_id
   WHERE pa.client_id = '${CLIENT}'::uuid
     AND p.owner_id = '${OWNER}'::uuid
     AND pa.status = 'active'
")"
if [[ "${left_active_coach}" != "0" ]]; then
  echo "Cas 4a left a Coach-owned active assignment outside the fork" >&2
  exit 1
fi
b_still_assigned="$(psql_at "
  SELECT count(*)
    FROM public.program_assignments
   WHERE program_id = '${PROGRAM_B}'::uuid
     AND client_id = '${CLIENT}'::uuid
")"
if [[ "${b_still_assigned}" != "0" ]]; then
  echo "Cas 4a PROGRAM_B assignment was not retargeted to the client fork" >&2
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT}","role":"authenticated"}', true);
DO \$\$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
    FROM public.program_assignments pa
   WHERE pa.client_id = '${CLIENT}'::uuid
     AND pa.status = 'paused'
     AND (public.get_frozen_program_archive(pa.id)->>'frozen_revision_no') IS NOT NULL;
  IF n IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Cas 4a get_frozen_program_archive count %', n;
  END IF;
END
\$\$;
COMMIT;
SQL

# Simulate coach program deletion after Auth delete.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "
  DELETE FROM public.programs WHERE owner_id = '${OWNER}'::uuid;
"
orphan="$(psql_at "
  SELECT count(*)
    FROM public.program_assignments pa
    JOIN public.programs p ON p.id = pa.program_id
   WHERE pa.client_id = '${CLIENT}'::uuid
     AND pa.frozen_revision_no IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.program_revisions r
        WHERE r.program_id = pa.program_id
          AND r.revision_no = pa.frozen_revision_no
     )
")"
if [[ "${orphan}" != "2" ]]; then
  echo "Cas 4a frozen revisions did not survive coach program delete (${orphan})" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Cas 4b: close wins, then assign is refused
# ---------------------------------------------------------------------------
reset_fixture

hold_advisory "${ADV_4B}"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-asg-mutex-t1.out 2>/tmp/prometheus-asg-mutex-t1.err &
SET application_name = '${T1_APP}';
BEGIN;
SELECT public.close_coach_account('${OWNER}'::uuid);
SELECT pg_advisory_xact_lock(${ADV_4B});
COMMIT;
SQL
t1_pid=$!

if [[ "$(wait_advisory_waiter "${T1_APP}" t1_pid)" == "0" ]]; then
  echo "Cas 4b T1 close never waited on advisory" >&2
  cat /tmp/prometheus-asg-mutex-t1.out /tmp/prometheus-asg-mutex-t1.err >&2 || true
  exit 1
fi

timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-asg-mutex-t2.out 2>/tmp/prometheus-asg-mutex-t2.err &
SET application_name = '${T2_APP}';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', false);
SELECT public.assign_program_secure('${PROGRAM_B}'::uuid, '${CLIENT}'::uuid, CURRENT_DATE);
SQL
t2_pid=$!

if [[ "$(wait_mutex_lock "${T2_APP}" t2_pid)" == "0" ]]; then
  echo "Cas 4b assign did not wait on client mutex (advisory)" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
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
  echo "Cas 4b T1 close failed: rc ${t1_rc}" >&2
  cat /tmp/prometheus-asg-mutex-t1.out /tmp/prometheus-asg-mutex-t1.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 124 ]]; then
  echo "Cas 4b assign deadlocked or stalled" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
  exit 1
fi
if [[ "${t2_rc}" -eq 0 ]]; then
  echo "Cas 4b assign succeeded after close_coach_account" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
  exit 1
fi
if ! grep -Eqi 'Not authorized for this client|Not your client' /tmp/prometheus-asg-mutex-t2.err /tmp/prometheus-asg-mutex-t2.out; then
  echo "Cas 4b assign failed for the wrong reason" >&2
  cat /tmp/prometheus-asg-mutex-t2.out /tmp/prometheus-asg-mutex-t2.err >&2 || true
  exit 1
fi
if [[ "$(active_assignment "${PROGRAM_B}")" != "" ]]; then
  echo "Cas 4b PROGRAM_B became active after close" >&2
  exit 1
fi
client_forks="$(psql_at "SELECT count(*) FROM public.programs WHERE owner_id = '${CLIENT}'::uuid")"
if [[ "${client_forks}" != "1" ]]; then
  echo "Cas 4b expected one client-owned fork from the original active, got ${client_forks}" >&2
  exit 1
fi

echo "assignment client mutex: assign×assign, create×create, assign×end, assign×close serialize without stale lock-set"
