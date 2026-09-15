import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAccountSnapshot, resolveAccountContext } from '../../lib/accountContext';
import { desktopSections, mobileTabs, navPersona, pathMatchesItem, quickAddActions, tabIndexForPath } from './navConfig';

const trackingOn = {
  track_workouts: true,
  track_checkins: true,
  track_nutrition: true,
  track_weight: true,
};

const coachSnap = parseAccountSnapshot({
  user_id: 'A',
  coach_capability: true,
  legacy_coaching_role: 'coach',
  active_coach_id: null,
}, 'A');

test('solo mobile tabs are Today / Workout / Progress / Nutrition / Profile', () => {
  const context = resolveAccountContext('none', null, true, null);
  assert.equal(navPersona(context), 'solo');
  assert.deepEqual(
    mobileTabs('solo', trackingOn).map(item => item.path),
    ['/dashboard', '/workout', '/exercise-progress', '/nutrition', '/profile'],
  );
});

test('coach mobile tabs put account in chrome and keep copilot off the tab bar', () => {
  const paths = mobileTabs('coaching', trackingOn).map(item => item.path);
  assert.deepEqual(paths, ['/dashboard', '/clients', '/messages', '/programs', '/profile']);
  assert.equal(paths.includes('/prometheus'), false);
});

test('coached mobile tabs keep messages and check-in, not photos', () => {
  const paths = mobileTabs('coached', trackingOn).map(item => item.path);
  assert.deepEqual(paths, ['/dashboard', '/workout', '/checkin', '/messages', '/profile']);
  assert.equal(paths.length, 5);
  assert.equal(paths.includes('/photos'), false);
  assert.equal(paths.includes('/nutrition'), false);
  assert.equal(paths.includes('/exercise-progress'), false);
});

test('UX84 quick add names an off-plan session when a program day is due', () => {
  const due = quickAddActions(trackingOn, { programDayDue: true });
  const rest = quickAddActions(trackingOn, { programDayDue: false });
  const workoutDue = due.find(action => action.id === 'newWorkout');
  const workoutRest = rest.find(action => action.id === 'newWorkout');
  assert.equal(workoutDue?.labelKey, 'nav.addWorkoutOffPlan');
  assert.deepEqual(workoutDue?.state, { offPlan: true });
  assert.equal(workoutRest?.labelKey, 'nav.newWorkout');
  assert.equal(workoutRest?.state, undefined);
});

test('UX111 coached nutrition stays off the tab bar (FAB + profile + desktop)', () => {
  const tabs = mobileTabs('coached', trackingOn);
  assert.equal(tabs.length, 5);
  const desktop = desktopSections('coached', trackingOn).flatMap(s => s.items.map(i => i.path));
  assert.equal(desktop.includes('/nutrition'), true);
  const fab = quickAddActions(trackingOn).map(a => a.path);
  assert.equal(fab.includes('/nutrition?add=1'), true);
  assert.equal(fab.includes('/checkin'), true);
});

test('coached desktop train lists program and progress, not stats or calendar', () => {
  const sections = desktopSections('coached', trackingOn);
  const train = sections.find(section => section.id === 'train')?.items.map(item => item.path);
  assert.deepEqual(train, ['/workout', '/programs', '/exercise-progress']);
  const all = sections.flatMap(section => section.items.map(item => item.path));
  assert.equal(all.includes('/stats'), false);
  assert.equal(all.includes('/calendar'), false);
});

test('desktop coaching lists copilot and marketplace as secondary sections', () => {
  const sections = desktopSections('coaching', trackingOn);
  const ids = sections.map(section => section.id);
  assert.deepEqual(ids, ['primary', 'copilot', 'activity', 'account']);
  assert.equal(sections.find(section => section.id === 'copilot')?.items[0]?.path, '/prometheus');
  assert.equal(sections.find(section => section.id === 'activity')?.tone, 'muted');
  assert.ok(sections.find(section => section.id === 'account')?.items.some(item => item.path === '/profile'));
});

test('a coach in the personal workspace uses the solo map', () => {
  const context = resolveAccountContext('coach', null, true, coachSnap, 'personal');
  assert.equal(navPersona(context), 'solo');
});

test('tab matching prefers the longest prefix and respects end', () => {
  const tabs = mobileTabs('solo', trackingOn);
  assert.equal(tabIndexForPath('/dashboard', tabs), 0);
  assert.equal(tabIndexForPath('/workout/new', tabs), 1);
  assert.equal(tabIndexForPath('/exercise-progress', tabs), 2);
  assert.equal(tabIndexForPath('/profile', tabs), 4);
  const profile = tabs.find(item => item.path === '/profile');
  assert.ok(profile);
  assert.equal(pathMatchesItem('/coach/profile', profile), false);
});
