import { createContext, useContext } from 'react';
import type { QuestionnaireResponse } from '../../lib/coachQuestionnaireApi';
import type { AssignedQuestionnaireStatus } from '../../lib/assignedQuestionnaire';

export interface AssignedQuestionnaireValue {
  status: AssignedQuestionnaireStatus;
  response: QuestionnaireResponse | null;
  retry: () => void;
}

export const AssignedQuestionnaireContext = createContext<AssignedQuestionnaireValue>({
  status: 'idle',
  response: null,
  retry: () => undefined,
});

export function useAssignedQuestionnaire(): AssignedQuestionnaireValue {
  return useContext(AssignedQuestionnaireContext);
}
