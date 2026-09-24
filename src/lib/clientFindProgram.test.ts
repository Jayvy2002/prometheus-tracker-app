import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { i18nLocaleSource } from './i18nLocaleSource';

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('coached athlete can open Mon programme, exercise-progress, stats and calendar in read-only', () => {
  const app = src('src/App.tsx') + src('src/app/bootstrap/useAuthenticatedSession.ts') + src('src/app/guards/RouteGuards.tsx') + src('src/app/router/AppRoutes.tsx');
  assert.match(app, /path="\/exercise-progress" element=\{<CoachTrackerRedirect><ExerciseProgressPage/);
  assert.doesNotMatch(app, /path="\/exercise-progress" element=\{<CoachTrackerRedirect><CoachedAthleteRedirect>/);
  assert.match(app, /path="\/stats" element=\{<CoachTrackerRedirect><StatsPage/);
  assert.doesNotMatch(app, /path="\/stats" element=\{<CoachTrackerRedirect><CoachedAthleteRedirect>/);
  assert.match(app, /path="\/calendar" element=\{<CoachTrackerRedirect><CalendarPage/);
  assert.doesNotMatch(app, /path="\/calendar" element=\{<CoachTrackerRedirect><CoachedAthleteRedirect>/);

  const workout = src('src/components/workout/WorkoutPage.tsx');
  assert.doesNotMatch(workout, /data-testid="workout-program"/);
  assert.doesNotMatch(workout, /to="\/programs"/);
  assert.doesNotMatch(workout, /to="\/exercise-progress"/);
  const nav = src('src/app/navigation/navConfig.ts');
  assert.match(nav, /labelKey: 'nav\.myProgram'/);
  assert.match(nav, /path: '\/exercise-progress'/);

  const progress = src('src/components/workout/ExerciseProgressPage.tsx');
  assert.match(progress, /canReadOwnHistory/);
  assert.match(progress, /canOpenPersonalCalendarRoute/);
  assert.match(progress, /to="\/stats"/);
  assert.match(progress, /to="\/calendar"/);
});

test('waiting for a program goes to Messages; a due plan day is labelled hors programme', () => {
  const dash = src('src/components/dashboard/Dashboard.tsx') + src('src/features/dashboard/hooks/useDashboardBootstrap.ts');
  assert.match(dash, /nextAction === 'waiting_program'/);
  assert.match(dash, /to="\/messages"/);
  assert.match(dash, /dashboard\.nothingToday/);

  // Quick add « Séance » opens the training page, which offers the off-plan session.
  const fab = src('src/app/layout/FAB.tsx');
  assert.match(fab, /nav\.quickSession/);
  const workoutPage = src('src/components/workout/WorkoutPage.tsx');
  assert.match(workoutPage, /nav\.addWorkoutOffPlan/);

  const fr = src('src/i18n/locales/fr.ts');
  assert.match(fr, /addWorkoutOffPlan: 'Séance hors programme'/);
  assert.match(fr, /nothingToday: 'Rien de prescrit aujourd’hui\.'/);
  assert.match(src('src/i18n/locales/fr/workout.ts'), /offPlanNotice/);
});
