import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { profileInitials } from './coachChrome';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('profile initials use first letters, fallback when empty', () => {
  assert.equal(profileInitials('Jayvy Coach'), 'JC');
  assert.equal(profileInitials('Jayvy'), 'J');
  assert.equal(profileInitials('  '), '?');
  assert.equal(profileInitials(null), '?');
});

test('mobile coach chrome: profile is a tab, no 6th bottom-nav tab', () => {
  const layout = src('src/app/layout/AppLayout.tsx');
  assert.doesNotMatch(layout, /CoachProfileButton/);
  assert.doesNotMatch(layout, /WorkspaceSwitcher/);
  assert.doesNotMatch(layout, /h-0 pointer-events-none/);
  assert.match(layout, /!hideFab && <FAB/);
  assert.doesNotMatch(layout, /startsWith\('\/dashboard'\)/);

  const profile = src('src/components/profile/ProfilePage.tsx');
  assert.match(profile, /WorkspaceSwitcher/);

  const nav = src('src/app/navigation/navConfig.ts');
  const mobileFn = nav.slice(nav.indexOf('export function mobileTabs'), nav.indexOf('function nonempty'));
  assert.match(mobileFn, /return \[today, clients, messages, programs, profile\]/);
  assert.doesNotMatch(mobileFn, /\bcopilot\b/);

  const side = src('src/app/layout/SideNav.tsx');
  assert.match(side, /desktopSections/);
  assert.match(side, /hidden md:flex/);
});

test('Today keeps File du jour; drafts live in Messages, not a third inbox', () => {
  const dash = src('src/components/coaching/CoachDashboard.tsx');
  assert.match(dash, /CoachTodayQueue/);
  assert.doesNotMatch(dash, /coaching\.interventions\.title/);
  assert.doesNotMatch(dash, /InterventionInboxCard/);
  assert.doesNotMatch(dash, /topDrafts/);
  assert.doesNotMatch(dash, /stats\.checkinsToReview/);
  assert.doesNotMatch(dash, /checkins-a-relire/);
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

test('Coached client shell: photos and program in hub, messages in tabs, no coach-mode dump', () => {
  const profile = src('src/components/profile/ProfilePage.tsx');
  assert.doesNotMatch(profile, /\/recipes/);
  assert.doesNotMatch(profile, /\/routines/);
  assert.match(profile, /\/photos/);
  assert.match(profile, /nav\.myProgram/);
  assert.doesNotMatch(profile, /nav\.clients/);
  assert.match(profile, /!coached && !inCoaching && \(/);
  assert.match(profile, /coaching\.coachMode/);

  const app = src('src/App.tsx');
  assert.match(app, /CoachedAthleteRedirect/);
  assert.match(app, /ProgramsHome/);
  assert.match(app, /path="\/programs"/);
  assert.doesNotMatch(app, /path="\/programs" element=\{<CoachedAthleteRedirect>/);
  assert.doesNotMatch(app, /changeLanguage\(profile/);
  assert.match(app, /CoachOnly/);
  assert.match(app, /TrackingGate module="nutrition"/);
  assert.match(app, /path="\/clients" element=\{<CoachOnly>/);

  const nav = src('src/app/navigation/navConfig.ts');
  assert.match(nav, /labelKey: 'nav\.myProgram'/);
  assert.match(nav, /path: '\/photos'/);

  const bottom = src('src/app/layout/BottomNav.tsx');
  assert.match(bottom, /mobileTabs/);
  assert.doesNotMatch(bottom, /path: '\/photos'/);
  const mobileFn = nav.slice(nav.indexOf('export function mobileTabs'), nav.indexOf('function nonempty'));
  const coachedMobile = mobileFn.slice(
    mobileFn.indexOf("if (persona === 'coached')"),
    mobileFn.lastIndexOf('return ['),
  );
  assert.match(coachedMobile, /\bmessages\b/);
  assert.match(coachedMobile, /\bcheckin\b/);
  assert.match(coachedMobile, /\bprofile\b/);
  assert.doesNotMatch(coachedMobile, /\bphotos\b/);
  assert.match(profile, /\/photos/);
  const dash = src('src/components/dashboard/Dashboard.tsx');
  assert.doesNotMatch(dash, /navigate\('\/photos'\)/);
  assert.doesNotMatch(dash, /dashboard\.photosCard/);
});

test('Coach chrome labels come from i18n; 360 default tab is overview with named empty states', () => {
  const nav = src('src/app/navigation/navConfig.ts');
  assert.match(nav, /labelKey: 'nav\.today'/);
  assert.match(nav, /labelKey: 'nav\.clients'/);
  assert.match(nav, /labelKey: 'nav\.programs'/);
  assert.match(nav, /labelKey: 'nav\.messages'/);
  assert.match(nav, /labelKey: 'nav\.copilot'/);

  const bottom = src('src/app/layout/BottomNav.tsx');
  assert.match(bottom, /t\(tab\.labelKey\)/);

  const detail = src('src/components/coaching/ClientDetailPage.tsx');
  assert.match(detail, /params\.set\('tab', 'overview'\)/);
  assert.match(detail, /SituationCards/);
  assert.match(detail, /clientSituationLines/);
  assert.match(detail, /parseVisibleTabs/);
  assert.match(detail, /coaching\.tabs360/);

  const queue = src('src/components/coaching/CoachTodayQueue.tsx');
  assert.match(queue, /clientFileHref/);
});
