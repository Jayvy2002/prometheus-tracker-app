import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SETUP_WIZARD_STEPS, setupProgramLabel, trackingModulesOn } from './setupWizard';
import { ALL_ON_TRACKING } from './clientTracking';
import { formatMessageDay, messageDayKey } from './messageDates';
import { timezoneDisplayLabel } from './timezoneLabel';

test('setup wizard has four named steps', () => {
  assert.deepEqual(SETUP_WIZARD_STEPS, ['understand', 'tracking', 'care', 'review']);
});

test('setup program label prefers an assigned name', () => {
  assert.equal(setupProgramLabel({ assignedName: 'Upper / Lower', draftName: 'Draft', draftDayCount: 4 }), 'Upper / Lower');
  assert.equal(setupProgramLabel({ draftName: 'Draft', draftDayCount: 2 }), 'Draft');
  assert.equal(setupProgramLabel({ draftName: 'Draft', draftDayCount: 0 }), null);
});

test('tracking modules list only enabled ones', () => {
  assert.deepEqual(trackingModulesOn({
    ...ALL_ON_TRACKING,
    track_workouts: true,
    track_checkins: true,
    track_nutrition: false,
    track_weight: false,
    training: { ...ALL_ON_TRACKING.training },
    nutrition: { ...ALL_ON_TRACKING.nutrition },
    checkin: { ...ALL_ON_TRACKING.checkin },
  }), ['workouts', 'checkins']);
});

test('message day keys group by local calendar day', () => {
  const iso = '2026-09-14T15:00:00.000Z';
  assert.match(messageDayKey(iso), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(formatMessageDay(new Date().toISOString(), 'fr', 'Aujourd’hui', 'Hier'), 'Aujourd’hui');
});

test('timezone labels stay human', () => {
  assert.match(timezoneDisplayLabel('America/Toronto', 'fr'), /Est/);
  assert.equal(timezoneDisplayLabel('America/Toronto', 'en').includes('Eastern'), true);
});
