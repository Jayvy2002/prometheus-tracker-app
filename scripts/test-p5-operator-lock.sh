#!/usr/bin/env bash
# Two operators revoke each other, then a grant races a revoke.
# Both mutations take advisory class 20014508 before touching the allowlist.
# The pause trigger only holds the test lock so the second session can queue.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

A='c5410000-0000-4000-8000-00000000000a'
B='c5410000-0000-4000-8000-00000000000b'
C='c5410000-0000-4000-8000-00000000000c'
OP_CLASS=20014508
OP_OBJ=1135
HOLD_CLASS=872009
HOLD_OBJ=541135
HOLD_APP='prometheus-p54-hold'
REVOKE_A='prometheus-p54-revoke-a'
REVOKE_B='prometheus-p54-revoke-b'
GRANT_APP='prometheus-p54-grant'
REVOKE_G='prometheus-p54-revoke-grant'

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
    cat /tmp/p54-revoke-a.out /tmp/p54-revoke-a.err /tmp/p54-revoke-b.out /tmp/p54-revoke-b.err \
      /tmp/p54-grant.out /tmp/p54-grant.err /tmp/p54-revoke-grant.out /tmp/p54-revoke-grant.err >&2 || true
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
 WHERE application_name IN ('${HOLD_APP}', '${REVOKE_A}', '${REVOKE_B}', '${GRANT_APP}', '${REVOKE_G}')
   AND pid <> pg_backend_pid();
DROP TRIGGER IF EXISTS p54_pause_operator ON public.platform_operators;
DROP FUNCTION IF EXISTS public.p54_pause_operator();
DELETE FROM public.platform_admin_audit
 WHERE subject_id IN ('${A}'::uuid, '${B}'::uuid, '${C}'::uuid);
DELETE FROM public.platform_operators
 WHERE user_id IN ('${A}'::uuid, '${B}'::uuid, '${C}'::uuid);
DELETE FROM public.user_roles
 WHERE user_id IN ('${A}'::uuid, '${B}'::uuid, '${C}'::uuid);
DELETE FROM auth.users
 WHERE id IN ('${A}'::uuid, '${B}'::uuid, '${C}'::uuid);
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

active_count() {
  psql_at "SELECT count(*) FROM public.platform_operators WHERE user_id IN ('${A}'::uuid, '${B}'::uuid, '${C}'::uuid) AND revoked_at IS NULL"
}

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users(id, email) VALUES
  ('${A}'::uuid, 'p54-lock-a@example.test'),
  ('${B}'::uuid, 'p54-lock-b@example.test'),
  ('${C}'::uuid, 'p54-lock-c@example.test')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
  ('${A}'::uuid, 'free', 'none'),
  ('${B}'::uuid, 'free', 'none'),
  ('${C}'::uuid, 'free', 'none')
ON CONFLICT (user_id) DO NOTHING;

SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
SELECT public.grant_platform_operator('${A}'::uuid, true);
SELECT public.grant_platform_operator('${B}'::uuid, true);
SQL

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
CREATE OR REPLACE FUNCTION public.p54_pause_operator()
RETURNS trigger
LANGUAGE plpgsql
AS \$\$
BEGIN
  PERFORM pg_advisory_xact_lock(${HOLD_CLASS}, ${HOLD_OBJ});
  RETURN NEW;
END;
\$\$;

DROP TRIGGER IF EXISTS p54_pause_operator ON public.platform_operators;
CREATE TRIGGER p54_pause_operator
  BEFORE INSERT OR UPDATE ON public.platform_operators
  FOR EACH ROW
  EXECUTE FUNCTION public.p54_pause_operator();
