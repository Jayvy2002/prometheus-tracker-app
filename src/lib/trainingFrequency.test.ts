import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveTrainingFrequency } from './trainingFrequency';

test('active program days override a stale profile frequency', () => {
  assert.equal(resolveTrainingFrequency(5, [{ weekday: 1 }, { weekday: 3 }, { weekday: 5 }]), 3);
});

test('duplicate weekdays do not inflate the program frequency', () => {
  assert.equal(resolveTrainingFrequency(5, [{ weekday: 1 }, { weekday: 1 }, { weekday: 4 }]), 2);
});

test('profile frequency and product default remain safe fallbacks', () => {
  assert.equal(resolveTrainingFrequency(4, []), 4);
  assert.equal(resolveTrainingFrequency(0, null), 3);
});
