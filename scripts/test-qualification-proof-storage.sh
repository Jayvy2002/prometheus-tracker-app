#!/usr/bin/env bash
# Qualification proof withdraw is fail-safe: Storage API .remove() first,
# then DB DELETE. SQL DELETE of storage.objects is forbidden.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

COACH='d41b0000-0000-4000-8000-000000000001'
QUAL=''

psql_at() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "$1"
}

status_json="$(supabase status -o json 2>/dev/null || true)"
if [[ -z "${status_json}" ]]; then
  echo "supabase status -o json unavailable" >&2
  exit 1
fi
API_URL="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["API_URL"])' <<<"${status_json}")"
SERVICE_ROLE_KEY="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])' <<<"${status_json}")"
host="$(python3 -c 'from urllib.parse import urlparse; import sys; print(urlparse(sys.argv[1]).hostname)' "${API_URL}")"
if [[ "${host}" != "127.0.0.1" && "${host}" != "localhost" ]]; then
  echo "refusing non-local Storage API host ${host}" >&2
  exit 1
fi

cleanup() {
  psql "$DATABASE_URL" -X -c "
    SELECT set_config('storage.allow_delete_query', 'true', true);
    DELETE FROM storage.objects WHERE bucket_id = 'qualification-proofs' AND name LIKE '${COACH}/%';
    DELETE FROM public.coach_qualifications WHERE coach_id = '${COACH}'::uuid;
    DELETE FROM public.coach_profiles WHERE coach_id = '${COACH}'::uuid;
    DELETE FROM public.user_capabilities WHERE user_id = '${COACH}'::uuid;
    DELETE FROM public.user_profiles WHERE id = '${COACH}'::uuid;
    DELETE FROM public.user_roles WHERE user_id = '${COACH}'::uuid;
    DELETE FROM auth.users WHERE id = '${COACH}'::uuid;
  " >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users(id, email)
VALUES ('${COACH}'::uuid, 'p41-storage-coach@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles(user_id, role, coaching_role)
VALUES ('${COACH}'::uuid, 'free', 'coach')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = EXCLUDED.coaching_role;
INSERT INTO public.user_capabilities(user_id, capability)
VALUES ('${COACH}'::uuid, 'coach')
ON CONFLICT DO NOTHING;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.save_my_coach_profile('{"public_name":"Storage Coach","introduction":"Exp","method":"Weekly","offer":"Terms","disciplines":["strength"],"languages":["en"],"formats":["online"]}');
SELECT public.declare_coach_qualification('CSCS', 'certification', 'NSCA');
COMMIT;
SQL

QUAL="$(psql_at "SELECT id FROM public.coach_qualifications WHERE coach_id = '${COACH}'::uuid ORDER BY declared_at DESC LIMIT 1")"
if [[ -z "${QUAL}" ]]; then
  echo "missing declared qualification" >&2
  exit 1
fi

PATH_NAME="${COACH}/${QUAL}/proof.pdf"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.save_coach_qualification(
  '${QUAL}'::uuid,
  'CSCS',
  'certification',
  'NSCA',
  '${PATH_NAME}',
  NULL
);
COMMIT;
SQL

printf '%%PDF-1.1 test proof\n' > /tmp/prometheus-qual-proof.pdf
upload_code="$(curl -sS -o /tmp/prometheus-qual-upload.out -w '%{http_code}' -X POST \
  "${API_URL}/storage/v1/object/qualification-proofs/${PATH_NAME}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/pdf" \
  --data-binary @/tmp/prometheus-qual-proof.pdf)"
if [[ "${upload_code}" != "200" && "${upload_code}" != "201" ]]; then
  echo "Storage API upload failed (${upload_code})" >&2
  cat /tmp/prometheus-qual-upload.out >&2 || true
  exit 1
fi

before_err="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
DO \$\$
BEGIN
  PERFORM public.withdraw_coach_qualification('${QUAL}'::uuid);
  RAISE EXCEPTION 'withdraw succeeded while proof object existed';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%withdraw succeeded while proof object existed%' THEN RAISE; END IF;
    IF SQLERRM <> 'proof_cleanup_required' THEN RAISE; END IF;
END
\$\$;
COMMIT;
SELECT 'proof_cleanup_required';
SQL
)"
if ! grep -q 'proof_cleanup_required' <<<"${before_err}"; then
  echo "withdraw before Storage API cleanup did not refuse: ${before_err}" >&2
  exit 1
fi
still="$(psql_at "SELECT count(*) FROM public.coach_qualifications WHERE id = '${QUAL}'::uuid")"
if [[ "${still}" != "1" ]]; then
  echo "withdraw deleted the qualification before Storage API cleanup" >&2
  exit 1
fi

remove_code="$(curl -sS -o /tmp/prometheus-qual-remove.out -w '%{http_code}' -X DELETE \
  "${API_URL}/storage/v1/object/qualification-proofs" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "[\"${PATH_NAME}\"]")"
if [[ "${remove_code}" != "200" ]]; then
  echo "Storage API .remove() failed (${remove_code})" >&2
  cat /tmp/prometheus-qual-remove.out >&2 || true
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${COACH}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"${COACH}","role":"authenticated"}', true);
SELECT public.withdraw_coach_qualification('${QUAL}'::uuid);
COMMIT;
SQL

left="$(psql_at "SELECT count(*) FROM public.coach_qualifications WHERE id = '${QUAL}'::uuid")"
if [[ "${left}" != "0" ]]; then
  echo "withdraw after Storage API cleanup left the qualification" >&2
  exit 1
fi
obj="$(psql_at "SELECT count(*) FROM storage.objects WHERE bucket_id = 'qualification-proofs' AND name = '${PATH_NAME}'")"
if [[ "${obj}" != "0" ]]; then
  echo "Storage API .remove() left a catalog row" >&2
  exit 1
fi

echo "qualification proof storage: withdraw refuses while object exists; Storage API .remove() then withdraw succeeds; no SQL DELETE of storage.objects"
