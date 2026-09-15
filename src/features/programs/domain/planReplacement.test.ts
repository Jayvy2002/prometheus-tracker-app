import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  ASSIGNED_PLAN_TABLES,
  ATHLETE_SWAP_TABLE,
  athleteSwapTouchesAssignedPlan,
  PROPOSE_TO_PLAN_KIND,
  proposeToPlanKind,
} from './planReplacement';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('UX19 reuses program_nl_edit — no second Ask engine', () => {
  assert.equal(proposeToPlanKind(), 'program_nl_edit');
  assert.equal(PROPOSE_TO_PLAN_KIND, 'program_nl_edit');
  const send = src('src/features/coaching/domain/coachDraftSend.ts');
  assert.match(send, /'program_nl_edit'/);
  assert.doesNotMatch(send, /propose_to_plan/);
  assert.doesNotMatch(src('src/features/coaching/domain/coachAgent.ts'), /propose_to_plan/);
});

test('athlete swap never writes the assigned plan', () => {
  assert.equal(athleteSwapTouchesAssignedPlan(), false);
  assert.equal(ATHLETE_SWAP_TABLE, 'workout_exercises');
  assert.ok(ASSIGNED_PLAN_TABLES.includes('program_day_exercises'));
  const card = src('src/components/workout/ExerciseCard.tsx');
  assert.match(card, /updateExercise\(exercise\.id, \{ name: proposal\.swapTo \}\)/);
  assert.doesNotMatch(card, /save_program|saveProgram|program_day_exercises/);
  const store = src('src/stores/workoutStore.ts');
  assert.match(store, /from\('workout_exercises'\)\.update/);
});

test('coach Proposer au plan is a draft with recap — LastSession + workspace', () => {
  const review = src('src/components/coaching/LastSessionReview.tsx');
  assert.match(review, /ux19-propose-to-plan/);
  assert.match(review, /kind: 'program_nl_edit'/);
  assert.match(review, /coaching\.ux19\.proposeToPlan/);
  const workspace = src('src/components/coaching/ExerciseWorkspace.tsx');
  assert.match(workspace, /ux19-propose-to-plan/);
  assert.match(workspace, /kind: 'program_nl_edit'/);
  const draft = src('src/components/coaching/InterventionDraftPage.tsx');
  assert.match(draft, /ux19-draft-recap/);
  assert.match(draft, /coaching\.draftSend\.compare/);
  const workout = src('src/components/workout/WorkoutPage.tsx');
  assert.match(workout, /ux19-assigned-plan-untouched/);
  const fr = src('src/i18n/locales/fr/coaching.ts');
  const en = src('src/i18n/locales/en/coaching.ts');
  assert.match(fr, /proposeToPlan: 'Proposer au plan'/);
  assert.match(en, /proposeToPlan: 'Propose to the plan'/);
});
