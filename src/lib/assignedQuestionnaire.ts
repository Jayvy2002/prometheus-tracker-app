import type { QuestionnaireResponse } from './coachQuestionnaireApi';

export type AssignedQuestionnaireStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** Assigned coach questionnaire that still has no completed_at. */
export function isIncompleteAssignedQuestionnaire(
  response: Pick<QuestionnaireResponse, 'completed_at'> | null | undefined,
): boolean {
  return !!response && response.completed_at == null;
}

/**
 * Skip the kinesiology wall while a coach questionnaire is assigned, still loading,
 * or failed to load. A fetch failure must not become a second full-screen lock.
 */
export function shouldSkipKinesiologyForAssignedQuestionnaire(input: {
  status: AssignedQuestionnaireStatus;
  response: Pick<QuestionnaireResponse, 'completed_at'> | null;
}): boolean {
  if (input.response) return true;
  return input.status === 'loading' || input.status === 'failed';
}
