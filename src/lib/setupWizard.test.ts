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
  // Two instants of the same local day share a key; the key is the local date, not the UTC one.
  const morning = new Date(2026, 8, 14, 0, 30).toISOString();
  const night = new Date(2026, 8, 14, 23, 30).toISOString();
  assert.equal(messageDayKey(morning), '2026-09-14');
  assert.equal(messageDayKey(night), '2026-09-14');
  assert.notEqual(messageDayKey(new Date(2026, 8, 15, 0, 5).toISOString()), messageDayKey(night));
  assert.equal(messageDayKey('not-a-date'), 'not-a-date'.slice(0, 10));
  // Relative labels: an instant one minute ago is « today », 24 h earlier is « yesterday ».
  const now = Date.now();
  const recent = new Date(now).toISOString();
  assert.equal(formatMessageDay(recent, 'fr', 'Aujourd’hui', 'Hier'), 'Aujourd’hui');
  const yesterdayNoon = new Date(new Date(now).setHours(12, 0, 0, 0) - 24 * 3600 * 1000).toISOString();
  assert.equal(formatMessageDay(yesterdayNoon, 'fr', 'Aujourd’hui', 'Hier'), 'Hier');
});

test('timezone labels stay human', () => {
  assert.match(timezoneDisplayLabel('America/Toronto', 'fr'), /Est/);
  assert.equal(timezoneDisplayLabel('America/Toronto', 'en').includes('Eastern'), true);
});
