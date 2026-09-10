#!/usr/bin/env node
/**
 * Parse `supabase migration list` (local vs remote).
 * Échec si une ligne a Local ≠ Remote, ou une colonne vide, ou le compte ≠ lock.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lock = JSON.parse(readFileSync(resolve(process.cwd(), 'supabase/schema_migrations.lock.json'), 'utf8'));
const lockVersions = lock.applied.map((row) => row.version);
const text = readFileSync(process.argv[2] || '/dev/stdin', 'utf8');

function parseRows(raw) {
  const jsonStart = raw.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      if (Array.isArray(parsed?.migrations)) {
        return parsed.migrations.map((row) => ({
          local: String(row.local || ''),
          remote: String(row.remote || ''),
        }));
      }
    } catch {
      // table format below
    }
  }
  const rows = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*`?(\d{14}|)`?\s*\|\s*`?(\d{14}|)`?/);
    if (!m) continue;
    rows.push({ local: m[1], remote: m[2] });
  }
  return rows;
}

const rows = parseRows(text);

if (!rows.length) {
  console.error('aucune ligne version parsée dans migration list');
  console.error(text.slice(0, 800));
  process.exit(1);
}

const diverged = rows.filter((r) => !r.local || !r.remote || r.local !== r.remote);
if (diverged.length) {
  console.error('divergence Local/Remote:');
  for (const r of diverged) console.error(`  local=${r.local || '∅'} remote=${r.remote || '∅'}`);
  process.exit(1);
}

const listed = rows.map((r) => r.local);
const missing = lockVersions.filter((v) => !listed.includes(v));
const extra = listed.filter((v) => !lockVersions.includes(v));
if (missing.length) {
  console.error('list manque vs lock:', missing.join(', '));
  process.exit(1);
}
if (extra.length) {
  console.error('list hors lock:', extra.join(', '));
  process.exit(1);
}
if (listed.length !== lockVersions.length) {
  console.error(`list ${listed.length} ≠ lock ${lockVersions.length}`);
  process.exit(1);
}

console.log(`migration list: ${listed.length} versions, Local = Remote, = lock`);
