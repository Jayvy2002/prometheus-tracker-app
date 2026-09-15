import { STANDARD_QUESTIONS } from '../../../../supabase/functions/_shared/questionnaireStandard';
import {
  type CoachQuestionnaire,
  type QuestionnaireAnswer,
  type QuestionnaireQuestion,
} from './coachQuestionnaire';
import { carryForwardAnswers, sectionHasMissingRequired } from './questionnaireSummary';

export const SHORT_TEMPLATE_QUESTION_IDS = [
  'objectifPrincipal',
  'seancesRealistes',
  'lieu',
  'equipement',
  'quelqueChoseImportant',
] as const;

export type PublishKind = 'first' | 'keep_all' | 'complement';
export type PublicationAction = 'keep' | 'complement' | 'in_progress' | 'unassigned';

export interface QuestionnaireEffort {
  screens: number;
  questions: number;
  required: number;
  medical: number;
}

export interface RosterResponseFact {
  clientId: string;
  versionId: string;
  questionnaireId: string;
  version: number;
  completedAt: string | null;
  answers: Record<string, QuestionnaireAnswer>;
  createdAt: string;
}

export interface PublicationImpactRow {
  clientId: string;
  name: string;
  action: PublicationAction;
}

function optionKey(question: QuestionnaireQuestion): string {
  return (question.options ?? []).map(option => option.id).join('\0');
}

function mappedQuestion(id: (typeof SHORT_TEMPLATE_QUESTION_IDS)[number], required: boolean): QuestionnaireQuestion {
  const standard = structuredClone(STANDARD_QUESTIONS[id]);
  return {
    id: standard.id,
    label: { ...standard.label },
    type: standard.type,
    required,
    medical: standard.medical,
    maps_to: standard.maps_to,
    ...(standard.options ? { options: standard.options } : {}),
  };
}

/** UX39 — one screen, no medical jargon, two required questions. */
export function shortQuestionnaireTemplate(input: { id: string; coachId: string }): CoachQuestionnaire {
  return {
    schemaVersion: 1,
    id: input.id,
    coachId: input.coachId,
    version: 1,
    name: { fr: 'Prise en charge', en: 'Intake' },
    sections: [{
      id: 'start',
      label: { fr: 'Pour commencer', en: 'To start' },
      questions: [
        mappedQuestion('objectifPrincipal', true),
        mappedQuestion('seancesRealistes', true),
        mappedQuestion('lieu', false),
        mappedQuestion('equipement', false),
        mappedQuestion('quelqueChoseImportant', false),
      ],
    }],
  };
}

export function questionnaireEffort(definition: CoachQuestionnaire): QuestionnaireEffort {
  const questions = definition.sections.flatMap(section => section.questions);
  return {
    screens: definition.sections.length,
    questions: questions.length,
    required: questions.filter(question => question.required).length,
    medical: questions.filter(question => question.medical).length,
  };
}

export function classifyQuestionnaireRevision(
  previous: CoachQuestionnaire | null,
  next: CoachQuestionnaire,
): { kind: PublishKind; addedRequiredIds: string[] } {
  const nextQuestions = next.sections.flatMap(section => section.questions);
  if (!previous) {
    return {
      kind: 'first',
      addedRequiredIds: nextQuestions.filter(question => question.required).map(question => question.id),
    };
  }
  const previousById = new Map(previous.sections.flatMap(section => section.questions).map(question => [question.id, question]));
  const addedRequiredIds: string[] = [];
  for (const question of nextQuestions) {
    const before = previousById.get(question.id);
    if (!before) {
      if (question.required) addedRequiredIds.push(question.id);
      continue;
    }
    const slotChanged = before.type !== question.type
      || (before.maps_to ?? '') !== (question.maps_to ?? '')
      || optionKey(before) !== optionKey(question);
    if (question.required && (slotChanged || !before.required)) addedRequiredIds.push(question.id);
  }
  return {
    kind: addedRequiredIds.length > 0 ? 'complement' : 'keep_all',
    addedRequiredIds,
  };
}

function latestForQuestionnaire(
  responses: RosterResponseFact[],
  clientId: string,
  questionnaireId: string,
): RosterResponseFact | undefined {
  return responses
    .filter(row => row.clientId === clientId && row.questionnaireId === questionnaireId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.version - a.version)[0];
}

/** UX41 — who keeps the previous answer, who must complete a complement, who stays pinned. */
export function previewPublicationImpact(input: {
  next: CoachQuestionnaire;
  previous: CoachQuestionnaire | null;
  clients: { id: string; name: string }[];
  responses: RosterResponseFact[];
}): { kind: PublishKind; addedRequiredIds: string[]; rows: PublicationImpactRow[] } {
  const classified = classifyQuestionnaireRevision(input.previous, input.next);
  const rows = input.clients.map(client => {
    const latest = latestForQuestionnaire(input.responses, client.id, input.next.id);
    if (!latest) return { clientId: client.id, name: client.name, action: 'unassigned' as const };
    if (!latest.completedAt) return { clientId: client.id, name: client.name, action: 'in_progress' as const };
    if (classified.kind === 'keep_all') {
      return { clientId: client.id, name: client.name, action: 'keep' as const };
    }
    const carried = carryForwardAnswers(latest.answers, input.next);
    const missing = input.next.sections.some(section => sectionHasMissingRequired(section, carried));
    return {
      clientId: client.id,
      name: client.name,
      action: missing ? 'complement' as const : 'keep' as const,
    };
  });
  return { ...classified, rows };
}

export function defaultAssignClientIds(rows: PublicationImpactRow[]): string[] {
  return rows.filter(row => row.action === 'complement').map(row => row.clientId);
}

export function canAssignPublicationAction(action: PublicationAction): boolean {
  return action !== 'in_progress';
}
