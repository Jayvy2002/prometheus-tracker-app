import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  extractProgramConstraints,
  fallbackProgramFromProfile,
  validateProgramDays,
} from '../../supabase/functions/_shared/coachAgent.ts';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

type Day = { weekday: number; exercises: Array<{ name: string }> };

test('I01: fallback honours exactly 2 declared days on THOSE days', () => {
  const intake = {
    seancesRealistes: '2',
    lieu: 'Salle',
    extras: { available_weekdays: [2, 5] },
  };
  const plan = fallbackProgramFromProfile(null, '', intake, 'fr') as { days: Day[] };
  assert.equal(plan.days.length, 2);
  assert.deepEqual(plan.days.map(d => d.weekday).sort(), [2, 5]);
});

test('I01: fallback honours a single day and up to six', () => {
  const one = fallbackProgramFromProfile(null, '', { seancesRealistes: '1', lieu: 'Salle' }, 'fr') as { days: Day[] };
  assert.equal(one.days.length, 1);
  const six = fallbackProgramFromProfile(null, '', { seancesRealistes: '6', lieu: 'Salle' }, 'fr') as { days: Day[] };
  assert.equal(six.days.length, 6);
});

test('I01: home without equipment → bodyweight only, no gym lifts', () => {
  const plan = fallbackProgramFromProfile(null, '', { seancesRealistes: '3', lieu: 'Domicile', equipement: [] }, 'fr') as {
    days: Day[];
    needs_coach_review: boolean;
  };
  const names = plan.days.flatMap(d => d.exercises.map(e => e.name.toLowerCase())).join(' | ');
  assert.doesNotMatch(names, /barre|haltère|haltere|machine|presse|câble|poulie|kettlebell|tractions/);
  assert.ok(plan.days.every(d => d.exercises.length >= 3));
});

test('I01: avoided movements are filtered, never prescribed', () => {
  const plan = fallbackProgramFromProfile(
    null,
    '',
    { seancesRealistes: '3', lieu: 'Salle', mouvementAEviter: 'squat', exercicesDetestes: 'burpees, fentes' },
    'fr',
  ) as { days: Day[]; constraints_notes: string[] };
  const names = plan.days.flatMap(d => d.exercises.map(e => e.name.toLowerCase())).join(' | ');
  assert.doesNotMatch(names, /squat|burpee|fente/);
  assert.ok(plan.constraints_notes.some(n => n.includes('squat')));
});

test('I01: medical flags and pain demand human review, not a silent adaptation', () => {
  const plan = fallbackProgramFromProfile(
    null,
    '',
    { seancesRealistes: '3', lieu: 'Salle', cardiaqueHtaPoitrine: 'Oui', douleursLimitations: 'Oui', mouvementAEviter: 'course' },
    'fr',
  ) as { needs_coach_review: boolean };
  assert.equal(plan.needs_coach_review, true);
});

test('I01: sessions/days conflict is flagged, explicit days win', () => {
  const plan = fallbackProgramFromProfile(
    null,
    '',
    { seancesRealistes: '4', lieu: 'Salle', extras: { available_weekdays: [1, 3] } },
    'fr',
  ) as { days: Day[]; needs_clarification: boolean; constraints_notes: string[] };
  assert.equal(plan.days.length, 2);
  assert.equal(plan.needs_clarification, true);
  assert.ok(plan.constraints_notes.some(n => n.includes('4') && n.includes('2')));
});

test('I01: validator rejects wrong count, weekday, forbidden and equipment violations', () => {
  const constraints = extractProgramConstraints(null, {
    seancesRealistes: '2',
    lieu: 'Salle',
    mouvementAEviter: 'squat',
    extras: { available_weekdays: [1, 4] },
  });
  assert.equal(constraints.dayCount, 2);
  const bad = validateProgramDays(
    [
      { weekday: 1, exercises: [{ name: 'Squat' }] },
      { weekday: 2, exercises: [{ name: 'Pompes' }] },
      { weekday: 4, exercises: [{ name: 'Pompes' }] },
    ],
    constraints,
  );
  assert.equal(bad.ok, false);
  assert.ok(bad.violations.some(v => v.startsWith('day_count')));
  assert.ok(bad.violations.some(v => v.startsWith('weekday:2')));
  assert.ok(bad.violations.some(v => v.startsWith('forbidden:squat')));
  const good = validateProgramDays(
    [
      { weekday: 1, exercises: [{ name: 'Pompes' }] },
      { weekday: 4, exercises: [{ name: 'Rowing' }] },
    ],
    constraints,
  );
  assert.equal(good.ok, true);
});

test('I01: a failed NL edit errors out — never a full fallback program', () => {
  const agent = src('supabase/functions/_shared/coachAgent.ts');
  // Both rescue blocks return program_edit_failed for program_nl_edit…
  assert.equal([...agent.matchAll(/return \{ ok: false, error: "program_edit_failed" \}/g)].length, 3);
  // …and the second rescue only falls back for onboarding_plan.
  assert.match(agent, /if \(kind === "onboarding_plan"\) \{\s+const program = fallbackProgramFromProfile/);
  assert.doesNotMatch(agent, /kind === "onboarding_plan" \|\| kind === "program_nl_edit"\) \{\s+const program = fallbackProgramFromProfile/);
  // Model output is validated before presentation.
  assert.match(agent, /validateProgramDays\(days, extractProgramConstraints\(profile, intake\)\)/);
  assert.match(agent, /fallback_after_invalid_model/);
});
