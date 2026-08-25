import type { WidgetType } from '../lib/types';

export function usePremium() {
  return {
    isPremium: true,
    canAddWidget: (_currentCount: number) => true,
    canUseWidgetType: (_type: WidgetType) => true,
    canViewWorkout: (_workoutDateIso: string) => true,
    canAddRoutine: (_currentCount: number) => true,
    canAddRecipe: (_currentCount: number) => true,
    canAddFavorite: (_currentCount: number) => true,
    canUseStatsPeriod: (_period: string) => true,
    canUseWeightPeriod: (_period: string) => true,
    canUseNotifications: true,
    canUseHealthIntegrations: true,
    canUseWeeklyMacroAdjustment: true,
    canSubmitCustomExercise: true,
  };
}
