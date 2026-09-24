import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRepFrontier, newComparableRecord, sessionRecords } from './comparableRecords';
import { isRecordAtIndex } from './performedSets';
import { formatLoad, formatWeightDelta } from '../../../lib/utils';

const set = (weight_kg: number, reps: number, extra: Partial<{ completed: boolean; set_type: string }> = {}) => ({
  weight_kg, reps, completed: true, set_type: 'working', ...extra,
});

test('frontier keeps only sets no other set beats on load and reps; warm-ups and unchecked sets do not count', () => {
  const frontier = loadRepFrontier([
    set(100, 5), set(100, 3), set(90, 8), set(80, 8), set(140, 1, { set_type: 'warmup' }), set(150, 1, { completed: false }),
  ]);
  assert.deepEqual(frontier, [{ weight_kg: 100, reps: 5 }, { weight_kg: 90, reps: 8 }]);
});

test('a light high-rep back-off set is not a record just because its estimated 1RM is high', () => {
  const previous = [{ weight_kg: 100, reps: 5 }, { weight_kg: 60, reps: 15 }];
  // 60 × 15 again: tie, not a record.
  assert.equal(newComparableRecord([{ weight_kg: 60, reps: 15 }], previous), null);
  // 100 × 6: more reps at the same load.
  assert.deepEqual(newComparableRecord([{ weight_kg: 100, reps: 6 }], previous), { weight_kg: 100, reps: 6 });
  // 102.5 × 5: more load for the same reps.
  assert.deepEqual(newComparableRecord([{ weight_kg: 102.5, reps: 5 }], previous), { weight_kg: 102.5, reps: 5 });
  // First time on the lift: baseline, not a record.
  assert.equal(newComparableRecord([{ weight_kg: 40, reps: 10 }], []), null);
});

test('bodyweight exercises record on reps; duplicated exercise blocks are merged', () => {
  const records = sessionRecords(
    [
      { name: 'Tractions', sets: [set(0, 9)] },
      { name: 'Squat', sets: [set(100, 5)] },
      { name: 'squat ', sets: [set(105, 5)] },
    ],
    { tractions: [{ weight_kg: 0, reps: 8 }], squat: [{ weight_kg: 102.5, reps: 5 }] },
  );
  assert.deepEqual(records, [
    { name: 'Tractions', set: { weight_kg: 0, reps: 9 } },
    { name: 'Squat', set: { weight_kg: 105, reps: 5 } },
  ]);
});

test('progress page records compare like for like when sets detail is known', () => {
  const entries = [
    { estimated1RM: 117, frontier: [{ weight_kg: 100, reps: 5 }] },
    // Lighter for the same reps: never a record, whatever the 1RM says.
    { estimated1RM: 117, frontier: [{ weight_kg: 95, reps: 5 }] },
    { estimated1RM: 120, frontier: [{ weight_kg: 100, reps: 6 }] },
  ];
  assert.equal(isRecordAtIndex(entries, 1), false);
  assert.equal(isRecordAtIndex(entries, 2), true);
});

test('coach and athlete screens format loads in the viewer unit', () => {
  assert.equal(formatLoad(100, 'kg'), '100kg');
  assert.equal(formatLoad(100, 'lbs'), '220.5lbs');
  assert.equal(formatWeightDelta(-1.2, 'kg'), '-1.2 kg');
  assert.equal(formatWeightDelta(1, 'lbs'), '+2.2 lbs');
});
