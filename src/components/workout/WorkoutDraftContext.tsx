import { createContext, useContext, useRef, useCallback } from 'react';
import type { SetType } from '../../lib/types';

interface SetDraft {
  weight_kg?: string;
  reps?: string;
  rir?: string;
  set_type?: SetType;
  duration_seconds?: string;
  tempo?: string;
}

interface ExerciseDraft {
  notes?: string;
}

interface DraftContext {
  getSetDraft: (setId: string) => SetDraft;
  updateSetDraft: (setId: string, field: keyof SetDraft, value: string) => void;
  updateSetType: (setId: string, value: SetType) => void;
  clearSetDraft: (setId: string) => void;
  getExerciseDraft: (exerciseId: string) => ExerciseDraft;
  updateExerciseDraft: (exerciseId: string, field: keyof ExerciseDraft, value: string) => void;
  clearExerciseDraft: (exerciseId: string) => void;
  getAllSetDrafts: () => Map<string, SetDraft>;
  getAllExerciseDrafts: () => Map<string, ExerciseDraft>;
  initSetDraft: (setId: string, weight_kg: number, reps: number, rir: number, set_type: SetType, duration_seconds?: number | null, tempo?: string | null) => void;
  initExerciseDraft: (exerciseId: string, notes: string) => void;
}

const Ctx = createContext<DraftContext | null>(null);

export function useDraftContext() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDraftContext must be used within WorkoutDraftProvider');
  return ctx;
}

export function WorkoutDraftProvider({ children }: { children: React.ReactNode }) {
  const setDrafts = useRef(new Map<string, SetDraft>());
  const exerciseDrafts = useRef(new Map<string, ExerciseDraft>());

  const initSetDraft = useCallback((setId: string, weight_kg: number, reps: number, rir: number, set_type: SetType, duration_seconds?: number | null, tempo?: string | null) => {
    if (!setDrafts.current.has(setId)) {
      setDrafts.current.set(setId, {
        weight_kg: weight_kg ? String(weight_kg) : '',
        reps: reps ? String(reps) : '',
        rir: rir ? String(rir) : '',
        set_type,
        duration_seconds: duration_seconds ? String(duration_seconds) : '',
        tempo: tempo || '',
      });
    }
  }, []);

  const initExerciseDraft = useCallback((exerciseId: string, notes: string) => {
    if (!exerciseDrafts.current.has(exerciseId)) {
      exerciseDrafts.current.set(exerciseId, { notes: notes || '' });
    }
  }, []);

  const getSetDraft = useCallback((setId: string): SetDraft => {
    return setDrafts.current.get(setId) || {};
  }, []);

  const updateSetDraft = useCallback((setId: string, field: keyof SetDraft, value: string) => {
    const existing = setDrafts.current.get(setId) || {};
    setDrafts.current.set(setId, { ...existing, [field]: value });
  }, []);

  const updateSetType = useCallback((setId: string, value: SetType) => {
    const existing = setDrafts.current.get(setId) || {};
    setDrafts.current.set(setId, { ...existing, set_type: value });
  }, []);

  const clearSetDraft = useCallback((setId: string) => {
    setDrafts.current.delete(setId);
  }, []);

  const getExerciseDraft = useCallback((exerciseId: string): ExerciseDraft => {
    return exerciseDrafts.current.get(exerciseId) || {};
  }, []);

  const updateExerciseDraft = useCallback((exerciseId: string, field: keyof ExerciseDraft, value: string) => {
    const existing = exerciseDrafts.current.get(exerciseId) || {};
    exerciseDrafts.current.set(exerciseId, { ...existing, [field]: value });
  }, []);

  const clearExerciseDraft = useCallback((exerciseId: string) => {
    exerciseDrafts.current.delete(exerciseId);
  }, []);

  const getAllSetDrafts = useCallback(() => setDrafts.current, []);
  const getAllExerciseDrafts = useCallback(() => exerciseDrafts.current, []);

  return (
    <Ctx.Provider value={{
      getSetDraft, updateSetDraft, updateSetType, clearSetDraft,
      getExerciseDraft, updateExerciseDraft, clearExerciseDraft,
      getAllSetDrafts, getAllExerciseDrafts,
      initSetDraft, initExerciseDraft,
    }}>
      {children}
    </Ctx.Provider>
  );
}
