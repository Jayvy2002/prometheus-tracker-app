import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { applySetPlaceholders } from './workoutSetComplete';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('empty weight and reps fill from last / suggested placeholders', () => {
  const filled = applySetPlaceholders({
    weight: '',
    reps: '',
    duration: '',
    isIsometric: false,
    showLoad: true,
    showReps: true,
    weightPlaceholder: '80',
    repsPlaceholder: '8',
  });
  assert.equal(filled.weight, '80');
  assert.equal(filled.reps, '8');
});

test('typed values are not overwritten by placeholders', () => {
  const filled = applySetPlaceholders({
    weight: '100',
    reps: '5',
    duration: '',
    isIsometric: false,
    showLoad: true,
    showReps: true,
    weightPlaceholder: '80',
    repsPlaceholder: '8',
  });
  assert.equal(filled.weight, '100');
  assert.equal(filled.reps, '5');
});

test('placeholder 0 is ignored so an empty set stays empty', () => {
  const filled = applySetPlaceholders({
    weight: '',
    reps: '',
    duration: '',
    isIsometric: false,
    showLoad: true,
    showReps: true,
    weightPlaceholder: '0',
    repsPlaceholder: '0',
  });
  assert.equal(filled.weight, '');
  assert.equal(filled.reps, '');
});

test('set complete without a prescribed rest still starts a 90s timer', () => {
  const card = src('src/components/workout/ExerciseCard.tsx');
  assert.match(card, /resolveRestSeconds\(exercise\.prescribed_rest_seconds\) \?\? 90/);
});

test('messages fill the viewport minus the tab bar; check-in extras are collapsed', () => {
  const clientMsg = src('src/components/coaching/ClientMessagesPage.tsx');
  assert.doesNotMatch(clientMsg, /pb-28/);
  assert.match(clientMsg, /100dvh-6rem/);
  const inbox = src('src/components/coaching/CoachInboxPage.tsx');
  assert.doesNotMatch(inbox, /pb-28/);
  assert.match(inbox, /100dvh-6rem/);
  const summary = src('src/components/workout/WorkoutSummaryScreen.tsx');
  assert.match(summary, /workout\.summary\.coachWillSee/);
});
