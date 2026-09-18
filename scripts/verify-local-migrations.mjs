#!/usr/bin/env node
/**
 * Après `supabase start` : schema_migrations locale = lock (toutes les versions).
 * Un replay vert exige chaque timestamp lock, pas seulement la plage audit.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.env.DATABASE_URL
  || process.env.POSTGRES_URL
  || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const lock = JSON.parse(readFileSync(resolve(process.cwd(), 'supabase/schema_migrations.lock.json'), 'utf8'));
const pending = JSON.parse(readFileSync(resolve(process.cwd(), 'supabase/migrations.pending.json'), 'utf8')).pending;
const required = [...lock.applied, ...pending].map((row) => row.version);

const raw = execFileSync('psql', [url, '-At', '-c', 'select version from supabase_migrations.schema_migrations order by version'], {
  encoding: 'utf8',
});
const local = raw.trim().split('\n').filter(Boolean);
const missing = required.filter((v) => !local.includes(v));
const extra = local.filter((v) => !required.includes(v));
if (missing.length) {
  console.error('versions lock absentes du replay local:', missing.join(', '));
  process.exit(1);
}
if (extra.length) {
  console.error('versions locales hors lock:', extra.join(', '));
  process.exit(1);
}
if (local.length !== required.length) {
  console.error(`compte local ${local.length} ≠ lock ${required.length}`);
  process.exit(1);
}

console.log(`replay local: ${local.length} versions = lock (aucun écart de timestamp)`);
console.log(local.join('\n'));
