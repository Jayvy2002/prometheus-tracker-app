import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAccountSnapshot, resolveAccountContext } from '../../lib/accountContext';
import {
  bodyHubItems,
  desktopSections,
  hubRedirectPath,
  mobileTabs,
  navPersona,
  pathMatchesItem,
  profileShortcutVisible,
  quickAddActions,
  quickAddVisible,
  suiviHubItems,
  suiviWatchItem,
  tabIndexForPath,
} from './navConfig';
import { scrollHints, scrollOffsetToReveal } from './scrollHints';
import fr from '../../i18n/locales/fr';
import en from '../../i18n/locales/en';

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

test('the body tab always exists: progress photos live there whatever is tracked', () => {
  const none = { ...trackingOn, track_nutrition: false, track_weight: false, track_checkins: false };
  assert.equal(mobileTabs('coached', none).some(item => item.path === '/body'), true);
  assert.equal(mobileTabs('solo', none).some(item => item.path === '/body'), true);
  const body = mobileTabs('solo', none).find(item => item.path === '/body');
  assert.ok(body && pathMatchesItem('/photos', body));
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

test('coached mobile tabs reach the calendar like the solo (Vision §13)', () => {
  const tabs = mobileTabs('coached', trackingOn);
  const paths = tabs.map(item => item.path);
  assert.deepEqual(paths, ['/dashboard', '/workout', '/body', '/suivi', '/messages']);
  assert.equal(paths.length, 5);
  const suivi = tabs.find(item => item.path === '/suivi');
  assert.ok(suivi && pathMatchesItem('/calendar', suivi));
  assert.ok(suivi && pathMatchesItem('/exercise-progress', suivi));
});

test('quick add « Séance » opens the training page, never an empty workout', () => {
  const session = quickAddActions(trackingOn).find(action => action.id === 'session');
  assert.equal(session?.labelKey, 'nav.quickSession');
  assert.equal(session?.path, '/workout');
  assert.equal(session?.state, undefined);
  assert.equal(quickAddActions(trackingOn).some(action => action.path === '/workout/new'), false);
  // The mobile + button reads this same list; it never keeps a second one.
  const fab = src('src/app/layout/FAB.tsx');
  assert.match(fab, /quickAddActions\(tracking\)/);
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

test('desktop mirrors the mobile tabs: same groups, names and sub-pages (Solo and Coaché)', () => {
  for (const persona of ['solo', 'coached'] as const) {
    const sections = desktopSections(persona, trackingOn);
    const byId = (id: string) => sections.find(section => section.id === id);
    const paths = (id: string) => byId(id)?.items.map(item => item.path);
    // Sections follow the tab order: Aujourd’hui · Entraînement · Corps · Suivi.
    assert.deepEqual(sections.slice(0, 4).map(section => section.id), ['today', 'train', 'body', 'suivi'], persona);
    // Each section is named like its mobile tab.
    const tabs = mobileTabs(persona, trackingOn);
    for (const [sectionId, tabPath] of [['train', '/workout'], ['body', '/body'], ['suivi', '/suivi']] as const) {
      assert.equal(byId(sectionId)?.labelKey, tabs.find(tab => tab.path === tabPath)?.labelKey, `${persona} ${sectionId}`);
    }
    // Routines stay available with a program, coached or not (Vision §7.1).
    assert.deepEqual(paths('train'), ['/workout', '/routines', '/programs'], persona);
    // Corps lists every sub-tab of the mobile hub, measurements included.
    assert.deepEqual(paths('body'), bodyHubItems(trackingOn).map(item => item.path), persona);
    assert.deepEqual(paths('body'), ['/nutrition', '/weight', '/measurements', '/checkin', '/photos'], persona);
    // Suivi: the hub tabs, then what Prometheus watches.
    assert.deepEqual(paths('suivi'), ['/calendar', '/exercise-progress', '/stats', '/watch'], persona);
    assert.deepEqual(byId('suivi')?.items.map(item => item.labelKey), ['nav.calendar', 'nav.progressTraining', 'nav.progressSummary', 'prometheusWatch.title']);
    // No legacy « Comprendre » / « S'entraîner » grouping any more.
    assert.equal(sections.some(section => section.labelKey === 'nav.sectionUnderstand' || section.labelKey === 'nav.sectionTrain'), false);
  }
  // The coached athlete's fifth tab is Messages; desktop puts it right after Suivi.
  const coached = desktopSections('coached', trackingOn).map(section => section.id);
  assert.deepEqual(coached, ['today', 'train', 'body', 'suivi', 'inbox', 'account']);
  const solo = desktopSections('solo', trackingOn).map(section => section.id);
  assert.deepEqual(solo, ['today', 'train', 'body', 'suivi', 'account', 'findCoach']);
});

test('desktop sections follow the same module and permission rules as the hubs', () => {
  const noWorkouts = { ...trackingOn, track_workouts: false };
  assert.equal(desktopSections('solo', noWorkouts).some(section => section.id === 'train'), false);
  assert.equal(mobileTabs('solo', noWorkouts).some(tab => tab.path === '/workout'), false);
  const noWeight = { ...trackingOn, track_weight: false };
  const body = desktopSections('coached', noWeight).find(section => section.id === 'body')?.items.map(item => item.path);
  assert.deepEqual(body, ['/nutrition', '/checkin', '/photos']);
  const checkinWithoutFields = desktopSections('solo', trackingOn, { checkinHasFields: false })
    .find(section => section.id === 'body')?.items.map(item => item.path);
  assert.equal(checkinWithoutFields?.includes('/checkin'), false);
  const noCalendar = desktopSections('solo', trackingOn, { suivi: { calendar: false, history: false } })
    .find(section => section.id === 'suivi')?.items.map(item => item.path);
  assert.deepEqual(noCalendar, ['/exercise-progress', '/watch']);
});

test('Corps hub: measurements follow weight, a check-in without fields is not a tab, photos always exist', () => {
  assert.deepEqual(bodyHubItems(trackingOn).map(item => item.id), ['nutrition', 'weight', 'measurements', 'checkin', 'photos']);
  const none = { ...trackingOn, track_nutrition: false, track_weight: false, track_checkins: false };
  assert.deepEqual(bodyHubItems(none).map(item => item.path), ['/photos']);
  assert.equal(bodyHubItems(trackingOn, { checkinHasFields: false }).some(item => item.path === '/checkin'), false);
  const body = mobileTabs('solo', trackingOn).find(item => item.path === '/body');
  assert.ok(body);
  for (const item of bodyHubItems(trackingOn)) assert.equal(pathMatchesItem(item.path, body), true, item.path);
  assert.equal(pathMatchesItem('/recipes', body), true);
  assert.equal(pathMatchesItem('/checkin/settings', body), true);
});

test('Suivi hub: calendar first when allowed, exercises always, summary only with history', () => {
  assert.deepEqual(suiviHubItems().map(item => item.path), ['/calendar', '/exercise-progress', '/stats']);
  assert.deepEqual(suiviHubItems({ calendar: false, history: true }).map(item => item.path), ['/exercise-progress', '/stats']);
  assert.deepEqual(suiviHubItems({ calendar: true, history: false }).map(item => item.path), ['/calendar', '/exercise-progress']);
  const exercises = suiviHubItems().find(item => item.id === 'exercises');
  assert.ok(exercises && pathMatchesItem('/progress/exercise/Squat', exercises));
  assert.equal(suiviWatchItem.path, '/watch');
  const suivi = mobileTabs('coached', trackingOn).find(item => item.path === '/suivi');
  assert.ok(suivi && pathMatchesItem('/watch', suivi));
});

test('/body and /suivi open a sub-page, honouring old ?view= links when that view exists', () => {
  const body = bodyHubItems(trackingOn);
  assert.equal(hubRedirectPath(body, null), '/nutrition');
  assert.equal(hubRedirectPath(body, 'measurements'), '/measurements');
  assert.equal(hubRedirectPath(body, 'photos'), '/photos');
  assert.equal(hubRedirectPath(body, 'unknown'), '/nutrition');
  const coachOff = bodyHubItems({ ...trackingOn, track_nutrition: false, track_weight: false });
  assert.equal(hubRedirectPath(coachOff, 'weight'), '/checkin');
  assert.equal(hubRedirectPath(suiviHubItems(), 'trends'), '/stats');
  assert.equal(hubRedirectPath(suiviHubItems(), null), '/calendar');
  assert.equal(hubRedirectPath([], null), null);
});

test('direct Corps and Suivi pages keep the hub tabs and their own guards', () => {
  const routes = src('src/app/router/AppRoutes.tsx');
  const bodyLayout = routes.slice(routes.indexOf('<Route element={<CoachTrackerRedirect><BodyHub />'), routes.indexOf('<Route path="/suivi"'));
  for (const path of ['/nutrition', '/weight', '/measurements', '/checkin', '/photos']) {
    assert.match(bodyLayout, new RegExp(`path="${path}"`), path);
  }
  assert.match(bodyLayout, /path="\/nutrition" element=\{<CoachTrackerRedirect><TrackingGate module="nutrition">/);
  assert.match(bodyLayout, /path="\/weight" element=\{<CoachTrackerRedirect><TrackingGate module="weight">/);
  assert.match(bodyLayout, /path="\/measurements" element=\{<CoachTrackerRedirect><TrackingGate module="weight">/);
  assert.match(bodyLayout, /path="\/checkin" element=\{<CoachTrackerRedirect><TrackingGate module="checkins">/);
  // Sub-pages of a sub-page (recipes, check-in settings) keep their own back button.
  assert.doesNotMatch(bodyLayout, /path="\/recipes"|path="\/checkin\/settings"/);
  const suiviLayout = routes.slice(routes.indexOf('<Route element={<CoachTrackerRedirect><SuiviHub />'), routes.indexOf('<Route path="/profile"'));
  for (const path of ['/calendar', '/exercise-progress', '/progress/exercise/:exerciseName', '/stats', '/watch']) {
    assert.match(suiviLayout, new RegExp(`path="${path}"`), path);
  }
  assert.match(routes, /path="\/body" element=\{<CoachTrackerRedirect><BodyHubIndex \/>/);
  assert.match(routes, /path="\/suivi" element=\{<CoachTrackerRedirect><SuiviHubIndex \/>/);
  // Each route is declared once: no second, tab-less copy of a hub page.
  for (const path of ['/nutrition', '/weight', '/checkin', '/photos', '/calendar', '/stats']) {
    assert.equal(routes.split(`path="${path}"`).length - 1, 1, path);
  }
  // The layouts read the shared lists; the tab bar says when it scrolls.
  assert.match(src('src/components/navigation/BodyHub.tsx'), /bodyHubItems\(/);
  assert.match(src('src/components/navigation/SuiviHub.tsx'), /suiviHubItems\(/);
  const tabs = src('src/components/navigation/HubTabs.tsx');
  assert.match(tabs, /aria-current=\{active \? 'page' : undefined\}/);
  assert.match(tabs, /scrollHints\(/);
  assert.match(tabs, /hub-tabs-more/);
  assert.match(tabs, /min-h-11/);
});

test('the profile avatar stands in for the missing Profil tab on every main page', () => {
  const coached = mobileTabs('coached', trackingOn);
  for (const path of ['/workout', '/nutrition', '/weight', '/measurements', '/checkin', '/photos', '/calendar', '/exercise-progress', '/stats', '/watch']) {
    assert.equal(profileShortcutVisible(path, coached), true, path);
  }
  // The Dashboard header carries the same avatar; Messages keeps its composer on screen.
  assert.equal(profileShortcutVisible('/dashboard', coached), false);
  assert.equal(profileShortcutVisible('/messages', coached), false);
  // Not a main page: no avatar row.
  assert.equal(profileShortcutVisible('/programs', coached), false);
  // Where Profil is a tab, the tab is the way.
  assert.equal(profileShortcutVisible('/workout', mobileTabs('solo', trackingOn)), false);
  assert.equal(profileShortcutVisible('/clients', mobileTabs('coaching', trackingOn)), false);

  const layout = src('src/app/layout/AppLayout.tsx');
  assert.match(layout, /profileShortcutVisible\(/);
  assert.match(layout, /<ProfileAvatarLink \/>/);
  const avatar = src('src/app/layout/ProfileAvatarLink.tsx');
  assert.match(avatar, /to="\/profile"/);
  assert.match(avatar, /aria-label=\{t\('nav\.profile'\)\}/);
  assert.match(avatar, /w-11 h-11/);
});

test('hub tab bar scroll hints: an edge fades only where tabs hide', () => {
  assert.deepEqual(scrollHints(0, 358, 358), { start: false, end: false });
  assert.deepEqual(scrollHints(0, 358, 359), { start: false, end: false });
  assert.deepEqual(scrollHints(0, 358, 430), { start: false, end: true });
  assert.deepEqual(scrollHints(30, 358, 430), { start: true, end: true });
  assert.deepEqual(scrollHints(72, 358, 430), { start: true, end: false });
  assert.equal(scrollOffsetToReveal(10, 60, 0, 358), null);
  assert.equal(scrollOffsetToReveal(340, 70, 0, 358), 340 + 70 + 24 - 358);
  assert.equal(scrollOffsetToReveal(20, 60, 100, 358), 0);
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

test('quick add floats only where it is the natural way to log, never over a page action or a form', () => {
  for (const path of ['/dashboard', '/workout', '/calendar', '/suivi', '/stats', '/watch', '/exercise-progress', '/progress/exercise/Squat']) {
    assert.equal(quickAddVisible(path), true, path);
  }
  for (const path of [
    '/workout/new', '/workout/abc', '/messages', '/messages/abc', '/checkin', '/checkin/settings',
    '/nutrition', '/weight', '/body', '/programs', '/routines', '/recipes', '/profile', '/photos',
    '/coaches', '/coach/profile', '/coaching-requests', '/import', '/questionnaire',
  ]) {
    assert.equal(quickAddVisible(path), false, path);
  }
});

test('the home page is named « Aujourd’hui » / « Today » everywhere, never « Dashboard »', () => {
  // Vision: Dashboard = today's priority and overview. The route stays /dashboard.
  assert.equal(fr.nav.today, 'Aujourd’hui');
  assert.equal(fr.pages.today, 'Aujourd’hui');
  assert.equal(fr.coaching.command.title, 'Aujourd’hui');
  assert.equal(en.nav.today, 'Today');
  assert.equal(en.pages.today, 'Today');
  assert.equal(en.coaching.command.title, 'Today');
  for (const [lang, source] of [['fr', src('src/i18n/locales/fr/navigation.ts') + src('src/i18n/locales/fr/coaching.ts')], ['en', src('src/i18n/locales/en/navigation.ts') + src('src/i18n/locales/en/coaching.ts')]] as const) {
    assert.doesNotMatch(source, /:\s*'[^']*Dashboard/, lang);
  }
  // The hero already says « Aujourd’hui »: the header shows the date, the name stays for screen readers.
  const dashboard = src('src/components/dashboard/Dashboard.tsx');
  assert.doesNotMatch(dashboard, /\{t\('nav\.today'\)\} ·/);
  assert.match(dashboard, /<h1 className="sr-only">\{t\('nav\.today'\)\}<\/h1>/);
});
