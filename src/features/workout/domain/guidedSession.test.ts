import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { placeholderLoadKg, placeholderReps, prescriptionAppliesToSet } from './setPlaceholders';
import { applySetPlaceholders } from './workoutSetComplete';
import { prescriptionBadgeParts, restPart, type PrescriptionVisibility } from './prescriptionBadge';
import { isTimedExercise, namedSetType, repsColumnKind, timedExerciseShowsLoad } from './timedExercise';
import { pickNextRoutine, routineTemplateExercises, weekdayKey } from './nextRoutine';

const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

const ALL: PrescriptionVisibility = { sets: true, reps: 'either', load: true, rir: true, rest: true };

// --- 8. Pre-fill ---

test('reps placeholder: last session first, then the prescription (top of a range), else nothing', () => {
  assert.equal(placeholderReps({ previousReps: 8, prescribedReps: 10 }), 8);
  assert.equal(placeholderReps({ previousReps: 0, prescribedReps: 10 }), 10);
  assert.equal(placeholderReps({ prescribedReps: 10, prescribedRepsMin: 8 }), 10);
  assert.equal(placeholderReps({ prescribedReps: 0, prescribedRepsMin: 8 }), 8);
  assert.equal(placeholderReps({}), null);
  assert.equal(placeholderReps({ previousReps: null, prescribedReps: 0 }), null);
  assert.equal(placeholderReps({ prescribedReps: 10, usePrescription: false }), null);
});

test('load placeholder: suggestion, then last set, then prescribed load; unknown is null, not 0', () => {
  assert.equal(placeholderLoadKg({ suggestedKg: 82.5, previousKg: 80, prescribedKg: 70 }), 82.5);
  assert.equal(placeholderLoadKg({ suggestedKg: null, previousKg: 80, prescribedKg: 70 }), 80);
  assert.equal(placeholderLoadKg({ previousKg: 0, prescribedKg: 70 }), 70);
  assert.equal(placeholderLoadKg({ prescribedKg: 0 }), null);
  assert.equal(placeholderLoadKg({ prescribedKg: 70, usePrescription: false }), null);
});

test('the working prescription never pre-fills a warm-up or a myo mini-set', () => {
  assert.equal(prescriptionAppliesToSet({ set_type: 'working' }), true);
  assert.equal(prescriptionAppliesToSet({ set_type: 'warmup' }), false);
  assert.equal(prescriptionAppliesToSet({ set_type: 'myo', myo_is_activation: true }), true);
  assert.equal(prescriptionAppliesToSet({ set_type: 'myo', myo_is_activation: false }), false);
});

test('one tap records only a real number: a unit hint or an empty placeholder never becomes a value', () => {
  const hint = applySetPlaceholders({
    weight: '', reps: '', duration: '', isIsometric: false, showLoad: true, showReps: true,
    weightPlaceholder: 'kg', repsPlaceholder: '',
  });
  assert.equal(hint.weight, '');
  assert.equal(hint.reps, '');
  const prescribed = applySetPlaceholders({
    weight: '', reps: '', duration: '', isIsometric: false, showLoad: true, showReps: true,
    weightPlaceholder: '82.5', repsPlaceholder: String(placeholderReps({ prescribedReps: 10 })),
  });
  assert.equal(prescribed.weight, '82.5');
  assert.equal(prescribed.reps, '10');
});

