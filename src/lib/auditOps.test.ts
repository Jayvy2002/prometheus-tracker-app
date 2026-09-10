import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { latestMigrationContaining } from './migrationScan';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('Q06: every edge function dir is inventoried in the manifest (no orphans)', () => {
  const root = resolve(process.cwd(), 'supabase/functions');
  const slugs = readdirSync(root).filter((name) => {
    if (name.startsWith('_') || name.startsWith('.')) return false;
    try {
      return statSync(join(root, name)).isDirectory();
    } catch {
      return false;
    }
  });
  const manifest = JSON.parse(src('supabase/functions.manifest.json')) as {
    expected: Array<{ slug: string; status: string }>;
  };
  const known = new Set(manifest.expected.map((e) => e.slug));
  for (const slug of slugs) {
    assert.ok(known.has(slug), `edge function '${slug}' missing from functions.manifest.json`);
  }
  // Retired functions answer 410, active ones never compare against the anon key.
  for (const entry of manifest.expected) {
    const code = src(`supabase/functions/${entry.slug}/index.ts`);
    if (entry.status === 'retired-410') {
      assert.match(code, /status:\s*410/, `${entry.slug} should answer 410`);
    } else {
      assert.doesNotMatch(code, /providedKey !== anonKey|!== anonKey/, `${entry.slug} must not use the anon key as a secret`);
    }
  }
});

test('Q06: migrations stay additive and RLS-safe', () => {
  const dir = resolve(process.cwd(), 'supabase/migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  assert.ok(files.length > 60, 'expected the migration history');
  for (const file of files) {
    const sql = readFileSync(resolve(dir, file), 'utf8');
    assert.doesNotMatch(sql, /DROP TABLE/i, `${file}: destructive DROP TABLE`);
    assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY/i, `${file}: RLS must stay on`);
    assert.doesNotMatch(sql, /SERVICE_ROLE_KEY/i, `${file}: no service key in migrations`);
  }
  // Every SECURITY DEFINER function pins its search_path.
  for (const file of files) {
    const sql = readFileSync(resolve(dir, file), 'utf8');
    const definers = [...sql.matchAll(/CREATE OR REPLACE FUNCTION ([\w."]+)\([^;]*?\)\s*RETURNS[\s\S]*?AS \$\$/gi)];
    for (const m of definers) {
      const head = m[0];
      if (/SECURITY DEFINER/i.test(head)) {
        assert.match(head, /SET search_path\s*=/i, `${file}: ${m[1]} lacks SET search_path`);
      }
    }
  }
});

test('Q05: routes are code-split; programs load embedded; workouts paginate', () => {
  const app = src('src/App.tsx');
  assert.match(app, /lazy\(\(\) => import\('\.\/components\/workout\/WorkoutPage'\)\)/);
  assert.match(app, /lazy\(\(\) => import\('\.\/components\/scanner\/ScannerPage'\)\)/);
  assert.match(app, /lazy\(\(\) => import\('\.\/components\/stats\/StatsPage'\)\)/);
  assert.match(app, /<Suspense fallback={<RouteFallback \/>}>/);
  const programs = src('src/stores/programStore.ts');
  assert.match(programs, /program_days\(\*, program_day_exercises\(\*\)\)/);
  assert.doesNotMatch(programs, /Promise\.all\(list\.map\(async p/);
  const workouts = src('src/stores/workoutStore.ts');
  assert.match(workouts, /WORKOUTS_PAGE_SIZE/);
  assert.match(workouts, /fetchOlderWorkouts/);
  assert.match(workouts, /workoutsExhausted/);
  assert.doesNotMatch(workouts, /\.limit\(500\)/);
});

test('Q04: dialog and switches are accessible primitives', () => {
  const modal = src('src/components/ui/Modal.tsx');
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby/);
  assert.match(modal, /aria-label=\{t\('common\.close'\)\}/);
  assert.match(modal, /previousFocus/);
  const notif = src('src/components/profile/NotificationSettings.tsx');
  assert.match(notif, /role="switch"/);
  assert.match(notif, /aria-checked/);
  const units = src('src/components/profile/UnitsForm.tsx');
  assert.match(units, /role="switch"/);
});

test('Q03: weights render in profile units; fallback speaks the user language', () => {
  const card = src('src/components/workout/ExerciseCard.tsx');
  assert.match(card, /formatWeight\(s\.weight_kg, weightUnit\)/);
  assert.match(card, /SUGGESTION_KEY\[suggestion\.kind\]/);
  assert.doesNotMatch(card, /Stagnant 3\\u00d7/);
  assert.doesNotMatch(card, /\$\{s\.weight_kg\}kg/);
  const agent = src('supabase/functions/_shared/coachAgent.ts');
  assert.match(agent, /LIFT_EN/);
  assert.match(agent, /liftName\(day\.name, locale\)/);
});

test('Q02: uploads validated, deletions confirmed, bucket limits versioned', () => {  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /heic_unsupported/);
  assert.match(store, /5 \* 1024 \* 1024/);
  const delFn = store.slice(store.indexOf('deleteProgressPhoto: async'));
  assert.ok(
    delFn.indexOf('.remove([storagePath])') < delFn.indexOf(".delete().eq('id', id)"),
    'file must be removed before its metadata row',
  );
  const page = src('src/components/coaching/ClientPhotosPage.tsx');
  assert.match(page, /setInterval\(refresh, 30 \* 60 \* 1000\)/);
  const mig = latestMigrationContaining('file_size_limit = 5242880').sql;
  assert.match(mig, /file_size_limit = 5242880/);
  assert.match(mig, /allowed_mime_types/);
});

test('Q07: telemetry is account-linked, documented and free of health signals', () => {
  const types = src('src/lib/types.ts');
  const block = types.slice(
    types.indexOf('export type ProductEventName ='),
    types.indexOf('export type ProductEventProps'),
  );
  const events = [...block.matchAll(/\|\s*'([a-z_]+)'/g)].map(m => m[1]);
  assert.ok(events.length >= 15, `expected ProductEventName list, got ${events.length}`);
  const doc = src('docs/TELEMETRY.md');
  for (const event of events) {
    assert.match(doc, new RegExp(`\`${event}\``), `event '${event}' missing from docs/TELEMETRY.md`);
  }
  const intake = src('src/components/onboarding/KinesiologyIntakeFlow.tsx');
  assert.doesNotMatch(intake, /medical_flags: medicalYesFlags/);
  assert.doesNotMatch(intake, /pain: intake\.douleursLimitations/);
  const setup = src('src/components/coaching/ClientSetupPage.tsx');
  assert.doesNotMatch(setup, /medical_ack:/);
  const sql = src('supabase/migrations/20260905002127_product_events.sql');
  assert.match(sql, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /GRANT INSERT ON public\.product_events TO authenticated/);
});
