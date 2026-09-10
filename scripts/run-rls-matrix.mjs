#!/usr/bin/env node
/**
 * Exécute supabase/tests/rls_matrix.sql contre DATABASE_URL
 * (supabase start local, ou URI d'une branche staging).
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const file = resolve(process.cwd(), 'supabase/tests/rls_matrix.sql');
const url = process.env.DATABASE_URL
  || process.env.POSTGRES_URL
  || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

try {
  execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit' });
} catch (err) {
  const code = err && typeof err === 'object' && 'status' in err ? err.status : 1;
  process.exit(typeof code === 'number' ? code : 1);
}
