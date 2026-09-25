import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useExerciseStore } from '../../../stores/exerciseStore';
import { catalogNameIndex, catalogRowFor, exerciseDisplayName } from '../domain/exerciseDisplayName';

/**
 * `name(stored, catalogExerciseId?)` → the exercise name in the app language.
 * Loads the catalog once (cached); until it is there, or if it cannot be read,
 * the stored name shows as before.
 */
export function useExerciseDisplayName(): (stored: string | null | undefined, catalogExerciseId?: string | null) => string {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const exercises = useExerciseStore(s => s.exercises);
  const fetchExercises = useExerciseStore(s => s.fetchExercises);

  useEffect(() => {
    void fetchExercises();
  }, [fetchExercises]);

  const index = useMemo(() => catalogNameIndex(exercises), [exercises]);
  return useCallback(
    (stored, catalogExerciseId) => exerciseDisplayName(stored, catalogRowFor(index, stored, catalogExerciseId), lang),
    [index, lang],
  );
}
