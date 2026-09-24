import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  conditionMet, emptyQuestion, missingRequired, moveQuestion, questionErrors, scaleRange, snapshotAnswers, visibleQuestions,
  type CheckinQuestion,
} from './checkinTemplate';

const travel: CheckinQuestion = { id: 'q1', type: 'yes_no', label: { fr: 'As-tu voyagé ?', en: 'Did you travel?' } };
const how: CheckinQuestion = { id: 'q2', type: 'text', label: { fr: 'Comment ?' }, required: true, show_if: { question: 'q1', equals: true } };
const mood: CheckinQuestion = {
  id: 'q3', type: 'choice', label: { fr: 'Humeur' },
  options: [{ id: 'a', label: { fr: 'Bien', en: 'Good' } }, { id: 'b', label: { fr: 'Moyen' } }],
};

test('a conditional question appears only when its condition is met', () => {
  assert.deepEqual(visibleQuestions([travel, how], {}).map(q => q.id), ['q1']);
  assert.deepEqual(visibleQuestions([travel, how], { q1: false }).map(q => q.id), ['q1']);
  assert.deepEqual(visibleQuestions([travel, how], { q1: true }).map(q => q.id), ['q1', 'q2']);
  assert.equal(conditionMet({ ...how, show_if: { question: 'p', gte: 6 } }, { p: 7 }), true);
});

test('a hidden required question never blocks saving', () => {
  assert.deepEqual(missingRequired([travel, how], { q1: false }), []);
  assert.deepEqual(missingRequired([travel, how], { q1: true }), ['q2']);
});

test('answers keep the label of the moment, in the athlete language, with choice labels', () => {
  const snap = snapshotAnswers([travel, how, mood], { q1: true, q2: 'Train', q3: 'a' }, 'en');
  assert.deepEqual(snap.map(a => a.label), ['Did you travel?', 'Comment ?', 'Humeur']);
  assert.equal(snap[2].display, 'Good');
  assert.equal(snapshotAnswers([travel, how], { q1: false, q2: 'stale' }, 'fr').length, 1, 'hidden answers are not stored');
});

test('builder rules: labels, options, conditions pointing backwards', () => {
  assert.deepEqual(questionErrors({ ...emptyQuestion('choice') }, []), ['label', 'options']);
  assert.deepEqual(questionErrors(how, []), ['condition']);
  assert.deepEqual(questionErrors(how, [travel]), []);
  const moved = moveQuestion([travel, how], 1, -1);
  assert.equal(moved[0].id, 'q2');
  assert.equal(moved[0].show_if, undefined, 'a condition that would point forward is dropped');
});

test('pain and fatigue are always 0–10; a scale defaults to 1–5', () => {
  assert.deepEqual(scaleRange({ type: 'pain' }), { min: 0, max: 10 });
  assert.deepEqual(scaleRange({ type: 'scale' }), { min: 1, max: 5 });
  assert.deepEqual(scaleRange({ type: 'scale', min: 0, max: 10 }), { min: 0, max: 10 });
});
