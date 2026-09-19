#!/usr/bin/env bash
# Two real Postgres sessions: skip an occupied advisory key, then two concurrent
# drains on the same prefix. Does not use dblink (non-superuser + local trust).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

ATHLETE='a1950000-0000-4000-8000-0000000000cc'
KEY_A="${ATHLETE}:concurrent-a"
KEY_B="${ATHLETE}:concurrent-b"
KEY_D1="${ATHLETE}:concurrent-d1"
KEY_D2="${ATHLETE}:concurrent-d2"
HOLD_APP='prometheus-drain-hold'

psql_at() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "$1"
}

hold_pid=""
cleanup() {
  if [[ -n "${hold_pid}" ]] && kill -0 "${hold_pid}" 2>/dev/null; then
    kill "${hold_pid}" 2>/dev/null || true
    wait "${hold_pid}" 2>/dev/null || true
  fi
  psql "$DATABASE_URL" -X -c "
    DELETE FROM public.athlete_decision_log WHERE athlete_id = '${ATHLETE}'::uuid;
    DELETE FROM public.athlete_decision_outbox WHERE athlete_id = '${ATHLETE}'::uuid;
    DELETE FROM public.user_profiles WHERE id = '${ATHLETE}'::uuid;
    DELETE FROM public.user_roles WHERE user_id = '${ATHLETE}'::uuid;
    DELETE FROM auth.users WHERE id = '${ATHLETE}'::uuid;
  " >/dev/null 2>&1 || true
}
trap cleanup EXIT

