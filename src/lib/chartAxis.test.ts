import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { niceWeightAxis } from './chartAxis';

test('weight axis: whole numbers, even steps, at most five ticks', () => {
  assert.deepEqual(niceWeightAxis([63.9, 64.4, 65.2]), { domain: [62, 68], ticks: [62, 64, 66, 68] });
  assert.deepEqual(niceWeightAxis([78]), { domain: [77, 79], ticks: [77, 78, 79] });
  const wide = niceWeightAxis([60, 95]);
  assert.ok(wide);
  assert.ok(wide.ticks.length <= 5);
  assert.ok(wide.ticks.every(v => Number.isInteger(v)));
  const steps = wide.ticks.slice(1).map((v, i) => v - wide.ticks[i]);
  assert.ok(steps.every(s => s === steps[0]));
  assert.equal(niceWeightAxis([]), null);
  assert.equal(niceWeightAxis([Number.NaN]), null);
});

test('the weight page uses the even axis in the app number format', () => {
  const page = readFileSync(resolve(process.cwd(), 'src/components/weight/WeightPage.tsx'), 'utf8');
  assert.match(page, /niceWeightAxis\(/);
  assert.match(page, /tickFormatter=\{\(v: number\) => formatNumber\(v, \{ maxDigits: 0 \}\)\}/);
  assert.doesNotMatch(page, /CreditCard/);
});
