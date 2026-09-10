#!/usr/bin/env node
/**
 * Après `supabase start` : la liste locale doit contenir les 29 versions
 * audit prod + 20260910153000. Les horloges Git plus anciennes (20260327…)
 * diffèrent volontairement des tampons prod 20260824… — on ne les compare pas.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.env.DATABASE_URL
  || process.env.POSTGRES_URL
  || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const lock = JSON.parse(readFileSync(resolve(process.cwd(), 'supabase/schema_migrations.lock.json'), 'utf8'));
const audit = lock.applied.filter((row) => row.version >= '20260910044211' && row.version <= '20260910064501');
const required = [...audit.map((row) => row.version), '20260910153000'];

const raw = execFileSync('psql', [url, '-At', '-c', 'select version from supabase_migrations.schema_migrations order by version'], {
  encoding: 'utf8',
});
const local = raw.trim().split('\n').filter(Boolean);
const missing = required.filter((v) => !local.includes(v));
if (missing.length) {
  console.error('versions requises absentes du replay local:', missing.join(', '));
  process.exit(1);
}

console.log(`replay local: ${local.length} versions`);
console.log(`audit prod 29/29 + 20260910153000 présents`);
console.log(local.filter((v) => v.startsWith('20260910')).join('\n'));
