import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSleepHours } from './sleepHours';

test('empty sleep hours stay « not answered », never 0', () => {
  assert.deepEqual(parseSleepHours(''), { ok: true, hours: null });
  assert.deepEqual(parseSleepHours('   '), { ok: true, hours: null });
  assert.deepEqual(parseSleepHours(null), { ok: true, hours: null });
  assert.deepEqual(parseSleepHours('0'), { ok: true, hours: 0 });
});

test('comma, dot, « h » and « 7h30 » give the same night', () => {
  assert.deepEqual(parseSleepHours('7,5'), { ok: true, hours: 7.5 });
  assert.deepEqual(parseSleepHours('7.5'), { ok: true, hours: 7.5 });
  assert.deepEqual(parseSleepHours('7,5 h'), { ok: true, hours: 7.5 });
  assert.deepEqual(parseSleepHours('7 h'), { ok: true, hours: 7 });
  assert.deepEqual(parseSleepHours('7h30'), { ok: true, hours: 7.5 });
  assert.deepEqual(parseSleepHours('6h45'), { ok: true, hours: 6.8 });
  assert.deepEqual(parseSleepHours('8H'), { ok: true, hours: 8 });
});

test('out of range or unreadable values are refused with a reason', () => {
  assert.deepEqual(parseSleepHours('25'), { ok: false, error: 'range' });
  assert.deepEqual(parseSleepHours('-1'), { ok: false, error: 'range' });
  assert.deepEqual(parseSleepHours('abc'), { ok: false, error: 'invalid' });
  assert.deepEqual(parseSleepHours('7h75'), { ok: false, error: 'invalid' });
  assert.deepEqual(parseSleepHours('7,5,5'), { ok: false, error: 'invalid' });
  assert.deepEqual(parseSleepHours('24'), { ok: true, hours: 24 });
});
