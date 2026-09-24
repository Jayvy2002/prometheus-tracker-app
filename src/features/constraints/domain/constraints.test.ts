import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { BODY_AREAS, CONSTRAINT_KINDS, areaFor, needsProfessionalAdvice, splitConstraints, type AthleteConstraint } from './constraints';

const c = (id: string, status: 'open' | 'resolved', declared_at: string): AthleteConstraint => ({
  id, user_id: 'u', kind: 'pain', body_area: 'knee', description: '', severity: 2, persistence: 'temporary',
  status, exercise_name: null, workout_id: null, declared_at, resolved_at: status === 'resolved' ? declared_at : null, created_by: 'u',
});

test('open constraints first, resolved ones kept below', () => {
  const { open, resolved } = splitConstraints([c('a', 'resolved', '2026-01-01'), c('b', 'open', '2026-02-01'), c('d', 'open', '2026-03-01')]);
  assert.deepEqual(open.map(x => x.id), ['d', 'b']);
  assert.deepEqual(resolved.map(x => x.id), ['a']);
});

test('professional advice for strong or lasting pain and for injuries, never a diagnosis', () => {
  assert.equal(needsProfessionalAdvice({ kind: 'pain', severity: 2, persistence: 'temporary' }), false);
  assert.equal(needsProfessionalAdvice({ kind: 'pain', severity: 4, persistence: 'temporary' }), true);
  assert.equal(needsProfessionalAdvice({ kind: 'pain', severity: 1, persistence: 'persistent' }), true);
  assert.equal(needsProfessionalAdvice({ kind: 'injury', severity: null, persistence: 'temporary' }), true);
  assert.equal(needsProfessionalAdvice({ kind: 'constraint', severity: null, persistence: 'persistent' }), false);
});

test('a non-body constraint has no body area', () => {
  assert.equal(areaFor('constraint', 'knee'), 'none');
  assert.equal(areaFor('pain', 'knee'), 'knee');
});

test('kinds and areas match the database checks', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260924140000_athlete_constraints.sql'), 'utf8');
  for (const kind of CONSTRAINT_KINDS) assert.match(sql, new RegExp(`'${kind}'`));
  for (const area of [...BODY_AREAS, 'none']) assert.match(sql, new RegExp(`'${area}'`));
});
