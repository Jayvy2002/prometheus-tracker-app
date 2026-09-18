#!/usr/bin/env node
/**
 * Git (fichiers supabase/migrations) == lock prod == live schema_migrations.
 * Un timestamp Git = une version Production. Pas d'excuse d'horloges divergentes.
 * Refuse les horodatages consolidés 2026091000000x (jamais appliqués).
 * Si SUPABASE_ACCESS_TOKEN est posé : compare aussi schema_migrations live.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const dir = resolve(ROOT, 'supabase/migrations');
const lock = JSON.parse(readFileSync(resolve(ROOT, 'supabase/schema_migrations.lock.json'), 'utf8'));
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'phyuijjekxtjvipjtdfv';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const banned = files.filter((f) => /^2026091000000\d_/.test(f));
if (banned.length) {
  fail(`fichiers consolidés interdits (jamais appliqués en prod): ${banned.join(', ')}`);
}

const gitVersions = files.map((f) => f.slice(0, 14));
const pending = JSON.parse(readFileSync(resolve(ROOT, 'supabase/migrations.pending.json'), 'utf8')).pending;
const expected = [...lock.applied, ...pending];
const lockVersions = expected.map((row) => row.version);
if (new Set(lockVersions).size !== lockVersions.length || pending.some(row => row.version <= lock.applied.at(-1).version)) {
  fail('pending migrations must be unique and newer than the production baseline');
}

if (gitVersions.length !== lockVersions.length) {
  fail(`Git ${gitVersions.length} fichiers ≠ lock ${lockVersions.length} versions`);
}

const gitOnly = gitVersions.filter((v) => !lockVersions.includes(v));
const lockOnly = lockVersions.filter((v) => !gitVersions.includes(v));
if (gitOnly.length) fail(`Git-only (hors lock): ${gitOnly.join(', ')}`);
if (lockOnly.length) fail(`lock-only (fichier Git manquant): ${lockOnly.join(', ')}`);

for (let i = 0; i < expected.length; i++) {
  const row = expected[i];
  const file = files[i];
  if (!file.startsWith(row.version + '_')) {
    fail(`ordre/timestamp: lock[${i}]=${row.version} vs Git ${file}`);
  }
  const name = file.slice(15, -4);
  if (name !== row.name) {
    fail(`nom: ${file} attendu ${row.version}_${row.name}.sql`);
  }
}

const auditLock = lock.applied.filter((row) => row.version >= '20260910044211' && row.version <= '20260910064501');
if (auditLock.length !== 29) {
  fail(`lock audit_range attend 29 versions, got ${auditLock.length}`);
}

if (!lockVersions.includes('20260910153000')) {
  fail('lock prod : 20260910153000_audit_blockers manquant');
}
if (!lockVersions.includes('20260910160000')) {
  fail('lock prod : 20260910160000_apply_intervention_client_target manquant');
}

console.log(`migrations Git: ${files.length} fichiers`);
console.log(`lock prod: ${lock.applied.length}; pending: ${pending.length} — Git aligned`);

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.log('[skipped] live schema_migrations (SUPABASE_ACCESS_TOKEN absent) — Git vs lock toujours exigés');
} else {
  try {
    const raw = execFileSync(
      'curl',
      [
        '-sS',
        '-H', `Authorization: Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
        `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/migrations`,
      ],
      { encoding: 'utf8' },
    );
    const live = JSON.parse(raw);
    if (!Array.isArray(live)) {
      fail(`migrations live: réponse non-liste (${String(raw).slice(0, 200)})`);
    }
    const liveVersions = live.map((row) => String(row.version || '')).filter(Boolean);
    const missingLive = lock.applied.map(row => row.version).filter((v) => !liveVersions.includes(v));
    const extraLive = liveVersions.filter((v) => !lockVersions.includes(v));
    if (missingLive.length) fail(`live manque vs lock: ${missingLive.join(', ')}`);
    if (extraLive.length) fail(`live hors lock: ${extraLive.join(', ')}`);
    console.log(`live schema_migrations OK: ${liveVersions.length} versions (${PROJECT_REF})`);
  } catch (err) {
    fail(`migrations live injoignables: ${err instanceof Error ? err.message : err}`);
  }
}
