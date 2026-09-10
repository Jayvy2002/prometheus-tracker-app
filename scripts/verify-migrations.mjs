#!/usr/bin/env node
/**
 * Aligne Git (fichiers supabase/migrations) et le lock prod.
 * Refuse les horodatages consolidés 2026091000000x (jamais appliqués).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const dir = resolve(ROOT, 'supabase/migrations');
const lock = JSON.parse(readFileSync(resolve(ROOT, 'supabase/schema_migrations.lock.json'), 'utf8'));

const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const banned = files.filter((f) => /^2026091000000\d_/.test(f));
if (banned.length) {
  console.error('fichiers consolidés interdits (jamais appliqués en prod):', banned.join(', '));
  process.exit(1);
}

const versions = files.map((f) => f.slice(0, 14));
const lockVersions = lock.applied.map((row) => row.version);

const auditFiles = files.filter((f) => f.startsWith('20260910'));
const auditLock = lock.applied.filter((row) => row.version >= '20260910044211' && row.version <= '20260910064501');

if (auditLock.length !== 29) {
  console.error(`lock audit_range attend 29 versions, got ${auditLock.length}`);
  process.exit(1);
}

for (const row of auditLock) {
  const hit = files.find((f) => f.startsWith(row.version + '_'));
  if (!hit) {
    console.error(`lock ${row.version} (${row.name}) absent de Git`);
    process.exit(1);
  }
}

const extraAudit = auditFiles.filter((f) => {
  const v = f.slice(0, 14);
  if (v === '20260910153000') return false;
  return !auditLock.some((row) => row.version === v);
});
if (extraAudit.length) {
  console.error('fichiers audit Git hors lock (sauf 20260910153000):', extraAudit.join(', '));
  process.exit(1);
}

if (!files.some((f) => f.startsWith('20260910153000_'))) {
  console.error('migration 20260910153000_audit_blockers.sql manquante');
  process.exit(1);
}

console.log(`migrations Git: ${files.length} fichiers, ${versions.length} versions`);
console.log(`lock prod: ${lockVersions.length} versions, audit 29/29 alignés, + 20260910153000 à enregistrer sous ce numéro`);
