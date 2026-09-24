import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  allSettled,
  programRowCopy,
  showSoloStartHero,
  soloReviewCompactKey,
  soloReviewPresentation,
} from './dashboardHome';
import frCommon from '../../../i18n/locales/fr/common';
import enCommon from '../../../i18n/locales/en/common';
import frNav from '../../../i18n/locales/fr/navigation';
import enNav from '../../../i18n/locales/en/navigation';

const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

const soloNoPlan = {
  activityPending: false,
  hasCoach: false,
  tracksWorkouts: true,
  hasProgram: false,
  hasGymCard: false,
  routineCount: 0,
};

test('a Solo with neither program nor routine gets a clear first move', () => {
  assert.equal(showSoloStartHero(soloNoPlan), true);
  assert.equal(showSoloStartHero({ ...soloNoPlan, activityPending: true }), false);
  assert.equal(showSoloStartHero({ ...soloNoPlan, hasCoach: true }), false);
  assert.equal(showSoloStartHero({ ...soloNoPlan, tracksWorkouts: false }), false);
  assert.equal(showSoloStartHero({ ...soloNoPlan, hasProgram: true }), false);
  assert.equal(showSoloStartHero({ ...soloNoPlan, hasGymCard: true }), false);
  assert.equal(showSoloStartHero({ ...soloNoPlan, routineCount: 1 }), false);
});

test('the program row names what it opens', () => {
  assert.deepEqual(programRowCopy({ programName: 'PPL', hasCoach: false }), { titleKey: 'nav.myProgram', subtitleKey: null });
  assert.deepEqual(programRowCopy({ programName: null, hasCoach: true }), { titleKey: 'nav.myProgram', subtitleKey: 'dashboard.firstRun.waitingProgram' });
  // No more vague « Mon programme — Tes plans et modèles » for a Solo without a plan.
  assert.deepEqual(programRowCopy({ programName: null, hasCoach: false }), { titleKey: 'dashboard.planProgram', subtitleKey: 'dashboard.planProgramHint' });
});

const review = (patch: Partial<{ status: 'ready' | 'insufficient'; draft: object | null; action: 'keep' | 'relance' | 'calorie_adjustment'; guarded: boolean; suppressed: boolean }>) => ({
  status: patch.status ?? 'ready',
  suppressedByDecision: patch.suppressed,
  proposal: {
    action: patch.action ?? 'keep',
    draft: (patch.draft ?? null) as never,
    guarded: patch.guarded,
  },
});

test('the two-week review is a full card only when a decision waits', () => {
  const draft = { calories: 2100, protein: 150, carbs: 220, fat: 70 };
  assert.equal(soloReviewPresentation(review({ action: 'calorie_adjustment', draft })), 'decision');
  assert.equal(soloReviewPresentation(review({ action: 'calorie_adjustment', draft, suppressed: true })), 'compact');
  assert.equal(soloReviewPresentation(review({ status: 'insufficient' })), 'compact');
  assert.equal(soloReviewPresentation(review({ action: 'keep' })), 'compact');
  assert.equal(soloReviewPresentation(review({ action: 'relance' })), 'compact');

  assert.equal(soloReviewCompactKey(review({ status: 'insufficient' })), 'dashboard.reviewCompact.insufficient');
  assert.equal(soloReviewCompactKey(review({ action: 'relance' })), 'dashboard.reviewCompact.moreData');
  assert.equal(soloReviewCompactKey(review({ action: 'keep', guarded: true })), 'dashboard.reviewCompact.guarded');
  assert.equal(soloReviewCompactKey(review({ action: 'keep' })), 'dashboard.reviewCompact.noChange');
  assert.equal(soloReviewCompactKey(review({ action: 'calorie_adjustment', suppressed: true })), 'dashboard.reviewCompact.noChange');
});

test('late cards are revealed together once each has answered', () => {
  assert.equal(allSettled(['proposal', 'watch'], ['watch']), false);
  assert.equal(allSettled(['proposal', 'watch'], ['watch', 'proposal']), true);
  assert.equal(allSettled([], []), true);
});

function dashboard(): string {
  return src('src/components/dashboard/Dashboard.tsx');
}

function segment(text: string, from: string, to: string): string {
  const start = text.indexOf(from);
  const end = text.indexOf(to, start + 1);
  assert.ok(start >= 0 && end > start, `${from} → ${to}`);
  return text.slice(start, end);
}

