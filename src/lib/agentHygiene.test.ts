import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

test('17e: historical auditLot* / uxPremium tests are named after the lock they protect', () => {
  const tests = collectSrcTests(resolve(root, 'src'));
  const names = tests.map(f => f.split('/').pop() ?? '');
  for (const banned of ['auditLot2.test.ts', 'auditLot3.test.ts', 'auditLot5.test.ts', 'auditLot7.test.ts', 'uxPremium.test.ts']) {
    assert.ok(!names.includes(banned), `${banned} must be renamed after the protected behaviour`);
  }
  assert.ok(names.includes('programAtomicWrites.test.ts'));
  assert.ok(names.includes('reviewWindowAndPortions.test.ts'));
  assert.ok(names.includes('clientDossierRealtime.test.ts'));
  assert.ok(names.includes('programRevisionsAndIntake.test.ts'));
  assert.ok(names.includes('honestTargetsAndFirstRun.test.ts'));
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

test('18: app / features / shared exist, aliases are wired, old paths re-export', () => {
  const at = (rel: string) => resolve(root, rel);
  for (const rel of [
    'src/app/layout/AppLayout.tsx',
    'src/app/navigation/navConfig.ts',
    'src/shared/ui/Button.tsx',
    'src/shared/api/supabase/index.ts',
    'src/shared/hooks/useOnline.ts',
    'src/shared/hooks/usePageTitle.ts',
    'src/features/account/hooks/useAccountContext.ts',
    'src/features/coaching/hooks/useClientTracking.ts',
    'src/features/nutrition/hooks/useFoodCatalogSearch.ts',
  ]) {
    assert.ok(existsSync(at(rel)), rel);
  }
  assert.match(readFileSync(at('src/lib/coachFleet.ts'), 'utf8'), /features\/coaching\/domain\/coachFleet/, 'lot 20: lib/coachFleet.ts re-exports');
  assert.ok(existsSync(at('src/features/coaching/domain/coachFleet.ts')), 'lot 20: coachFleet lives in features/coaching');
  assert.ok(existsSync(at('src/App.tsx')), 'App.tsx remains the assembler');
  assert.ok(existsSync(at('src/stores/coachingStore.ts')), 'lot 18/21a must not split coachingStore');
  assert.ok(existsSync(at('src/lib/types.ts')), 'lot 18 must not split types.ts');

  const vite = readFileSync(at('vite.config.ts'), 'utf8');
  assert.match(vite, /'@\/app'/);
  assert.match(vite, /'@\/features'/);
  assert.match(vite, /'@\/shared'/);
  const ts = readFileSync(at('tsconfig.app.json'), 'utf8');
  assert.match(ts, /"@\/app\/\*"/);
  assert.match(ts, /"@\/features\/\*"/);
  assert.match(ts, /"@\/shared\/\*"/);

  assert.match(readFileSync(at('src/lib/supabase.ts'), 'utf8'), /shared\/api\/supabase/);
  assert.match(readFileSync(at('src/components/ui/Button.tsx'), 'utf8'), /shared\/ui\/Button/);
  assert.match(readFileSync(at('src/components/layout/AppLayout.tsx'), 'utf8'), /app\/layout\/AppLayout/);
  assert.match(readFileSync(at('src/navigation/navConfig.ts'), 'utf8'), /app\/navigation\/navConfig/);
});

test('19: listed primitives use semantic tokens, not blue-600 / neutral-* / rose-*', () => {
  const primitives = [
    'src/shared/ui/Button.tsx',
    'src/shared/ui/Card.tsx',
    'src/shared/ui/Input.tsx',
    'src/shared/ui/Select.tsx',
    'src/shared/ui/Modal.tsx',
    'src/shared/ui/PageHeader.tsx',
    'src/shared/ui/EmptyState.tsx',
    'src/shared/ui/ErrorState.tsx',
    'src/shared/ui/TabList.tsx',
    'src/shared/ui/IconButton.tsx',
  ];
  const banned = /\b(?:bg|text|border|ring|shadow|placeholder|hover:bg|hover:text|hover:border|focus:ring|focus:border)-(?:blue|neutral|rose)-/;
  for (const rel of primitives) {
    const src = readFileSync(resolve(root, rel), 'utf8');
    assert.doesNotMatch(src, banned, `${rel} still uses a raw palette class`);
    assert.doesNotMatch(src, /\bbg-blue-600\b|\bbg-rose-600\b/);
  }
  const theme = readFileSync(resolve(root, 'tailwind.config.js'), 'utf8');
  assert.match(theme, /primary:/);
  assert.match(theme, /success:/);
  assert.match(theme, /warning:/);
  assert.match(theme, /danger:/);
  const button = readFileSync(resolve(root, 'src/shared/ui/Button.tsx'), 'utf8');
  assert.match(button, /bg-primary/);
  assert.match(button, /bg-danger/);
});

test('20 coaching: coach*.ts implementations live in features/coaching/domain', () => {
  const at = (rel: string) => resolve(root, rel);
  for (const name of ['coachFleet.ts', 'coachRole.ts', 'coachAgent.ts', 'coachAsk.ts', 'coachQuestionnaire.ts']) {
    assert.ok(existsSync(at(`src/features/coaching/domain/${name}`)), name);
    assert.match(readFileSync(at(`src/lib/${name}`), 'utf8'), /features\/coaching\/domain\//);
  }
  const fleet = readFileSync(at('src/features/coaching/domain/coachFleet.ts'), 'utf8');
  assert.match(fleet, /supabase\/functions\/_shared\/fleetCopy/);
  assert.ok(existsSync(at('src/App.tsx')));
  assert.ok(existsSync(at('src/stores/coachingStore.ts')));
  assert.ok(existsSync(at('src/lib/types.ts')));
});

test('20 marketplace: marketplace modules live in features/marketplace/domain', () => {
  const at = (rel: string) => resolve(root, rel);
  for (const name of ['marketplace.ts', 'marketplaceApi.ts']) {
    assert.ok(existsSync(at(`src/features/marketplace/domain/${name}`)), name);
    assert.match(readFileSync(at(`src/lib/${name}`), 'utf8'), /features\/marketplace\/domain\//);
  }
});

test('20 workout: workout modules live in features/workout/domain', () => {
  const at = (rel: string) => resolve(root, rel);
  for (const name of ['startWorkout.ts', 'performedSets.ts', 'exerciseCatalog.ts', 'plateMath.ts']) {
    assert.ok(existsSync(at(`src/features/workout/domain/${name}`)), name);
    assert.match(readFileSync(at(`src/lib/${name}`), 'utf8'), /features\/workout\/domain\//);
  }
});

test('20 nutrition: nutrition modules live in features/nutrition/domain', () => {
  const at = (rel: string) => resolve(root, rel);
  for (const name of ['nutritionTargets.ts', 'foodEnergy.ts', 'openFoodFacts.ts', 'groceryList.ts']) {
    assert.ok(existsSync(at(`src/features/nutrition/domain/${name}`)), name);
    assert.match(readFileSync(at(`src/lib/${name}`), 'utf8'), /features\/nutrition\/domain\//);
  }
});

test('20 programs: program modules live in features/programs/domain', () => {
  const at = (rel: string) => resolve(root, rel);
  for (const name of ['programWrite.ts', 'programPatch.ts', 'programNl.ts', 'soloProgram.ts']) {
    assert.ok(existsSync(at(`src/features/programs/domain/${name}`)), name);
    assert.match(readFileSync(at(`src/lib/${name}`), 'utf8'), /features\/programs\/domain\//);
  }
});

test('21a: App.tsx assembles router, guards and session bootstrap', () => {
  const at = (rel: string) => resolve(root, rel);
  for (const rel of [
    'src/App.tsx',
    'src/app/router/AppRoutes.tsx',
    'src/app/guards/RouteGuards.tsx',
    'src/app/bootstrap/useAuthenticatedSession.ts',
  ]) {
    assert.ok(existsSync(at(rel)), rel);
  }
  const app = readFileSync(at('src/App.tsx'), 'utf8');
  assert.match(app, /from '\.\/app\/router\/AppRoutes'/);
  assert.doesNotMatch(app, /function CoachOnly/);
  assert.doesNotMatch(app, /path="\/programs"/);
  const routes = readFileSync(at('src/app/router/AppRoutes.tsx'), 'utf8');
  assert.match(routes, /path="\/programs"/);
  assert.match(routes, /TrackingGate/);
  const guards = readFileSync(at('src/app/guards/RouteGuards.tsx'), 'utf8');
  assert.match(guards, /export function CoachOnly/);
  assert.match(guards, /export function CoachTrackerRedirect/);
  assert.match(guards, /export function CoachedAthleteRedirect/);
  const boot = readFileSync(at('src/app/bootstrap/useAuthenticatedSession.ts'), 'utf8');
  assert.match(boot, /refreshPendingOps/);
  assert.match(boot, /shouldForceKinesiologyIntake/);
  assert.ok(existsSync(at('src/stores/coachingStore.ts')), '21a must not split coachingStore');
});

test('21b: fetch/orchestration extracted; screens and coachingStore stay', () => {
  const at = (rel: string) => resolve(root, rel);
  for (const rel of [
    'src/features/coaching/hooks/useClientDossier.ts',
    'src/features/dashboard/hooks/useDashboardBootstrap.ts',
    'src/features/programs/hooks/useProgramEditorTracking.ts',
    'src/features/programs/hooks/useProgramNlEdit.ts',
    'src/features/workout/hooks/useExerciseHistory.ts',
    'src/features/workout/domain/overloadSuggestion.ts',
    'src/features/workout/data/loadFullWorkout.ts',
    'src/features/workout/data/replayOfflineOp.ts',
    'src/components/workout/SetRow.tsx',
    'src/components/coaching/ClientDetailPage.tsx',
    'src/components/dashboard/Dashboard.tsx',
    'src/components/workout/ExerciseCard.tsx',
    'src/components/coaching/ProgramSessionEditor.tsx',
    'src/stores/workoutStore.ts',
    'src/stores/coachingStore.ts',
  ]) {
    assert.ok(existsSync(at(rel)), rel);
  }
  assert.match(readFileSync(at('src/components/coaching/ClientDetailPage.tsx'), 'utf8'), /useClientDossier/);
  assert.doesNotMatch(readFileSync(at('src/components/coaching/ClientDetailPage.tsx'), 'utf8'), /subscribeClientDossier\(/);
  assert.match(readFileSync(at('src/features/coaching/hooks/useClientDossier.ts'), 'utf8'), /subscribeClientDossier\(/);
  assert.match(readFileSync(at('src/components/dashboard/Dashboard.tsx'), 'utf8'), /useDashboardBootstrap/);
  assert.doesNotMatch(readFileSync(at('src/components/dashboard/Dashboard.tsx'), 'utf8'), /from\('nutrition_logs'\)/);
  assert.match(readFileSync(at('src/stores/workoutStore.ts'), 'utf8'), /from '\.\.\/features\/workout\/data\/replayOfflineOp'/);
  assert.ok(existsSync(at('src/stores/coachingStore.ts')), '21b keeps the coachingStore path');
});

test('21c: coachingStore is a façade over features/coaching/model', () => {
  const at = (rel: string) => resolve(root, rel);
  for (const rel of [
    'src/stores/coachingStore.ts',
    'src/features/coaching/model/coachingShared.ts',
    'src/features/coaching/model/sessionTokens.ts',
    'src/features/coaching/model/roleSlice.ts',
    'src/features/coaching/model/clientsSlice.ts',
    'src/features/coaching/model/messagesSlice.ts',
    'src/features/coaching/model/questionnairesSlice.ts',
    'src/features/coaching/model/interventionsSlice.ts',
    'src/features/coaching/model/trackingSlice.ts',
    'src/features/coaching/model/realtimeSlice.ts',
    'src/features/coaching/model/invitesSlice.ts',
    'src/features/coaching/model/lifecycleSlice.ts',
  ]) {
    assert.ok(existsSync(at(rel)), rel);
  }
  const facade = readFileSync(at('src/stores/coachingStore.ts'), 'utf8');
  assert.match(facade, /createRoleSlice/);
  assert.match(facade, /createClientsSlice/);
  assert.match(facade, /createMessagesSlice/);
  assert.match(facade, /createQuestionnairesSlice/);
  assert.match(facade, /createInterventionsSlice/);
  assert.match(facade, /createTrackingSlice/);
  assert.doesNotMatch(facade, /fetchMyRole: async/);
  assert.match(facade, /from '\.\.\/features\/coaching\/model\/sessionTokens'/);
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
