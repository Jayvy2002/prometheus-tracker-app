import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  MEASUREMENT_SITES,
  MEASURE_MAX_CM,
  MEASURE_MIN_CM,
  buildMeasurementEntries,
  cmToUnit,
  draftForDay,
  measurementDays,
  summarizeBySite,
  unitToCm,
  type BodyMeasurement,
} from './measurements';

const m = (site: BodyMeasurement['site'], measured_at: string, value_cm: number): BodyMeasurement => ({
  id: `${site}-${measured_at}`, user_id: 'u', site, measured_at, value_cm, note: '',
});

test('each site keeps its own trend; never-measured sites are absent, not zero', () => {
  const summaries = summarizeBySite([
    m('waist', '2026-09-01', 84),
    m('arm_left', '2026-09-01', 35),
    m('waist', '2026-09-15', 82.5),
    m('waist', '2026-09-08', 83),
  ]);
  assert.deepEqual(summaries.map(s => s.site), ['waist', 'arm_left']);
  const waist = summaries[0];
  assert.equal(waist.latest.measured_at, '2026-09-15');
  assert.equal(waist.deltaCm, -0.5);
  assert.deepEqual(waist.series, [84, 83, 82.5]);
  assert.equal(summaries[1].deltaCm, null);
  assert.equal(summaries.some(s => s.site === 'hips'), false);
});

test('inches are shown and saved without drift', () => {
  assert.equal(cmToUnit(82.5, 'cm'), 82.5);
  assert.equal(cmToUnit(82.5, 'in'), 32.5);
  assert.equal(unitToCm(32.5, 'in'), 82.6);
  assert.equal(unitToCm(82.5, 'cm'), 82.5);
});

test('empty fields are skipped, comma decimals work, out-of-range values are named', () => {
  const { entries, invalid } = buildMeasurementEntries({ waist: '82,5', hips: '', chest: '5', neck: 'abc' }, 'cm');
  assert.deepEqual(entries, [{ site: 'waist', value_cm: 82.5 }]);
  assert.deepEqual(invalid, ['neck', 'chest']);
  assert.deepEqual(buildMeasurementEntries({}, 'cm'), { entries: [], invalid: [] });
  const inches = buildMeasurementEntries({ waist: '32.5' }, 'in');
  assert.deepEqual(inches.entries, [{ site: 'waist', value_cm: 82.6 }]);
});

test('a day already measured prefills the correction form in the profile unit', () => {
  const rows = [m('waist', '2026-09-15', 82.5), m('hips', '2026-09-15', 96), m('waist', '2026-09-01', 84)];
  assert.deepEqual(draftForDay(rows, '2026-09-15', 'cm'), { waist: '82.5', hips: '96' });
  assert.deepEqual(draftForDay(rows, '2026-09-15', 'in'), { waist: '32.5', hips: '37.8' });
  // French prefill uses a comma and still parses back to the same value.
  const fr = draftForDay(rows, '2026-09-15', 'cm', v => String(v).replace('.', ','));
  assert.deepEqual(fr, { waist: '82,5', hips: '96' });
  assert.deepEqual(buildMeasurementEntries(fr, 'cm').entries, [{ site: 'waist', value_cm: 82.5 }, { site: 'hips', value_cm: 96 }]);
  assert.deepEqual([...measurementDays(rows).entries()], [['2026-09-15', 2], ['2026-09-01', 1]]);
});

test('sites and bounds match the database checks', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260924170000_body_measurements.sql'), 'utf8');
  for (const site of MEASUREMENT_SITES) assert.match(sql, new RegExp(`'${site}'`));
  assert.match(sql, new RegExp(`value_cm BETWEEN ${MEASURE_MIN_CM} AND ${MEASURE_MAX_CM}`));
  assert.match(sql, /UNIQUE \(user_id, measured_at, site\)/);
});

test('no score or judgement: the view shows neutral deltas and each site apart', () => {
  const view = readFileSync(resolve(process.cwd(), 'src/components/measurements/MeasurementsPage.tsx'), 'utf8');
  assert.doesNotMatch(view, /score/i);
  assert.doesNotMatch(view, /text-(green|red|emerald|rose)-/);
  assert.match(view, /summarizeBySite/);
  assert.match(view, /Sparkline/);
  assert.match(view, /EmptyState/);
});
