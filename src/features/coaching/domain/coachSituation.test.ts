import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  clientFileHref,
  clientSituationLines,
  daysBetween,
  hasSessionGap,
  lastLoggedSessionDate,
} from './coachSituation';
import { parseVisibleTabs } from './coachSettings';
import { resolveClientTab } from './coachRecovery';
import type { ClientLiftProgress } from '../../../lib/types';

const TODAY = '2026-08-29';

function lift(date: string): ClientLiftProgress {
  return {
    clientId: 'emile-id',
    exerciseName: 'squat',
    displayName: 'Squat',
    stalled: false,
    sessions: [{
      date,
      workoutId: 'w1',
      workoutName: 'Lower',
      bestSet: '80kg × 5',
      maxWeight: 80,
      volume: 400,
      avgRir: null,
      sets: [],
    }],
  };
}

test('opening a client file is Vue d’ensemble, not Training', () => {
  assert.equal(clientFileHref('emile-id'), '/clients/emile-id?tab=overview');
  assert.equal(resolveClientTab(null, null), 'overview');
  assert.equal(resolveClientTab(undefined, null), 'overview');
  assert.equal(resolveClientTab('', null), 'overview');
});

test('visible tabs always keep Vue d’ensemble first even if the stored list starts at Training', () => {
  const tabs = parseVisibleTabs(['training', 'progress', 'checkins', 'health', 'notes']);
  assert.equal(tabs[0], 'overview');
  assert.ok(tabs.includes('training'));
  assert.equal(tabs.includes('profile'), false);
  const withFiche = parseVisibleTabs(['overview', 'profile', 'training']);
  assert.deepEqual(withFiche, ['overview', 'training']);
});

test('Émile-like ghost: names the idle days and the missing program', () => {
  const last = lastLoggedSessionDate([], [lift('2026-08-14')]);
  assert.equal(last, '2026-08-14');
  assert.equal(daysBetween('2026-08-14', TODAY), 15);

  const lines = clientSituationLines({
    hasProgram: false,
    lastSessionDate: last,
    today: TODAY,
  });
  assert.deepEqual(lines.map(l => l.id), ['no_program', 'idle_session']);
  assert.equal(lines[0]?.relance, false);
  assert.equal(lines[1]?.days, 15);
  assert.equal(lines[1]?.relance, true);
  assert.equal(lines[1]?.messageKey, 'coaching.situation.idleSession');
  assert.equal(hasSessionGap(lines), true);
});

test('never trained, no program: setup first, no Relancer for a missed session', () => {
  const lines = clientSituationLines({
    hasProgram: false,
    lastSessionDate: lastLoggedSessionDate([], []),
    today: TODAY,
  });
  assert.deepEqual(lines.map(l => l.id), ['no_program']);
  assert.equal(lines[0]?.relance, false);
  assert.equal(hasSessionGap(lines), false);
});

test('never trained, program assigned: one Relancer line, not a mute blank', () => {
  const lines = clientSituationLines({
    hasProgram: true,
    lastSessionDate: lastLoggedSessionDate([], []),
    today: TODAY,
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.id, 'no_session');
  assert.equal(lines[0]?.relance, true);
});

test('trained 14 days ago still has a last session — idle line is for ghosts past that window', () => {
  const lines = clientSituationLines({
    hasProgram: true,
    lastSessionDate: '2026-08-15',
    today: TODAY,
  });
  assert.equal(daysBetween('2026-08-15', TODAY), 14);
  assert.equal(lines.length, 0);
});

test('i18n defaults to French, not English navigator fallback', () => {
  const i18n = readFileSync(resolve(process.cwd(), 'src/i18n/index.ts'), 'utf8');
  assert.match(i18n, /fallbackLng:\s*'fr'/);
  assert.match(i18n, /lng:\s*'fr'/);
  assert.doesNotMatch(i18n, /fallbackLng:\s*'en'/);
  assert.doesNotMatch(i18n, /'navigator'/);
  const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.doesNotMatch(app, /changeLanguage\(profile/);

  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  assert.match(html, /lang="fr"/);

  const fr = readFileSync(resolve(process.cwd(), 'src/i18n/locales/fr.ts'), 'utf8');
  assert.match(fr, /today:\s*"Aujourd'hui"/);
  assert.match(fr, /programs:\s*'Programmes'/);
  assert.match(fr, /overview:\s*'Vue d’ensemble'/);
  assert.match(fr, /training:\s*'Entraînement'/);
  assert.match(fr, /Pas de séance depuis \{\{days\}\} jours/);
  assert.match(fr, /Pas de programme assigné/);
  assert.match(fr, /firstRunTitle:\s*'Nouveau client'/);
});
