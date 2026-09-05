import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  draftingPayload,
  isInterventionDrafting,
  isInterventionReady,
  interventionDraftError,
  mergeInterventionRealtime,
  pendingForClient,
  routeCoachSecondRequest,
} from './coachSecond';
import type { CoachIntervention } from './types';

function row(partial: Partial<CoachIntervention>): CoachIntervention {
  return {
    id: 'i1',
    coach_id: 'c1',
    client_id: 'u1',
    kind: 'onboarding_plan',
    title: 'draft',
    rationale: 'prompt',
    payload: {},
    status: 'pending',
    source: 'second',
    created_at: '2026-08-29T00:00:00Z',
    updated_at: '2026-08-29T00:00:00Z',
    resolved_at: null,
    ...partial,
  };
}

test('roster-style create-program routes to onboarding_plan', () => {
  const route = routeCoachSecondRequest('Crée un programme IA pour ce client', { onboarded: true });
  assert.equal(route.kind, 'onboarding_plan');
  assert.equal(route.reason, 'first_program');
});

test('colloquial “fait moi un programme” routes to onboarding_plan', () => {
  const route = routeCoachSecondRequest('fait moi un programme pour un etudiant novice', { onboarded: true });
  assert.equal(route.kind, 'onboarding_plan');
});

test('NL edit with a program in context routes to program_nl_edit', () => {
  const route = routeCoachSecondRequest('passe le développé incliné à 2×6-10 RIR1', { hasProgram: true });
  assert.equal(route.kind, 'program_nl_edit');
});

test('freeform Ask Prometheus routes to ask_prometheus', () => {
  const route = routeCoachSecondRequest('Pourquoi Marie ne progresse pas au squat ?');
  assert.equal(route.kind, 'ask_prometheus');
});

test('drafting payload is pending and empty of program content', () => {
  const payload = draftingPayload({ prompt: 'hello', screen: 'client_setup' });
  const item = row({ payload });
  assert.equal(isInterventionDrafting(item), true);
  assert.equal(isInterventionReady(item), false);
  assert.equal(interventionDraftError(item), null);
});

test('Realtime UPDATE with a program replaces the drafting row without a refresh', () => {
  const drafting = row({ payload: { drafting: true, prompt: 'go' } });
  const ready = row({
    payload: {
      program: {
        name: 'Force 4j',
        description: '',
        duration_weeks: 8,
        days: [{ weekday: 1, name: 'A', exercises: [{ name: 'Squat', default_sets: 3, default_reps: 5, default_reps_min: null, default_rir: 2, default_rest_seconds: 120 }] }],
      },
      tracking: {
        track_weight: true,
        track_checkins: true,
        track_nutrition: true,
        track_workouts: true,
        workout_focus: '',
      },
    },
    updated_at: '2026-08-29T00:01:00Z',
  });
  const afterInsert = mergeInterventionRealtime([], 'INSERT', drafting);
  assert.equal(afterInsert.length, 1);
  assert.equal(isInterventionDrafting(afterInsert[0]), true);
  const afterUpdate = mergeInterventionRealtime(afterInsert, 'UPDATE', ready);
  assert.equal(afterUpdate.length, 1);
  assert.equal(isInterventionDrafting(afterUpdate[0]), false);
  assert.equal(isInterventionReady(afterUpdate[0]), true);
});

test('failed webhook marks error and is not treated as a ready draft', () => {
  const failed = row({ payload: { drafting: false, error: 'WEBHOOK_FAILED' } });
  assert.equal(interventionDraftError(failed), 'WEBHOOK_FAILED');
  assert.equal(isInterventionReady(failed), false);
});

test('JSON object answers and log dumps are not a ready draft', () => {
  const dumped = row({
    kind: 'program_nl_edit',
    payload: { answer: { sets: [1, 2], raw: 'log' }, cause: '{"kind":"program_nl_edit"}' },
  });
  assert.equal(isInterventionReady(dumped), false);
});

test('pendingForClient skips app-wide cards without a client', () => {
  const orphan = row({
    id: 'app1',
    client_id: null,
    kind: 'ask_prometheus',
  });
  const real = row({
    id: 'nl1',
    client_id: 'u1',
    kind: 'program_nl_edit',
  });
  assert.equal(pendingForClient([orphan, real], 'u1')?.id, 'nl1');
  assert.equal(pendingForClient([orphan], 'u1'), null);
});
