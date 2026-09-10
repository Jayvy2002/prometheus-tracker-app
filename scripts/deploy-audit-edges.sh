#!/usr/bin/env bash
# Déploiement CLI optionnel des deux Edge Functions d'audit (I01–I04 / tournée).
# Le live du 10 sept. 2026 (fleet v32 / agent v25) a été posé via Supabase
# Management API — ce script n'est PAS la preuve de ce déploiement.
# Usage : SUPABASE_ACCESS_TOKEN=… ./scripts/deploy-audit-edges.sh
# Échoue sans token (jamais exit 0). Dépôt privé GitHub Free : secret repo.
set -euo pipefail
REF="${SUPABASE_PROJECT_REF:-phyuijjekxtjvipjtdfv}"
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN manquant — impossible de déployer en CLI." >&2
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "CLI supabase absente du PATH — npx." >&2
  SUPABASE=(npx --yes supabase)
else
  SUPABASE=(supabase)
fi

echo "=== CLI deploy coach-fleet-round (verify_jwt=false) ==="
"${SUPABASE[@]}" functions deploy coach-fleet-round --project-ref "$REF" --no-verify-jwt
echo "=== CLI deploy coach-agent (verify_jwt=true, défaut config.toml) ==="
"${SUPABASE[@]}" functions deploy coach-agent --project-ref "$REF"

echo "--- inventaire live ---"
curl -sS -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  "https://api.supabase.com/v1/projects/${REF}/functions" \
  | python3 -c "
import json, sys
fns = json.load(sys.stdin)
if not isinstance(fns, list):
    print('inventaire illisible:', str(fns)[:200], file=sys.stderr)
    sys.exit(1)
want = {'coach-fleet-round', 'coach-agent'}
found = 0
for f in sorted(fns, key=lambda x: x.get('slug', '')):
    if f.get('slug') in want:
        found += 1
        print(f\"{f['slug']} version={f.get('version')} verify_jwt={f.get('verify_jwt')} status={f.get('status')} import_map={f.get('import_map')}\")
if found != 2:
    sys.exit(1)
"
echo "CLI deploy OK"