SQL

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p54-hold.out 2>&1 &
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

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p54-revoke-a.out 2>/tmp/p54-revoke-a.err &
SET application_name = '${REVOKE_A}';
SELECT set_config('request.jwt.claim.sub', '${A}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', json_build_object('sub', '${A}', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
DO \$\$
DECLARE
  v jsonb;
BEGIN
  v := public.admin_revoke_platform_operator('${B}'::uuid, true);
  RAISE NOTICE 'status:%', v->>'status';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'status:%', SQLERRM;
END \$\$;
SQL
a_pid=$!

if ! wait_state "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${REVOKE_A}' AND l.locktype = 'advisory' AND l.classid = ${OP_CLASS} AND l.objid = ${OP_OBJ} AND l.granted" "${a_pid}"; then
  echo "revoke A did not hold the operator mutex" >&2
  cat /tmp/p54-revoke-a.out /tmp/p54-revoke-a.err >&2 || true
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p54-revoke-b.out 2>/tmp/p54-revoke-b.err &
SET application_name = '${REVOKE_B}';
SELECT set_config('request.jwt.claim.sub', '${B}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', json_build_object('sub', '${B}', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
DO \$\$
DECLARE
  v jsonb;
BEGIN
  v := public.admin_revoke_platform_operator('${A}'::uuid, true);
  RAISE NOTICE 'status:%', v->>'status';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'status:%', SQLERRM;
END \$\$;
SQL
b_pid=$!

if ! wait_state "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${REVOKE_B}' AND l.locktype = 'advisory' AND l.classid = ${OP_CLASS} AND l.objid = ${OP_OBJ} AND NOT l.granted" "${b_pid}"; then
  echo "revoke B did not wait on the operator mutex" >&2
  cat /tmp/p54-revoke-a.out /tmp/p54-revoke-a.err /tmp/p54-revoke-b.out /tmp/p54-revoke-b.err >&2 || true
  exit 1
fi

psql "$DATABASE_URL" -X -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = '${HOLD_APP}' AND pid <> pg_backend_pid();" >/dev/null
wait "${a_pid}" || { echo "revoke A failed" >&2; cat /tmp/p54-revoke-a.err >&2; exit 1; }
wait "${b_pid}" || { echo "revoke B failed" >&2; cat /tmp/p54-revoke-b.err >&2; exit 1; }
hold_pid=""
a_pid=""
b_pid=""

assert_no_deadlock /tmp/p54-revoke-a.err /tmp/p54-revoke-b.err /tmp/p54-revoke-a.out /tmp/p54-revoke-b.out

A_STATUS="$(grep -oE 'status:(revoked|last_operator)' /tmp/p54-revoke-a.err | head -n 1 || true)"
B_STATUS="$(grep -oE 'status:(revoked|last_operator)' /tmp/p54-revoke-b.err | head -n 1 || true)"
PAIR="$(printf '%s\n%s\n' "${A_STATUS}" "${B_STATUS}" | sort | tr '\n' ' ')"
if [[ "${PAIR}" != "status:last_operator status:revoked " ]]; then
  echo "unexpected revoke pair: ${PAIR}" >&2
  exit 1
fi
if [[ "$(active_count)" != "1" ]]; then
  echo "revoke race left $(active_count) operators" >&2
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "UPDATE public.platform_operators SET revoked_at = NULL WHERE user_id IN ('${A}'::uuid, '${B}'::uuid);" >/dev/null

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p54-hold.out 2>&1 &
SET application_name = '${HOLD_APP}';
BEGIN;
SELECT pg_advisory_xact_lock(${HOLD_CLASS}, ${HOLD_OBJ});
SELECT pg_sleep(60);
COMMIT;
SQL
hold_pid=$!

if ! wait_state "SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND classid = ${HOLD_CLASS} AND objid = ${HOLD_OBJ} AND granted" "${hold_pid}"; then
  echo "second hold lock was not taken" >&2
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p54-grant.out 2>/tmp/p54-grant.err &
SET application_name = '${GRANT_APP}';
SELECT set_config('request.jwt.claim.sub', '${A}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', json_build_object('sub', '${A}', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
DO \$\$
DECLARE
  v jsonb;
BEGIN
  v := public.grant_platform_operator('${C}'::uuid, true);
  RAISE NOTICE 'status:%', v->>'status';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'status:%', SQLERRM;
END \$\$;
SQL
a_pid=$!

if ! wait_state "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${GRANT_APP}' AND l.locktype = 'advisory' AND l.classid = ${OP_CLASS} AND l.objid = ${OP_OBJ} AND l.granted" "${a_pid}"; then
  echo "grant did not hold the operator mutex" >&2
  cat /tmp/p54-grant.out /tmp/p54-grant.err >&2 || true
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL >/tmp/p54-revoke-grant.out 2>/tmp/p54-revoke-grant.err &
SET application_name = '${REVOKE_G}';
SELECT set_config('request.jwt.claim.sub', '${B}', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claims', json_build_object('sub', '${B}', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
DO \$\$
DECLARE
  v jsonb;
BEGIN
  v := public.admin_revoke_platform_operator('${A}'::uuid, true);
  RAISE NOTICE 'status:%', v->>'status';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'status:%', SQLERRM;
END \$\$;
SQL
b_pid=$!

if ! wait_state "SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid WHERE a.application_name = '${REVOKE_G}' AND l.locktype = 'advisory' AND l.classid = ${OP_CLASS} AND l.objid = ${OP_OBJ} AND NOT l.granted" "${b_pid}"; then
  echo "revoke during grant did not wait on the operator mutex" >&2
  cat /tmp/p54-grant.out /tmp/p54-grant.err /tmp/p54-revoke-grant.out /tmp/p54-revoke-grant.err >&2 || true
  exit 1
fi

psql "$DATABASE_URL" -X -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = '${HOLD_APP}' AND pid <> pg_backend_pid();" >/dev/null
wait "${a_pid}" || { echo "grant failed" >&2; cat /tmp/p54-grant.err >&2; exit 1; }
wait "${b_pid}" || { echo "revoke during grant failed" >&2; cat /tmp/p54-revoke-grant.err >&2; exit 1; }
hold_pid=""
a_pid=""
b_pid=""

assert_no_deadlock /tmp/p54-grant.err /tmp/p54-revoke-grant.err /tmp/p54-grant.out /tmp/p54-revoke-grant.out

G_STATUS="$(grep -oE 'status:[a-z_]+' /tmp/p54-grant.err | head -n 1 || true)"
R_STATUS="$(grep -oE 'status:[a-z_]+' /tmp/p54-revoke-grant.err | head -n 1 || true)"
if [[ "${G_STATUS}" != "status:granted" || "${R_STATUS}" != "status:revoked" ]]; then
  echo "unexpected grant/revoke statuses: ${G_STATUS} ${R_STATUS}" >&2
  exit 1
fi
LEFT="$(active_count)"
if [[ "${LEFT}" -lt 1 ]]; then
  echo "grant race left zero operators" >&2
  exit 1
fi

echo "p5.4 revoke × revoke × grant: one survivor, second last_operator, grant serialized, no zero operators, no deadlock"
