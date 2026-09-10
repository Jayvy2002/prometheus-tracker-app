#!/usr/bin/env node
/**
 * Q06 — vérifie que chaque Edge Function bundlée compile (imports _shared résolus).
 * Même commande que le déploiement manuel : tout échec bloque la CI.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import os from 'node:os';

const ROOT = resolve(process.cwd(), 'supabase/functions');
const OUT = join(os.tmpdir(), 'prometheus-edge-check.js');

const slugs = readdirSync(ROOT).filter((name) => {
  if (name.startsWith('_') || name.startsWith('.')) return false;
  try {
    return statSync(join(ROOT, name)).isDirectory();
  } catch {
    return false;
  }
});

let failed = 0;
for (const slug of slugs) {
  const entry = join(ROOT, slug, 'index.ts');
  try {
    execFileSync(
      'npx',
      ['esbuild', entry, '--bundle', '--format=esm', '--platform=neutral', '--external:npm:*', '--external:jsr:*', `--outfile=${OUT}`, '--log-level=error'],
      { stdio: 'inherit' },
    );
    console.log(`edge OK: ${slug}`);
  } catch {
    console.error(`edge FAIL: ${slug}`);
    failed += 1;
  }
}
if (failed > 0) {
  console.error(`${failed} edge function(s) failed to bundle`);
  process.exit(1);
}
console.log(`all ${slugs.length} edge functions bundle`);
