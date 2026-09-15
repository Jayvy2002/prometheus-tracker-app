import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { listQuestionnaireResponses, type QuestionnaireResponse } from '../../lib/coachQuestionnaireApi';
import type { AssignedQuestionnaireStatus } from '../../lib/assignedQuestionnaire';
import { AssignedQuestionnaireContext } from './assignedQuestionnaireContext';

export default function AssignedQuestionnaireProvider({ children }: { children: ReactNode }) {
  const userId = useAuthStore(s => s.user?.id ?? null);
  const myCoachId = useCoachingStore(s => s.myCoach?.id ?? null);
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const roleReady = useCoachingStore(s => s.roleReady);
  const onQuestionnaire = useLocation().pathname === '/questionnaire';
  const assignmentScope = userId && myCoachId && coachingRole !== 'coach' ? `${userId}:${myCoachId}` : null;
  const [status, setStatus] = useState<AssignedQuestionnaireStatus>('idle');
  const [response, setResponse] = useState<QuestionnaireResponse | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const retry = useCallback(() => setRetryCount(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!assignmentScope || !userId || !myCoachId || !roleReady) {
      setStatus('idle');
      setResponse(null);
      return;
    }
    const coachId = myCoachId;
    setStatus('loading');
    setResponse(null);
    listQuestionnaireResponses(userId).then(rows => {
      if (cancelled) return;
      setStatus('ready');
      setResponse(rows.find(r => r.coach_id === coachId) ?? null);
    }).catch(() => {
      if (cancelled) return;
      setStatus('failed');
      setResponse(null);
    });
    return () => { cancelled = true; };
  }, [assignmentScope, userId, myCoachId, roleReady, retryCount, onQuestionnaire]);

  const value = useMemo(() => ({ status, response, retry }), [status, response, retry]);
  return (
    <AssignedQuestionnaireContext.Provider value={value}>
      {children}
    </AssignedQuestionnaireContext.Provider>
  );
}
