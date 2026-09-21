#!/usr/bin/env bash
# Two real Postgres sessions: an in-flight assign_program_secure (uncommitted
# FK to programs) versus delete_program. FOR UPDATE on the parent row must make
# delete wait, then refuse after the assign commits — never CASCADE the assignment.
# Does not use dblink (same harness as scripts/test-decision-drain-concurrency.sh).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

OWNER='d1e70000-0000-4000-8000-000000000001'
CLIENT='d1e70000-0000-4000-8000-000000000004'
PROGRAM='d1e70000-0000-4000-8000-000000000010'
LINK='d1e70000-0000-4000-8000-0000000000aa'
ADV_KEY=872009200145
HOLD_APP='prometheus-delete-hold'
ASSIGN_APP='prometheus-delete-assign'
DELETE_APP='prometheus-delete-rpc'

psql_at() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "$1"
}

hold_pid=""
assign_pid=""
delete_pid=""
cleanup() {
  for pid in "${delete_pid}" "${assign_pid}" "${hold_pid}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
  psql "$DATABASE_URL" -X -c "
    SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
     WHERE application_name IN ('${HOLD_APP}', '${ASSIGN_APP}', '${DELETE_APP}')
       AND pid <> pg_backend_pid();
    DELETE FROM public.program_assignments WHERE program_id = '${PROGRAM}'::uuid;
    DELETE FROM public.programs WHERE id = '${PROGRAM}'::uuid;
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

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users(id, email)
VALUES
  ('${OWNER}'::uuid, 'p3h-del-lock-owner@example.test'),
  ('${CLIENT}'::uuid, 'p3h-del-lock-client@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles(user_id, role, coaching_role)
VALUES
  ('${OWNER}'::uuid, 'free', 'coach'),
  ('${CLIENT}'::uuid, 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = EXCLUDED.coaching_role;
INSERT INTO public.user_capabilities(user_id, capability)
VALUES ('${OWNER}'::uuid, 'coach')
ON CONFLICT DO NOTHING;
DELETE FROM public.program_assignments WHERE program_id = '${PROGRAM}'::uuid;
DELETE FROM public.programs WHERE id = '${PROGRAM}'::uuid;
DELETE FROM public.coach_client_links WHERE id = '${LINK}'::uuid;
INSERT INTO public.coach_client_links(id, coach_id, client_id, status)
VALUES ('${LINK}'::uuid, '${OWNER}'::uuid, '${CLIENT}'::uuid, 'active');
INSERT INTO public.programs(id, owner_id, name, description, duration_weeks)
VALUES ('${PROGRAM}'::uuid, '${OWNER}'::uuid, 'Delete lock race', '', 8);
SQL

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-delete-hold.out 2>&1 &
SET application_name = '${HOLD_APP}';
BEGIN;
SELECT pg_advisory_xact_lock(${ADV_KEY});
SELECT pg_sleep(60);
ROLLBACK;
SQL
hold_pid=$!

got=0
for _ in $(seq 1 50); do
  got="$(psql_at "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${HOLD_APP}' AND l.locktype = 'advisory' AND l.granted")"
  if [[ "${got}" != "0" ]]; then
    break
  fi
  sleep 0.1
done
if [[ "${got}" == "0" ]]; then
  echo "hold session never acquired advisory lock" >&2
  cat /tmp/prometheus-delete-hold.out >&2 || true
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-delete-assign.out 2>/tmp/prometheus-delete-assign.err &
SET application_name = '${ASSIGN_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', true);
SELECT public.assign_program_secure('${PROGRAM}'::uuid, '${CLIENT}'::uuid, CURRENT_DATE);
SELECT pg_advisory_xact_lock(${ADV_KEY});
COMMIT;
SQL
assign_pid=$!

waiting=0
for _ in $(seq 1 50); do
  waiting="$(psql_at "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${ASSIGN_APP}' AND l.locktype = 'advisory' AND NOT l.granted")"
  if [[ "${waiting}" != "0" ]]; then
    break
  fi
  if ! kill -0 "${assign_pid}" 2>/dev/null; then
    break
  fi
  sleep 0.1
done
if [[ "${waiting}" == "0" ]]; then
  echo "assign session never waited on advisory after insert" >&2
  cat /tmp/prometheus-delete-assign.out /tmp/prometheus-delete-assign.err >&2 || true
  exit 1
fi

rm -f /tmp/prometheus-delete-rpc.out /tmp/prometheus-delete-rpc.err
timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-delete-rpc.out 2>/tmp/prometheus-delete-rpc.err &
SET application_name = '${DELETE_APP}';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', false);
SELECT public.delete_program('${PROGRAM}'::uuid);
SQL
delete_pid=$!

locked=0
for _ in $(seq 1 50); do
  locked="$(psql_at "SELECT count(*) FROM pg_stat_activity WHERE application_name = '${DELETE_APP}' AND wait_event_type = 'Lock'")"
  if [[ "${locked}" != "0" ]]; then
    break
  fi
  if ! kill -0 "${delete_pid}" 2>/dev/null; then
    break
  fi
  sleep 0.1
done
if [[ "${locked}" == "0" ]]; then
  echo "delete_program did not wait on in-flight assignment" >&2
  cat /tmp/prometheus-delete-rpc.out /tmp/prometheus-delete-rpc.err >&2 || true
  exit 1
fi

kill "${hold_pid}" 2>/dev/null || true
psql "$DATABASE_URL" -X -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = '${HOLD_APP}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
wait "${hold_pid}" 2>/dev/null || true
hold_pid=""

assign_rc=0
delete_rc=0
wait "${assign_pid}" || assign_rc=$?
wait "${delete_pid}" || delete_rc=$?
assign_pid=""
delete_pid=""

if [[ "${assign_rc}" -ne 0 ]]; then
  echo "in-flight assign_program_secure failed: rc ${assign_rc}" >&2
  cat /tmp/prometheus-delete-assign.out /tmp/prometheus-delete-assign.err >&2 || true
  exit 1
fi
if [[ "${delete_rc}" -eq 124 ]]; then
  echo "delete_program deadlocked or stalled on in-flight assign" >&2
  cat /tmp/prometheus-delete-rpc.out /tmp/prometheus-delete-rpc.err >&2 || true
  exit 1
fi
if [[ "${delete_rc}" -eq 0 ]]; then
  echo "delete_program committed while an assignment was in flight" >&2
  cat /tmp/prometheus-delete-rpc.out >&2 || true
  exit 1
fi
if ! grep -q 'program_has_active_assignment' /tmp/prometheus-delete-rpc.err; then
  echo "delete_program did not refuse with program_has_active_assignment" >&2
  cat /tmp/prometheus-delete-rpc.out /tmp/prometheus-delete-rpc.err >&2 || true
  exit 1
fi

still_program="$(psql_at "SELECT count(*) FROM public.programs WHERE id = '${PROGRAM}'::uuid")"
still_asg="$(psql_at "SELECT count(*) FROM public.program_assignments WHERE program_id = '${PROGRAM}'::uuid AND status = 'active'")"
if [[ "${still_program}" != "1" || "${still_asg}" != "1" ]]; then
  echo "refused delete destroyed program or assignment (programs=${still_program} assignments=${still_asg})" >&2
  exit 1
fi

echo "delete_program row lock: in-flight assign cannot sneak past FOR UPDATE"
