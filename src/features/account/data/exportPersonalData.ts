import { supabase } from '../../../lib/supabase';
import {
  PERSONAL_EXPORT_EXCLUDED,
  PERSONAL_EXPORT_INCLUDED,
  profileExportFields,
} from '../domain/dataControl';

export interface PersonalDataExport {
  exported_at: string;
  included: typeof PERSONAL_EXPORT_INCLUDED;
  excluded: typeof PERSONAL_EXPORT_EXCLUDED;
  profile: Record<string, unknown> | null;
  workouts: unknown[];
  nutrition_logs: unknown[];
  water_logs: unknown[];
  weight_measurements: unknown[];
  daily_checkins: unknown[];
  progress_photos: unknown[];
  recipes: unknown[];
}

function rows<T>(data: T[] | null): T[] {
  return data ?? [];
}

export async function exportPersonalData(userId: string): Promise<PersonalDataExport> {
  const [
    profileRes,
    workoutsRes,
    nutritionRes,
    waterRes,
    weightRes,
    checkinRes,
    photosRes,
    recipesRes,
  ] = await Promise.all([
    supabase.from('user_profiles').select('id, full_name, language, unit_weight, unit_distance, unit_height, timezone, daily_calorie_target, protein_target, carbs_target, fat_target, daily_water_target_ml').eq('id', userId).maybeSingle(),
    supabase.from('workouts').select('id, name, date, completed, duration_seconds').eq('user_id', userId).order('date', { ascending: false }).limit(1000),
    supabase.from('nutrition_logs').select('id, logged_at, category, name, calories, protein, carbs, fat, quantity, unit').eq('user_id', userId).order('logged_at', { ascending: false }).limit(2000),
    supabase.from('water_logs').select('id, logged_at, amount_ml').eq('user_id', userId).order('logged_at', { ascending: false }).limit(1000),
    supabase.from('weight_measurements').select('id, weight_kg, measured_at, notes').eq('user_id', userId).order('measured_at', { ascending: false }).limit(1000),
    supabase.from('daily_checkins').select('id, checked_at, sleep_hours, sleep_quality, energy_level, stress, notes').eq('user_id', userId).order('checked_at', { ascending: false }).limit(1000),
    supabase.from('progress_photos').select('id, taken_at, created_at').eq('user_id', userId).order('taken_at', { ascending: false }).limit(500),
    supabase.from('recipes').select('id, name, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(500),
  ]);

  const firstError = [
    profileRes, workoutsRes, nutritionRes, waterRes, weightRes, checkinRes, photosRes, recipesRes,
  ].find(result => result.error);
  if (firstError?.error) throw new Error(firstError.error.message);

  return {
    exported_at: new Date().toISOString(),
    included: PERSONAL_EXPORT_INCLUDED,
    excluded: PERSONAL_EXPORT_EXCLUDED,
    profile: profileExportFields((profileRes.data as Record<string, unknown> | null) ?? null),
    workouts: rows(workoutsRes.data),
    nutrition_logs: rows(nutritionRes.data),
    water_logs: rows(waterRes.data),
    weight_measurements: rows(weightRes.data),
    daily_checkins: rows(checkinRes.data),
    progress_photos: rows(photosRes.data),
    recipes: rows(recipesRes.data),
  };
}
