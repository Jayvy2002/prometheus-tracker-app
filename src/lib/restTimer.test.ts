import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countdownEndAt, countdownRemaining } from './restTimer';

test('1:30 countdown tracks wall clock, not stacked ticks', () => {
  const start = 1_000_000;
  const endAt = countdownEndAt(90, start);
  assert.equal(countdownRemaining(endAt, start), 90);
  assert.equal(countdownRemaining(endAt, start + 10_000), 80);
  assert.equal(countdownRemaining(endAt, start + 21_000), 69);
  assert.equal(countdownRemaining(endAt, start + 90_000), 0);
  assert.equal(countdownRemaining(endAt, start + 95_000), 0);
});

test('presets map to real seconds', () => {
  const start = 5_000;
  for (const sec of [30, 45, 60, 90, 120, 180]) {
    const endAt = countdownEndAt(sec, start);
    assert.equal(countdownRemaining(endAt, start + (sec - 1) * 1000), 1);
    assert.equal(countdownRemaining(endAt, start + sec * 1000), 0);
  }
});

test('sub-second elapsed does not skip a whole second', () => {
  const endAt = countdownEndAt(90, 0);
  assert.equal(countdownRemaining(endAt, 400), 90);
  assert.equal(countdownRemaining(endAt, 999), 90);
  assert.equal(countdownRemaining(endAt, 1000), 89);
});
