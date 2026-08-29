import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

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

test('Ask keeps Open draft for this question; no fleet round, no recent-drafts list, no 0-count chips', () => {
  const ask = src('src/components/coaching/AskPrometheusPage.tsx');
  assert.match(ask, /coaching\.ask\.openDraft/);
  assert.match(ask, /rosterHitsForFilter/);
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

test('Coached client shell: no Programs, no coach-mode, no profile nav dump', () => {
  const profile = src('src/components/profile/ProfilePage.tsx');
  assert.doesNotMatch(profile, /\/recipes/);
  assert.doesNotMatch(profile, /\/routines/);
  assert.doesNotMatch(profile, /\/photos/);
  assert.doesNotMatch(profile, /nav\.programs/);
  assert.doesNotMatch(profile, /nav\.clients/);
  assert.match(profile, /!coached && \(/);
  assert.match(profile, /coaching\.coachMode/);

  const app = src('src/App.tsx');
  assert.match(app, /CoachedAthleteRedirect/);
  assert.match(app, /path="\/programs"/);
  assert.doesNotMatch(app, /changeLanguage\(profile/);

  const side = src('src/components/layout/SideNav.tsx');
  assert.match(side, /track_workouts && !coached/);
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
