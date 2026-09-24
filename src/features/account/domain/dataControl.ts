/** UX66 — who sees what, what an export contains, what delete removes. */

export const PERSONAL_EXPORT_INCLUDED = [
  'profile',
  'workouts',
  'nutrition_logs',
  'water_logs',
  'weight_measurements',
  'body_measurements',
  'daily_checkins',
  'progress_photos',
  'recipes',
] as const;

export const PERSONAL_EXPORT_EXCLUDED = [
  'coach_notes',
  'interventions',
  'product_events',
  'kinesiology_intake',
] as const;

export type SharedModule = 'workouts' | 'checkins' | 'nutrition' | 'weight';

export interface TrackingShare {
  track_workouts: boolean;
  track_checkins: boolean;
  track_nutrition: boolean;
  track_weight: boolean;
}

export function sharedModulesForCoach(tracking: TrackingShare): SharedModule[] {
  const modules: SharedModule[] = [];
  if (tracking.track_workouts) modules.push('workouts');
  if (tracking.track_checkins) modules.push('checkins');
  if (tracking.track_nutrition) modules.push('nutrition');
  if (tracking.track_weight) modules.push('weight');
  return modules;
}

export function dataAudience(input: {
  hasCoach: boolean;
  coachName: string | null;
  tracking: TrackingShare;
}): {
  photos: 'self' | 'coach';
  coachName: string | null;
  modules: SharedModule[];
} {
  if (!input.hasCoach) {
    return { photos: 'self', coachName: null, modules: [] };
  }
  return {
    photos: 'coach',
    coachName: input.coachName,
    modules: sharedModulesForCoach(input.tracking),
  };
}

export function deleteConfirmToken(language: string): 'SUPPRIMER' | 'DELETE' {
  return language.toLowerCase().startsWith('fr') ? 'SUPPRIMER' : 'DELETE';
}

export function profileExportFields(profile: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!profile) return null;
  const {
    kinesiology_intake: _kine,
    kinesiology_intake_completed_at: _kineAt,
    ...rest
  } = profile;
  void _kine;
  void _kineAt;
  return rest;
}
