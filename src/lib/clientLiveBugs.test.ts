import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('client Mon programme is read-only assigned plan, not a wizard', () => {
  const page = src('src/components/programs/ClientProgramPage.tsx');
  assert.match(page, /programs\.mineTitle/);
  assert.match(page, /fetchMyAssignment/);
  assert.match(page, /programs\.todayBadge/);
  assert.doesNotMatch(page, /\/programs\/new/);
  assert.doesNotMatch(page, /createProgram/);
  assert.doesNotMatch(page, /navigate\('\/routines'\)/);
  assert.doesNotMatch(page, /coaching\.coachMode/);

  const app = src('src/App.tsx');
  assert.match(app, /function ProgramsHome/);
  assert.match(app, /ClientProgramPage/);
  assert.match(app, /path="\/programs" element=\{<ProgramsHome/);
  assert.doesNotMatch(app, /path="\/programs" element=\{<CoachedAthleteRedirect>/);

  const fr = src('src/i18n/locales/fr.ts');
  assert.match(fr, /myProgram: 'Mon programme'/);
  assert.match(fr, /mineSubtitle:/);
});

test('client sidebar has Photos + Mon programme', () => {
  const side = src('src/components/layout/SideNav.tsx');
  assert.match(side, /path: '\/photos'/);
  assert.match(side, /nav\.photos/);
  assert.match(side, /nav\.myProgram/);
  assert.doesNotMatch(side, /path: '\/routines'/);
});

test('rest timer interval is wall-clock and does not re-arm on remaining', () => {
  const timer = src('src/components/workout/RestTimer.tsx');
  assert.match(timer, /countdownEndAt/);
  assert.match(timer, /countdownRemaining/);
  assert.doesNotMatch(timer, /\[active, remaining\]/);
  assert.match(timer, /setInterval\(tick, 200\)/);
});

test('plus de cibles macros inventées ni de noms d’exercices en anglais', () => {
  const macro = src('src/components/nutrition/MacroSummary.tsx');
  assert.doesNotMatch(macro, /\?\? 150|\?\? 250|\?\? 65/);
  assert.match(macro, /m\.target > 0/);

  const picker = src('src/components/workout/ExercisePicker.tsx');
  assert.match(picker, /ex\.name_fr \|\| ex\.name/);
  assert.match(picker, /detail\.name_fr \|\| detail\.name/);
  // Le nom canonique reste stocké : l'historique des charges est groupé dessus.
  assert.match(picker, /onSelect\(exercise\.name\)/);

  const summary = src('src/components/workout/WorkoutSummaryScreen.tsx');
  assert.doesNotMatch(summary, /prCount/);
});
