import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAccountSnapshot, resolveAccountContext } from '../../lib/accountContext';
import { desktopSections, mobileTabs, navPersona, pathMatchesItem, quickAddActions, tabIndexForPath } from './navConfig';

const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

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

test('solo mobile tabs are Today / Workout / Body / Progress / Profile', () => {
  const context = resolveAccountContext('none', null, true, null);
  assert.equal(navPersona(context), 'solo');
  assert.deepEqual(
    mobileTabs('solo', trackingOn).map(item => item.path),
    ['/dashboard', '/workout', '/body', '/suivi', '/profile'],
  );
});

test('the body tab exists only when a body module is tracked', () => {
  const none = { ...trackingOn, track_nutrition: false, track_weight: false, track_checkins: false };
  assert.equal(mobileTabs('coached', none).some(item => item.path === '/body'), false);
  assert.equal(mobileTabs('solo', none).some(item => item.path === '/body'), false);
  const weightOnly = { ...none, track_weight: true };
  assert.equal(mobileTabs('coached', weightOnly).some(item => item.path === '/body'), true);
});

test('hubs stay lit on their sub-pages, and logging is not under progress', () => {
  const tabs = mobileTabs('solo', trackingOn);
  const body = tabs.find(item => item.path === '/body');
  const suivi = tabs.find(item => item.path === '/suivi');
  assert.ok(body && suivi);
  assert.equal(pathMatchesItem('/nutrition', body), true);
  assert.equal(pathMatchesItem('/weight', body), true);
  assert.equal(pathMatchesItem('/nutrition', suivi), false);
  assert.equal(pathMatchesItem('/progress/exercise/Squat', suivi), true);
  assert.equal(pathMatchesItem('/calendar', suivi), true);
});

test('coach mobile tabs put account in chrome and keep copilot off the tab bar', () => {
  const paths = mobileTabs('coaching', trackingOn).map(item => item.path);
  assert.deepEqual(paths, ['/dashboard', '/clients', '/messages', '/programs', '/profile']);
  assert.equal(paths.includes('/prometheus'), false);
});

test('coached mobile tabs are home, workout, body, coach and profile', () => {
  const paths = mobileTabs('coached', trackingOn).map(item => item.path);
  assert.deepEqual(paths, ['/dashboard', '/workout', '/body', '/messages', '/profile']);
  assert.equal(paths.length, 5);
  assert.equal(paths.includes('/photos'), false);
  assert.equal(paths.includes('/checkin'), false);
  assert.equal(paths.includes('/exercise-progress'), false);
});

test('quick add « Séance » opens the training page, never an empty workout', () => {
  const session = quickAddActions(trackingOn).find(action => action.id === 'session');
  assert.equal(session?.labelKey, 'nav.quickSession');
  assert.equal(session?.path, '/workout');
  assert.equal(session?.state, undefined);
  assert.equal(quickAddActions(trackingOn).some(action => action.path === '/workout/new'), false);
  const fab = src('src/app/layout/FAB.tsx');
  assert.match(fab, /navigate\('\/workout'\)/);
  assert.doesNotMatch(fab, /\/workout\/new/);
});

test('coached body tab keeps nutrition on desktop and off the marketplace', () => {
  const tabs = mobileTabs('coached', trackingOn);
  assert.equal(tabs.length, 5);
  assert.equal(tabs.some(item => item.path === '/body'), true);
  const desktop = desktopSections('coached', trackingOn).flatMap(s => s.items.map(i => i.path));
  assert.equal(desktop.includes('/nutrition'), true);
  assert.equal(desktop.includes('/coaches'), false);
  const fab = quickAddActions(trackingOn).map(a => a.path);
  assert.equal(fab.includes('/nutrition?add=1'), true);
  assert.equal(fab.includes('/checkin'), true);
});

test('coached desktop train lists program, progress, stats and calendar', () => {
  const sections = desktopSections('coached', trackingOn);
  const train = sections.find(section => section.id === 'train')?.items.map(item => item.path);
  assert.deepEqual(train, ['/workout', '/programs', '/exercise-progress', '/stats', '/calendar']);
  const all = sections.flatMap(section => section.items.map(item => item.path));
  assert.equal(all.includes('/stats'), true);
  assert.equal(all.includes('/calendar'), true);
});

test('desktop coaching lists copilot and marketplace as secondary sections', () => {
  const sections = desktopSections('coaching', trackingOn);
  const ids = sections.map(section => section.id);
  assert.deepEqual(ids, ['primary', 'copilot', 'offer', 'import', 'account']);
  assert.equal(sections.find(section => section.id === 'copilot')?.items[0]?.path, '/prometheus');
  assert.equal(sections.find(section => section.id === 'offer')?.tone, 'muted');
  // My offer is what the coach publishes and receives; finding a coach is personal.
  const offer = sections.find(section => section.id === 'offer')?.items.map(item => item.path);
  assert.deepEqual(offer, ['/coach/profile', '/coaching-requests']);
  const all = sections.flatMap(section => section.items.map(item => item.path));
  assert.equal(all.includes('/coaches'), false);
  assert.equal(all.includes('/coaches/match'), false);
  assert.ok(sections.find(section => section.id === 'account')?.items.some(item => item.path === '/profile'));
});

test('finding a coach is a personal, solo-only desktop entry', () => {
  const solo = desktopSections('solo', trackingOn).flatMap(section => section.items.map(item => item.path));
  assert.equal(solo.includes('/coaches'), true);
  const coached = desktopSections('coached', trackingOn).flatMap(section => section.items.map(item => item.path));
  assert.equal(coached.includes('/coaches'), false);
});

test('a coach in the personal workspace uses the solo map', () => {
  const context = resolveAccountContext('coach', null, true, coachSnap, 'personal');
  assert.equal(navPersona(context), 'solo');
});

test('tab matching prefers the longest prefix and respects end', () => {
  const tabs = mobileTabs('solo', trackingOn);
  assert.equal(tabIndexForPath('/dashboard', tabs), 0);
  assert.equal(tabIndexForPath('/workout/new', tabs), 1);
  assert.equal(tabIndexForPath('/body', tabs), 2);
  assert.equal(tabIndexForPath('/suivi', tabs), 3);
  assert.equal(tabIndexForPath('/exercise-progress', tabs), 3);
  assert.equal(tabIndexForPath('/profile', tabs), 4);
  const profile = tabs.find(item => item.path === '/profile');
  assert.ok(profile);
  assert.equal(pathMatchesItem('/coach/profile', profile), false);
});
