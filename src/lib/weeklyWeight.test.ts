import test from 'node:test';
import assert from 'node:assert/strict';
import { rollingWeightTrend, weeklyAverageKg } from './weeklyWeight';

const rows = [
  { measured_at: '2026-09-10', weight_kg: 81 },
  { measured_at: '2026-09-12', weight_kg: 80 },
  { measured_at: '2026-09-17', weight_kg: 79.5 },
  { measured_at: '2026-09-19', weight_kg: 79 },
  { measured_at: '2026-09-23', weight_kg: 80 },
];

test('headline weight is the 7-day mean, delta compares with the week before', () => {
  const week = weeklyAverageKg(rows, '2026-09-23');
  assert.equal(week.current, (79.5 + 79 + 80) / 3);
  assert.equal(week.deltaKg, +(((79.5 + 79 + 80) / 3) - (81 + 80) / 2).toFixed(1));
});

test('no weigh-in this week: no headline, no invented delta', () => {
  const week = weeklyAverageKg(rows, '2026-10-30');
  assert.equal(week.current, null);
  assert.equal(week.deltaKg, null);
});

test('trend smooths one heavy day instead of following it', () => {
  const trend = rollingWeightTrend(rows);
  assert.equal(trend.length, rows.length);
  const last = trend[trend.length - 1];
  assert.equal(last.weight_kg, 80);
  assert.ok(last.trend_kg < 80);
  assert.equal(trend[0].trend_kg, 81);
});
