import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { describeAskSend } from './coachAsk';
import { i18nLocaleSource } from './i18nLocaleSource';

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('10a: recipes live in AppLayout Nutrition chrome, not FullPageLayout / SessionShell', () => {
  const app = src('src/App.tsx') + src('src/app/bootstrap/useAuthenticatedSession.ts') + src('src/app/guards/RouteGuards.tsx') + src('src/app/router/AppRoutes.tsx');
  const layoutBlock = app.slice(
    app.indexOf('<Route element={<AppLayout />}>'),
    app.indexOf('<Route path="/workout/new"'),
  );
  assert.match(layoutBlock, /path="\/recipes"/);
  assert.doesNotMatch(layoutBlock, /CoachedAthleteRedirect>\s*<TrackingGate module="nutrition"><RecipesPage/);
  const recipes = src('src/components/nutrition/RecipesPage.tsx');
  assert.doesNotMatch(recipes, /FullPageLayout/);
  assert.doesNotMatch(recipes, /SessionShell/);
  const nutrition = src('src/components/nutrition/NutritionPage.tsx');
  assert.match(nutrition, /navigate\('\/recipes'\)/);
  assert.doesNotMatch(nutrition, /CardLink to="\/recipes"/);
  assert.doesNotMatch(nutrition, /!coached/);
});

test('10b: solo weekly review is three figures; Accueil notice stays', () => {
  const card = src('src/components/dashboard/SoloWeeklyReview.tsx');
  assert.match(card, /grid-cols-3/);
  assert.doesNotMatch(card, /grid-cols-4/);
  assert.match(card, /soloReview\.statKcal/);
  assert.match(card, /soloReview\.statWeight/);
  assert.match(card, /soloReview\.statSessions/);
  const dash = src('src/components/dashboard/Dashboard.tsx') + src('src/features/dashboard/hooks/useDashboardBootstrap.ts');
  assert.match(dash, /SoloProgramProposal variant="notice"/);
});

test('10c: 360 health tab and recovery copy say Récupération; learned uses kinds not JSON keys', () => {
  const fr = src('src/i18n/locales/fr.ts');
  assert.match(fr, /health: 'Récupération'/);
  assert.match(fr, /title: 'Récupération'/);
  assert.match(fr, /Ouvre Récupération/);
  assert.doesNotMatch(fr, /Ouvre Santé/);
  const en = src('src/i18n/locales/en.ts');
  assert.match(en, /health: 'Recovery'/);
  assert.doesNotMatch(en, /Open Santé/);
  const learned = src('src/components/coaching/CoachLearnedPage.tsx');
  assert.match(learned, /coaching\.learned\.kinds/);
  assert.doesNotMatch(learned, /keys\.slice/);
});

test('10d: Ask names who + effect before an agent send', () => {
  assert.deepEqual(
    describeAskSend({ roster: true, routeKind: 'ask_prometheus', clientName: null, hasProgram: false }),
    {
      whoKey: 'coaching.ask.preview.whoRoster',
      whoParams: {},
      effectKey: 'coaching.ask.preview.effectFilter',
      sendsAgent: false,
    },
  );
  assert.equal(
    describeAskSend({ roster: false, routeKind: 'ask_prometheus', clientName: 'Nadia', hasProgram: false }).whoKey,
    'coaching.ask.preview.whoClient',
  );
  assert.equal(
    describeAskSend({ roster: false, routeKind: 'onboarding_plan', clientName: 'Nadia', hasProgram: false }).effectKey,
    'coaching.ask.preview.effectProgramDraft',
  );
  assert.equal(
    describeAskSend({ roster: false, routeKind: 'program_nl_edit', clientName: 'Nadia', hasProgram: true }).effectKey,
    'coaching.ask.preview.effectPlanEdit',
  );
  const page = src('src/components/coaching/AskPrometheusPage.tsx');
  assert.match(page, /describeAskSend/);
  assert.match(page, /setPending/);
  assert.match(page, /coaching\.ask\.confirmSend/);
  assert.doesNotMatch(page, /if \(isRosterAsk\(q\)\) return;\s*void sendToAgent/);
});

test('10e: check-in success names the coach; never “transmis”', () => {
  const page = src('src/components/checkin/CheckInPage.tsx');
  assert.match(page, /checkin\.savedVisible/);
  assert.match(page, /displayName\(myCoach\)/);
  const fr = src('src/i18n/locales/fr.ts');
  assert.match(fr, /savedVisible: 'Enregistré — visible par \{\{coach\}\}'/);
  assert.doesNotMatch(fr, /[Tt]ransmis au coach/);
});

test('10f: exercise progress uses profile weight units', () => {
  const page = src('src/components/workout/ExerciseProgressPage.tsx');
  assert.match(page, /formatWeight\(kg, unit\)/);
  assert.match(page, /unit_weight/);
  assert.doesNotMatch(page, /\{ex\.latest1RM\} kg/);
  assert.doesNotMatch(page, />kg</);
});

test('10g: OverflowMenu Escape + first item focus; nav aria-current', () => {
  const menu = src('src/shared/ui/OverflowMenu.tsx');
  assert.match(menu, /Escape/);
  assert.match(menu, /\[role="menuitem"\]/);
  assert.match(menu, /items\?\.\[0\]\?\.focus/);
  const bottom = src('src/app/layout/BottomNav.tsx');
  const side = src('src/app/layout/SideNav.tsx');
  assert.match(bottom, /aria-current="page"/);
  assert.match(side, /aria-current="page"/);
});

test('10h: PageTransition resets tab index when persona changes', () => {
  const trans = src('src/app/layout/PageTransition.tsx') + src('src/shared/ui/PageTransition.tsx');
  assert.match(trans, /previousPersona/);
  assert.match(trans, /previousTabIndex = -1/);
  assert.match(trans, /navPersona\(context\)/);
});

test('10i: séance / programme / routine — the Vision §7.1 vocabulary, one word per concept', () => {
  const fr = src('src/i18n/locales/fr.ts');
  assert.match(fr, /title: 'Routines'/);
  assert.doesNotMatch(fr, /Supprimer le modèle/);
  assert.match(fr, /startRoutineFailed: 'Impossible de démarrer la séance/);
  assert.doesNotMatch(fr, /Mes modèles/);
  const en = src('src/i18n/locales/en.ts');
  assert.match(en, /title: 'Routines'/);
  assert.doesNotMatch(en, /Failed to start routine/);
});

test('10j: setup review preview titles what the client will see', () => {
  const setup = src('src/components/coaching/ClientSetupPage.tsx');
  assert.match(setup, /coaching\.setup\.wizard\.clientWillSee/);
  const fr = src('src/i18n/locales/fr.ts');
  assert.match(fr, /clientWillSee: 'Ce que le client verra'/);
});
