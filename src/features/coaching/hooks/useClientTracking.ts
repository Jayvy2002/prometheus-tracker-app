import { useMemo } from 'react';
import { useCoachingStore } from '../../../stores/coachingStore';
import { useProfileStore } from '../../../stores/profileStore';
import { applyPersonalModules, type ResolvedTrackingConfig } from '../../../lib/clientTracking';
import { isCoachedAthlete } from '../../../lib/coachRole';

/**
 * What the viewer follows. A coached athlete follows the coach's configuration;
 * a Solo follows their own module choice (Vision §5.3).
 */
export function useClientTracking(): ResolvedTrackingConfig {
  const tracking = useCoachingStore(s => s.myTrackingConfig);
  const coached = useCoachingStore(s => isCoachedAthlete(s.coachingRole, s.myCoach));
  const modules = useProfileStore(s => s.profile?.personal_modules ?? null);
  return useMemo(
    () => (coached ? tracking : applyPersonalModules(tracking, modules)),
    [coached, tracking, modules],
  );
}
