#!/usr/bin/env bash
# Preuve CLI : migration list sans divergence + db push --dry-run sans ancienne.
# Ne répare pas Production. Ne pousse rien.
set -euo pipefail
REF="${SUPABASE_PROJECT_REF:-phyuijjekxtjvipjtdfv}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN manquant — preuve CLI migration list / dry-run impossible." >&2
  exit 1
fi

if command -v supabase >/dev/null 2>&1; then
  SUPABASE=(supabase)
else
  SUPABASE=(npx --yes supabase@2.117.0)
fi

mkdir -p /tmp/prometheus-mig
echo "=== supabase migration list --project-ref ${REF} ==="
"${SUPABASE[@]}" --agent no migration list --project-ref "$REF" | tee /tmp/prometheus-mig/migration-list.txt
node scripts/assert-migration-list.mjs /tmp/prometheus-mig/migration-list.txt

echo "=== supabase db push --dry-run --project-ref ${REF} ==="
"${SUPABASE[@]}" --agent no db push --dry-run --project-ref "$REF" | tee /tmp/prometheus-mig/db-push-dry-run.txt
node scripts/assert-db-push-dry-run.mjs /tmp/prometheus-mig/db-push-dry-run.txt

echo "prod-migration-sync OK"
