#!/usr/bin/env node
/**
 * Q06 — inventaire Edge Functions.
 * Compare : manifeste attendu, répertoires locaux, JWT config.toml,
 * inventaire déployé (lock, et live si SUPABASE_ACCESS_TOKEN).
 * Compile ensuite chaque fonction (esbuild) — nécessaire mais insuffisant seul.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import os from 'node:os';

const ROOT = resolve(process.cwd());
const FN_DIR = resolve(ROOT, 'supabase/functions');
const MANIFEST_PATH = resolve(ROOT, 'supabase/functions.manifest.json');
const CONFIG_PATH = resolve(ROOT, 'supabase/config.toml');
const LOCK_PATH = resolve(ROOT, 'supabase/functions.deployed.lock.json');
const OUT = join(os.tmpdir(), 'prometheus-edge-check.js');
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'phyuijjekxtjvipjtdfv';

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function localSlugs() {
  return readdirSync(FN_DIR).filter((name) => {
    if (name.startsWith('_') || name.startsWith('.')) return false;
    try {
      return statSync(join(FN_DIR, name)).isDirectory();
    } catch {
      return false;
    }
  }).sort();
}

function parseJwtConfig(toml) {
  const map = new Map();
  const re = /\[functions\.([^\]]+)\]\s*([\s\S]*?)(?=\n\[|\s*$)/g;
  let m;
  while ((m = re.exec(toml)) !== null) {
    const slug = m[1].trim();
    const jwt = /verify_jwt\s*=\s*(true|false)/.exec(m[2]);
    if (jwt) map.set(slug, jwt[1] === 'true');
  }
  return map;
}

function asBool(value) {
  return value === true || value === 'true';
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const expected = manifest.expected;
if (!Array.isArray(expected) || expected.length === 0) {
  fail('functions.manifest.json: expected[] manquant');
  process.exit(1);
}

const dirs = localSlugs();
const expectedSlugs = expected.map((row) => row.slug).sort();
const missingDirs = expectedSlugs.filter((slug) => !dirs.includes(slug));
const extraDirs = dirs.filter((slug) => !expectedSlugs.includes(slug));
if (missingDirs.length) fail(`répertoires locaux manquants: ${missingDirs.join(', ')}`);
if (extraDirs.length) fail(`répertoires locaux hors manifeste: ${extraDirs.join(', ')}`);
else console.log(`dirs OK: ${dirs.length} slugs = manifeste`);

const jwtMap = parseJwtConfig(readFileSync(CONFIG_PATH, 'utf8'));
for (const row of expected) {
  if (!jwtMap.has(row.slug)) {
    fail(`config.toml JWT manquant pour ${row.slug}`);
    continue;
  }
  if (jwtMap.get(row.slug) !== Boolean(row.verify_jwt)) {
    fail(`JWT mismatch ${row.slug}: config=${jwtMap.get(row.slug)} manifeste=${row.verify_jwt}`);
  }
}
const extraJwt = [...jwtMap.keys()].filter((slug) => !expectedSlugs.includes(slug));
if (extraJwt.length) fail(`config.toml JWT hors manifeste: ${extraJwt.join(', ')}`);
else console.log('JWT config.toml = manifeste');

const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
const deployed = Array.isArray(lock.functions) ? lock.functions : [];
const lockSlugs = deployed.map((row) => row.slug).sort();
const missingLock = expectedSlugs.filter((slug) => !lockSlugs.includes(slug));
const extraLock = lockSlugs.filter((slug) => !expectedSlugs.includes(slug));
if (missingLock.length) fail(`inventaire déployé (lock) manquant: ${missingLock.join(', ')}`);
if (extraLock.length) fail(`orpheline déployée (lock): ${extraLock.join(', ')}`);
for (const row of expected) {
  const live = deployed.find((d) => d.slug === row.slug);
  if (!live) continue;
  if (asBool(live.verify_jwt) !== Boolean(row.verify_jwt)) {
    fail(`JWT lock mismatch ${row.slug}: lock=${live.verify_jwt} manifeste=${row.verify_jwt}`);
  }
}
console.log(`lock déployé OK: ${deployed.length} slugs`);

if (process.env.SUPABASE_ACCESS_TOKEN) {
  try {
    const raw = execFileSync(
      'curl',
      [
        '-sS',
        '-H', `Authorization: Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
        `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`,
      ],
      { encoding: 'utf8' },
    );
    const liveList = JSON.parse(raw);
    if (!Array.isArray(liveList)) {
      fail(`inventaire live illisible: ${raw.slice(0, 200)}`);
    } else {
      const liveSlugs = liveList.map((row) => row.slug).sort();
      const missingLive = expectedSlugs.filter((slug) => !liveSlugs.includes(slug));
      const extraLive = liveSlugs.filter((slug) => !expectedSlugs.includes(slug));
      if (missingLive.length) fail(`inventaire live manquant: ${missingLive.join(', ')}`);
      if (extraLive.length) fail(`orpheline live: ${extraLive.join(', ')}`);
      for (const row of expected) {
        const live = liveList.find((d) => d.slug === row.slug);
        if (!live) continue;
        if (asBool(live.verify_jwt) !== Boolean(row.verify_jwt)) {
          fail(`JWT live mismatch ${row.slug}: live=${live.verify_jwt} manifeste=${row.verify_jwt}`);
        }
        const locked = deployed.find((d) => d.slug === row.slug);
        if (locked && live.version != null && locked.version != null
            && Number(live.version) !== Number(locked.version)) {
          fail(`version mismatch ${row.slug}: live=${live.version} lock=${locked.version}`);
        }
      }
      console.log(`inventaire live OK: ${liveList.length} slugs (${PROJECT_REF})`);
      for (const row of ['coach-fleet-round', 'coach-agent']) {
        const live = liveList.find((d) => d.slug === row);
        if (live) console.log(`  ${row} live v${live.version} jwt=${live.verify_jwt}`);
      }
    }
  } catch (err) {
    fail(`inventaire live injoignable: ${err instanceof Error ? err.message : err}`);
  }
} else {
  console.log('[skipped] live functions inventory (SUPABASE_ACCESS_TOKEN absent) — lock + manifeste + dirs + JWT toujours exigés');
}

let failedBundle = 0;
for (const slug of dirs) {
  const entry = join(FN_DIR, slug, 'index.ts');
  try {
    execFileSync(
      'npx',
      ['esbuild', entry, '--bundle', '--format=esm', '--platform=neutral', '--external:npm:*', '--external:jsr:*', `--outfile=${OUT}`, '--log-level=error'],
      { stdio: 'inherit' },
    );
    console.log(`edge OK: ${slug}`);
  } catch {
    console.error(`edge FAIL: ${slug}`);
    failedBundle += 1;
  }
}
if (failedBundle > 0) {
  fail(`${failedBundle} edge function(s) failed to bundle`);
} else {
  console.log(`bundle OK: ${dirs.length} functions`);
}

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
