import { createContext, useContext, useRef, useCallback, useEffect } from 'react';
import type { SetType } from '../../lib/types';
import { useWorkoutStore } from '../../stores/workoutStore';

interface SetDraft {
  weight_kg?: string;
  reps?: string;
  rir?: string;
  set_type?: SetType;
  duration_seconds?: string;
  tempo?: string;
  cluster_rest_seconds?: string;
  cluster_reps_per_burst?: string;
  myo_is_activation?: boolean;
  drop_percentage?: string;
}

interface ExerciseDraft {
  notes?: string;
}

interface PersistedDrafts {
  sets: Record<string, SetDraft>;
  exercises: Record<string, ExerciseDraft>;
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
  persistNow: () => void;
}

const Ctx = createContext<DraftContext | null>(null);

export function useDraftContext() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDraftContext must be used within WorkoutDraftProvider');
  return ctx;
}

function storageKey(workoutId: string) {
  return `prometheus_field_draft_${workoutId}`;
}

function loadPersisted(workoutId: string): PersistedDrafts {
  try {
    const raw = localStorage.getItem(storageKey(workoutId));
    if (!raw) return { sets: {}, exercises: {} };
    return JSON.parse(raw) as PersistedDrafts;
  } catch {
    return { sets: {}, exercises: {} };
  }
}

function savePersisted(workoutId: string, drafts: PersistedDrafts) {
  try {
    localStorage.setItem(storageKey(workoutId), JSON.stringify(drafts));
  } catch {
    // quota
  }
}

export function clearFieldDrafts(workoutId: string) {
  try {
    localStorage.removeItem(storageKey(workoutId));
  } catch {
    // ignore
  }
}

export function WorkoutDraftProvider({ children }: { children: React.ReactNode }) {
  const setDrafts = useRef(new Map<string, SetDraft>());
  const exerciseDrafts = useRef(new Map<string, ExerciseDraft>());
  const loadedFor = useRef<string | null>(null);
  const workoutId = useWorkoutStore(s => s.currentWorkout?.id ?? null);

  const persistNow = useCallback(() => {
    if (!workoutId) return;
    const sets: Record<string, SetDraft> = {};
    setDrafts.current.forEach((v, k) => { sets[k] = v; });
    const exercises: Record<string, ExerciseDraft> = {};
    exerciseDrafts.current.forEach((v, k) => { exercises[k] = v; });
    savePersisted(workoutId, { sets, exercises });
  }, [workoutId]);

  useEffect(() => {
    if (!workoutId || loadedFor.current === workoutId) return;
    const stored = loadPersisted(workoutId);
    Object.entries(stored.sets).forEach(([id, draft]) => setDrafts.current.set(id, draft));
    Object.entries(stored.exercises).forEach(([id, draft]) => exerciseDrafts.current.set(id, draft));
    loadedFor.current = workoutId;
  }, [workoutId]);

  useEffect(() => {
    const onHide = () => persistNow();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      persistNow();
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [persistNow]);

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
    persistNow();
  }, [persistNow]);

  const updateSetType = useCallback((setId: string, value: SetType) => {
    const existing = setDrafts.current.get(setId) || {};
    setDrafts.current.set(setId, { ...existing, set_type: value });
    persistNow();
  }, [persistNow]);

  const clearSetDraft = useCallback((setId: string) => {
    setDrafts.current.delete(setId);
    persistNow();
  }, [persistNow]);

  const getExerciseDraft = useCallback((exerciseId: string): ExerciseDraft => {
    return exerciseDrafts.current.get(exerciseId) || {};
  }, []);

  const updateExerciseDraft = useCallback((exerciseId: string, field: keyof ExerciseDraft, value: string) => {
    const existing = exerciseDrafts.current.get(exerciseId) || {};
    exerciseDrafts.current.set(exerciseId, { ...existing, [field]: value });
    persistNow();
  }, [persistNow]);

  const clearExerciseDraft = useCallback((exerciseId: string) => {
    exerciseDrafts.current.delete(exerciseId);
    persistNow();
  }, [persistNow]);

  const getAllSetDrafts = useCallback(() => setDrafts.current, []);
  const getAllExerciseDrafts = useCallback(() => exerciseDrafts.current, []);

  return (
    <Ctx.Provider value={{
      getSetDraft, updateSetDraft, updateSetType, clearSetDraft,
      getExerciseDraft, updateExerciseDraft, clearExerciseDraft,
      getAllSetDrafts, getAllExerciseDrafts,
      initSetDraft, initExerciseDraft, persistNow,
    }}>
      {children}
    </Ctx.Provider>
  );
}
