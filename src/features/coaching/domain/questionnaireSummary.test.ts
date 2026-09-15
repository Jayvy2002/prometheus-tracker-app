import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import type { CoachQuestionnaire, QuestionnaireQuestion } from './coachQuestionnaire';
import {
  carryForwardAnswers,
  formatQuestionnaireAnswer,
  questionHasAnswer,
  sectionHasMissingRequired,
} from './questionnaireSummary';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const prefs: QuestionnaireQuestion = {
  id: 'custom_prefs',
  label: { fr: 'Créneau', en: 'Slot' },
  type: 'single',
  required: true,
  medical: false,
  options: [
    { id: 'a', label: { fr: 'Matin', en: 'Morning' } },
    { id: 'b', label: { fr: 'Soir', en: 'Evening' } },
  ],
};

const extra: QuestionnaireQuestion = {
  id: 'custom_note',
  label: { fr: 'Note', en: 'Note' },
  type: 'text',
  required: false,
  medical: false,
};

const definition: CoachQuestionnaire = {
  schemaVersion: 1,
  id: 'q1',
  coachId: 'coach',
  version: 2,
  name: { fr: 'Prise en charge', en: 'Intake' },
  sections: [
    { id: 'prefs', label: { fr: 'Préférences', en: 'Preferences' }, questions: [prefs] },
    { id: 'extra', label: { fr: 'Complément', en: 'Extra' }, questions: [extra] },
  ],
};

test('UX05 carry-forward keeps matching answers and drops incompatible ones', () => {
  const carried = carryForwardAnswers({
    custom_prefs: 'a',
    custom_note: 'ok',
    custom_gone: 'drop',
    custom_prefs_wrong: 1 as unknown as never,
  }, definition);
  assert.deepEqual(carried, { custom_prefs: 'a', custom_note: 'ok' });

  const skipped = carryForwardAnswers({ custom_prefs: 'z' }, definition);
  assert.deepEqual(skipped, {});
});

test('section status and answer formatting stay readable by rubric', () => {
  assert.equal(questionHasAnswer(prefs, {}), false);
  assert.equal(questionHasAnswer(prefs, { custom_prefs: 'a' }), true);
  assert.equal(sectionHasMissingRequired(definition.sections[0], {}), true);
  assert.equal(sectionHasMissingRequired(definition.sections[0], { custom_prefs: 'a' }), false);

  const fmt = {
    question: prefs,
    lang: 'fr' as const,
    empty: 'Non renseigné',
    yes: 'Oui',
    no: 'Non',
  };
  assert.equal(formatQuestionnaireAnswer({ ...fmt, value: 'a' }), 'Matin');
  assert.equal(formatQuestionnaireAnswer({ ...fmt, value: undefined }), 'Non renseigné');
  assert.equal(formatQuestionnaireAnswer({
    ...fmt,
    question: { ...extra, type: 'yes_no' },
    value: false,
  }), 'Non');
  assert.equal(formatQuestionnaireAnswer({
    ...fmt,
    question: { ...extra, type: 'weekdays' },
    value: [7, 1],
  }), 'lundi, dimanche');
});

test('client questionnaire shows a per-section summary instead of a full restart', () => {
  const panel = src('src/components/onboarding/ClientQuestionnairePanel.tsx');
  assert.match(panel, /carryForwardAnswers/);
  assert.match(panel, /data-testid="questionnaire-summary"/);
  assert.match(panel, /questionnaire-edit-/);
  assert.match(panel, /onlySectionId/);
  assert.match(src('src/components/onboarding/CoachQuestionnaireFields.tsx'), /onlySectionId/);
  assert.match(src('src/i18n/locales/fr/coaching.ts'), /backToSummary: 'Retour au résumé'/);
  assert.match(src('src/i18n/locales/fr/coaching.ts'), /carried: /);
});
