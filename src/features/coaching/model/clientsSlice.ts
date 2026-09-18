import {
  supabase,
} from '../../../lib/supabase';
import type {
  ClientTrackingConfig,
  CoachClientSummary,
  CoachNote,
  CoachRosterSignals,
  DailyCheckin,
  NutritionLog,
  ProgramAssignment,
  UserProfile,
  WaterLog,
  WeightMeasurement,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../../../lib/types';
import {
  EMPTY_COACH_SETTINGS,
} from '../../../lib/coachSettings';
import {
  ALL_ON_TRACKING,
} from '../../../lib/clientTracking';
import {
  profileHasMedicalFlags,
} from '../../../lib/kinesiologyIntake';
import {
  track,
} from '../../../lib/telemetryClient';
import {
  cloneTracking,
  opsHasPartialError,
} from '../../../lib/coachStoreGuards';
import i18n from '../../../i18n';
import {
  toast,
} from '../../../components/ui/Toast';
import {
  useProfileStore,
} from '../../../stores/profileStore';
import {
  useProgramStore,
} from '../../../stores/programStore';
import {
  buildClientOpsRows,
  coachClockFacts,
  datePrefix,
  weekAgoStr,
} from '../../../lib/coachAlerts';
import {
  buildClientLifts,
} from '../../../lib/coachLifts';
import {
  buildCoachPriorities,
  commandStats,
} from '../../../lib/coachPriorities';
import {
  addDaysToDateStr,
  todayStr,
} from '../../../lib/utils';
import {
  compareRosterName,
} from '../../../lib/coachRoster';
import {
  fetchAllRows,
} from '../../../lib/postgrestPage';
import {
  getSessionOwner,
} from '../../../lib/sessionScope';
import {
  coachingRuntime,
  CoachingGet,
  CoachingSet,
  CoachingState,
  dropUnlinkedClient,
  EMPTY_SIGNALS,
  EMPTY_STATS,
  persistRememberedCoachingRole,
} from './coachingShared';

export function createClientsSlice(set: CoachingSet, get: CoachingGet): Pick<CoachingState, 'fetchClients' | 'fetchCoachOps' | 'fetchClientProfile' | 'applyProgramOutline' | 'fetchClientAssignments' | 'adoptClientProgram' | 'touchClientVisit' | 'fetchClientWorkouts' | 'fetchClientWorkout' | 'fetchClientNutrition' | 'fetchClientWeight' | 'fetchClientCheckins' | 'fetchNotes' | 'addNote' | 'deleteNote' | 'endMyCoachLink' | 'endClientLink' > {
  return {
  fetchClients: async () => {
    set({ loading: true });
    type LinkRow = {
      client_id: string;
      created_at: string;
      last_visited_at?: string | null;
      last_nudged_at?: string | null;
    };
    let links: LinkRow[] | null = null;
    const withNudge = await supabase
      .from('coach_client_links')
      .select('client_id, created_at, last_visited_at, last_nudged_at')
      .eq('status', 'active');
    if (withNudge.error) {
      const withVisit = await supabase
        .from('coach_client_links')
        .select('client_id, created_at, last_visited_at')
        .eq('status', 'active');
      if (withVisit.error) {
        const fallback = await supabase
          .from('coach_client_links')
          .select('client_id, created_at')
          .eq('status', 'active');
        if (fallback.error) {
          set({ loading: false, clientsFetchError: fallback.error.message });
          toast(i18n.t('errors.loadOps'), 'error');
          return;
        }
        if (!fallback.data?.length) {
          set({ clients: [], loading: false, clientsFetchError: null });
          return;
        }
        links = fallback.data as LinkRow[];
      } else {
        links = (withVisit.data ?? []) as LinkRow[];
      }
    } else {
      links = (withNudge.data ?? []) as LinkRow[];
    }
    if (!links.length) {
      set({ clients: [], loading: false });
      return;
    }
    const ids = links.map(l => l.client_id as string);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, avatar_url, onboarding_completed, goal, training_frequency, target_weight_kg, weight_kg, daily_calorie_target, protein_target, carbs_target, fat_target, kinesiology_intake')
      .in('id', ids);
    const linkedAt = new Map(links.map(l => [l.client_id as string, l.created_at as string]));
    const visitedAt = new Map(links.map(l => [l.client_id as string, l.last_visited_at ?? null]));
    const nudgedAt = new Map(links.map(l => [l.client_id as string, l.last_nudged_at ?? null]));
    const clients: CoachClientSummary[] = (profiles ?? []).map(p => ({
      id: p.id as string,
      full_name: (p.full_name as string) || '',
      email: (p.email as string) || '',
      avatar_url: (p.avatar_url as string) || '',
      linked_at: linkedAt.get(p.id as string) ?? '',
      onboarding_completed: !!p.onboarding_completed,
      goal: (p.goal as string) || '',
      training_frequency: Number(p.training_frequency) || 0,
      target_weight_kg: Number(p.target_weight_kg) || 0,
      weight_kg: Number(p.weight_kg) || 0,
      last_visited_at: visitedAt.get(p.id as string) ?? null,
      last_nudged_at: nudgedAt.get(p.id as string) ?? null,
      daily_calorie_target: Number(p.daily_calorie_target) || 0,
      protein_target: Number(p.protein_target) || 0,
      carbs_target: Number(p.carbs_target) || 0,
      fat_target: Number(p.fat_target) || 0,
      medical_flags: profileHasMedicalFlags(p.kinesiology_intake),
    }));
    clients.sort(compareRosterName);
    set({ clients, loading: false, clientsFetchError: null });
  },

  fetchCoachOps: async () => {
    set({ opsLoading: true });
    await Promise.all([get().fetchClients(), get().fetchPendingInterventions(), get().fetchCoachSettings()]);
    const clients = get().clients;
    if (get().clientsFetchError && clients.length === 0) {
      set({
        opsLoading: false,
        opsPartialError: get().clientsFetchError,
      });
      return;
    }
    if (clients.length === 0) {
      set({
        opsRows: [],
        opsLoading: false,
        opsPartialError: null,
        priorities: [],
        rosterSignals: EMPTY_SIGNALS,
        commandStats: EMPTY_STATS,
      });
      return;
    }
    const ids = clients.map(c => c.id);
    const settings = get().coachSettings ?? { coach_id: '', ...EMPTY_COACH_SETTINGS };
    const clock = coachClockFacts(new Date(), settings.timezone);
    const today = clock.today;
    const weekAgo = weekAgoStr(today);
    const threeWeeks = addDaysToDateStr(today, -20);
    const weekday = clock.weekday;

    const [
      trackingRes,
      assignmentRes,
      checkinTodayRes,
      nutritionRes,
      weightWeekRes,
      workoutWeekRes,
      checkinHistRes,
      weightHistRes,
      workoutHistRes,
      notesRes,
      interventionHistRes,
      nutritionHistRes,
    ] = await Promise.all([
      supabase.from('client_tracking_config').select('*').in('client_id', ids),
      supabase.from('program_assignments').select('client_id, program_id, start_date').in('client_id', ids).eq('status', 'active'),
      supabase.from('daily_checkins').select('user_id').in('user_id', ids).eq('checked_at', today),
      supabase.from('nutrition_logs').select('user_id').in('user_id', ids).eq('logged_at', today),
      supabase.from('weight_measurements').select('user_id').in('user_id', ids).gte('measured_at', weekAgo),
      supabase.from('workouts').select('user_id, date, completed').in('user_id', ids).eq('completed', true).gte('date', `${weekAgo}T00:00:00`),
      fetchAllRows(() => supabase.from('daily_checkins').select('*').in('user_id', ids).gte('checked_at', threeWeeks).order('checked_at', { ascending: false })),
      fetchAllRows(() => supabase.from('weight_measurements').select('*').in('user_id', ids).gte('measured_at', threeWeeks).order('measured_at', { ascending: false })),
      fetchAllRows(() => supabase.from('workouts').select('id, user_id, date, name, completed').in('user_id', ids).eq('completed', true).gte('date', `${threeWeeks}T00:00:00`).order('date', { ascending: false })),
      fetchAllRows(() => supabase.from('coach_notes').select('client_id, created_at').in('client_id', ids).order('created_at', { ascending: false })),
      fetchAllRows(() => supabase.from('coach_interventions').select('client_id, resolved_at, updated_at, status').in('client_id', ids).in('status', ['sent', 'kept'])),
      fetchAllRows(() => supabase.from('nutrition_logs').select('user_id, logged_at, calories').in('user_id', ids).gte('logged_at', threeWeeks)),
    ]);

    const partial = opsHasPartialError([
      trackingRes, assignmentRes, checkinTodayRes, nutritionRes, weightWeekRes,
      workoutWeekRes, checkinHistRes, weightHistRes, workoutHistRes, notesRes,
      interventionHistRes, nutritionHistRes,
    ]);

    const assignments = assignmentRes.data ?? [];
    const programIds = [...new Set(assignments.map(a => a.program_id as string))];
    let programDays: { program_id: string; weekday: number }[] = [];
    const programMeta = new Map<string, { name: string; duration_weeks: number }>();
    if (programIds.length > 0) {
      const [{ data: days }, { data: programs }] = await Promise.all([
        supabase.from('program_days').select('program_id, weekday').in('program_id', programIds),
        supabase.from('programs').select('id, name, duration_weeks').in('id', programIds),
      ]);
      programDays = (days ?? []) as { program_id: string; weekday: number }[];
      for (const p of programs ?? []) {
        programMeta.set(p.id as string, {
          name: (p.name as string) || '',
          duration_weeks: Number(p.duration_weeks) || 8,
        });
      }
    }

    const trackingByClient = new Map<string, ClientTrackingConfig>();
    for (const row of (trackingRes.error ? [] : trackingRes.data ?? []) as ClientTrackingConfig[]) {
      trackingByClient.set(row.client_id, row);
    }

    const assignedClientIds = new Set(assignments.map(a => a.client_id as string));
    const programByClient = new Map(assignments.map(a => [a.client_id as string, a.program_id as string]));
    const scheduledWeekdaysByClient = new Map<string, Set<number>>();
    const assignmentStart: Record<string, string> = {};
    const assignmentWeeks: Record<string, number> = {};
    const assignmentName: Record<string, string> = {};
    const scheduledDays: Record<string, number> = {};
    for (const client of clients) {
      const programId = programByClient.get(client.id);
      if (!programId) continue;
      const days = programDays.filter(d => d.program_id === programId).map(d => d.weekday);
      scheduledWeekdaysByClient.set(client.id, new Set(days));
      scheduledDays[client.id] = days.length;
      const asg = assignments.find(a => a.client_id === client.id);
      if (asg) assignmentStart[client.id] = asg.start_date as string;
      const meta = programMeta.get(programId);
      if (meta) {
        assignmentWeeks[client.id] = meta.duration_weeks;
        assignmentName[client.id] = meta.name;
      }
    }

    const workoutDatesByUser = new Map<string, string[]>();
    for (const w of workoutWeekRes.data ?? []) {
      const uid = w.user_id as string;
      const day = datePrefix(w.date as string);
      const list = workoutDatesByUser.get(uid) ?? [];
      list.push(day);
      workoutDatesByUser.set(uid, list);
    }

    const histWorkouts = (workoutHistRes.data ?? []) as Array<{
      id: string; user_id: string; date: string; name: string; completed: boolean;
    }>;
    const workoutIds = histWorkouts.map(w => w.id);
    let exercises: Array<{ id: string; workout_id: string; name: string }> = [];
    const sets: Array<{ exercise_id: string; weight_kg: number; reps: number; rir: number; completed: boolean; set_type?: string }> = [];
    if (workoutIds.length > 0) {
      const { data: exRows } = await supabase
        .from('workout_exercises')
        .select('id, workout_id, name')
        .in('workout_id', workoutIds);
      exercises = (exRows ?? []) as Array<{ id: string; workout_id: string; name: string }>;
      const exIds = exercises.map(e => e.id);
      if (exIds.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < exIds.length; i += 200) chunks.push(exIds.slice(i, i + 200));
        for (const chunk of chunks) {
          const { data: setRows } = await supabase
            .from('workout_sets')
            .select('exercise_id, weight_kg, reps, rir, completed, set_type')
            .in('exercise_id', chunk);
          sets.push(...((setRows ?? []) as typeof sets));
        }
      }
    }

    const lastNoteAt: Record<string, string> = {};
    for (const n of notesRes.data ?? []) {
      const id = n.client_id as string;
      if (!lastNoteAt[id]) lastNoteAt[id] = n.created_at as string;
    }
    const lastInterventionAt: Record<string, string> = {};
    for (const row of interventionHistRes.data ?? []) {
      const id = row.client_id as string | null;
      if (!id) continue;
      const at = (row.resolved_at as string) || (row.updated_at as string);
      if (!lastInterventionAt[id] || at > lastInterventionAt[id]) lastInterventionAt[id] = at;
    }

    const opsRows = buildClientOpsRows(clients, {
      today,
      weekAgo,
      weekday,
      localHour: clock.localHour,
      missedWorkoutCutoffHour: settings.missed_workout_cutoff_hour,
      checkinUserIds: new Set((checkinTodayRes.data ?? []).map(r => r.user_id as string)),
      nutritionUserIds: new Set((nutritionRes.data ?? []).map(r => r.user_id as string)),
      weightUserIds: new Set((weightWeekRes.data ?? []).map(r => r.user_id as string)),
      workoutDatesByUser,
      scheduledWeekdaysByClient,
      assignedClientIds,
      trackingByClient,
    });

    const calorieTargets: Record<string, number> = {};
    for (const c of clients) {
      calorieTargets[c.id] = c.daily_calorie_target ?? 0;
    }

    const rosterSignals: CoachRosterSignals = {
      checkins: (checkinHistRes.data ?? []) as DailyCheckin[],
      weights: (weightHistRes.data ?? []) as WeightMeasurement[],
      lifts: buildClientLifts(histWorkouts, exercises, sets),
      nutritionLogs: ((nutritionHistRes.data ?? []) as Array<{ user_id: string; logged_at: string; calories: number }>).map(row => ({
        user_id: row.user_id,
        logged_at: String(row.logged_at ?? '').slice(0, 10),
        calories: Number(row.calories) || 0,
      })),
      calorieTargets,
      lastNoteAt,
      lastInterventionAt,
      assignmentStart,
      assignmentWeeks,
      assignmentName,
      scheduledDays,
    };
    const priorities = buildCoachPriorities(opsRows, rosterSignals);
    set({
      opsRows,
      opsLoading: false,
      opsPartialError: partial,
      rosterSignals,
      priorities,
      commandStats: commandStats(opsRows, priorities, rosterSignals),
    });
  },

  fetchClientProfile: async (clientId) => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', clientId)
      .maybeSingle();
    return (data as UserProfile | null) ?? null;
  },

  applyProgramOutline: async (clientId, outline) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const name = outline.name.trim();
    if (!name || outline.days.length === 0) return { error: null };
    const programs = useProgramStore.getState();
    // D01 : une seule RPC — programme + jours + exercices + attribution.
    const programId = await programs.createProgram({
      owner_id: user.id,
      name,
      description: outline.description,
      duration_weeks: outline.duration_weeks,
    }, outline.days.map((d, i) => ({
      weekday: d.weekday,
      name: d.name,
      routine_id: null,
      order_index: i,
      exercises: (d.exercises ?? []).map((ex, order_index) => ({
        name: ex.name,
        default_sets: ex.default_sets || 3,
        default_reps: ex.default_reps || 10,
        default_reps_min: ex.default_reps_min ?? null,
        default_rir: ex.default_rir ?? null,
        default_rest_seconds: ex.default_rest_seconds ?? 90,
        default_weight_kg: ex.default_weight_kg ?? null,
        order_index,
      })),
    })), { assignClientId: clientId, startDate: todayStr() });
    if (!programId) return { error: 'Failed to create program' };
    return { error: null };
  },

  fetchClientAssignments: async (clientId) => {
    const { data } = await supabase
      .from('program_assignments')
      .select('*, programs(name)')
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false });
    return ((data ?? []) as Array<ProgramAssignment & { programs?: { name: string } | null }>)
      .filter(a => a.status === 'active' || a.status === 'paused');
  },

  adoptClientProgram: async (programId, clientId) => {
    const { data, error } = await supabase.rpc('adopt_client_program', {
      p_program_id: programId,
      p_client_id: clientId,
    });
    if (error || !data) return { error: error?.message ?? 'Adoption impossible' };
    track('program_adopted', {});
    return { programId: data as string };
  },

  touchClientVisit: async (clientId) => {
    const iso = new Date().toISOString();
    await supabase
      .from('coach_client_links')
      .update({ last_visited_at: iso, updated_at: iso })
      .eq('client_id', clientId)
      .eq('status', 'active');
    // Keep the in-memory last_visited_at as the previous visit so Client 360
    // "since last visit" is computed against what the coach had not yet seen.
  },

  fetchClientWorkouts: async (clientId) => {
    const { data } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', clientId)
      .order('date', { ascending: false })
      .limit(60);
    return (data ?? []) as Workout[];
  },

  fetchClientWorkout: async (workoutId) => {
    const { data: workout } = await supabase
      .from('workouts')
      .select('*')
      .eq('id', workoutId)
      .maybeSingle();
    if (!workout) return null;
    const { data: exercises } = await supabase
      .from('workout_exercises')
      .select('*')
      .eq('workout_id', workoutId)
      .order('order_index');
    const exIds = (exercises ?? []).map(e => e.id);
    let sets: WorkoutSet[] = [];
    if (exIds.length > 0) {
      const { data: setsData } = await supabase
        .from('workout_sets')
        .select('*')
        .in('exercise_id', exIds)
        .order('order_index');
      sets = (setsData ?? []) as WorkoutSet[];
    }
    const fullExercises = (exercises ?? []).map(ex => ({
      ...ex,
      sets: sets.filter(s => s.exercise_id === ex.id),
    })) as WorkoutExercise[];
    return { ...workout, exercises: fullExercises } as Workout;
  },

  fetchClientNutrition: async (clientId, date) => {
    const [{ data: logs }, { data: water }] = await Promise.all([
      supabase.from('nutrition_logs').select('*').eq('user_id', clientId).eq('logged_at', date),
      supabase.from('water_logs').select('*').eq('user_id', clientId).eq('logged_at', date),
    ]);
    return {
      logs: (logs ?? []) as NutritionLog[],
      water: (water ?? []) as WaterLog[],
    };
  },

  fetchClientWeight: async (clientId) => {
    const { data } = await supabase
      .from('weight_measurements')
      .select('*')
      .eq('user_id', clientId)
      .order('measured_at', { ascending: false })
      .limit(90);
    return (data ?? []) as WeightMeasurement[];
  },

  fetchClientCheckins: async (clientId) => {
    const { data } = await supabase
      .from('daily_checkins')
      .select('*')
      .eq('user_id', clientId)
      .order('checked_at', { ascending: false })
      .limit(21);
    return (data ?? []) as DailyCheckin[];
  },

  fetchNotes: async (clientId) => {
    const { data } = await supabase
      .from('coach_notes')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    set({ notes: (data ?? []) as CoachNote[] });
  },

  addNote: async (clientId, body, opts) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await supabase
      .from('coach_notes')
      .insert({
        coach_id: user.id,
        client_id: clientId,
        body: body.trim(),
        note_date: opts?.noteDate ?? todayStr(),
        workout_id: opts?.workoutId ?? null,
      })
      .select()
      .maybeSingle();
    if (error || !data) return { error: error?.message ?? 'Failed to save note' };
    set(s => ({ notes: [data as CoachNote, ...s.notes] }));
    return { error: null };
  },

  deleteNote: async (id) => {
    await supabase.from('coach_notes').delete().eq('id', id);
    set(s => ({ notes: s.notes.filter(n => n.id !== id) }));
  },

  endMyCoachLink: async () => {
    const accountId = getSessionOwner();
    if (!accountId) return { error: 'not_authenticated' };
    if (coachingRuntime.endMyCoachLinkInFlight) return { error: 'operation_pending' };
    coachingRuntime.endMyCoachLinkInFlight = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.id !== accountId) return { error: 'not_authenticated' };
      const { data, error } = await supabase.rpc('client_end_coach_link');
      if (getSessionOwner() !== accountId) return { error: 'session_changed' };
      if (error) return { error: error.message };
      const payload = data as { ok?: boolean; error?: string; ended_at?: string } | null;
      if (payload?.ok !== true) return { error: payload?.error ?? 'invalid_response' };

      get().stopClientRealtime();
      // Leaving personal coaching does not remove professional coach capability.
      const role = get().accountSnapshot?.coachCapability ? 'coach' : 'none';
      persistRememberedCoachingRole(accountId, role);
      if (typeof payload.ended_at === 'string') {
        useProfileStore.getState().applyCoachingDeparture(accountId, payload.ended_at);
      }
      const snapshot = get().accountSnapshot;
      set({
        coachingRole: role,
        roleReady: true,
        coachingRoleError: null,
        myCoach: null,
        myTrackingConfig: cloneTracking(ALL_ON_TRACKING),
        trackingReady: true,
        latestCoachMessage: null,
        unreadMessageCount: 0,
        sentMessages: [],
        threadExhausted: {},
        accountSnapshot: snapshot && snapshot.userId === accountId
          ? { ...snapshot, activeCoachId: null, legacyRole: role }
          : snapshot,
      });
      return { error: null };
    } catch {
      return { error: getSessionOwner() === accountId ? 'network' : 'session_changed' };
    } finally {
      coachingRuntime.endMyCoachLinkInFlight = false;
    }
  },

  endClientLink: async (linkClientId) => {
    const accountId = getSessionOwner();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'not_authenticated' };
    if (accountId && user.id !== accountId) return { error: 'session_changed' };
    if (linkClientId === user.id) return { error: 'cannot_end_self' };

    const { data, error } = await supabase.rpc('end_coach_client_link', {
      p_client_id: linkClientId,
    });
    if (error) return { error: error.message };
    const payload = data as { ok?: boolean; error?: string } | null;
    if (payload?.ok !== true) return { error: payload?.error ?? 'invalid_response' };

    set(s => dropUnlinkedClient(s, linkClientId));
    return { error: null };
  },
  };
}
