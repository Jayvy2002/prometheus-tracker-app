#!/usr/bin/env bash
# Two real Postgres sessions: activate_program_version / save_program versus
# client_end_coach_link. FOR UPDATE on programs must serialize freeze so the
# pin is the committed live revision, never a torn activation.
# Does not use dblink (same harness as scripts/test-delete-program-lock.sh).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

OWNER='d1e80000-0000-4000-8000-000000000001'
CLIENT='d1e80000-0000-4000-8000-000000000004'
PROGRAM_A='d1e80000-0000-4000-8000-000000000010'
PROGRAM_B='d1e80000-0000-4000-8000-000000000011'
PROGRAM_C='d1e80000-0000-4000-8000-000000000012'
LINK='d1e80000-0000-4000-8000-0000000000aa'
ADV_A=872009200146
ADV_B=872009200147
ADV_C=872009200148
HOLD_APP='prometheus-freeze-hold'
ACTIVATE_APP='prometheus-freeze-activate'
DEPART_APP='prometheus-freeze-depart'
SAVE_APP='prometheus-freeze-save'

psql_at() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "$1"
}

hold_pid=""
activate_pid=""
depart_pid=""
save_pid=""
cleanup() {
  for pid in "${depart_pid}" "${activate_pid}" "${save_pid}" "${hold_pid}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      wait "${pid}" 2>/dev/null || true
    fi
  done
  psql "$DATABASE_URL" -X -c "
    SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
     WHERE application_name IN ('${HOLD_APP}', '${ACTIVATE_APP}', '${DEPART_APP}', '${SAVE_APP}')
       AND pid <> pg_backend_pid();
    DELETE FROM public.program_assignments
     WHERE program_id IN ('${PROGRAM_A}'::uuid, '${PROGRAM_B}'::uuid, '${PROGRAM_C}'::uuid);
    DELETE FROM public.program_revisions
     WHERE program_id IN ('${PROGRAM_A}'::uuid, '${PROGRAM_B}'::uuid, '${PROGRAM_C}'::uuid);
    DELETE FROM public.programs
     WHERE id IN ('${PROGRAM_A}'::uuid, '${PROGRAM_B}'::uuid, '${PROGRAM_C}'::uuid);
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
  ('${OWNER}'::uuid, 'p3h-freeze-lock-owner@example.test'),
  ('${CLIENT}'::uuid, 'p3h-freeze-lock-client@example.test')
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
 WHERE program_id IN ('${PROGRAM_A}'::uuid, '${PROGRAM_B}'::uuid, '${PROGRAM_C}'::uuid);
DELETE FROM public.program_revisions
 WHERE program_id IN ('${PROGRAM_A}'::uuid, '${PROGRAM_B}'::uuid, '${PROGRAM_C}'::uuid);
DELETE FROM public.programs
 WHERE id IN ('${PROGRAM_A}'::uuid, '${PROGRAM_B}'::uuid, '${PROGRAM_C}'::uuid);
DELETE FROM public.coach_client_links WHERE id = '${LINK}'::uuid;
INSERT INTO public.coach_client_links(id, coach_id, client_id, status)
VALUES ('${LINK}'::uuid, '${OWNER}'::uuid, '${CLIENT}'::uuid, 'active');
SQL
}

seed_program() {
  local program="$1"
  local name="$2"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO public.programs(id, owner_id, name, description, duration_weeks)
VALUES ('${program}'::uuid, '${OWNER}'::uuid, '${name}', 'version A', 8);
SQL
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
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
SELECT public.save_program_version(
  '${program}'::uuid,
  '${name} B',
  'version B',
  8,
  '[{"weekday":1,"name":"Push B","exercises":[{"name":"Press","default_sets":4,"default_reps":6}]}]'::jsonb,
  null
);
SELECT public.assign_program_secure('${program}'::uuid, '${CLIENT}'::uuid, CURRENT_DATE);
COMMIT;
SQL
}

hold_advisory() {
  local key="$1"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-freeze-hold.out 2>&1 &
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
    cat /tmp/prometheus-freeze-hold.out >&2 || true
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

seed_users

# --- Cas A: activation locks first; freeze waits; pin = new revision. ---
seed_program "${PROGRAM_A}" "Freeze A"
rev_a1="$(psql_at "SELECT active_revision_no FROM public.programs WHERE id = '${PROGRAM_A}'::uuid")"
rev_a2="$(psql_at "SELECT max(revision_no) FROM public.program_revisions WHERE program_id = '${PROGRAM_A}'::uuid")"
if [[ "${rev_a1}" == "${rev_a2}" ]]; then
  echo "Cas A fixture missing a saved version B" >&2
  exit 1
fi

hold_advisory "${ADV_A}"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-freeze-activate.out 2>/tmp/prometheus-freeze-activate.err &
SET application_name = '${ACTIVATE_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', true);
SELECT public.activate_program_version('${PROGRAM_A}'::uuid, ${rev_a2}, null);
SELECT pg_advisory_xact_lock(${ADV_A});
COMMIT;
SQL
activate_pid=$!

