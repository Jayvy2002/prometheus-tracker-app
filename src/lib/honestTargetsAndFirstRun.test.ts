import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('nutrition targets are never invented as 150 / 250 / 65 / 2000', () => {
  const files = [
    'src/components/nutrition/MacroSummary.tsx',
    'src/components/dashboard/Dashboard.tsx',
    'src/components/stats/StatsPage.tsx',
  ];
  for (const file of files) {
    const text = src(file);
    assert.doesNotMatch(text, /protein_target \?\? 150/);
    assert.doesNotMatch(text, /carbs_target \?\? 250/);
    assert.doesNotMatch(text, /fat_target \?\? 6[57]/);
    assert.doesNotMatch(text, /daily_calorie_target \?\? 2000/);
    assert.match(text, /nutritionTargetsFromProfile/);
  }
});

test('finishing a workout does not mark leftover sets as completed', () => {
  const form = src('src/components/workout/WorkoutForm.tsx');
  assert.doesNotMatch(form, /\.update\(\{ completed: true \}\)/);
  assert.match(form, /shouldConfirmIncompleteFinish/);
  assert.match(form, /workout\.finishAnyway/);
});

test('auth, invite and intention are human first-run surfaces', () => {
  const auth = src('src/components/auth/AuthPage.tsx');
  assert.match(auth, /autoComplete=\{mode === 'register' \? 'new-password' : 'current-password'\}/);
  assert.match(auth, /auth\.showPassword/);
  assert.match(auth, /htmlFor="auth-email"/);
  const invite = src('src/components/coaching/InvitePage.tsx');
  assert.match(invite, /coaching\.invite\.titleNoName/);
  assert.match(invite, /coaching\.invite\.humanBody/);
  const intention = src('src/components/onboarding/EntryIntentionPage.tsx');
  assert.match(intention, /cta: 'soloCta'/);
  assert.match(intention, /<article/);
});

test('error boundary never prints Error.name to the user', () => {
  const boundary = src('src/components/ErrorBoundary.tsx');
  assert.doesNotMatch(boundary, /error\?\.name/);
  assert.doesNotMatch(boundary, /error\?\.message/);
  assert.match(boundary, /errors\.dataSafe/);
});

test('client setup is a four-step wizard', () => {
  const setup = src('src/components/coaching/ClientSetupPage.tsx');
  assert.match(setup, /SETUP_WIZARD_STEPS/);
  assert.match(setup, /coaching\.setup\.wizard\.start/);
  assert.doesNotMatch(setup, /coaching\.interventions\.send/);
});

test('client 360 tabs are a keyboard tablist', () => {
  const page = src('src/components/coaching/ClientDetailPage.tsx') + src('src/features/coaching/hooks/useClientDossier.ts');
  assert.match(page, /TabList/);
  assert.match(page, /role="tabpanel"/);
  assert.match(page, /coaching\.client360\.message/);
  assert.match(page, /coaching\.client360\.sinceVisit/);
});

test('assigning a program does not preselect the first client', () => {
  const programs = src('src/components/programs/ProgramsPage.tsx');
  assert.doesNotMatch(programs, /setAssignClient\(clients\[0\]\.id\)/);
  assert.match(programs, /setAssignClient\(''\)/);
  assert.match(programs, /OverflowMenu/);
  assert.doesNotMatch(programs, /<Card[^>]*onClick/);
});

test('navigation cards use links instead of Card onClick', () => {
  assert.doesNotMatch(src('src/components/stats/StatsPage.tsx'), /<Card[^>]*onClick/);
  assert.match(src('src/components/stats/StatsPage.tsx'), /CardLink/);
  assert.doesNotMatch(src('src/components/coaching/CoachDashboard.tsx'), /<Card[^>]*onClick/);
});

test('learned preferences hide cron / seen / flagged jargon', () => {
  const learned = src('src/components/coaching/CoachLearnedPage.tsx');
  assert.doesNotMatch(learned, /coaching\.learned\.cron/);
  assert.doesNotMatch(learned, /coaching\.learned\.roundStats/);
  assert.match(learned, /coaching\.learned\.correct/);
});

