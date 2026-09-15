import { useEffect, useState } from 'react';
import { useCoachingStore } from '../../../stores/coachingStore';
import {
  ALL_ON_TRACKING,
  parseCoachTrackingDefaults,
  parseResolvedTracking,
  type ResolvedTrackingConfig,
} from '../../../lib/clientTracking';

export function useProgramEditorTracking(clientId?: string | null) {
  const fetchTrackingConfig = useCoachingStore(s => s.fetchTrackingConfig);
  const fetchCoachSettings = useCoachingStore(s => s.fetchCoachSettings);
  const [tracking, setTracking] = useState<ResolvedTrackingConfig>(ALL_ON_TRACKING);

  useEffect(() => {
    void fetchCoachSettings();
    if (!clientId) {
      const defaults = useCoachingStore.getState().coachSettings?.default_tracking;
      setTracking(parseCoachTrackingDefaults(defaults));
      return;
    }
    void fetchTrackingConfig(clientId).then(cfg => {
      if (cfg) {
        setTracking(parseResolvedTracking(cfg));
        return;
      }
      const defaults = useCoachingStore.getState().coachSettings?.default_tracking;
      setTracking(parseCoachTrackingDefaults(defaults));
    });
  }, [clientId, fetchTrackingConfig, fetchCoachSettings]);

  return tracking;
}
