#!/usr/bin/env bash
# Applique en production uniquement les migrations déclarées dans
# supabase/migrations.pending.json, après la preuve dry-run fail-closed.
# Le timestamp du fichier Git est conservé par `supabase db push`.
# Ne pas utiliser le MCP apply_migration : il réécrit la version.
set -euo pipefail

if [[ "${CONFIRM_APPLY:-}" != "APPLY_PENDING" ]]; then
  echo "Refus : CONFIRM_APPLY doit valoir APPLY_PENDING." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash scripts/prod-migration-sync.sh

PENDING_COUNT="$(node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
const pending = JSON.parse(readFileSync('supabase/migrations.pending.json','utf8')).pending;
if (!Array.isArray(pending) || pending.length === 0) {
  console.log('0');
  process.exit(0);
}
for (const row of pending) {
  if (!row.version || !row.name) {
    console.error('pending mal formé');
    process.exit(1);
  }
}
console.log(String(pending.length));
NODE
)"

if [[ "$PENDING_COUNT" == "0" ]]; then
  echo "Aucune migration pending. Rien à appliquer."
  exit 0
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "CLI supabase absente après la preuve dry-run." >&2
  exit 1
fi

echo "=== supabase db push (pending uniquement, timestamp Git conservé) ==="
supabase --agent no db push --linked --yes --skip-vault 2>&1 | tee /tmp/prometheus-mig/db-push-apply.txt

echo "=== supabase migration list après apply ==="
supabase --agent no migration list 2>&1 | tee /tmp/prometheus-mig/migration-list-after.txt

node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
const pending = JSON.parse(readFileSync('supabase/migrations.pending.json','utf8')).pending.map(row => row.version);
const text = readFileSync('/tmp/prometheus-mig/migration-list-after.txt','utf8');
const missing = [];
for (const version of pending) {
  const lines = text.split('\n').filter(line => line.includes(version));
  const remote = lines.some(line => {
    const cells = line.split('|').map(cell => cell.trim().replace(/`/g, ''));
    return cells.length >= 2 && cells[0] === version && cells[1] === version;
  });
  if (!remote) missing.push(version);
}
if (missing.length) {
  console.error('apply incomplet, remote absent pour:', missing.join(', '));
  process.exit(1);
}
console.log('apply observé sur remote pour:', pending.join(', '));
NODE

echo "prod-migration-apply OK"
