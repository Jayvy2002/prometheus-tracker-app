import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { i18nLocaleSource } from './i18nLocaleSource';

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('client Mon programme is the assigned plan; coached stays read-only, solo edits like a routine', () => {
  const page = src('src/components/programs/ClientProgramPage.tsx');
  assert.match(page, /programs\.mineTitle/);
  assert.match(page, /fetchMyAssignment/);
  assert.match(page, /programs\.todayBadge/);
  assert.match(page, /ProgramSessionEditor/);
  assert.match(page, /canUpdateOwnAssignedProgram/);
  assert.doesNotMatch(page, /\/programs\/new/);
  assert.doesNotMatch(page, /createProgram/);
  assert.doesNotMatch(page, /navigate\('\/routines'\)/);
  assert.doesNotMatch(page, /coaching\.coachMode/);

  const app = src('src/App.tsx') + src('src/app/bootstrap/useAuthenticatedSession.ts') + src('src/app/guards/RouteGuards.tsx') + src('src/app/router/AppRoutes.tsx');
  assert.match(app, /function ProgramsHome/);
  assert.match(app, /ClientProgramPage/);
  assert.match(app, /path="\/programs" element=\{<ProgramsHome/);
  assert.doesNotMatch(app, /path="\/programs" element=\{<CoachedAthleteRedirect>/);

  const fr = src('src/i18n/locales/fr.ts');
  assert.match(fr, /myProgram: 'Mon programme'/);
  assert.match(fr, /mineSubtitle:/);
});

test('client sidebar has Photos + Mon programme', () => {
  const nav = src('src/app/navigation/navConfig.ts');
  assert.match(nav, /path: '\/photos'/);
  assert.match(nav, /labelKey: 'nav\.photos'/);
  assert.match(nav, /labelKey: 'nav\.myProgram'/);
  assert.doesNotMatch(nav, /path: '\/routines'/);
});

test('rest timer interval is wall-clock and does not re-arm on remaining', () => {
  const timer = src('src/components/workout/RestTimer.tsx');
  assert.match(timer, /countdownEndAt/);
  assert.match(timer, /countdownRemaining/);
  assert.doesNotMatch(timer, /\[active, remaining\]/);
  assert.match(timer, /setInterval\(tick, 200\)/);
});