test('Dashboard reads today first: priority, then the day, then compact attention points', () => {
  const dash = dashboard();
  const priority = segment(dash, 'data-testid="dashboard-column-today"', 'data-testid="dashboard-column-overview"');
  const overview = segment(dash, 'data-testid="dashboard-column-overview"', 'data-testid="dashboard-attention"');
  const attention = segment(dash, 'data-testid="dashboard-attention"', 'function DashboardInsights');

  // 1. The one thing to do now.
  assert.match(priority, /<ClientGymCard/);
  assert.match(priority, /showRoutineHero/);
  assert.match(priority, /data-testid="dashboard-start"/);
  // 2. The day: nutrition, weight, week — then the program row.
  assert.match(overview, /<NutritionRings/);
  assert.match(overview, /<DashboardWeightCard/);
  assert.ok(overview.indexOf('data-testid="dashboard-week"') < overview.indexOf('data-testid="dashboard-program"'));
  // 3. Attention rows, then the cards that load on their own.
  assert.match(attention, /attention\.unreadMessage/);
  assert.match(attention, /attention\.checkinDue/);
  assert.match(attention, /<DashboardInsights/);

  // Nothing that loads on its own sits above the day: no jump in the first screen.
  for (const late of ['WatchSummaryRow', 'SoloWeeklyReview', 'SoloProgramProposal', 'DashboardInsights']) {
    assert.doesNotMatch(priority, new RegExp(`<${late}`), late);
    assert.doesNotMatch(overview, new RegExp(`<${late}`), late);
  }
  const insights = dash.slice(dash.indexOf('function DashboardInsights'));
  assert.match(insights, /useSettledReveal\(expected\)/);
  assert.match(insights, /hidden=\{!revealed\}/);
  assert.match(insights, /<SoloProgramProposal variant="notice" onSettled=\{settleProposal\} \/>/);
  assert.match(insights, /<WatchSummaryRow athleteId=\{athleteId\} onSettled=\{settleWatch\} \/>/);
  // Attention rows wait for the check-in rhythm so a late row never pushes the cards.
  assert.match(dash, /const attentionReady = !activityPending && !checkinSchedule\.loading/);
  // Routines decide the first move too: they are loaded before anything shows.
  assert.match(dash, /routinesLoading \|\| !assignmentReady/);

  // Desktop keeps two columns: priority + attention left, overview right.
  assert.match(dash, /lg:grid lg:grid-cols-2 lg:grid-rows-\[auto_1fr\]/);
  assert.match(dash, /lg:col-start-2 lg:row-start-1 lg:row-span-2/);
  assert.match(dash, /lg:col-start-1 lg:row-start-2/);
  // A loading state, not an empty page.
  assert.match(priority, /role="status"/);
  assert.match(priority, /CardSkeleton/);
});

test('the Solo first move is a free session or a first routine, and a refused start still says so', () => {
  const dash = dashboard();
  const start = segment(dash, '{showStartHero && (', '{showNextActionHero');
  assert.match(start, /navigate\('\/workout\/new'\)/);
  assert.match(start, /nav\.addWorkoutOffPlan/);
  assert.match(start, /to="\/routines"/);
  assert.match(start, /dashboard\.startHero\.createRoutine/);
  // The Dashboard links to routines only from this first move.
  assert.equal(dash.split('/routines').length - 1, 1);
  // Lot A: a start that fails is said out loud.
  assert.ok(dash.split("toast(t('workout.startRoutineFailed'), 'error')").length - 1 >= 4);
  assert.match(dash, /showNextActionHero = [^;]*!showStartHero/);
});

test('the review folds into one line unless a decision waits, and never flashes', () => {
  const card = src('src/components/dashboard/SoloWeeklyReview.tsx');
  assert.match(card, /soloReviewPresentation\(review\) === 'decision'/);
  assert.match(card, /soloReviewCompactKey\(review\)/);
  assert.match(card, /aria-expanded=\{expanded\}/);
  assert.match(card, /aria-controls=\{expanded \? panelId : undefined\}/);
  assert.match(card, /if \(checkedWeek !== review\.weekStart\) return null/);
  assert.match(card, /onSettled\?\.\(\)/);
  assert.match(src('src/components/dashboard/WatchSummaryRow.tsx'), /settledRef\.current\?\.\(\)/);
  assert.match(src('src/components/dashboard/SoloProgramProposal.tsx'), /settledRef\.current\?\.\(\)/);
});

test('new Dashboard and navigation copy exists in FR and EN', () => {
  const pairs: Array<[Record<string, unknown>, Record<string, unknown>]> = [
    [frCommon.dashboard.startHero, enCommon.dashboard.startHero],
    [frCommon.dashboard.reviewCompact, enCommon.dashboard.reviewCompact],
  ];
  for (const [fr, en] of pairs) {
    assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
    for (const value of [...Object.values(fr), ...Object.values(en)]) assert.ok(typeof value === 'string' && value.length > 0);
  }
  assert.ok(frCommon.dashboard.planProgram && enCommon.dashboard.planProgram);
  assert.ok(frCommon.dashboard.planProgramHint && enCommon.dashboard.planProgramHint);
  assert.equal(frNav.nav.sessions, 'Séances');
  assert.equal(enNav.nav.sessions, 'Sessions');
  assert.equal(frCommon.dashboard.startHero.createRoutine, 'Créer ma première routine');
});