test('scanner search UI does not expose Open Food Facts steps', () => {
  const scanner = src('src/components/scanner/UnifiedScanner.tsx');
  assert.doesNotMatch(scanner, /scanner\.checkingDb/);
  assert.doesNotMatch(scanner, /scanner\.checkingOff/);
  assert.match(scanner, /scanner\.lookingUp/);
  assert.match(scanner, /scanner\.notFoundHuman/);
});

test('UX44: barcode and AI waits are dismissible without applying a result', () => {
  const scanner = src('src/components/scanner/UnifiedScanner.tsx');
  assert.match(scanner, /dismissWait/);
  assert.match(scanner, /cancelledRef/);
  assert.match(scanner, /scanner\.waitQuitHint/);
  assert.match(scanner, /onClose\(\)/);
  assert.match(scanner, /data-testid="scanner-wait-cancel"/);
  const fr = src('src/i18n/locales/fr/nutrition.ts');
  assert.match(fr, /Le journal reste possible/);
});

test('progress hub links to stats weight calendar', () => {
  const hub = src('src/components/workout/ExerciseProgressPage.tsx');
  assert.match(hub, /to="\/stats"/);
  assert.match(hub, /to="\/weight"/);
  assert.match(hub, /to="\/calendar"/);
});

test('set type dots use a static Tailwind class', () => {
  const card = src('src/components/workout/ExerciseCard.tsx') + src('src/components/workout/SetRow.tsx') + src('src/features/workout/domain/overloadSuggestion.ts') + src('src/features/workout/hooks/useExerciseHistory.ts');
  assert.doesNotMatch(card, /color\.replace\('text-', 'bg-'\)/);
  assert.match(card, /dotColor/);
  assert.doesNotMatch(card, />Tempo</);
  assert.doesNotMatch(card, />Cluster</);
  assert.doesNotMatch(card, />ACT</);
});

test('reduced motion does not leave delayed sidebar items at opacity 0', () => {
  const css = src('src/index.css');
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /animation-delay:\s*0s/);
  assert.match(css, /\.sidebar-item/);
  assert.match(css, /animation:\s*none/);
});

test('daily-driver items use ListRow, PageHeader and 44px Button chrome', () => {
  const row = src('src/shared/ui/ListRow.tsx');
  assert.match(row, /min-h-11/);
  assert.match(row, /rounded-2xl/);
  assert.match(row, /ListRowTone/);
  assert.match(src('src/shared/ui/Button.tsx'), /min-h-11/);
  const dash = src('src/components/dashboard/Dashboard.tsx') + src('src/features/dashboard/hooks/useDashboardBootstrap.ts');
  assert.match(dash, /ListRow/);
  assert.doesNotMatch(dash, /violet-500/);
  assert.doesNotMatch(dash, /cyan-500\/8/);
  assert.doesNotMatch(dash, /orange-500\/8/);
  assert.match(src('src/components/checkin/CheckInPage.tsx'), /PageHeader/);
  assert.match(src('src/components/workout/WorkoutSummaryScreen.tsx'), /<Button/);
  assert.match(src('src/components/coaching/CoachTodayQueue.tsx'), /ListRow/);
  assert.doesNotMatch(src('src/components/coaching/CoachInboxPage.tsx'), /<Card[^>]*onClick/);
  assert.match(src('src/components/coaching/CoachInboxPage.tsx'), /ListRow/);
});

test('mobile and desktop nav share Aujourd’hui via navConfig and use NavLink', () => {
  const config = src('src/app/navigation/navConfig.ts');
  const bottom = src('src/app/layout/BottomNav.tsx');
  const side = src('src/app/layout/SideNav.tsx');
  assert.match(config, /labelKey: 'nav\.today'/);
  assert.match(bottom, /NavLink/);
  assert.match(bottom, /mobileTabs/);
  assert.doesNotMatch(bottom, /t\('nav\.home'\)/);
  assert.match(side, /NavLink/);
  assert.match(side, /desktopSections/);
  assert.doesNotMatch(side, /WorkspaceSwitcher/);
  assert.doesNotMatch(bottom, /\/prometheus/);
});
