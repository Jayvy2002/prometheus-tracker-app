import { captureSession } from '../../../lib/sessionScope';
import {
  supabase,
} from '../../../lib/supabase';
import {
  mapInterventionRow,
} from '../../../lib/coachInterventions';
import {
  COACH_REALTIME_POLL_MS,
  isInterventionDrafting,
  mergeInterventionRealtime,
} from '../../../lib/coachSecond';
import {
  mapCoachMessage,
} from '../../../lib/coachQueue';
import {
  liveMessageState,
  nutritionTargetsFromProfileRow,
  shouldRefreshClientAssignment,
  shouldRefreshClientProgramContent,
  shouldRefreshProgressPhotos,
} from '../../../lib/clientLive';
import {
  resolveViewerTracking,
} from '../../../lib/clientTracking';
import {
  isCoachedAthlete,
} from '../../../lib/coachRole';
import {
  profileLinkEndedChanged,
} from '../../../lib/soloTransition';
import {
  useProfileStore,
} from '../../../stores/profileStore';
import {
  useProgramStore,
} from '../../../stores/programStore';
import {
  coachingRuntime,
  CoachingGet,
  CoachingSet,
  CoachingState,
  dossierChannels,
} from './coachingShared';

export function createRealtimeSlice(set: CoachingSet, get: CoachingGet): Pick<CoachingState, 'startCoachRealtime' | 'stopCoachRealtime' | 'startClientRealtime' | 'stopClientRealtime' | 'subscribeClientDossier' > {
  return {
  startCoachRealtime: async () => {
    const sessionCurrent = captureSession();
    const current = () => sessionCurrent() && get().accountWorkspace === 'coaching';
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !current()) return;
    if (!get().accountSnapshot?.coachCapability) return;
    void get().fetchCoachMessages();
    if (!coachingRuntime.coachRealtimeChannel) {
      void get().fetchPendingInterventions();
      coachingRuntime.coachRealtimeChannel = supabase
        .channel(`coach-live-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'coach_interventions',
            filter: `coach_id=eq.${user.id}`,
          },
          payload => {
            if (!current()) return;
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            const mapped = raw ? mapInterventionRow(raw) : null;
            if (!mapped) {
              void get().fetchPendingInterventions();
              return;
            }
            const event = payload.eventType === 'DELETE' ? 'DELETE' : payload.eventType;
            set(s => ({
              pendingInterventions: mergeInterventionRealtime(s.pendingInterventions, event, mapped),
            }));
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'coach_messages',
            filter: `coach_id=eq.${user.id}`,
          },
          payload => {
            if (!current()) return;
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            const mapped = raw ? mapCoachMessage(raw) : null;
            if (!mapped) {
              void get().fetchCoachMessages();
              return;
            }
            const event = payload.eventType === 'DELETE' ? 'DELETE' : payload.eventType;
            set(s => liveMessageState(s.sentMessages, event, mapped, user.id));
          },
        )
        .subscribe(status => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            void get().fetchPendingInterventions();
            void get().fetchCoachMessages();
          }
        });
    }
    if (!coachingRuntime.coachPollTimer) {
      coachingRuntime.coachPollTimer = setInterval(() => {
        if (get().pendingInterventions.some(isInterventionDrafting)) {
          void get().fetchPendingInterventions();
        }
      }, COACH_REALTIME_POLL_MS);
    }
  },

  stopCoachRealtime: () => {
    if (coachingRuntime.coachRealtimeChannel) {
      void supabase.removeChannel(coachingRuntime.coachRealtimeChannel);
      coachingRuntime.coachRealtimeChannel = null;
    }
    if (coachingRuntime.coachPollTimer) {
      clearInterval(coachingRuntime.coachPollTimer);
      coachingRuntime.coachPollTimer = null;
    }
  },

  startClientRealtime: async () => {
    const sessionCurrent = captureSession();
    const current = () => sessionCurrent() && get().accountWorkspace === 'personal';
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !current()) return;
    if (get().accountWorkspace === 'coaching') return;
    void get().fetchMyCoach().then(() => {
      void get().fetchCoachMessages();
      void get().fetchMyTrackingConfig();
    });
    void useProgramStore.getState().fetchMyAssignment(user.id);
    void get().fetchPendingInterventions();
    if (!coachingRuntime.clientRealtimeChannel) {
      coachingRuntime.clientRealtimeChannel = supabase
        .channel(`client-live-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'coach_messages',
            filter: `client_id=eq.${user.id}`,
          },
          payload => {
            if (!current()) return;
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            const mapped = raw ? mapCoachMessage(raw) : null;
            if (!mapped) {
              void get().fetchCoachMessages();
              return;
            }
            const event = payload.eventType === 'DELETE' ? 'DELETE' : payload.eventType;
            set(s => liveMessageState(s.sentMessages, event, mapped, user.id));
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'program_assignments',
            filter: `client_id=eq.${user.id}`,
          },
          payload => {
            if (!current()) return;
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            if (!shouldRefreshClientAssignment(payload.eventType, raw, user.id) && payload.eventType !== 'DELETE') {
              return;
            }
            void useProgramStore.getState().fetchMyAssignment(user.id);
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_profiles',
            filter: `id=eq.${user.id}`,
          },
          payload => {
            if (!current()) return;
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            // The coach ended the link: role went back to 'none' server-side — reload role, coach
            // and profile so the athlete lands on the solo home without a reload (VISION point 4).
            if (profileLinkEndedChanged(useProfileStore.getState().profile, raw)) {
              void useProfileStore.getState().fetchProfile(user.id, { silent: true });
              void get().fetchMyRole(user.id).then(() => get().fetchMyCoach());
              return;
            }
            const targets = nutritionTargetsFromProfileRow(raw);
            if (targets) {
              useProfileStore.getState().applyRemoteTargets(user.id, targets);
              return;
            }
            void useProfileStore.getState().fetchProfile(user.id, { silent: true });
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'client_tracking_config',
            filter: `client_id=eq.${user.id}`,
          },
          payload => {
            if (!current()) return;
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            const isCoached = isCoachedAthlete(get().coachingRole, get().myCoach);
            if (payload.eventType === 'DELETE' || !raw) {
              set({ myTrackingConfig: resolveViewerTracking(null, isCoached), trackingReady: true });
              return;
            }
            set({ myTrackingConfig: resolveViewerTracking(raw, isCoached), trackingReady: true });
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'coach_interventions',
            filter: `client_id=eq.${user.id}`,
          },
          payload => {
            if (!current()) return;
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            const mapped = raw ? mapInterventionRow(raw) : null;
            if (!mapped) {
              void get().fetchPendingInterventions();
              return;
            }
            const event = payload.eventType === 'DELETE' ? 'DELETE' : payload.eventType;
            set(s => ({
              pendingInterventions: mergeInterventionRealtime(s.pendingInterventions, event, mapped),
            }));
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'program_days',
          },
          payload => {
            if (!current()) return;
            if (!shouldRefreshClientProgramContent(payload.eventType)) return;
            void useProgramStore.getState().fetchMyAssignment(user.id);
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'program_day_exercises',
          },
          payload => {
            if (!current()) return;
            if (!shouldRefreshClientProgramContent(payload.eventType)) return;
            void useProgramStore.getState().fetchMyAssignment(user.id);
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'progress_photos',
            filter: `user_id=eq.${user.id}`,
          },
          payload => {
            if (!current()) return;
            const raw = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            if (!shouldRefreshProgressPhotos(payload.eventType, raw, user.id) && payload.eventType !== 'DELETE') {
              return;
            }
            set(s => ({ progressPhotosEpoch: s.progressPhotosEpoch + 1 }));
          },
        )
        .subscribe(status => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            void get().fetchCoachMessages();
            void useProgramStore.getState().fetchMyAssignment(user.id);
            void useProfileStore.getState().fetchProfile(user.id, { silent: true });
            void get().fetchMyTrackingConfig();
            void get().fetchPendingInterventions();
            set(s => ({ progressPhotosEpoch: s.progressPhotosEpoch + 1 }));
          }
        });
    }
  },

  stopClientRealtime: () => {
    if (coachingRuntime.clientRealtimeChannel) {
      void supabase.removeChannel(coachingRuntime.clientRealtimeChannel);
      coachingRuntime.clientRealtimeChannel = null;
    }
  },

  subscribeClientDossier: (clientId, onInvalidate) => {
    const existing = dossierChannels.get(clientId);
    if (existing) void supabase.removeChannel(existing);
    // C01 : RLS restreint déjà aux suivis du coach ; on filtre par client côté réception.
    const tables = [
      'workouts', 'workout_exercises', 'workout_sets',
      'nutrition_logs', 'water_logs', 'weight_measurements',
      'daily_checkins', 'daily_steps',
    ];
    let channel = supabase.channel(`client-dossier-${clientId}`);
    const userOf = (row: Record<string, unknown> | undefined): string | null => {
      if (!row) return null;
      const direct = row.user_id;
      if (typeof direct === 'string') return direct;
      return null;
    };
    for (const table of tables) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        payload => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
          if (userOf(row) === clientId) onInvalidate();
          // workout_exercises/sets ne portent pas user_id : toute écriture invalide.
          if ((table === 'workout_exercises' || table === 'workout_sets') && !userOf(row)) onInvalidate();
        },
      );
    }
    const subscribed = channel.subscribe();
    dossierChannels.set(clientId, subscribed);
    return () => {
      void supabase.removeChannel(subscribed);
      if (dossierChannels.get(clientId) === subscribed) dossierChannels.delete(clientId);
    };
  },
  };
}
