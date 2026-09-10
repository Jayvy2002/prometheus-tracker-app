#!/usr/bin/env node
/**
 * Aligne Git (fichiers supabase/migrations) et le lock prod.
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

const lockVersions = lock.applied.map((row) => row.version);
const auditFiles = files.filter((f) => f.startsWith('20260910'));
const auditLock = lock.applied.filter((row) => row.version >= '20260910044211' && row.version <= '20260910064501');

if (auditLock.length !== 29) {
  fail(`lock audit_range attend 29 versions, got ${auditLock.length}`);
}

for (const row of auditLock) {
  const hit = files.find((f) => f.startsWith(row.version + '_'));
  if (!hit) fail(`lock ${row.version} (${row.name}) absent de Git`);
}

if (!files.some((f) => f.startsWith('20260910153000_'))) {
  fail('migration 20260910153000_audit_blockers.sql manquante');
}
if (!lock.applied.some((row) => row.version === '20260910153000')) {
  fail('lock prod : 20260910153000_audit_blockers manquant — tamponner sous ce numéro, pas un autre');
}

const extraAudit = auditFiles.filter((f) => {
  const v = f.slice(0, 14);
  return !lock.applied.some((row) => row.version === v);
});
if (extraAudit.length) {
  fail(`fichiers audit Git hors lock: ${extraAudit.join(', ')}`);
}

console.log(`migrations Git: ${files.length} fichiers`);
console.log(`lock prod: ${lockVersions.length} versions, audit 29/29 + 20260910153000`);

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.log('SUPABASE_ACCESS_TOKEN absent — comparaison live sautée (Git vs lock exigés)');
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
      console.log(`migrations live: réponse non-liste (${String(raw).slice(0, 120)}) — skip (lock Git exigé)`);
    } else {
      const liveVersions = live.map((row) => String(row.version || row.name || '')).filter(Boolean);
      const missingLive = lockVersions.filter((v) => !liveVersions.includes(v));
      const extraLive = liveVersions.filter((v) => !lockVersions.includes(v));
      if (missingLive.length) fail(`live manque vs lock: ${missingLive.join(', ')}`);
      if (extraLive.length) fail(`live hors lock: ${extraLive.join(', ')}`);
      console.log(`live schema_migrations OK: ${liveVersions.length} versions (${PROJECT_REF})`);
    }
  } catch (err) {
    fail(`migrations live injoignables: ${err instanceof Error ? err.message : err}`);
  }
}
