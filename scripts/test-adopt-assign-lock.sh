#!/usr/bin/env bash
# Two real Postgres sessions: adopt_client_assignment versus
# assign_program_secure / create_program_complete(assignClientId).
# Both public mutators lock parent programs ORDER BY id FOR UPDATE before
# any active→paused write, so they cannot deadlock with adopt
# (program → assignment). Does not use dblink.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

OWNER='d1e90000-0000-4000-8000-000000000001'
CLIENT='d1e90000-0000-4000-8000-000000000004'
PROGRAM_A='d1e90000-0000-4000-8000-000000000010'
PROGRAM_T='d1e90000-0000-4000-8000-000000000011'
PROGRAM_B='d1e90000-0000-4000-8000-000000000012'
LINK='d1e90000-0000-4000-8000-0000000000aa'
ADV_A=872009200149
ADV_B=872009200150
HOLD_APP='prometheus-adopt-assign-hold'
ADOPT_APP='prometheus-adopt-assign-adopt'
ASSIGN_APP='prometheus-adopt-assign-assign'
CREATE_APP='prometheus-adopt-assign-create'

psql_at() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "$1"
}

hold_pid=""
adopt_pid=""
other_pid=""
cleanup() {
  for pid in "${other_pid}" "${adopt_pid}" "${hold_pid}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
  psql "$DATABASE_URL" -X -c "
    SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
     WHERE application_name IN ('${HOLD_APP}', '${ADOPT_APP}', '${ASSIGN_APP}', '${CREATE_APP}')
       AND pid <> pg_backend_pid();
    DELETE FROM public.program_assignments
     WHERE client_id = '${CLIENT}'::uuid
        OR program_id IN ('${PROGRAM_A}'::uuid, '${PROGRAM_T}'::uuid, '${PROGRAM_B}'::uuid);
    DELETE FROM public.program_revisions
     WHERE program_id IN (
       SELECT id FROM public.programs
        WHERE owner_id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid)
           OR id IN ('${PROGRAM_A}'::uuid, '${PROGRAM_T}'::uuid, '${PROGRAM_B}'::uuid)
     );
    DELETE FROM public.programs
     WHERE owner_id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid)
        OR id IN ('${PROGRAM_A}'::uuid, '${PROGRAM_T}'::uuid, '${PROGRAM_B}'::uuid);
    DELETE FROM public.coach_client_links WHERE id = '${LINK}'::uuid;
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
  ('${OWNER}'::uuid, 'p3h-adopt-assign-owner@example.test'),
  ('${CLIENT}'::uuid, 'p3h-adopt-assign-client@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles(user_id, role, coaching_role)
VALUES
  ('${OWNER}'::uuid, 'free', 'coach'),
  ('${CLIENT}'::uuid, 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = EXCLUDED.coaching_role;
INSERT INTO public.user_capabilities(user_id, capability)
VALUES ('${OWNER}'::uuid, 'coach')
ON CONFLICT DO NOTHING;
DELETE FROM public.program_assignments
 WHERE client_id = '${CLIENT}'::uuid
    OR program_id IN ('${PROGRAM_A}'::uuid, '${PROGRAM_T}'::uuid, '${PROGRAM_B}'::uuid);
DELETE FROM public.program_revisions
 WHERE program_id IN (
   SELECT id FROM public.programs
    WHERE owner_id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid)
       OR id IN ('${PROGRAM_A}'::uuid, '${PROGRAM_T}'::uuid, '${PROGRAM_B}'::uuid)
 );
DELETE FROM public.programs
 WHERE owner_id IN ('${OWNER}'::uuid, '${CLIENT}'::uuid)
    OR id IN ('${PROGRAM_A}'::uuid, '${PROGRAM_T}'::uuid, '${PROGRAM_B}'::uuid);
DELETE FROM public.coach_client_links WHERE id = '${LINK}'::uuid;
INSERT INTO public.coach_client_links(id, coach_id, client_id, status)
VALUES ('${LINK}'::uuid, '${OWNER}'::uuid, '${CLIENT}'::uuid, 'active');
SQL
}

