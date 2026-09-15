import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = process.cwd();

function collectSrcTests(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectSrcTests(full, out);
    else if (entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

test('17c: package name is prometheus-tracker-app', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { name: string };
  assert.equal(pkg.name, 'prometheus-tracker-app');
});

test('17b: npm test discovers src/**/*.test.ts instead of a manual list', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    scripts: { test: string };
  };
  assert.match(pkg.scripts.test, /run-unit-tests\.mjs/);
  assert.doesNotMatch(pkg.scripts.test, /src\/lib\/\w+\.test\.ts/);

  const runner = readFileSync(resolve(root, 'scripts/run-unit-tests.mjs'), 'utf8');
  assert.match(runner, /endsWith\('\.test\.ts'\)/);
  assert.match(runner, /tsx/);

  const tests = collectSrcTests(resolve(root, 'src'));
  assert.ok(tests.length >= 89, `expected ≥89 src tests, got ${tests.length}`);
  assert.ok(
    tests.some(f => f.endsWith('agentHygiene.test.ts')),
    'this lock file must itself be discovered',
  );
  assert.ok(
    tests.some(f => f.endsWith('microcopy.test.ts')),
    'microcopy.test.ts was invisible on the manual list',
  );
  assert.ok(
    tests.some(f => f.endsWith('sessionScope.test.ts')),
    'sessionScope.test.ts must run via npm test, not only CI',
  );
  assert.ok(
    tests.some(f => f.endsWith('navConfig.test.ts')),
    'tests outside src/lib must stay visible',
  );
});

test('17a: architecture and design-system docs exist', () => {
  const arch = readFileSync(resolve(root, 'docs/ARCHITECTURE.md'), 'utf8');
  const design = readFileSync(resolve(root, 'docs/DESIGN_SYSTEM.md'), 'utf8');
  assert.match(arch, /Arbre actuel/);
  assert.match(arch, /Arbre cible/);
  assert.match(arch, /coachingStore/);
  assert.match(arch, /features\/coaching/);
  assert.doesNotMatch(arch, /Ne pas lire CHANTIER/);
  assert.match(design, /bg-surface|surface/);
  assert.match(design, /Button\.tsx/);
  assert.match(design, /lot 19/);
});

test('17d: one env convention — public Vite keys only, never service_role', () => {
  const example = readFileSync(resolve(root, '.env.example'), 'utf8');
  const production = readFileSync(resolve(root, '.env.production'), 'utf8');
  const claude = readFileSync(resolve(root, 'CLAUDE.md'), 'utf8');
  for (const [name, text] of [
    ['.env.example', example],
    ['.env.production', production],
  ] as const) {
    assert.match(text, /VITE_SUPABASE_URL=/);
    assert.match(text, /VITE_SUPABASE_ANON_KEY=/);
    assert.match(text, /VITE_VAPID_PUBLIC_KEY=/);
    assert.doesNotMatch(text, /^[A-Z0-9_]*SERVICE_ROLE=/m, `${name} must not assign a service role`);
    assert.doesNotMatch(text, /^[A-Z0-9_]*(SECRET|PRIVATE_KEY)=/m);
  }
  assert.match(example, /your-project\.supabase\.co/);
  assert.match(claude, /\.env\.production/);
  assert.match(claude, /\.env\.example/);
  assert.match(claude, /service_role/);
});
