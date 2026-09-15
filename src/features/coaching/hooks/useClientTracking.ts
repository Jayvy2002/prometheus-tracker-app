import { useCoachingStore } from '../../../stores/coachingStore';
import type { ResolvedTrackingConfig } from '../../../lib/clientTracking';

export function useClientTracking(): ResolvedTrackingConfig {
  return useCoachingStore(s => s.myTrackingConfig);
}
