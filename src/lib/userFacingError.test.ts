import assert from 'node:assert/strict';
import { test } from 'node:test';
import { userFacingError } from './userFacingError';

const FALLBACK = 'Impossible de terminer cette action. Réessaie.';

test('userFacingError hides engine and Postgres strings', () => {
  assert.equal(userFacingError('permission denied for table workouts', FALLBACK), FALLBACK);
  assert.equal(userFacingError('PGRST116: JSON object requested', FALLBACK), FALLBACK);
  assert.equal(userFacingError('duplicate key value violates unique constraint', FALLBACK), FALLBACK);
  assert.equal(userFacingError('TypeError: Cannot read properties of null', FALLBACK), FALLBACK);
});

test('userFacingError keeps a short human message', () => {
  assert.equal(userFacingError('Ton programme a changé. Recharge la page.', FALLBACK), 'Ton programme a changé. Recharge la page.');
  assert.equal(userFacingError('', FALLBACK), FALLBACK);
  assert.equal(userFacingError(null, FALLBACK), FALLBACK);
});
