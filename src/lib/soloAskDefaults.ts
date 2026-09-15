import type { SoloAskContext, SoloAskSurface } from './soloAsk';
import type { UserProfile } from './types';

type AskBase = Omit<SoloAskContext, 'question'>;

export function soloAskFromProfile(
  surface: SoloAskSurface,
  profile: UserProfile | null | undefined,
  extra: Partial<AskBase> = {},
): AskBase {
  return {
    surface,
    injuries: profile?.injuries_limitations ?? '',
    experience: profile?.training_experience ?? '',
    frequency: profile?.training_frequency ?? 0,
    focus: profile?.training_focus ?? '',
    programName: null,
    programExercises: [],
    recentLiftNames: [],
    calorieTarget: profile?.daily_calorie_target ?? 0,
    proteinTarget: profile?.protein_target ?? 0,
    carbsTarget: profile?.carbs_target ?? 0,
    fatTarget: profile?.fat_target ?? 0,
    consumedCalories: 0,
    consumedProtein: 0,
    consumedCarbs: 0,
    consumedFat: 0,
    allergies: profile?.food_allergies ?? [],
    dietType: profile?.diet_type ?? 'omnivore',
    currentExerciseName: null,
    catalog: [],
    lastWeightKg: null,
    lastReps: null,
    lastRestSeconds: null,
    missedWeekday: null,
    coachName: null,
    ...extra,
  };
}
