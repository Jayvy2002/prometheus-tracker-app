import { useCheckinStore } from '../stores/checkinStore';
import { useCoachingStore } from '../stores/coachingStore';
import { useNutritionStore } from '../stores/nutritionStore';
import { useProfileStore } from '../stores/profileStore';
import { useProgramStore } from '../stores/programStore';
import { useRecipeStore } from '../stores/recipeStore';
import { useRoutineStore } from '../stores/routineStore';
import { useSoloCopilotStore } from '../stores/soloCopilotStore';
import { useStreakStore } from '../stores/streakStore';
import { useWeightStore } from '../stores/weightStore';
import { useWorkoutStore } from '../stores/workoutStore';

/** Wipe every in-memory user store. Call on logout so a shared device cannot leak the previous account. */
export function resetSessionStores(): void {
  useProfileStore.getState().clearProfile();
  useCoachingStore.getState().clear();
  useProgramStore.getState().clear();
  useWorkoutStore.getState().reset();
  useNutritionStore.getState().reset();
  useWeightStore.getState().reset();
  useStreakStore.getState().reset();
  useRecipeStore.getState().reset();
  useRoutineStore.getState().reset();
  useCheckinStore.getState().clear();
  useSoloCopilotStore.getState().clear();
}