if [[ "$(wait_advisory_waiter "${ACTIVATE_APP}" activate_pid)" == "0" ]]; then
  echo "Cas A activate session never waited on advisory after locking programs" >&2
  cat /tmp/prometheus-freeze-activate.out /tmp/prometheus-freeze-activate.err >&2 || true
  exit 1
fi

rm -f /tmp/prometheus-freeze-depart.out /tmp/prometheus-freeze-depart.err
timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-freeze-depart.out 2>/tmp/prometheus-freeze-depart.err &
SET application_name = '${DEPART_APP}';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT}","role":"authenticated"}', false);
SELECT public.client_end_coach_link();
SQL
depart_pid=$!

if [[ "$(wait_row_lock "${DEPART_APP}" depart_pid)" == "0" ]]; then
  echo "Cas A departure did not wait on in-flight activation" >&2
  cat /tmp/prometheus-freeze-depart.out /tmp/prometheus-freeze-depart.err >&2 || true
  exit 1
fi

release_hold
activate_rc=0
depart_rc=0
wait "${activate_pid}" || activate_rc=$?
wait "${depart_pid}" || depart_rc=$?
activate_pid=""
depart_pid=""

if [[ "${activate_rc}" -ne 0 ]]; then
  echo "Cas A activate_program_version failed: rc ${activate_rc}" >&2
  cat /tmp/prometheus-freeze-activate.out /tmp/prometheus-freeze-activate.err >&2 || true
  exit 1
fi
if [[ "${depart_rc}" -eq 124 ]]; then
  echo "Cas A departure deadlocked or stalled on in-flight activate" >&2
  cat /tmp/prometheus-freeze-depart.out /tmp/prometheus-freeze-depart.err >&2 || true
  exit 1
fi
if [[ "${depart_rc}" -ne 0 ]]; then
  echo "Cas A client_end_coach_link failed: rc ${depart_rc}" >&2
  cat /tmp/prometheus-freeze-depart.out /tmp/prometheus-freeze-depart.err >&2 || true
  exit 1
fi

frozen_a="$(psql_at "SELECT frozen_revision_no FROM public.program_assignments WHERE program_id = '${PROGRAM_A}'::uuid AND client_id = '${CLIENT}'::uuid")"
live_a="$(psql_at "SELECT active_revision_no FROM public.programs WHERE id = '${PROGRAM_A}'::uuid")"
if [[ "${frozen_a}" != "${rev_a2}" || "${live_a}" != "${rev_a2}" ]]; then
  echo "Cas A freeze pin ${frozen_a} live ${live_a}, expected new revision ${rev_a2}" >&2
  exit 1
fi

# Relink for Cas B / C.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
UPDATE public.coach_client_links SET status = 'active' WHERE id = '${LINK}'::uuid;
UPDATE public.user_roles SET coaching_role = 'none' WHERE user_id = '${CLIENT}'::uuid;
SQL

# --- Cas B: departure locks first; waiting activate resumes after freeze pin. ---
# Owner-library activate remains allowed after the last client leaves (paused
# archives do not impose Coach). Isolation is the freeze pin staying on the old
# revision — not a restore of paused-blocks-owner.
seed_program "${PROGRAM_B}" "Freeze B"
rev_b1="$(psql_at "SELECT active_revision_no FROM public.programs WHERE id = '${PROGRAM_B}'::uuid")"
rev_b2="$(psql_at "SELECT max(revision_no) FROM public.program_revisions WHERE program_id = '${PROGRAM_B}'::uuid")"

hold_advisory "${ADV_B}"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-freeze-depart-b.out 2>/tmp/prometheus-freeze-depart-b.err &
SET application_name = '${DEPART_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT}","role":"authenticated"}', true);
SELECT public.client_end_coach_link();
SELECT pg_advisory_xact_lock(${ADV_B});
COMMIT;
SQL
depart_pid=$!

if [[ "$(wait_advisory_waiter "${DEPART_APP}" depart_pid)" == "0" ]]; then
  echo "Cas B departure never waited on advisory after locking programs" >&2
  cat /tmp/prometheus-freeze-depart-b.out /tmp/prometheus-freeze-depart-b.err >&2 || true
  exit 1
fi

rm -f /tmp/prometheus-freeze-activate-b.out /tmp/prometheus-freeze-activate-b.err
timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-freeze-activate-b.out 2>/tmp/prometheus-freeze-activate-b.err &
SET application_name = '${ACTIVATE_APP}';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', false);
SELECT public.activate_program_version('${PROGRAM_B}'::uuid, ${rev_b2}, null);
SQL
activate_pid=$!

if [[ "$(wait_row_lock "${ACTIVATE_APP}" activate_pid)" == "0" ]]; then
  echo "Cas B activation did not wait on in-flight departure" >&2
  cat /tmp/prometheus-freeze-activate-b.out /tmp/prometheus-freeze-activate-b.err >&2 || true
  exit 1
fi

release_hold
depart_rc=0
activate_rc=0
wait "${depart_pid}" || depart_rc=$?
wait "${activate_pid}" || activate_rc=$?
depart_pid=""
activate_pid=""

