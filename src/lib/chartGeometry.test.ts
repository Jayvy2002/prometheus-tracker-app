import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  areaPathFromLine,
  monotonePath,
  nearestIndex,
  niceTicks,
  scaleLinear,
  subsampleIndices,
  yDomain,
} from './chartGeometry';

describe('chartGeometry', () => {
  it('maps domain to range linearly', () => {
    const x = scaleLinear([0, 10], [0, 100]);
    assert.equal(x(0), 0);
    assert.equal(x(10), 100);
    assert.equal(x(5), 50);
  });

  it('builds a monotone cubic with M and C for 3+ points', () => {
    const d = monotonePath([
      { x: 0, y: 10 },
      { x: 10, y: 20 },
      { x: 20, y: 15 },
    ]);
    assert.match(d, /^M /);
    assert.match(d, / C /);
  });

  it('closes an area path to the baseline', () => {
    const line = monotonePath([
      { x: 0, y: 10 },
      { x: 10, y: 4 },
    ]);
    const area = areaPathFromLine(line, 0, 10, 40);
    assert.match(area, / L 10 40 L 0 40 Z$/);
  });

  it('picks the nearest x index', () => {
    assert.equal(nearestIndex([0, 10, 20], 12), 1);
    assert.equal(nearestIndex([0, 10, 20], 19), 2);
  });

  it('pads a flat y domain', () => {
    const [min, max] = yDomain([75, 75], 1);
    assert.ok(min < 75);
    assert.ok(max > 75);
  });

  it('returns integer ticks when requested', () => {
    const ticks = niceTicks(0.2, 4.8, 4, true);
    assert.ok(ticks.every(t => Number.isInteger(t)));
    assert.ok(ticks[0] <= 1);
    assert.ok(ticks[ticks.length - 1] >= 4);
  });

  it('subsamples tick indices without duplicates', () => {
    const idx = subsampleIndices(30, 6);
    assert.equal(new Set(idx).size, idx.length);
    assert.ok(idx.length <= 6);
    assert.equal(idx[0], 0);
    assert.equal(idx[idx.length - 1], 29);
  });
});