test('SetRow reads the prescription and never shows « 0 » as a placeholder', () => {
  const row = src('src/components/workout/SetRow.tsx');
  assert.match(row, /placeholderReps\(/);
  assert.match(row, /placeholderLoadKg\(/);
  assert.match(row, /prescribedReps: prescription\?\.reps/);
  assert.doesNotMatch(row, /: '0';/);
  assert.match(row, /workout\.exerciseCard\.repsPlaceholder/);
  const card = src('src/components/workout/ExerciseCard.tsx');
  assert.match(card, /prescription=\{\{/);
});

// --- 9. Prescription badge ---

test('prescription badge: readable parts, only what is known', () => {
  const full = prescriptionBadgeParts({ sets: 4, reps: 10, rir: 0, restSeconds: 90 }, ALL);
  assert.deepEqual(full, [
    { key: 'setsReps', params: { sets: 4, reps: '10' } },
    { key: 'restMinSec', params: { min: 1, sec: '30' } },
    { key: 'rir', params: { rir: 0 } },
  ]);
  const range = prescriptionBadgeParts({ sets: 3, reps: 10, repsMin: 8, weightKg: 80 }, ALL);
  assert.deepEqual(range.map(p => p.key), ['setsReps', 'load']);
  assert.deepEqual(range[0].params, { sets: 3, reps: '8–10' });
  const single = prescriptionBadgeParts({ sets: 3, reps: 10, repsMin: 8 }, { ...ALL, reps: 'single' });
  assert.deepEqual(single[0].params, { sets: 3, reps: '10' });
  assert.deepEqual(prescriptionBadgeParts({ sets: 4 }, ALL), [{ key: 'setsOnly', params: { count: 4 } }]);
  assert.deepEqual(prescriptionBadgeParts({ reps: 12 }, ALL), [{ key: 'repsOnly', params: { reps: '12' } }]);
  assert.deepEqual(prescriptionBadgeParts({}, ALL), []);
  assert.deepEqual(prescriptionBadgeParts({ rir: null, restSeconds: 0 }, ALL), []);
  const hidden = prescriptionBadgeParts({ sets: 4, reps: 10, rir: 2, restSeconds: 90, weightKg: 80 },
    { sets: true, reps: 'single', load: false, rir: false, rest: false });
  assert.deepEqual(hidden.map(p => p.key), ['setsReps']);
});

test('rest reads as minutes and seconds', () => {
  assert.deepEqual(restPart(90), { key: 'restMinSec', params: { min: 1, sec: '30' } });
  assert.deepEqual(restPart(65), { key: 'restMinSec', params: { min: 1, sec: '05' } });
  assert.deepEqual(restPart(120), { key: 'restMin', params: { min: 2 } });
  assert.deepEqual(restPart(45), { key: 'restSec', params: { sec: 45 } });
  assert.equal(restPart(0), null);
  assert.equal(restPart(null), null);
});

test('the badge no longer ends with « → 0 » and every part is translated', () => {
  const card = src('src/components/workout/ExerciseCard.tsx');
  assert.doesNotMatch(card, /' → '/);
  assert.match(card, /prescriptionBadgeParts\(/);
  assert.match(card, /workout\.prescription\.\$\{part\.key\}/);
  for (const lang of ['fr', 'en']) {
    const locale = src(`src/i18n/locales/${lang}/workout.ts`);
    for (const key of ['setsReps', 'setsOnly_one', 'setsOnly_other', 'repsOnly', 'restMinSec', 'restMin', 'restSec', 'rir']) {
      assert.match(locale, new RegExp(`\\b${key}: '`), `${lang} ${key}`);
    }
  }
  assert.match(src('src/i18n/locales/fr/workout.ts'), /restMinSec: 'repos \{\{min\}\} min \{\{sec\}\}'/);
  assert.match(src('src/i18n/locales/en/workout.ts'), /restMinSec: 'rest \{\{min\}\}:\{\{sec\}\}'/);
});

// --- 11. Timed exercises ---

test('a timed exercise is known from its set type only, never from its name', () => {
  const hold = [{ set_type: 'isometric' }, { set_type: 'isometric' }];
  assert.equal(isTimedExercise(hold), true);
  assert.equal(isTimedExercise([{ set_type: 'working' }]), false);
  assert.equal(isTimedExercise([]), false);
  assert.equal(repsColumnKind(hold), 'duration');
  assert.equal(repsColumnKind([{ set_type: 'isometric' }, { set_type: 'working' }]), 'mixed');
  assert.equal(repsColumnKind([{ set_type: 'working' }]), 'reps');
  // « Gainage » logged as working sets stays in reps: no guess from the name.
  assert.equal(repsColumnKind([{ set_type: 'working' }, { set_type: 'working' }]), 'reps');
  const timed = src('src/features/workout/domain/timedExercise.ts');
  assert.doesNotMatch(timed, /gainage|plank/i);
});

test('a timed exercise shows a load column only when a load is known', () => {
  const hold = [{ set_type: 'isometric', weight_kg: 0 }];
  assert.equal(timedExerciseShowsLoad({ sets: hold }), false);
  assert.equal(timedExerciseShowsLoad({ sets: hold, prescribed_weight_kg: 10 }), true);
  assert.equal(timedExerciseShowsLoad({ sets: [{ set_type: 'isometric', weight_kg: 5 }] }), true);
  assert.equal(timedExerciseShowsLoad({ sets: [{ set_type: 'working', weight_kg: 0 }] }), true);
  const card = src('src/components/workout/ExerciseCard.tsx');
  assert.match(card, /timedExerciseShowsLoad\(exercise\)/);
  assert.match(card, /workout\.exerciseCard\.durationColumn/);
  assert.doesNotMatch(card, /'\/s'/);
});

// --- 12. Logger irritants ---

test('readouts name a set type in words, never a raw value', () => {
  assert.equal(namedSetType('working'), null);
  assert.equal(namedSetType('normal'), null);
  assert.equal(namedSetType(''), null);
  assert.equal(namedSetType(null), null);
  assert.equal(namedSetType('warmup'), 'warmup');
  assert.equal(namedSetType('isometric'), 'isometric');
  for (const rel of ['src/components/workout/SessionReadout.tsx', 'src/components/workout/WorkoutRecap.tsx']) {
    const file = src(rel);
    assert.match(file, /namedSetType\(/, rel);
    assert.doesNotMatch(file, /set_type !== 'working' \? ` · \$\{/, rel);
  }
});

test('logger: the plate button says what it is, names wrap, the legend is compact and stays dismissed', () => {
  const card = src('src/components/workout/ExerciseCard.tsx');
  assert.match(card, /aria-label=\{t\('workout\.plates\.open'\)\}/);
  assert.doesNotMatch(card, /<Weight /);
  assert.match(card, /line-clamp-2 break-words/);
  const legend = src('src/components/workout/SetLegend.tsx');
  assert.match(legend, /workout\.legend\.compact/);
  assert.match(legend, /aria-expanded=\{open\}/);
  assert.match(legend, /localStorage\.setItem\(SEEN_KEY, '1'\)/);
  assert.match(legend, /if \(seen\) return null/);
});

// --- 13. Solo training page ---

test('next routine: scheduled today first, otherwise the first; nothing once trained today', () => {
  const routines = [
    { id: 'a', scheduled_days: ['monday'] },
    { id: 'b', scheduled_days: ['wednesday'] },
    { id: 'c', scheduled_days: null },
  ];
  assert.equal(weekdayKey(3), 'wednesday');
  assert.equal(weekdayKey(0), 'sunday');
  assert.deepEqual(pickNextRoutine(routines, 3, false), { routine: routines[1], scheduledToday: true });
  assert.deepEqual(pickNextRoutine(routines, 5, false), { routine: routines[0], scheduledToday: false });
  assert.equal(pickNextRoutine(routines, 3, true), null);
  assert.equal(pickNextRoutine([], 3, false), null);
  assert.deepEqual(
    routineTemplateExercises([{ name: 'Squat', default_sets: 3, default_reps: 8, order_index: 0 }]),
    [{ name: 'Squat', default_sets: 3, default_reps: 8, order_index: 0 }],
  );
});

test('training page: the Solo gets a next routine or a routine explanation; a refused start is said', () => {
  const page = src('src/components/workout/WorkoutPage.tsx');
  assert.match(page, /pickNextRoutine\(routines, programClock\.weekday, alreadyTrainedToday\)/);
  assert.match(page, /data-testid="workout-next-routine"/);
  assert.match(page, /data-testid="workout-routine-intro"/);
  const start = page.slice(page.indexOf('const startRoutine'), page.indexOf('const restoreDeleted'));
  assert.match(start, /startWorkoutFromTemplate\(/);
  assert.equal((start.match(/toast\(t\('workout\.startRoutineFailed'\), 'error'\)/g) ?? []).length, 3);
  // The coached athlete keeps the program card.
  assert.match(page, /<ClientGymCard/);
  assert.match(page, /const soloWithoutPlan = !coached/);
});

test('training page: last session is one line with details on demand; history leads with date and duration', () => {
  const page = src('src/components/workout/WorkoutPage.tsx');
  assert.match(page, /aria-expanded=\{lastDetailOpen\}/);
  assert.match(page, /workout\.lastSessionShowDetail/);
  assert.match(page, /lastDetailOpen && \(/);
  assert.doesNotMatch(page, /summary\.volume/);
  assert.doesNotMatch(page, /formatWeight/);
  // Delete / undo flow untouched.
  assert.match(page, /requestDelete\(w\)/);
  const fr = src('src/i18n/locales/fr/workout.ts');
  assert.match(fr, /lastSessionOpen: 'Ouvrir la séance'/);
  assert.doesNotMatch(fr, /Rouvrir cette séance/);
});