if [[ "${depart_rc}" -ne 0 ]]; then
  echo "Cas B client_end_coach_link failed: rc ${depart_rc}" >&2
  cat /tmp/prometheus-freeze-depart-b.out /tmp/prometheus-freeze-depart-b.err >&2 || true
  exit 1
fi
if [[ "${activate_rc}" -eq 124 ]]; then
  echo "Cas B activate deadlocked or stalled on in-flight departure" >&2
  cat /tmp/prometheus-freeze-activate-b.out /tmp/prometheus-freeze-activate-b.err >&2 || true
  exit 1
fi
if [[ "${activate_rc}" -ne 0 ]]; then
  echo "Cas B owner-library activate after last client failed: rc ${activate_rc}" >&2
  cat /tmp/prometheus-freeze-activate-b.out /tmp/prometheus-freeze-activate-b.err >&2 || true
  exit 1
fi

frozen_b="$(psql_at "SELECT frozen_revision_no FROM public.program_assignments WHERE program_id = '${PROGRAM_B}'::uuid AND client_id = '${CLIENT}'::uuid")"
live_b="$(psql_at "SELECT active_revision_no FROM public.programs WHERE id = '${PROGRAM_B}'::uuid")"
if [[ "${frozen_b}" != "${rev_b1}" ]]; then
  echo "Cas B freeze pin ${frozen_b}, expected old revision ${rev_b1}" >&2
  exit 1
fi
if [[ "${live_b}" != "${rev_b2}" ]]; then
  echo "Cas B live revision ${live_b}, expected library activate ${rev_b2}" >&2
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
UPDATE public.coach_client_links SET status = 'active' WHERE id = '${LINK}'::uuid;
UPDATE public.user_roles SET coaching_role = 'none' WHERE user_id = '${CLIENT}'::uuid;
SQL

# --- Cas C: save_program live locks first; freeze waits; pin stays current revision. ---
seed_program "${PROGRAM_C}" "Freeze C"
rev_c1="$(psql_at "SELECT active_revision_no FROM public.programs WHERE id = '${PROGRAM_C}'::uuid")"

hold_advisory "${ADV_C}"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-freeze-save.out 2>/tmp/prometheus-freeze-save.err &
SET application_name = '${SAVE_APP}';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${OWNER}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', true);
SELECT public.save_program(
  '${PROGRAM_C}'::uuid,
  'Freeze C live',
  'version C live',
  8,
  '[{"weekday":1,"name":"Push C","exercises":[{"name":"Squat","default_sets":3,"default_reps":5}]}]'::jsonb,
  null
);
SELECT pg_advisory_xact_lock(${ADV_C});
COMMIT;
SQL
save_pid=$!

if [[ "$(wait_advisory_waiter "${SAVE_APP}" save_pid)" == "0" ]]; then
  echo "Cas C save_program never waited on advisory after locking programs" >&2
  cat /tmp/prometheus-freeze-save.out /tmp/prometheus-freeze-save.err >&2 || true
  exit 1
fi

rm -f /tmp/prometheus-freeze-depart-c.out /tmp/prometheus-freeze-depart-c.err
timeout 20 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/prometheus-freeze-depart-c.out 2>/tmp/prometheus-freeze-depart-c.err &
SET application_name = '${DEPART_APP}';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${CLIENT}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', '{"sub":"${CLIENT}","role":"authenticated"}', false);
SELECT public.client_end_coach_link();
SQL
depart_pid=$!

if [[ "$(wait_row_lock "${DEPART_APP}" depart_pid)" == "0" ]]; then
  echo "Cas C departure did not wait on in-flight save_program" >&2
  cat /tmp/prometheus-freeze-depart-c.out /tmp/prometheus-freeze-depart-c.err >&2 || true
  exit 1
fi

release_hold
save_rc=0
depart_rc=0
wait "${save_pid}" || save_rc=$?
wait "${depart_pid}" || depart_rc=$?
save_pid=""
depart_pid=""

if [[ "${save_rc}" -ne 0 ]]; then
  echo "Cas C save_program failed: rc ${save_rc}" >&2
  cat /tmp/prometheus-freeze-save.out /tmp/prometheus-freeze-save.err >&2 || true
  exit 1
fi
if [[ "${depart_rc}" -ne 0 ]]; then
  echo "Cas C client_end_coach_link failed: rc ${depart_rc}" >&2
  cat /tmp/prometheus-freeze-depart-c.out /tmp/prometheus-freeze-depart-c.err >&2 || true
  exit 1
fi

frozen_c="$(psql_at "SELECT frozen_revision_no FROM public.program_assignments WHERE program_id = '${PROGRAM_C}'::uuid AND client_id = '${CLIENT}'::uuid")"
if [[ "${frozen_c}" != "${rev_c1}" ]]; then
  echo "Cas C freeze pin ${frozen_c}, expected current revision ${rev_c1}" >&2
  exit 1
fi

echo "freeze/activation row lock: Cas A pin new revision; Cas B pin old then owner library; Cas C save_program serializes"