seed_library_program() {
  local program="$1"
  local name="$2"
  local assign="$3"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO public.programs(id, owner_id, name, description, duration_weeks)
VALUES ('${program}'::uuid, '${OWNER}'::uuid, '${name}', 'version A', 8);
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', true);
SELECT public.save_program(
  '${program}'::uuid,
  '${name}',
  'version A',
  8,
  '[{"weekday":1,"name":"Push A","exercises":[{"name":"Bench","default_sets":3,"default_reps":5}]}]'::jsonb,
  null
);
SELECT public.activate_program_version(
  '${program}'::uuid,
  public.save_program_version(
    '${program}'::uuid,
    '${name}',
    'version A',
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

hold_advisory() {
  local key="$1"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-adopt-assign-hold.out 2>&1 &
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
    cat /tmp/prometheus-adopt-assign-hold.out >&2 || true
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

wait_row_lock() {
  local app="$1"
  local pid_var="$2"
  local locked=0
  for _ in $(seq 1 50); do
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

active_assignment() {
  local program="$1"
  psql_at "SELECT id FROM public.program_assignments WHERE program_id = '${program}'::uuid AND client_id = '${CLIENT}'::uuid AND status = 'active'"
}

seed_users
seed_library_program "${PROGRAM_A}" "Adopt Assign A" 1
seed_library_program "${PROGRAM_T}" "Adopt Assign Target" 0

asg_a="$(active_assignment "${PROGRAM_A}")"
if [[ -z "${asg_a}" ]]; then
  echo "Cas 1 missing active assignment on PROGRAM_A" >&2
  exit 1
fi
rev_a="$(psql_at "SELECT active_revision_no FROM public.programs WHERE id = '${PROGRAM_A}'::uuid")"

hold_advisory "${ADV_A}"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-adopt-assign-adopt.out 2>/tmp/prometheus-adopt-assign-adopt.err &
SET application_name = '${ADOPT_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', true);
SELECT public.adopt_client_assignment('${asg_a}'::uuid);
SELECT pg_advisory_xact_lock(${ADV_A});
COMMIT;
SQL
adopt_pid=$!

if [[ "$(wait_advisory_waiter "${ADOPT_APP}" adopt_pid)" == "0" ]]; then
  echo "Cas 1 adopt session never waited on advisory after locking programs" >&2
  cat /tmp/prometheus-adopt-assign-adopt.out /tmp/prometheus-adopt-assign-adopt.err >&2 || true
  exit 1
fi

rm -f /tmp/prometheus-adopt-assign-assign.out /tmp/prometheus-adopt-assign-assign.err
timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-adopt-assign-assign.out 2>/tmp/prometheus-adopt-assign-assign.err &
SET application_name = '${ASSIGN_APP}';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', false);
SELECT public.assign_program_secure('${PROGRAM_T}'::uuid, '${CLIENT}'::uuid, CURRENT_DATE);
SQL
other_pid=$!

if [[ "$(wait_row_lock "${ASSIGN_APP}" other_pid)" == "0" ]]; then
  echo "Cas 1 assign_program_secure did not wait on in-flight adopt" >&2
  cat /tmp/prometheus-adopt-assign-assign.out /tmp/prometheus-adopt-assign-assign.err >&2 || true
  exit 1
fi

still_active="$(psql_at "SELECT status FROM public.program_assignments WHERE id = '${asg_a}'::uuid")"
if [[ "${still_active}" != "active" ]]; then
  echo "Cas 1 assignment was paused before assign acquired the program lock" >&2
  exit 1
fi

release_hold
adopt_rc=0
other_rc=0
wait "${adopt_pid}" || adopt_rc=$?
wait "${other_pid}" || other_rc=$?
adopt_pid=""
other_pid=""

if [[ "${adopt_rc}" -ne 0 ]]; then
  echo "Cas 1 adopt_client_assignment failed: rc ${adopt_rc}" >&2
  cat /tmp/prometheus-adopt-assign-adopt.out /tmp/prometheus-adopt-assign-adopt.err >&2 || true
  exit 1
fi
if [[ "${other_rc}" -eq 124 ]]; then
  echo "Cas 1 assign_program_secure deadlocked or stalled on in-flight adopt" >&2
  cat /tmp/prometheus-adopt-assign-assign.out /tmp/prometheus-adopt-assign-assign.err >&2 || true
  exit 1
fi
if [[ "${other_rc}" -ne 0 ]]; then
  echo "Cas 1 assign_program_secure failed: rc ${other_rc}" >&2
  cat /tmp/prometheus-adopt-assign-assign.out /tmp/prometheus-adopt-assign-assign.err >&2 || true
  exit 1
fi

fork_a="$(psql_at "SELECT id FROM public.programs WHERE owner_id = '${OWNER}'::uuid AND id NOT IN ('${PROGRAM_A}'::uuid, '${PROGRAM_T}'::uuid, '${PROGRAM_B}'::uuid) ORDER BY created_at DESC LIMIT 1")"
if [[ -z "${fork_a}" ]]; then
  echo "Cas 1 adopted fork missing" >&2
  exit 1
fi
day_a="$(psql_at "SELECT name FROM public.program_days WHERE program_id = '${fork_a}'::uuid ORDER BY order_index LIMIT 1")"
if [[ "${day_a}" != "Push A" ]]; then
  echo "Cas 1 adopted archive incoherent, day ${day_a}" >&2
  exit 1
fi
paused_a="$(psql_at "SELECT status || ':' || COALESCE(frozen_revision_no::text, 'null') FROM public.program_assignments WHERE id = '${asg_a}'::uuid")"
if [[ "${paused_a}" != "paused:${rev_a}" ]]; then
  echo "Cas 1 original assignment ${paused_a}, expected paused:${rev_a}" >&2
  exit 1
fi
active_t="$(psql_at "SELECT count(*) FROM public.program_assignments WHERE program_id = '${PROGRAM_T}'::uuid AND client_id = '${CLIENT}'::uuid AND status = 'active'")"
if [[ "${active_t}" != "1" ]]; then
  echo "Cas 1 final assignment is not the target program" >&2
  exit 1
fi
actives="$(psql_at "SELECT count(*) FROM public.program_assignments WHERE client_id = '${CLIENT}'::uuid AND status = 'active'")"
if [[ "${actives}" != "1" ]]; then
  echo "Cas 1 client has ${actives} active assignments" >&2
  exit 1
fi

# Relink / reset coaching_role in case transition side effects appeared.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
UPDATE public.coach_client_links SET status = 'active' WHERE id = '${LINK}'::uuid;
UPDATE public.user_roles SET coaching_role = 'none' WHERE user_id = '${CLIENT}'::uuid;
SQL

seed_library_program "${PROGRAM_B}" "Adopt Create B" 1
asg_b="$(active_assignment "${PROGRAM_B}")"
if [[ -z "${asg_b}" ]]; then
  echo "Cas 2 missing active assignment on PROGRAM_B" >&2
  exit 1
fi
rev_b="$(psql_at "SELECT active_revision_no FROM public.programs WHERE id = '${PROGRAM_B}'::uuid")"
forks_before="$(psql_at "SELECT count(*) FROM public.programs WHERE owner_id = '${OWNER}'::uuid")"

hold_advisory "${ADV_B}"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-adopt-assign-adopt-b.out 2>/tmp/prometheus-adopt-assign-adopt-b.err &
SET application_name = '${ADOPT_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', true);
SELECT public.adopt_client_assignment('${asg_b}'::uuid);
SELECT pg_advisory_xact_lock(${ADV_B});
COMMIT;
SQL
adopt_pid=$!

if [[ "$(wait_advisory_waiter "${ADOPT_APP}" adopt_pid)" == "0" ]]; then
  echo "Cas 2 adopt session never waited on advisory after locking programs" >&2
  cat /tmp/prometheus-adopt-assign-adopt-b.out /tmp/prometheus-adopt-assign-adopt-b.err >&2 || true
  exit 1
fi

rm -f /tmp/prometheus-adopt-assign-create.out /tmp/prometheus-adopt-assign-create.err
timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-adopt-assign-create.out 2>/tmp/prometheus-adopt-assign-create.err &
SET application_name = '${CREATE_APP}';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', false);
SELECT public.create_program_complete(
  'Adopt Create New',
  'created under lock',
  8,
  '[{"weekday":1,"name":"Push New","exercises":[{"name":"Press","default_sets":4,"default_reps":6}]}]'::jsonb,
  '${CLIENT}'::uuid,
  CURRENT_DATE
);
SQL
other_pid=$!

if [[ "$(wait_row_lock "${CREATE_APP}" other_pid)" == "0" ]]; then
  echo "Cas 2 create_program_complete did not wait on in-flight adopt" >&2
  cat /tmp/prometheus-adopt-assign-create.out /tmp/prometheus-adopt-assign-create.err >&2 || true
  exit 1
fi

still_active_b="$(psql_at "SELECT status FROM public.program_assignments WHERE id = '${asg_b}'::uuid")"
if [[ "${still_active_b}" != "active" ]]; then
  echo "Cas 2 assignment was paused before create acquired the program lock" >&2
  exit 1
fi

release_hold
adopt_rc=0
other_rc=0
wait "${adopt_pid}" || adopt_rc=$?
wait "${other_pid}" || other_rc=$?
adopt_pid=""
other_pid=""

if [[ "${adopt_rc}" -ne 0 ]]; then
  echo "Cas 2 adopt_client_assignment failed: rc ${adopt_rc}" >&2
  cat /tmp/prometheus-adopt-assign-adopt-b.out /tmp/prometheus-adopt-assign-adopt-b.err >&2 || true
  exit 1
fi
if [[ "${other_rc}" -eq 124 ]]; then
  echo "Cas 2 create_program_complete deadlocked or stalled on in-flight adopt" >&2
  cat /tmp/prometheus-adopt-assign-create.out /tmp/prometheus-adopt-assign-create.err >&2 || true
  exit 1
fi
if [[ "${other_rc}" -ne 0 ]]; then
  echo "Cas 2 create_program_complete failed: rc ${other_rc}" >&2
  cat /tmp/prometheus-adopt-assign-create.out /tmp/prometheus-adopt-assign-create.err >&2 || true
  exit 1
fi

created="$(tr -d '[:space:]' < /tmp/prometheus-adopt-assign-create.out)"
if [[ -z "${created}" ]]; then
  echo "Cas 2 create_program_complete returned no program id" >&2
  exit 1
fi
paused_b="$(psql_at "SELECT status || ':' || COALESCE(frozen_revision_no::text, 'null') FROM public.program_assignments WHERE id = '${asg_b}'::uuid")"
if [[ "${paused_b}" != "paused:${rev_b}" ]]; then
  echo "Cas 2 original assignment ${paused_b}, expected paused:${rev_b}" >&2
  exit 1
fi
active_new="$(psql_at "SELECT count(*) FROM public.program_assignments WHERE program_id = '${created}'::uuid AND client_id = '${CLIENT}'::uuid AND status = 'active'")"
if [[ "${active_new}" != "1" ]]; then
  echo "Cas 2 final assignment is not the created program ${created}" >&2
  exit 1
fi
actives="$(psql_at "SELECT count(*) FROM public.program_assignments WHERE client_id = '${CLIENT}'::uuid AND status = 'active'")"
if [[ "${actives}" != "1" ]]; then
  echo "Cas 2 client has ${actives} active assignments" >&2
  exit 1
fi
forks_after="$(psql_at "SELECT count(*) FROM public.programs WHERE owner_id = '${OWNER}'::uuid")"
if [[ "${forks_after}" -le "${forks_before}" ]]; then
  echo "Cas 2 adopted fork missing (programs ${forks_before} → ${forks_after})" >&2
  exit 1
fi
day_b="$(psql_at "SELECT name FROM public.program_days WHERE program_id IN (SELECT id FROM public.programs WHERE owner_id = '${OWNER}'::uuid AND id NOT IN ('${PROGRAM_A}'::uuid, '${PROGRAM_T}'::uuid, '${PROGRAM_B}'::uuid, '${created}'::uuid)) ORDER BY created_at DESC LIMIT 1")"
# The newest coach-owned extra program is the adopt fork of B (Push A).
fork_b_day="$(psql_at "
  SELECT pd.name
    FROM public.program_days pd
    JOIN public.programs p ON p.id = pd.program_id
   WHERE p.owner_id = '${OWNER}'::uuid
     AND p.id NOT IN ('${PROGRAM_A}'::uuid, '${PROGRAM_T}'::uuid, '${PROGRAM_B}'::uuid, '${created}'::uuid)
     AND pd.name = 'Push A'
   ORDER BY p.created_at DESC
   LIMIT 1
")"
if [[ "${fork_b_day}" != "Push A" ]]; then
  echo "Cas 2 adopted archive incoherent, day ${fork_b_day}" >&2
  exit 1
fi

echo "adopt/assign row lock: adopt×assign_program_secure and adopt×create_program_complete serialize without deadlock"
