import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCoachQuestionnaire, reviseCoachQuestionnaire, snapshotQuestionnaireSubmission,
  validateQuestionnaireAnswers, type CoachQuestionnaire, type QuestionType,
} from './coachQuestionnaire';

const label = { fr: 'Préférences', en: 'Preferences' };
function fixture(type: QuestionType = 'text'): CoachQuestionnaire {
  return {
    schemaVersion: 1, id: 'questionnaire_1', coachId: 'coach_1', version: 1,
    name: { ...label },
    sections: [{ id: 'preferences', label: { ...label }, questions: [{
      id: 'custom_preferences', label: { ...label }, type, required: true, medical: false,
      ...(type === 'single' || type === 'multi' ? { options: [
        { id: 'a', label: { fr: 'Matin', en: 'Morning' } },
        { id: 'b', label: { fr: 'Soir', en: 'Evening' } },
      ] } : {}),
    }] }],
  };
}

test('definition rejects incomplete translations, invalid versions and ambiguous ids', () => {
  assert.equal(parseCoachQuestionnaire(fixture()).ok, true);
  for (const version of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseCoachQuestionnaire({ ...fixture(), version }).ok, false);
  }
  const missingTranslation = fixture();
  missingTranslation.sections[0].questions[0].label.en = ' ';
  assert.equal(parseCoachQuestionnaire(missingTranslation).ok, false);
  const duplicate = fixture();
  duplicate.sections.push({ ...structuredClone(duplicate.sections[0]), id: 'second' });
  assert.equal(parseCoachQuestionnaire(duplicate).ok, false);
  const standardCollision = fixture();
  standardCollision.sections[0].questions[0].id = 'nom';
  assert.equal(parseCoachQuestionnaire(standardCollision).ok, false);
});

test('imports reject unknown fields, silent mappings, types and malformed options', () => {
  assert.equal(parseCoachQuestionnaire(null).ok, false);
  assert.equal(parseCoachQuestionnaire({ ...fixture(), schemaVersion: 2 }).ok, false);
  const mapped = fixture();
  Object.assign(mapped.sections[0].questions[0], { maps_to: 'nom' });
  assert.equal(parseCoachQuestionnaire(mapped).ok, false);
  for (const options of [[], [{ id: 'a', label }], [{ id: 'a', label }, { id: 'a', label }]]) {
    const data = fixture('single');
    data.sections[0].questions[0].options = options;
    assert.equal(parseCoachQuestionnaire(data).ok, false);
  }
});

test('false and zero satisfy required answers; drafts may remain incomplete', () => {
  assert.deepEqual(validateQuestionnaireAnswers(fixture('yes_no'), { custom_preferences: false }), []);
  assert.deepEqual(validateQuestionnaireAnswers(fixture('number'), { custom_preferences: 0 }), []);
  assert.deepEqual(validateQuestionnaireAnswers(fixture(), {}, false), []);
  assert.equal(validateQuestionnaireAnswers(fixture(), {})[0].code, 'required');
  assert.equal(validateQuestionnaireAnswers(fixture(), { unexpected: 'x' }, false)[0].code, 'unknown_question');
});

test('answer types and choice ids are enforced without numeric or boolean coercion', () => {
  const invalid: [QuestionType, unknown][] = [
    ['text', 1], ['text', 'x'.repeat(10001)], ['number', '2'], ['number', Infinity],
    ['yes_no', 'false'], ['single', 'unknown'], ['multi', ['a', 'a']],
    ['multi', ['unknown']], ['weekdays', [0]], ['weekdays', [8]],
    ['weekdays', [1, 1]], ['weekdays', ['1']], ['weekdays', [1.5]],
  ];
  for (const [type, value] of invalid) {
    assert.equal(validateQuestionnaireAnswers(fixture(type), { custom_preferences: value })[0].code, 'invalid_answer');
  }
  for (const [type, value] of [['single', 'a'], ['multi', ['a', 'b']], ['weekdays', [1, 7]]] as const) {
    assert.deepEqual(validateQuestionnaireAnswers(fixture(type), { custom_preferences: value }), []);
  }
});

test('definition parsing returns an independent copy', () => {
  const original = fixture();
  const parsed = parseCoachQuestionnaire(original);
  assert.ok(parsed.ok);
  parsed.value.sections[0].questions[0].label.fr = 'Nouveau';
  assert.equal(original.sections[0].questions[0].label.fr, 'Préférences');
});

test('new revision preserves owner/id and cannot alter a previous submission', () => {
  const original = fixture('multi');
  const answers = { custom_preferences: ['a'] };
  const submitted = snapshotQuestionnaireSubmission(original, answers);
  assert.ok(submitted.ok);
  const changes = { name: { fr: 'Version suivante', en: 'Next version' }, sections: structuredClone(original.sections) };
  changes.sections[0].questions[0].label.fr = 'Autre question';
  const next = reviseCoachQuestionnaire(original, changes);
  assert.ok(next.ok);
  assert.equal(next.value.version, 2);
  assert.equal(next.value.id, original.id);
  assert.equal(next.value.coachId, original.coachId);
  answers.custom_preferences.push('b');
  original.sections[0].questions[0].options![0].label.fr = 'Modifié';
  assert.equal(submitted.value.definition.sections[0].questions[0].options![0].label.fr, 'Matin');
  assert.deepEqual(submitted.value.answers.custom_preferences, ['a']);
  assert.equal(submitted.value.definition.version, 1);
});

test('submission rejects invalid answers and revision guards version overflow', () => {
  assert.equal(snapshotQuestionnaireSubmission(fixture(), {}).ok, false);
  const previous = { ...fixture(), version: Number.MAX_SAFE_INTEGER };
  assert.equal(reviseCoachQuestionnaire(previous, previous).ok, false);
});
