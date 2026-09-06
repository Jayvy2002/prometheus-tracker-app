import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCoachedAthlete, isSoloAthlete } from './coachRole';

test('coached clients never get coach chrome; solo can still enable coach mode', () => {
  assert.equal(isCoachedAthlete('client', { id: 'coach-1' }), true);
  assert.equal(isCoachedAthlete('client', null), true);
  assert.equal(isCoachedAthlete('none', { id: 'coach-1' }), true);
  assert.equal(isCoachedAthlete('none', null), false);
  assert.equal(isCoachedAthlete('coach', null), false);
  assert.equal(isCoachedAthlete('coach', { id: 'other' }), false);
  assert.equal(isSoloAthlete('none', null), true);
  assert.equal(isSoloAthlete('client', null), false);
  assert.equal(isSoloAthlete('coach', null), false);
});
