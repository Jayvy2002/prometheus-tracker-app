import { useCheckinStore } from '../stores/checkinStore';
import { useExerciseStore } from '../stores/exerciseStore';
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
import { clearCachesForOwner } from './offlineCache';
import { getSessionOwner, setSessionOwner } from './sessionScope';
import { clearSessionTimersForOwner } from './sessionTimer';
import { clearFieldDraftsForOwner } from './fieldDraftKeys';

/**
 * Wipe every in-memory user store + every per-account local cache.
 * S05 : call on logout so a shared device cannot leak the previous account
 * (stores mémoire, cache offline, brouillons de saisie, minuteurs).
 */
export function resetSessionStores(): void {
  const owner = getSessionOwner();
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
  useExerciseStore.getState().reset();
  useSoloCopilotStore.getState().clear();
  // Purge locale du compte qui part, puis libération du scope.
  // NOTE : la file offline (D07) n'est PAS purgée — namespacée par compte,
  // elle attend le retour de A (aucune perte) sans jamais fuiter vers B.
  if (owner) {
    clearCachesForOwner(owner);
    clearFieldDraftsForOwner();
    clearSessionTimersForOwner();
  }
  setSessionOwner(null);
}