payload() {
  local key="$1"
  local why="$2"
  printf '{"domain":"training","type":"missed_sessions","decision":"accepted","proposal":{"action":"relance"},"why":"%s","data_used":{"workout_count":1},"applied_effect":{},"idempotency_key":"%s"}' "$why" "$key"
}

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users(id, email)
VALUES ('${ATHLETE}'::uuid, 'p23d-conc@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles(user_id, role, coaching_role)
VALUES ('${ATHLETE}'::uuid, 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = EXCLUDED.coaching_role;
DELETE FROM public.athlete_decision_log WHERE athlete_id = '${ATHLETE}'::uuid;
DELETE FROM public.athlete_decision_outbox WHERE athlete_id = '${ATHLETE}'::uuid;
DELETE FROM public.user_profiles WHERE id = '${ATHLETE}'::uuid;
INSERT INTO public.athlete_decision_outbox (
  id, idempotency_key, athlete_id, actor_id, payload, created_at, next_attempt_at, attempts
) VALUES (
  'a1950000-0000-4000-8000-0000000000c1',
  '${KEY_A}',
  '${ATHLETE}'::uuid,
  '${ATHLETE}'::uuid,
  '$(payload "$KEY_A" concurrent-a)'::jsonb,
  timestamptz '2020-01-01 00:00:00+00',
  timestamptz '2020-01-01 00:00:00+00',
  0
), (
  'a1950000-0000-4000-8000-0000000000c2',
  '${KEY_B}',
  '${ATHLETE}'::uuid,
  '${ATHLETE}'::uuid,
  '$(payload "$KEY_B" concurrent-b)'::jsonb,
  timestamptz '2020-01-01 00:00:00+00',
  timestamptz '2020-01-01 00:00:00+00',
  0
);
SQL

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL &
SET application_name = '${HOLD_APP}';
BEGIN;
SELECT pg_advisory_xact_lock(
  ('x' || substr(md5('${ATHLETE}' || ':decision:' || '${KEY_A}'), 1, 16))::bit(64)::bigint
);
SELECT pg_sleep(20);
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
  exit 1
fi

set +e
drain_out="$(PGOPTIONS='-c statement_timeout=1500ms' psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "SELECT public.drain_athlete_decision_outbox(2);" 2>/tmp/prometheus-drain-hold.err)"
drain_rc=$?
set -e
drain_out="$(printf '%s' "${drain_out}" | tr -d '[:space:]')"
if [[ "${drain_rc}" -ne 0 ]]; then
  echo "drain waited on occupied key" >&2
  cat /tmp/prometheus-drain-hold.err >&2 || true
  exit 1
fi
if [[ "${drain_out}" != "1" ]]; then
  echo "occupied-key drain should skip and process the other row: ${drain_out}" >&2
  exit 1
fi

held_journaled="$(psql_at "SELECT count(*) FROM public.athlete_decision_log WHERE idempotency_key = '${KEY_A}'")"
if [[ "${held_journaled}" != "0" ]]; then
  echo "held key was journaled while occupied" >&2
  exit 1
fi
free_journaled="$(psql_at "SELECT count(*) FROM public.athlete_decision_log WHERE idempotency_key = '${KEY_B}'")"
if [[ "${free_journaled}" != "1" ]]; then
  echo "second key not drained while first occupied" >&2
  exit 1
fi

kill "${hold_pid}" 2>/dev/null || true
wait "${hold_pid}" 2>/dev/null || true
hold_pid=""

after="$(psql_at "SELECT public.drain_athlete_decision_outbox(2)")"
a_journaled="$(psql_at "SELECT count(*) FROM public.athlete_decision_log WHERE idempotency_key = '${KEY_A}'")"
if [[ "${a_journaled}" != "1" ]]; then
  echo "held key not drained after lock released (drain=${after})" >&2
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO public.athlete_decision_outbox (
  id, idempotency_key, athlete_id, actor_id, payload, created_at, next_attempt_at, attempts
) VALUES (
  'a1950000-0000-4000-8000-0000000000d1',
  '${KEY_D1}',
  '${ATHLETE}'::uuid,
  '${ATHLETE}'::uuid,
  '$(payload "$KEY_D1" concurrent-d1)'::jsonb,
  timestamptz '2019-01-01 00:00:00+00',
  timestamptz '2019-01-01 00:00:00+00',
  0
), (
  'a1950000-0000-4000-8000-0000000000d2',
  '${KEY_D2}',
  '${ATHLETE}'::uuid,
  '${ATHLETE}'::uuid,
  '$(payload "$KEY_D2" concurrent-d2)'::jsonb,
  timestamptz '2019-01-01 00:00:00+00',
  timestamptz '2019-01-01 00:00:00+00',
  0
);
SQL

rm -f /tmp/prometheus-drain-d1.out /tmp/prometheus-drain-d2.out /tmp/prometheus-drain-d1.err /tmp/prometheus-drain-d2.err
timeout 3 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "SELECT public.drain_athlete_decision_outbox(25)" \
  >/tmp/prometheus-drain-d1.out 2>/tmp/prometheus-drain-d1.err &
d1_pid=$!
timeout 3 psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "SELECT public.drain_athlete_decision_outbox(25)" \
  >/tmp/prometheus-drain-d2.out 2>/tmp/prometheus-drain-d2.err &
d2_pid=$!
e1=0
e2=0
wait "${d1_pid}" || e1=$?
wait "${d2_pid}" || e2=$?
if [[ "${e1}" -eq 124 || "${e2}" -eq 124 ]]; then
  echo "concurrent drains deadlocked or stalled" >&2
  cat /tmp/prometheus-drain-d1.err /tmp/prometheus-drain-d2.err >&2 || true
  exit 1
fi
if [[ "${e1}" -ne 0 || "${e2}" -ne 0 ]]; then
  echo "concurrent drains lost or duplicated work: rc ${e1} ${e2}" >&2
  cat /tmp/prometheus-drain-d1.err /tmp/prometheus-drain-d2.err >&2 || true
  exit 1
fi

n1="$(tr -d '[:space:]' </tmp/prometheus-drain-d1.out)"
n2="$(tr -d '[:space:]' </tmp/prometheus-drain-d2.out)"
n1="${n1:-0}"
n2="${n2:-0}"
if [[ $((n1 + n2)) -ne 2 ]]; then
  echo "concurrent drains lost or duplicated work: ${n1} ${n2}" >&2
  cat /tmp/prometheus-drain-d1.err /tmp/prometheus-drain-d2.err >&2 || true
  exit 1
fi

n_log="$(psql_at "SELECT count(*) FROM public.athlete_decision_log WHERE idempotency_key IN ('${KEY_D1}', '${KEY_D2}')")"
if [[ "${n_log}" != "2" ]]; then
  echo "concurrent drains did not journal both keys: ${n_log}" >&2
  exit 1
fi

echo "decision drain concurrency: skip occupied key, two sessions no deadlock"
