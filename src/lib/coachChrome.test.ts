import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  ALL_OFF_TRACKING,
  ALL_ON_TRACKING,
  COACHED_NAV_MAX,
  coachedNavPaths,
} from './clientTracking';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('Today keeps File du jour; drafts live in Messages, not a third inbox', () => {
  const dash = src('src/components/coaching/CoachDashboard.tsx');
  assert.match(dash, /CoachTodayQueue/);
  assert.doesNotMatch(dash, /coaching\.interventions\.title/);
  assert.doesNotMatch(dash, /InterventionInboxCard/);
  assert.doesNotMatch(dash, /topDrafts/);
  assert.match(dash, /stats\.checkinsToReview > 0/);
  assert.doesNotMatch(dash, /navigate\('\/profile'\)/);
  assert.doesNotMatch(dash, /nav\.clients/);

  const queue = src('src/components/coaching/CoachTodayQueue.tsx');
  assert.doesNotMatch(queue, /navigate\('\/clients'\)/);

  const inbox = src('src/components/coaching/CoachInboxPage.tsx');
  assert.match(inbox, /InterventionInboxCard/);
  assert.match(inbox, /coaching\.inbox\.toHandle/);
});

test('Ask opens the editable draft for this question; roster chips stay local', () => {
  const ask = src('src/components/coaching/AskPrometheusPage.tsx');
  assert.match(ask, /openDraftHref/);
  assert.match(ask, /from:\s*'ask'/);
  assert.match(ask, /navigate\(href\)/);
  assert.match(ask, /rosterHitsForFilter/);
  assert.doesNotMatch(ask, /coaching\.ask\.openDraft/);
  assert.doesNotMatch(ask, /coaching\.fleet\.run/);
  assert.doesNotMatch(ask, /coaching\.ask\.drafts/);
  assert.doesNotMatch(ask, /coaching\.ask\.noDrafts/);
});

test('Clients roster: invite is a dedicated flow, no Programs shortcut, Setup only if not configured, open file is Vue d’ensemble', () => {
  const clients = src('src/components/coaching/ClientsPage.tsx');
  assert.doesNotMatch(clients, /navigate\('\/programs'\)/);
  assert.match(clients, /inviteOpen/);
  assert.match(clients, /coaching\.invite\.cta/);
  assert.match(clients, /forceSetup &&/);
  assert.match(clients, /shouldOpenSetup/);
  assert.match(clients, /clientFileHref/);
  assert.match(clients, /sortRosterClients/);
  assert.match(clients, /coaching\.rosterList/);
  assert.doesNotMatch(clients, /lastMessageForClient/);
});

test('Progress: no empty before/after spam; logged-exercise picker stays on Training', () => {
  const compare = src('src/components/coaching/ProgressPhotoCompare.tsx');
  assert.match(compare, /if \(kind === 'empty'\) return null/);
  assert.doesNotMatch(compare, /emptyCoachRelance/);

  const detail = src('src/components/coaching/ClientDetailPage.tsx');
  assert.match(detail, /photos\.length > 0/);
  const progressBlock = detail.slice(detail.indexOf("tab === 'progress'"));
  const trainingBlock = detail.slice(detail.indexOf("tab === 'training' ?"));
  assert.match(progressBlock, /compact/);
  assert.match(trainingBlock, /onOpenSeries/);
});

test('Coached client shell: hub Messages + Photos + Mon programme, no coach-mode dump', () => {
  const profile = src('src/components/profile/ProfilePage.tsx');
  assert.doesNotMatch(profile, /\/recipes/);
  assert.doesNotMatch(profile, /\/routines/);
  assert.match(profile, /\/photos/);
  assert.match(profile, /\/messages/);
  assert.match(profile, /nav\.myProgram/);
  assert.doesNotMatch(profile, /nav\.clients/);
  assert.match(profile, /!coached && \(/);
  assert.match(profile, /coaching\.coachMode/);

  const app = src('src/App.tsx');
  assert.match(app, /ProgramsHome/);
  assert.match(app, /path="\/programs"/);
  assert.doesNotMatch(app, /path="\/programs" element=\{<CoachedAthleteRedirect>/);
  assert.doesNotMatch(app, /changeLanguage\(profile/);
  assert.match(app, /CoachOnly/);
  assert.match(app, /TrackingGate module="nutrition"/);
  assert.match(app, /path="\/clients" element=\{<CoachOnly>/);

  const side = src('src/components/layout/SideNav.tsx');
  assert.match(side, /nav\.myProgram/);
  assert.match(side, /path: '\/photos'/);
  assert.doesNotMatch(side, /path: '\/stats'|path: '\/calendar'|path: '\/exercise-progress'/);

  const bottom = src('src/components/layout/BottomNav.tsx');
  assert.match(bottom, /coachedNavPaths\(tracking\)/);
  assert.match(bottom, /'\/photos': \{/);
  assert.match(bottom, /'\/profile': \{/);
});

test('La barre du bas du client coaché suit ce que le coach a activé', () => {
  const allOn = coachedNavPaths(ALL_ON_TRACKING);
  assert.equal(allOn.length <= COACHED_NAV_MAX, true);
  assert.equal(allOn[0], '/dashboard');
  assert.equal(allOn[allOn.length - 1], '/profile');
  // Le trou signalé : nutrition activée mais aucun chemin depuis le téléphone.
  assert.equal(allOn.includes('/nutrition'), true);
  assert.equal(allOn.includes('/messages'), true);

  const trainOnly = coachedNavPaths({ ...ALL_OFF_TRACKING, track_workouts: true });
  assert.deepEqual(trainOnly, ['/dashboard', '/workout', '/messages', '/photos', '/profile']);

  const checkinOnly = coachedNavPaths({ ...ALL_OFF_TRACKING, track_checkins: true });
  assert.equal(checkinOnly.includes('/checkin'), true);
  assert.equal(checkinOnly.includes('/workout'), false);

  // Rien d'activé : on ne fabrique pas d'onglet vide.
  assert.deepEqual(coachedNavPaths(ALL_OFF_TRACKING), ['/dashboard', '/messages', '/photos', '/profile']);
});

test('Le coach atteint ses réglages depuis son téléphone', () => {
  const bottom = src('src/components/layout/BottomNav.tsx');
  const coachBar = bottom.slice(bottom.indexOf("coachingRole === 'coach'"), bottom.indexOf(': coached'));
  assert.match(coachBar, /path: '\/profile'/);
  assert.match(coachBar, /nav\.prometheus/);
});

test('Coach chrome labels come from i18n; 360 default tab is overview with named empty states', () => {
  const side = src('src/components/layout/SideNav.tsx');
  assert.match(side, /t\('nav\.today'\)/);
  assert.match(side, /t\('nav\.clients'\)/);
  assert.match(side, /t\('nav\.programs'\)/);
  assert.match(side, /t\('nav\.messages'\)/);
  assert.match(side, /t\('nav\.prometheus'\)/);

  const bottom = src('src/components/layout/BottomNav.tsx');
  assert.match(bottom, /t\('nav\.today'\)/);
  assert.match(bottom, /t\('nav\.programs'\)/);

  const detail = src('src/components/coaching/ClientDetailPage.tsx');
  assert.match(detail, /params\.set\('tab', 'overview'\)/);
  assert.match(detail, /SituationCards/);
  assert.match(detail, /clientSituationLines/);
  assert.match(detail, /parseVisibleTabs/);
  assert.match(detail, /coaching\.tabs360/);

  const queue = src('src/components/coaching/CoachTodayQueue.tsx');
  assert.match(queue, /clientFileHref/);
});
