#!/usr/bin/env node
/**
 * Exécute supabase/tests/rls_matrix.sql contre DATABASE_URL
 * (supabase start local = staging-like, ou URI d'une branche staging).
 * Dump toujours rls_results (même en cas d'échec) pour la CI / le résumé PR.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const file = resolve(process.cwd(), 'supabase/tests/rls_matrix.sql');
const url = process.env.DATABASE_URL
  || process.env.POSTGRES_URL
  || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const dumpPath = process.env.RLS_RESULTS_PATH || '/tmp/rls-matrix-results.txt';

function dumpResults() {
  try {
    const out = execFileSync(
      'psql',
      [url, '-P', 'pager=off', '-c', 'SELECT check_id, passed, detail FROM rls_results ORDER BY check_id'],
      { encoding: 'utf8' },
    );
    writeFileSync(dumpPath, out);
    console.log('\n===== rls_results =====');
    console.log(out);
    if (process.env.GITHUB_STEP_SUMMARY) {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, `## Matrice RLS\n\n\`\`\`\n${out}\n\`\`\`\n`, { flag: 'a' });
    }
  } catch (err) {
    console.error('dump rls_results impossible:', err instanceof Error ? err.message : err);
  }
}

let failed = false;
try {
  execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit' });
} catch (err) {
  failed = true;
  const code = err && typeof err === 'object' && 'status' in err ? err.status : 1;
  dumpResults();
  process.exit(typeof code === 'number' ? code : 1);
}

dumpResults();
if (failed) process.exit(1);
