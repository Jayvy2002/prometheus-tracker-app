import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { parseCoachQuestionnaire, type CoachQuestionnaire } from './coachQuestionnaire';
import {
  SHORT_TEMPLATE_QUESTION_IDS,
  canAssignPublicationAction,
  classifyQuestionnaireRevision,
  defaultAssignClientIds,
  previewPublicationImpact,
  questionnaireEffort,
  shortQuestionnaireTemplate,
} from './questionnaireBuilder';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function fixture(extra?: Partial<CoachQuestionnaire>): CoachQuestionnaire {
  return {
    schemaVersion: 1,
    id: 'q_intake',
    coachId: 'coach_1',
    version: 1,
    name: { fr: 'Prise en charge', en: 'Intake' },
    sections: [{
      id: 'start',
      label: { fr: 'Pour commencer', en: 'To start' },
      questions: [{
        id: 'custom_goal',
        label: { fr: 'Objectif', en: 'Goal' },
        type: 'text',
        required: true,
        medical: false,
      }],
    }],
    ...extra,
  };
}

test('UX39 short template is valid, one screen, two required, no medical jargon', () => {
  const definition = shortQuestionnaireTemplate({ id: 'q_short_1', coachId: 'coach_1' });
  const parsed = parseCoachQuestionnaire(definition);
  assert.equal(parsed.ok, true);
  const effort = questionnaireEffort(definition);
  assert.equal(effort.screens, 1);
  assert.equal(effort.questions, 5);
  assert.equal(effort.required, 2);
  assert.equal(effort.medical, 0);
  assert.deepEqual(SHORT_TEMPLATE_QUESTION_IDS, [
    'objectifPrincipal', 'seancesRealistes', 'lieu', 'equipement', 'quelqueChoseImportant',
  ]);
  assert.equal(definition.sections[0].questions[0].required, true);
  assert.equal(definition.sections[0].questions[1].required, true);
  assert.ok(definition.sections[0].questions.every(q => !q.medical));
});

test('UX40 effort counts screens and required questions', () => {
  const next = fixture();
  next.sections.push({
    id: 'extra',
    label: { fr: 'Complément', en: 'Extra' },
    questions: [{
      id: 'custom_note',
      label: { fr: 'Note', en: 'Note' },
      type: 'text',
      required: false,
      medical: true,
    }],
  });
  assert.deepEqual(questionnaireEffort(next), { screens: 2, questions: 2, required: 1, medical: 1 });
});

test('UX41 typo or optional add does not force a mass reset', () => {
  const previous = fixture();
  const typo = structuredClone(previous);
  typo.version = 2;
  typo.sections[0].questions[0].label.fr = 'Ton objectif';
  const labelOnly = classifyQuestionnaireRevision(previous, typo);
  assert.equal(labelOnly.kind, 'keep_all');
  assert.deepEqual(labelOnly.addedRequiredIds, []);

  const optional = structuredClone(previous);
  optional.version = 2;
  optional.sections[0].questions.push({
    id: 'custom_note',
    label: { fr: 'Note', en: 'Note' },
    type: 'text',
    required: false,
    medical: false,
  });
  assert.equal(classifyQuestionnaireRevision(previous, optional).kind, 'keep_all');
});

test('UX41 new required question asks a complement, in-progress stays pinned', () => {
  const previous = fixture();
  const next = structuredClone(previous);
  next.version = 2;
  next.sections[0].questions.push({
    id: 'custom_days',
    label: { fr: 'Jours', en: 'Days' },
    type: 'number',
    required: true,
    medical: false,
  });
  const classified = classifyQuestionnaireRevision(previous, next);
  assert.equal(classified.kind, 'complement');
  assert.deepEqual(classified.addedRequiredIds, ['custom_days']);

  const impact = previewPublicationImpact({
    previous,
    next,
    clients: [
      { id: 'done', name: 'Client Fait' },
      { id: 'draft', name: 'Client En cours' },
      { id: 'none', name: 'Client Nouveau' },
      { id: 'covered', name: 'Déjà répondu' },
    ],
    responses: [
      {
        clientId: 'done', versionId: 'v1', questionnaireId: 'q_intake', version: 1,
        completedAt: '2026-09-15T00:00:00.000Z', answers: { custom_goal: 'force' }, createdAt: '2026-09-01T00:00:00.000Z',
      },
      {
        clientId: 'draft', versionId: 'v1', questionnaireId: 'q_intake', version: 1,
        completedAt: null, answers: { custom_goal: 'draft' }, createdAt: '2026-09-02T00:00:00.000Z',
      },
      {
        clientId: 'covered', versionId: 'v1', questionnaireId: 'q_intake', version: 1,
        completedAt: '2026-09-15T00:00:00.000Z',
        answers: { custom_goal: 'force', custom_days: 3 },
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  });
  assert.equal(impact.rows.find(row => row.clientId === 'done')?.action, 'complement');
  assert.equal(impact.rows.find(row => row.clientId === 'draft')?.action, 'in_progress');
  assert.equal(impact.rows.find(row => row.clientId === 'none')?.action, 'unassigned');
  assert.equal(impact.rows.find(row => row.clientId === 'covered')?.action, 'keep');
  assert.deepEqual(defaultAssignClientIds(impact.rows), ['done']);
  assert.equal(canAssignPublicationAction('in_progress'), false);
  assert.equal(canAssignPublicationAction('unassigned'), true);
});

test('first publish does not auto-assign the roster', () => {
  const next = fixture();
  const impact = previewPublicationImpact({
    previous: null,
    next,
    clients: [{ id: 'a', name: 'A' }],
    responses: [],
  });
  assert.equal(impact.kind, 'first');
  assert.equal(impact.rows[0].action, 'unassigned');
  assert.deepEqual(defaultAssignClientIds(impact.rows), []);
});

test('builder page starts from the short template and recaps who must complete', () => {
  const page = src('src/components/coaching/CoachQuestionnairePage.tsx');
  assert.match(page, /shortQuestionnaireTemplate/);
  assert.match(page, /questionnaire-from-short/);
  assert.match(page, /questionnaire-effort/);
  assert.match(page, /questionnaire-preview/);
  assert.match(page, /questionnaire-publish-recap/);
  assert.match(page, /assignQuestionnaireComplements/);
  assert.match(page, /previewLanguage/);
  const fields = src('src/components/onboarding/CoachQuestionnaireFields.tsx');
  assert.match(fields, /previewLanguage/);
  const sql = src('supabase/migrations/20260915201731_assign_questionnaire_complements.sql');
  assert.match(sql, /assign_questionnaire_complements/);
  assert.match(sql, /in_progress/);
  assert.match(sql, /questionnaire_responses_client_version_uidx/);
  const fr = src('src/i18n/locales/fr/coaching.ts');
  const en = src('src/i18n/locales/en/coaching.ts');
  assert.match(fr, /fromShort: 'Partir d’un modèle court \(recommandé\)'/);
  assert.match(en, /fromShort: 'Start from a short template \(recommended\)'/);
  assert.match(fr, /publishKeepAll:/);
  assert.match(en, /publishComplement:/);
});
