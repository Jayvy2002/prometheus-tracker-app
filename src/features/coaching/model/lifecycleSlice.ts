import {
  supabase,
} from '../../../lib/supabase';
import {
  ALL_ON_TRACKING,
} from '../../../lib/clientTracking';
import {
  cloneTracking,
} from '../../../lib/coachStoreGuards';
import {
  CoachingGet,
  CoachingSet,
  CoachingState,
  dossierChannels,
  EMPTY_SIGNALS,
  EMPTY_STATS,
} from './coachingShared';

export function createLifecycleSlice(set: CoachingSet, get: CoachingGet): Pick<CoachingState, 'clear' > {
  return {
  clear: () => {
    get().stopCoachRealtime();
    get().stopClientRealtime();
    for (const channel of dossierChannels.values()) void supabase.removeChannel(channel);
    dossierChannels.clear();
    set({
      coachingRole: 'none',
      roleReady: false,
      coachingRoleError: null,
      accountSnapshot: null,
      accountWorkspace: 'personal',
      clients: [],
      clientsFetchError: null,
      invites: [],
      myCoach: null,
      notes: [],
      opsRows: [],
      opsLoading: false,
      opsPartialError: null,
      pendingInterventions: [],
      sentMessages: [],
      latestCoachMessage: null,
      unreadMessageCount: 0,
      threadExhausted: {},
      coachSettings: null,
      myTrackingConfig: cloneTracking(ALL_ON_TRACKING),
      trackingReady: false,
      queueDismissedIds: [],
      priorities: [],
      rosterSignals: EMPTY_SIGNALS,
      commandStats: EMPTY_STATS,
      fleetRunning: false,
      lastFleetRound: null,
      progressPhotosEpoch: 0,
    });
  },
  };
}
