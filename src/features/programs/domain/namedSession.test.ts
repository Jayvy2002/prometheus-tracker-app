import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { i18nLocaleSource } from '../../../lib/i18nLocaleSource';
import { shiftProgramWeekdays } from '../../../lib/soloAsk';
import { namedSessionLine } from './namedSession';

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function allMigrations(): string {
  const dir = resolve(process.cwd(), 'supabase/migrations');
  return readdirSync(dir)
    .filter(name => name.endsWith('.sql'))
    .map(name => readFileSync(join(dir, name), 'utf8'))
    .join('\n');
}

test('UX22 named session is weekday · name; empty side is omitted', () => {
  assert.equal(namedSessionLine('Lun', 'Haut du corps'), 'Lun · Haut du corps');
  assert.equal(namedSessionLine('Mar', '  Mardi force  '), 'Mar · Mardi force');
  assert.equal(namedSessionLine('Mer', ''), 'Mer');
  assert.equal(namedSessionLine('', 'Pull'), 'Pull');
  assert.equal(namedSessionLine('  ', '  '), '');
});

test('UX22 recale keeps the day name and does not invent a plan day', () => {
  const days = [
    { weekday: 1, name: 'Haut du corps' },
    { weekday: 3, name: 'Bas du corps' },
  ];
  const shifted = shiftProgramWeekdays(days, 1, 2);
  assert.equal(shifted.length, 2);
  assert.deepEqual(shifted.map(d => d.name), ['Haut du corps', 'Bas du corps']);
  assert.deepEqual(shifted.map(d => d.weekday), [2, 3]);
  const untouched = shiftProgramWeekdays(days, 5, 6);
  assert.deepEqual(untouched, days);
});

test('UX22 athlete surfaces show weekday + name; coach shows cycle structure', () => {
  const card = src('src/components/dashboard/ClientGymCard.tsx');
  assert.match(card, /programSessionLabel/);
  assert.match(card, /data-testid="ux22-session-label"/);
  assert.match(card, /programs\.todaySession/);

  const page = src('src/components/programs/ClientProgramPage.tsx');
  assert.match(page, /namedSessionLine/);
  assert.match(page, /data-testid="ux22-program-today"/);
  assert.match(page, /weekdayLabel\(todayDay\.weekday\)/);

  const editor = src('src/components/coaching/ProgramSessionEditor.tsx');
  assert.match(editor, /programs\.cycleDetails/);
  assert.match(editor, /programs\.durationWeeks/);
  assert.match(editor, /data-testid="ux22-cycle-fields"/);
  assert.match(editor, /namedSessionLine/);
  assert.doesNotMatch(editor, /phaseIndex|Mesocycle|PhasePicker/);

  const programs = src('src/components/programs/ProgramsPage.tsx');
  assert.match(programs, /programSessionLabel/);
  assert.match(programs, /programs\.subtitle/);

  const form = src('src/components/workout/WorkoutForm.tsx');
  assert.match(form, /usePlanSessionLabel/);
  assert.match(form, /data-testid="ux22-session-label"/);
  const recap = src('src/components/workout/WorkoutRecap.tsx');
  assert.match(recap, /usePlanSessionLabel/);
});

test('UX22 is copy/UI — no mesocycle engine', () => {
  const sql = allMigrations();
  assert.doesNotMatch(sql, /CREATE TABLE public\.(mesocycles|program_cycles|macrocycles)\b/);
  const app = src('src/app/router/AppRoutes.tsx');
  assert.doesNotMatch(app, /\/phases|MesocycleEditor|PhaseEngine/);
  const fr = src('src/i18n/locales/fr.ts');
  const en = src('src/i18n/locales/en.ts');
  assert.match(fr, /todaySession: 'Aujourd’hui : \{\{name\}\}'/);
  assert.match(en, /todaySession: 'Today: \{\{name\}\}'/);
  assert.match(fr, /cycleDetails: 'Nom, durée, notes'/);
  assert.match(en, /cycleDetails: 'Name, duration, notes'/);
  assert.doesNotMatch(fr, /mésocycle/);
  assert.doesNotMatch(en, /mesocycle/);
  assert.match(fr, /Séances nommées, organisées par jours fixes ou dans l’ordre/);
  assert.match(en, /Named sessions, organized by fixed days or in order/);
});
