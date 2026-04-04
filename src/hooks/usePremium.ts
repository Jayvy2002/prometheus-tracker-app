import { useSubscriptionStore } from '../stores/subscriptionStore';
import type { WidgetType } from '../lib/types';

export const FREE_LIMITS = {
  maxDashboardWidgets: 5,
  maxRoutines: 3,
  maxRecipes: 5,
  maxFoodFavorites: 10,
  workoutHistoryDays: 90,
} as const;

/** Widget types available on the free plan (6 out of 9) */
export const FREE_WIDGET_TYPES: WidgetType[] = [
  'calories',
  'weight',
  'water',
  'macros',
  'steps',
  'streak',
];

/** Widget types that require premium */
export const PREMIUM_WIDGET_TYPES: WidgetType[] = [
  'workout_volume',
  'exercise_progress',
  'weekly_goal',
];

export function usePremium() {
  const { tier, status } = useSubscriptionStore();
  const isPremium = tier === 'premium' && (status === 'active' || status === 'trialing');

  return {
    isPremium,

    // Dashboard
    canAddWidget: (currentCount: number) =>
      isPremium || currentCount < FREE_LIMITS.maxDashboardWidgets,

    canUseWidgetType: (type: WidgetType) =>
      isPremium || (FREE_WIDGET_TYPES as string[]).includes(type),

    // Workout history
    canViewWorkout: (workoutDateIso: string) => {
      if (isPremium) return true;
      const daysAgo = (Date.now() - new Date(workoutDateIso).getTime()) / 86_400_000;
      return daysAgo <= FREE_LIMITS.workoutHistoryDays;
    },

    // Routines
    canAddRoutine: (currentCount: number) =>
      isPremium || currentCount < FREE_LIMITS.maxRoutines,

    // Nutrition
    canAddRecipe: (currentCount: number) =>
      isPremium || currentCount < FREE_LIMITS.maxRecipes,

    canAddFavorite: (currentCount: number) =>
      isPremium || currentCount < FREE_LIMITS.maxFoodFavorites,

    // Statistics
    canUseStatsPeriod: (period: string) =>
      isPremium || period === 'week',

    // Weight chart
    canUseWeightPeriod: (period: string) =>
      isPremium || period === '7d' || period === '30d',

    // Features
    canUseNotifications: isPremium,
    canUseHealthIntegrations: isPremium,
    canUseWeeklyMacroAdjustment: isPremium,
    canSubmitCustomExercise: isPremium,
  };
}
