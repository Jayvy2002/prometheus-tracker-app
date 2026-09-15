import {
  supabase,
} from '../../../lib/supabase';
import {
  imageFileForUpload,
} from '../../../lib/heicConvert';
import type {
  ClientTrackingConfig,
  ProgressPhoto,
} from '../../../lib/types';
import {
  EMPTY_COACH_SETTINGS,
  mapCoachSettings,
} from '../../../lib/coachSettings';
import {
  aggregateNutritionByDay,
} from '../../../lib/coachProgress';
import {
  parseResolvedTracking,
  serializeTrackingVars,
} from '../../../lib/clientTracking';
import {
  isCoachedAthlete,
} from '../../../lib/coachRole';
import {
  track,
} from '../../../lib/telemetryClient';
import {
  viewerTrackingAfterFetch,
} from '../../../lib/coachStoreGuards';
import {
  buildClientLifts,
} from '../../../lib/coachLifts';
import {
  addDaysToDateStr,
  todayStr,
} from '../../../lib/utils';
import {
  CoachingGet,
  CoachingSet,
  CoachingState,
} from './coachingShared';

export function createTrackingSlice(set: CoachingSet, get: CoachingGet): Pick<CoachingState, 'fetchTrackingConfig' | 'fetchMyTrackingConfig' | 'saveTrackingConfig' | 'setClientNutritionTargets' | 'setClientVisibleProfile' | 'fetchCoachSettings' | 'saveCoachSettings' | 'fetchClientNutritionRange' | 'fetchClientLiftHistory' | 'fetchProgressPhotos' | 'uploadProgressPhoto' | 'deleteProgressPhoto' | 'signProgressPhotoUrls' > {
  return {
  fetchTrackingConfig: async (clientId) => {
    const { data } = await supabase
      .from('client_tracking_config')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();
    return (data as ClientTrackingConfig | null) ?? null;
  },

  fetchMyTrackingConfig: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const isCoached = isCoachedAthlete(get().coachingRole, get().myCoach);
    if (!user) {
      const next = viewerTrackingAfterFetch({ isCoached: false, row: null, fetchError: false });
      set({ myTrackingConfig: next.tracking, trackingReady: true });
      return;
    }
    const { data, error } = await supabase
      .from('client_tracking_config')
      .select('*')
      .eq('client_id', user.id)
      .maybeSingle();
    const next = viewerTrackingAfterFetch({
      isCoached,
      row: data,
      fetchError: !!error,
    });
    set({ myTrackingConfig: next.tracking, trackingReady: next.ready });
  },

  saveTrackingConfig: async (clientId, data) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const current = parseResolvedTracking(data);
    const serialized = serializeTrackingVars({
      ...current,
      track_weight: data.track_weight ?? current.track_weight,
      track_checkins: data.track_checkins ?? current.track_checkins,
      track_nutrition: data.track_nutrition ?? current.track_nutrition,
      track_workouts: data.track_workouts ?? current.track_workouts,
      workout_focus: data.workout_focus ?? current.workout_focus,
      training: data.training ?? current.training,
      nutrition: data.nutrition ?? current.nutrition,
      checkin: data.checkin ?? current.checkin,
      setup_completed_at: data.setup_completed_at ?? current.setup_completed_at,
    });
    const payload = {
      coach_id: user.id,
      client_id: clientId,
      ...serialized,
      setup_completed_at: data.setup_completed_at ?? serialized.setup_completed_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('client_tracking_config')
      .upsert(payload, { onConflict: 'coach_id,client_id' });
    if (error) return { error: error.message };
    track('tracking_config_saved', {
      track_workouts: payload.track_workouts,
      track_nutrition: payload.track_nutrition,
      track_checkins: payload.track_checkins,
      track_weight: payload.track_weight,
    });
    return { error: null };
  },

  setClientNutritionTargets: async (clientId, targets) => {
    const { error } = await supabase.rpc('coach_set_client_nutrition_targets', {
      p_client_id: clientId,
      p_calories: Math.round(targets.calories),
      p_protein: Math.round(targets.protein),
      p_carbs: Math.round(targets.carbs),
      p_fat: Math.round(targets.fat),
    });
    if (error) return { error: error.message };
    track('nutrition_targets_set', { calories: Math.round(targets.calories) });
    return { error: null };
  },

  setClientVisibleProfile: async (clientId, patch) => {
    const { error } = await supabase.rpc('coach_set_client_visible_profile', {
      p_client_id: clientId,
      p_patch: patch,
    });
    if (error) return { error: error.message };
    return { error: null };
  },

  fetchCoachSettings: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ coachSettings: null });
      return;
    }
    const { data, error } = await supabase
      .from('coach_settings')
      .select('*')
      .eq('coach_id', user.id)
      .maybeSingle();
    if (error || !data) {
      set({
        coachSettings: { coach_id: user.id, ...EMPTY_COACH_SETTINGS },
      });
      return;
    }
    set({ coachSettings: mapCoachSettings(data as Record<string, unknown>, user.id) });
  },

  saveCoachSettings: async (patch) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const current = get().coachSettings ?? { coach_id: user.id, ...EMPTY_COACH_SETTINGS };
    const payload = {
      coach_id: user.id,
      visible_tabs: patch.visible_tabs ?? current.visible_tabs,
      nudge_templates: patch.nudge_templates ?? current.nudge_templates,
      default_tracking: patch.default_tracking ?? current.default_tracking,
      timezone: patch.timezone ?? current.timezone,
      missed_workout_cutoff_hour: patch.missed_workout_cutoff_hour ?? current.missed_workout_cutoff_hour,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('coach_settings')
      .upsert(payload, { onConflict: 'coach_id' })
      .select()
      .maybeSingle();
    if (error) return { error: error.message };
    set({
      coachSettings: data
        ? mapCoachSettings(data as Record<string, unknown>, user.id)
        : { ...current, ...patch, updated_at: payload.updated_at },
    });
    return { error: null };
  },

  fetchClientNutritionRange: async (clientId, start, end, calorieTarget) => {
    const { data } = await supabase
      .from('nutrition_logs')
      .select('logged_at, calories, protein, carbs, fat')
      .eq('user_id', clientId)
      .gte('logged_at', start)
      .lte('logged_at', end);
    return aggregateNutritionByDay(
      (data ?? []) as Array<{ logged_at: string; calories: number; protein: number; carbs: number; fat: number }>,
      calorieTarget,
    );
  },

  fetchClientLiftHistory: async (clientId) => {
    const start = addDaysToDateStr(todayStr(), -90);
    const { data: workoutRows } = await supabase
      .from('workouts')
      .select('id, user_id, date, name, completed')
      .eq('user_id', clientId)
      .eq('completed', true)
      .gte('date', `${start}T00:00:00`)
      .order('date', { ascending: false })
      .limit(80);
    const histWorkouts = (workoutRows ?? []) as Array<{
      id: string; user_id: string; date: string; name: string; completed: boolean;
    }>;
    if (histWorkouts.length === 0) return [];
    const { data: exRows } = await supabase
      .from('workout_exercises')
      .select('id, workout_id, name')
      .in('workout_id', histWorkouts.map(w => w.id));
    const exercises = (exRows ?? []) as Array<{ id: string; workout_id: string; name: string }>;
    const sets: Array<{ exercise_id: string; weight_kg: number; reps: number; rir: number; completed: boolean; set_type?: string }> = [];
    const exIds = exercises.map(e => e.id);
    for (let i = 0; i < exIds.length; i += 200) {
      const { data: setRows } = await supabase
        .from('workout_sets')
        .select('exercise_id, weight_kg, reps, rir, completed, set_type')
        .in('exercise_id', exIds.slice(i, i + 200));
      sets.push(...((setRows ?? []) as typeof sets));
    }
    return buildClientLifts(histWorkouts, exercises, sets);
  },

  fetchProgressPhotos: async (userId) => {
    const { data, error } = await supabase
      .from('progress_photos')
      .select('*')
      .eq('user_id', userId)
      .order('taken_at', { ascending: false });
    if (error || !data) return [];
    return data as ProgressPhoto[];
  },

  uploadProgressPhoto: async ({ file, takenAt, kind, notes }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const prepared = await imageFileForUpload(file);
    if ('error' in prepared) {
      if (prepared.error === 'heic_unsupported') return { error: 'heic_unsupported' };
      return { error: prepared.error };
    }
    file = prepared.file;
    const lower = file.name.toLowerCase();
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    const extOk = ['.jpg', '.jpeg', '.png', '.webp'].some(e => lower.endsWith(e));
    if (!allowed.includes(file.type.toLowerCase()) && !extOk) {
      return { error: 'unsupported_type' };
    }
    if (file.size > 5 * 1024 * 1024) {
      return { error: 'too_large' };
    }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('progress-photos')
      .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
    if (uploadError) return { error: uploadError.message };
    const { data, error } = await supabase
      .from('progress_photos')
      .insert({
        user_id: user.id,
        taken_at: takenAt,
        kind,
        storage_path: path,
        notes: (notes ?? '').trim(),
      })
      .select()
      .maybeSingle();
    if (error || !data) {
      await supabase.storage.from('progress-photos').remove([path]);
      return { error: error?.message ?? 'Failed to save photo' };
    }
    return { photo: data as ProgressPhoto };
  },

  deleteProgressPhoto: async (id, storagePath) => {
    // Q02 : fichier d'abord — en cas d'échec rien n'est perdu et on réessaie.
    // (L'inverse laisserait un fichier orphelin irrécupérable.)
    const { error: fileError } = await supabase.storage.from('progress-photos').remove([storagePath]);
    if (fileError) return { error: fileError.message };
    const { error } = await supabase.from('progress_photos').delete().eq('id', id);
    if (error) return { error: error.message };
    return { error: null };
  },

  signProgressPhotoUrls: async (photos) => {
    if (photos.length === 0) return {};
    const { data, error } = await supabase.storage
      .from('progress-photos')
      .createSignedUrls(photos.map(p => p.storage_path), 3600);
    if (error || !data) return {};
    const out: Record<string, string> = {};
    data.forEach((row, i) => {
      if (row.signedUrl && photos[i]) out[photos[i].id] = row.signedUrl;
    });
    return out;
  },
  };
}
