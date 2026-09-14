import { useCoachingStore } from '../stores/coachingStore';
import { resolveAccountContext, type AccountContext } from './accountContext';

export function useAccountContext(): AccountContext {
  const role = useCoachingStore(s => s.coachingRole);
  const coach = useCoachingStore(s => s.myCoach);
  const ready = useCoachingStore(s => s.roleReady);
  const snapshot = useCoachingStore(s => s.accountSnapshot);
  const workspace = useCoachingStore(s => s.accountWorkspace);
  return resolveAccountContext(role, coach, ready, snapshot, workspace);
}
