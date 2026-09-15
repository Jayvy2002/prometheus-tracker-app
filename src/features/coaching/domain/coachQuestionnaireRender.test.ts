import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import CoachQuestionnaireFields from '../../../components/onboarding/CoachQuestionnaireFields';
import type { CoachQuestionnaire, QuestionType } from './coachQuestionnaire';
import fr from '../../../i18n/locales/fr';
import en from '../../../i18n/locales/en';

const definition: CoachQuestionnaire = {
  id: 'q1', coachId: 'c1', version: 1, schemaVersion: 1,
  name: { fr: 'Questions', en: 'Questions' },
  sections: [{ id: 's1', label: { fr: 'Préférences', en: 'Preferences' },
    questions: (['text', 'number', 'single', 'multi', 'yes_no', 'weekdays'] as QuestionType[]).map(type => ({
      id: 'custom_' + type, type, label: { fr: 'Question ' + type, en: 'Answer ' + type },
      required: true, medical: false,
      ...(['single', 'multi'].includes(type) ? { options: [
        { id: 'a', label: { fr: 'Matin', en: 'Morning' } },
        { id: 'b', label: { fr: 'Soir', en: 'Evening' } },
      ] } : {}),
    })),
  }],
};
async function render(language: string, disabled = false) {
  const instance = createInstance();
  await instance.init({ lng: language, resources: { fr: { translation: fr }, en: { translation: en } } });
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance },
    createElement(CoachQuestionnaireFields, {
      definition, answers: { custom_yes_no: false, custom_number: 0,
        custom_text: '<script>not executable</script>', custom_multi: ['b'], custom_weekdays: [1, 7] },
      onChange: () => undefined, disabled,
      issues: [{ path: 'answers.custom_text', code: 'required' }],
    })));
}
test('all six question types render with saved zero, false and selected values', async () => {
  const html = await render('fr');
  assert.match(html, /type="number"[^>]*value="0"/);
  assert.match(html, /value="false" selected="">Non/);
  assert.match(html, /<textarea/);
  assert.match(html, /<fieldset/);
  assert.match(html, /lundi/);
  assert.match(html, /dimanche/);
  assert.match(html, /checked=""/);
});
test('labels, options and validation messages follow language; answer HTML is escaped', async () => {
  const french = await render('fr');
  const english = await render('en');
  assert.match(french, /Préférences/);
  assert.match(english, /Preferences/);
  assert.match(english, /Morning/);
  assert.match(english, /Monday/);
  assert.match(english, /Please answer this question/);
  assert.match(french, /&lt;script&gt;/);
  assert.doesNotMatch(french, /<script>/);
  assert.match(french, /aria-describedby=/);
  assert.match(french, /role="alert"/);
});
test('preview can disable all answer controls', async () => {
  const html = await render('en', true);
  assert.match(html, /<fieldset disabled=""/);
  assert.match(html, /<textarea[^>]*disabled=""/);
  assert.match(html, /<select[^>]*disabled=""/);
});

test('builder preview can force the client language independently of the coach UI', async () => {
  const instance = createInstance();
  await instance.init({ lng: 'fr', resources: { fr: { translation: fr }, en: { translation: en } } });
  const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance },
    createElement(CoachQuestionnaireFields, {
      definition, answers: {}, onChange: () => undefined, disabled: true, previewLanguage: 'en',
    })));
  assert.match(html, /Preferences/);
  assert.match(html, /Answer text/);
  assert.doesNotMatch(html, /Préférences/);
});

test('audience and the health notice appear before the first medical question', async () => {
  const withMedical: CoachQuestionnaire = {
    ...definition,
    sections: [
      definition.sections[0],
      {
        id: 's-health',
        label: { fr: 'Santé', en: 'Health' },
        questions: [{
          id: 'custom_pain', type: 'text',
          label: { fr: 'Douleur', en: 'Pain' },
          required: false, medical: true,
        }],
      },
    ],
  };
  const instance = createInstance();
  await instance.init({ lng: 'fr', resources: { fr: { translation: fr }, en: { translation: en } } });
  const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance },
    createElement(CoachQuestionnaireFields, {
      definition: withMedical, answers: {}, onChange: () => undefined,
    })));
  const audienceAt = html.indexOf('Ces réponses sont accessibles');
  const noticeAt = html.indexOf('Les questions suivantes concernent ta santé');
  const painAt = html.indexOf('Douleur');
  assert.ok(audienceAt >= 0 && noticeAt > audienceAt && painAt > noticeAt);
  assert.match(html, /role="note"/);
});
