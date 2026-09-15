import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('coached athlete can open Mon programme and exercise-progress in read-only, not stats or calendar', () => {
  const app = src('src/App.tsx');
  assert.match(app, /path="\/exercise-progress" element=\{<CoachTrackerRedirect><ExerciseProgressPage/);
  assert.doesNotMatch(app, /path="\/exercise-progress" element=\{<CoachTrackerRedirect><CoachedAthleteRedirect>/);
  assert.match(app, /path="\/stats" element=\{<CoachTrackerRedirect><CoachedAthleteRedirect>/);
  assert.match(app, /path="\/calendar" element=\{<CoachTrackerRedirect><CoachedAthleteRedirect>/);

  const workout = src('src/components/workout/WorkoutPage.tsx');
  assert.match(workout, /coached \|\| !assignment\?\.program/);
  assert.match(workout, /to="\/programs"/);
  assert.match(workout, /to="\/exercise-progress"/);

  const progress = src('src/components/workout/ExerciseProgressPage.tsx');
  assert.match(progress, /isCoachedAthlete/);
  assert.match(progress, /!coached && \(/);
  assert.match(progress, /to="\/stats"/);
  assert.match(progress, /to="\/calendar"/);
});

test('waiting for a program goes to Messages; a due plan day is labelled hors programme', () => {
  const dash = src('src/components/dashboard/Dashboard.tsx');
  assert.match(dash, /nextAction === 'waiting_program'/);
  assert.match(dash, /to="\/messages"/);
  assert.match(dash, /dashboard\.nothingToday/);

  const fab = src('src/app/layout/FAB.tsx');
  assert.match(fab, /isProgramDayDue/);
  assert.match(fab, /nav\.addWorkoutOffPlan/);

  const fr = src('src/i18n/locales/fr.ts');
  assert.match(fr, /addWorkoutOffPlan: 'Séance hors programme'/);
  assert.match(fr, /nothingToday: 'Rien de prescrit aujourd’hui\.'/);
});
