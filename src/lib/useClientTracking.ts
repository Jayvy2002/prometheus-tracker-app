import { useCoachingStore } from '../stores/coachingStore';
import type { ResolvedTrackingConfig } from './clientTracking';

export function useClientTracking(): ResolvedTrackingConfig {
  return useCoachingStore(s => s.myTrackingConfig);
}
