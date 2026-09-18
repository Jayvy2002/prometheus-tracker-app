#!/usr/bin/env bash
# Preuve production en lecture seule : lie explicitement la CLI au projet attendu,
# compare l'historique des migrations et prévisualise db push sans appliquer de SQL.
set -euo pipefail

EXPECTED_REF="phyuijjekxtjvipjtdfv"
REF="${SUPABASE_PROJECT_REF:-$EXPECTED_REF}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$REF" != "$EXPECTED_REF" ]]; then
  echo "Projet Supabase inattendu: '$REF' (attendu: '$EXPECTED_REF'). Refus du contrôle production." >&2
  exit 1
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN manquant — preuve production impossible." >&2
  exit 1
fi

if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "SUPABASE_DB_PASSWORD manquant — lien CLI / dry-run production impossible." >&2
  exit 1
fi

if command -v supabase >/dev/null 2>&1; then
  SUPABASE=(supabase)
else
  SUPABASE=(npx --yes supabase@2.117.0)
fi

mkdir -p /tmp/prometheus-mig

"${SUPABASE[@]}" --version | tee /tmp/prometheus-mig/cli-version.txt

echo "=== supabase link --project-ref $REF ==="
"${SUPABASE[@]}" --agent no link --project-ref "$REF"

LINKED_REF="$(cat supabase/.temp/project-ref 2>/dev/null || true)"
if [[ "$LINKED_REF" != "$REF" ]]; then
  echo "La CLI Supabase n'est pas liée au projet production attendu après 'supabase link'." >&2
  exit 1
fi
printf '%s\n' "$LINKED_REF" > /tmp/prometheus-mig/linked-project-ref.txt

echo "=== supabase migration list (linked production) ==="
"${SUPABASE[@]}" --agent no migration list | tee /tmp/prometheus-mig/migration-list.txt
node scripts/assert-migration-list.mjs /tmp/prometheus-mig/migration-list.txt

echo "=== supabase db push --dry-run (linked production) ==="
"${SUPABASE[@]}" --agent no db push --dry-run | tee /tmp/prometheus-mig/db-push-dry-run.txt
node scripts/assert-db-push-dry-run.mjs /tmp/prometheus-mig/db-push-dry-run.txt

echo "prod-migration-sync OK — production vérifiée sans appliquer de migration."
