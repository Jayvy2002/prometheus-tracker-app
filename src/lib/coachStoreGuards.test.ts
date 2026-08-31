import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_OFF_TRACKING, ALL_ON_TRACKING } from './clientTracking';
import {
  inboxPrimaryIsSend,
  nextRoleAfterFetch,
  opsHasPartialError,
  parseRememberedCoachingRole,
  previousRoleForFetch,
  viewerTrackingAfterFetch,
} from './coachStoreGuards';

test('remembered coach seat survives reload until a successful fetch', () => {
  assert.equal(parseRememberedCoachingRole('coach'), 'coach');
  assert.equal(parseRememberedCoachingRole('nope'), null);
  assert.equal(previousRoleForFetch('none', 'coach'), 'coach');
  assert.equal(previousRoleForFetch('client', 'coach'), 'client');
  assert.equal(previousRoleForFetch('none', null), 'none');
});

test('role fetch error keeps the previous role — never fail-open to none', () => {
  const out = nextRoleAfterFetch({
    previous: 'coach',
    data: null,
    error: { message: 'network blip' },
  });
  assert.equal(out.role, 'coach');
  assert.equal(out.error, 'network blip');
});

test('role fetch success can still become none when the row says so', () => {
  const out = nextRoleAfterFetch({
    previous: 'coach',
    data: { coaching_role: 'none' },
    error: null,
  });
  assert.equal(out.role, 'none');
  assert.equal(out.error, null);
});

test('coached athlete without a tracking row is ALL_OFF, not ALL_ON', () => {
  const missing = viewerTrackingAfterFetch({ isCoached: true, row: null, fetchError: false });
  assert.equal(missing.tracking.track_nutrition, false);
  assert.equal(missing.tracking.track_workouts, false);
  assert.equal(missing.tracking.track_checkins, false);
  assert.equal(missing.ready, true);
  assert.equal(missing.tracking.track_nutrition, ALL_OFF_TRACKING.track_nutrition);

  const failed = viewerTrackingAfterFetch({ isCoached: true, row: null, fetchError: true });
  assert.equal(failed.tracking.track_nutrition, false);

  const solo = viewerTrackingAfterFetch({ isCoached: false, row: null, fetchError: false });
  assert.equal(solo.tracking.track_nutrition, ALL_ON_TRACKING.track_nutrition);
});

test('inbox kcal is never a one-tap send; Relancer may be', () => {
  assert.equal(inboxPrimaryIsSend('calorie_adjustment'), false);
  assert.equal(inboxPrimaryIsSend('program_adjustment'), false);
  assert.equal(inboxPrimaryIsSend('adherence_training'), true);
  assert.equal(inboxPrimaryIsSend('adherence_nutrition'), true);
  assert.equal(inboxPrimaryIsSend('keep_in_touch'), true);
});

test('ops partial error surfaces the first failed query', () => {
  assert.equal(opsHasPartialError([{ error: null }, { error: null }]), null);
  assert.equal(opsHasPartialError([
    { error: null },
    { error: { message: 'workouts timeout' } },
  ]), 'workouts timeout');
});
