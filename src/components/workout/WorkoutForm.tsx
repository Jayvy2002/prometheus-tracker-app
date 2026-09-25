import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import FullPageLayout from '../layout/FullPageLayout';
import { ArrowLeft, Plus, Timer, CloudOff, RefreshCw, AlertTriangle, MoreVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useWorkoutStore, isOfflineTempId } from '../../stores/workoutStore';
import { supabase } from '../../lib/supabase';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import IconButton from '../ui/IconButton';
import Modal from '../ui/Modal';
import { PageSkeleton } from '../ui/PageSkeleton';
import PageHeader from '../ui/PageHeader';
import { toast } from '../ui/Toast';
import { userFacingError } from '../../lib/userFacingError';
import { incompleteWorkingSets, shouldConfirmIncompleteFinish } from '../../lib/workoutFinish';
import { workoutHasLoggedWork } from '../../features/workout/domain/resumableSession';
import { draftLoadToKg } from '../../features/workout/domain/workoutSetComplete';
import ExerciseCard from './ExerciseCard';
import SupersetGroup from './SupersetGroup';
import RestTimer from './RestTimer';
import ExercisePicker from './ExercisePicker';
import DateInput from '../ui/DateInput';
import { WorkoutDraftProvider, useDraftContext } from './WorkoutDraftContext';
import { clearFieldDrafts } from '../../lib/fieldDraftKeys';
import WorkoutSummaryScreen from './WorkoutSummaryScreen';
import WorkoutRecap from './WorkoutRecap';
import SessionTimer from './SessionTimer';
import { useRoutineStore } from '../../stores/routineStore';
import { startWorkoutFromTemplate } from '../../lib/startWorkout';
import { routineStartExercises } from '../../features/workout/data/routineStart';
import { newSetTypeFor } from '../../features/workout/domain/timedExercise';
import { toWorkoutTemplateExercise } from '../../lib/programSetPrescription';
import {
  loadSessionTimer, saveSessionTimer, clearSessionTimer,
  currentElapsedMs, startTimer, pauseTimer, emptyTimer,
  type SessionTimerState,
} from '../../lib/sessionTimer';
import type { Workout, WorkoutTemplateExercise } from '../../lib/types';
import { useClientTracking } from '../../lib/useClientTracking';
import { showTrainingField } from '../../lib/clientTracking';
import { useOnline } from '../../lib/useOnline';
import { offlineOpLabelKey, peekDeadLetterOps } from '../../lib/offlineQueue';
import { isSoloAthlete } from '../../lib/coachRole';
import { isPerformedSet } from '../../lib/performedSets';
import { soloAskFromProfile } from '../../lib/soloAskDefaults';
import SoloAskBar from '../solo/SoloAskBar';
import { useProfileStore } from '../../stores/profileStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { useExerciseStore } from '../../stores/exerciseStore';
import { useProgramStore } from '../../stores/programStore';
import { shiftProgramWeekdays } from '../../lib/soloAsk';
import { usePlanSessionLabel } from '../../features/programs/hooks/usePlanSessionLabel';
import { usePreferencesStore } from '../../stores/preferencesStore';
import SetLegend from './SetLegend';

interface LocationState {
  routineId?: string;
  programAssignmentId?: string;
  programDayId?: string;
  programName?: string;
  offPlan?: boolean;
}

function WorkoutFormInner() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const state = (routerLocation.state as LocationState | null) ?? {};
  const routineId = state.routineId;
  const { user } = useAuthStore();
  const {
    currentWorkout, fetchWorkout, createWorkout, updateWorkout, deleteWorkout, addExercise, addSet, updateSet, setCurrentWorkout,
    pendingOps, deadOps, syncOfflineQueue, retryDeadLetter,
  } = useWorkoutStore();
  const { profile } = useProfileStore();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const solo = isSoloAthlete(coachingRole, myCoach);
  const catalogExercises = useExerciseStore(s => s.exercises);
  const fetchExercises = useExerciseStore(s => s.fetchExercises);
  const assignment = useProgramStore(s => s.assignment);
  const saveProgram = useProgramStore(s => s.saveProgram);
  const fetchMyAssignment = useProgramStore(s => s.fetchMyAssignment);
  const online = useOnline();
  const { getAllSetDrafts, getAllExerciseDrafts, persistNow } = useDraftContext();
  const tracking = useClientTracking();
  const restEnabled = showTrainingField(tracking, 'rest');

  const [showTimer, setShowTimer] = useState(false);
  const [restDuration, setRestDuration] = useState<number | undefined>(undefined);
  const [restAutoStart, setRestAutoStart] = useState(false);
  const [restEpoch, setRestEpoch] = useState(0);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [workoutName, setWorkoutName] = useState('');
  const [workoutDate, setWorkoutDate] = useState('');
  const planSessionLabel = usePlanSessionLabel(
    currentWorkout?.program_day_id,
    workoutName || currentWorkout?.name || t('workout.title'),
  );
  const [saving, setSaving] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [sessionMenu, setSessionMenu] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const keepAwake = usePreferencesStore(s => s.keepScreenAwake);
  const [summaryWorkout, setSummaryWorkout] = useState<Workout | null>(null);
  const [summaryDuration, setSummaryDuration] = useState(0);
  const [initError, setInitError] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [timer, setTimer] = useState<SessionTimerState>(emptyTimer());
  const [elapsedTick, setElapsedTick] = useState(0);
  const createdRef = useRef(false);
  const routineAppliedRef = useRef(false);
  const leavingRef = useRef(false);
  const { fetchRoutineWithExercises, createRoutine, addRoutineExercise } = useRoutineStore();
  const isNew = !id || routerLocation.pathname.endsWith('/new');
  const forceEdit = searchParams.get('edit') === '1';
  const isProgramSession = !!currentWorkout?.program_day_id;

  useEffect(() => {
    if (!user) return;

    if (isNew) {
      if (createdRef.current) return;
      createdRef.current = true;

      const seed = async () => {
        if (routineId || state.programDayId) {
          let exercises: WorkoutTemplateExercise[] = [];
          let name = state.programName || '';
          if (state.programDayId) {
            const { data } = await supabase
              .from('program_day_exercises')
              .select('*')
              .eq('program_day_id', state.programDayId)
              .order('order_index');
            exercises = (data ?? []).map((ex, i) => toWorkoutTemplateExercise({
              name: ex.name as string,
              default_sets: (ex.default_sets as number) ?? 3,
              default_reps: (ex.default_reps as number) ?? 10,
              default_reps_min: (ex.default_reps_min as number | null) ?? null,
              default_rir: (ex.default_rir as number | null) ?? null,
              default_rest_seconds: (ex.default_rest_seconds as number) ?? 90,
              default_weight_kg: (ex.default_weight_kg as number | null) ?? null,
              set_type: (ex.set_type as WorkoutTemplateExercise['set_type']) ?? 'working',
              superset_group: (ex.superset_group as string | null) ?? null,
              drop_count: (ex.drop_count as number | null) ?? null,
              tempo: (ex.tempo as string | null) ?? null,
              isometric_seconds: (ex.isometric_seconds as number | null) ?? null,
              cluster_rest_seconds: (ex.cluster_rest_seconds as number | null) ?? null,
              cluster_reps_per_burst: (ex.cluster_reps_per_burst as number | null) ?? null,
              myo_activation: Boolean(ex.myo_activation),
            }, i));
            if (!name) {
              const { data: day } = await supabase.from('program_days').select('name').eq('id', state.programDayId).maybeSingle();
              name = (day?.name as string) || t('workout.title');
            }
          } else if (routineId) {
            const routine = await fetchRoutineWithExercises(routineId);
            if (routine) {
              name = routine.name;
              exercises = await routineStartExercises(routine.exercises);
            }
          }
          const workoutId = await startWorkoutFromTemplate({
            userId: user.id,
            name,
            routineId: routineId || null,
            programAssignmentId: state.programAssignmentId,
            programDayId: state.programDayId,
            exercises,
          });
          if (!workoutId) {
            setInitError(true);
            return;
          }
          navigate(`/workout/${workoutId}`, { replace: true });
          return;
        }

        const now = new Date();
        const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T12:00:00`;
        const offPlanName = state.offPlan ? t('nav.addWorkoutOffPlan') : '';
        const workoutId = await createWorkout({ user_id: user.id, name: offPlanName, date: localDate });
        if (!workoutId) {
          if (useWorkoutStore.getState().queueBlocked === 'quota') {
            toast(t('workout.syncQuota'), 'error');
          }
          setInitError(true);
          return;
        }
        navigate(`/workout/${workoutId}`, { replace: true, state: state.offPlan ? { offPlan: true } : undefined });
      };

      seed().catch(() => setInitError(true));
    } else if (id) {
      setLookupDone(false);
      void fetchWorkout(id).finally(() => setLookupDone(true));
    }
  }, [user, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user) void fetchMyAssignment(user.id);
  }, [user, fetchMyAssignment]);

  useEffect(() => {
    void fetchExercises();
  }, [fetchExercises]);

  useEffect(() => {
    if (!currentWorkout || !routineId || routineAppliedRef.current || !isNew) return;
    // Seeding is handled in startWorkoutFromTemplate for /new + routineId.
    routineAppliedRef.current = true;
  }, [currentWorkout?.id, routineId, isNew]);

  // Once an offline session has synced, the URL follows its real id so a
  // reload opens the server copy instead of a cleared local draft.
  useEffect(() => {
    if (id && isOfflineTempId(id) && currentWorkout && !isOfflineTempId(currentWorkout.id)) {
      navigate(`/workout/${currentWorkout.id}`, { replace: true });
    }
  }, [id, currentWorkout?.id, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentWorkout) {
      setWorkoutName(currentWorkout.name || '');
      setWorkoutDate(currentWorkout.date || '');
      const stored = loadSessionTimer(currentWorkout.id);
      if (stored.elapsedMs > 0 || stored.running) {
        setTimer(stored);
      } else if (currentWorkout.duration_seconds > 0 && !currentWorkout.completed) {
        setTimer({ startedAt: null, elapsedMs: currentWorkout.duration_seconds * 1000, running: false });
      }
    }
  }, [currentWorkout?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!timer.running) return;
    const id = window.setInterval(() => setElapsedTick(n => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [timer.running]);

  useEffect(() => {
    if (!currentWorkout || currentWorkout.completed) return;
    saveSessionTimer(currentWorkout.id, timer);
    const seconds = Math.floor(currentElapsedMs(timer) / 1000);
    if (seconds > 0 && seconds % 15 === 0) {
      void updateWorkout(currentWorkout.id, { duration_seconds: seconds });
    }
  }, [elapsedTick, timer.running]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentWorkout || currentWorkout.completed || timer.running || timer.startedAt) return;
    const hasWork = (currentWorkout.exercises ?? []).some(ex =>
      (ex.sets ?? []).some(s => s.weight_kg > 0 || s.reps > 0),
    );
    if (hasWork) {
      const next = startTimer(timer);
      setTimer(next);
      saveSessionTimer(currentWorkout.id, next);
    }
  }, [currentWorkout?.exercises]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!keepAwake || !currentWorkout || currentWorkout.completed) return;
    let released = false;
    let sentinel: WakeLockSentinel | null = null;
    const acquire = () => {
      if (!('wakeLock' in navigator) || released) return;
      void navigator.wakeLock.request('screen').then(lock => {
        sentinel = lock;
      }).catch(() => undefined);
    };
    acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, [keepAwake, currentWorkout?.id, currentWorkout?.completed]);

  const elapsedSeconds = Math.floor(currentElapsedMs(timer) / 1000);
  void elapsedTick;

  const toggleSessionTimer = () => {
    const next = timer.running ? pauseTimer(timer) : startTimer(timer);
    setTimer(next);
    if (currentWorkout) saveSessionTimer(currentWorkout.id, next);
  };

  const hasTypedDraft = () => {
    for (const draft of getAllSetDrafts().values()) {
      if ((draft.weight_kg ?? '') !== '' || (draft.reps ?? '') !== '' || (draft.duration_seconds ?? '') !== '') return true;
    }
    return false;
  };

  const handleBack = async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    persistNow();
    if (currentWorkout) {
      saveSessionTimer(currentWorkout.id, pauseTimer(timer));
      const seconds = Math.floor(currentElapsedMs(timer) / 1000);
      const empty = !currentWorkout.completed
        && !workoutHasLoggedWork(currentWorkout.exercises)
        && !hasTypedDraft();
      if (empty) {
        // Nothing was logged: leaving discards the shell instead of leaving
        // an open session behind the « Reprendre » bar.
        await deleteWorkout(currentWorkout.id);
        clearSessionTimer(currentWorkout.id);
        clearFieldDrafts(currentWorkout.id);
      } else if (seconds > 0 && !currentWorkout.completed) {
        await updateWorkout(currentWorkout.id, { duration_seconds: seconds });
      }
    }
    setCurrentWorkout(null);
    navigate(currentWorkout?.program_day_id ? '/dashboard' : '/workout');
  };

  const abandonSession = async () => {
    if (!currentWorkout || leavingRef.current) return;
    leavingRef.current = true;
    await deleteWorkout(currentWorkout.id);
    clearSessionTimer(currentWorkout.id);
    clearFieldDrafts(currentWorkout.id);
    setCurrentWorkout(null);
    navigate(currentWorkout.program_day_id ? '/dashboard' : '/workout');
  };

  const handleAddExercise = async (name: string, catalogId?: string | null) => {
    const workout = useWorkoutStore.getState().currentWorkout;
    if (!workout) return;
    const idx = workout.exercises?.length ?? 0;
    const ex = await addExercise(workout.id, name, idx, {
      catalog_exercise_id: catalogId ?? null,
    });
    // A timed catalog exercise (plank) starts with a timed set, not kg × reps.
    const measurement = catalogId
      ? useExerciseStore.getState().exercises.find(row => row.id === catalogId)?.measurement
      : null;
    if (ex) await addSet(ex.id, 0, newSetTypeFor([], measurement));
  };

  const handleStartRestTimer = (overrideDuration?: number) => {
    if (typeof overrideDuration === 'number' && overrideDuration > 0) {
      setRestDuration(overrideDuration);
      setRestAutoStart(true);
      setRestEpoch(n => n + 1);
      setShowTimer(false);
    } else {
      setRestAutoStart(false);
      setShowTimer(true);
    }
    if (!timer.running) toggleSessionTimer();
  };

  const requestFinish = () => {
    if (!currentWorkout || saving) return;
    if (shouldConfirmIncompleteFinish(currentWorkout.exercises)) {
      setFinishConfirmOpen(true);
      return;
    }
    void handleFinish();
  };

  const handleFinish = async () => {
    if (!currentWorkout || saving) return;
    setFinishConfirmOpen(false);
    setSaving(true);

    try {
      persistNow();
      const setDrafts = getAllSetDrafts();
      const exerciseDrafts = getAllExerciseDrafts();

      const unit: 'kg' | 'lbs' = profile?.unit_weight === 'lbs' ? 'lbs' : 'kg';
      const safeInt = (v: string) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };

      const setUpdates: PromiseLike<unknown>[] = [];
      setDrafts.forEach((draft, setId) => {
        const updates: Record<string, unknown> = {};
        if (draft.weight_kg !== undefined) updates.weight_kg = draftLoadToKg(draft.weight_kg, unit);
        if (draft.reps !== undefined) updates.reps = draft.reps === '' ? 0 : safeInt(draft.reps);
        if (draft.rir !== undefined) updates.rir = draft.rir === '' ? 0 : safeInt(draft.rir);
        if (draft.set_type !== undefined) updates.set_type = draft.set_type;
        if (draft.duration_seconds !== undefined) updates.duration_seconds = draft.duration_seconds === '' ? null : safeInt(draft.duration_seconds);
        if (draft.tempo !== undefined) updates.tempo = draft.tempo === '' ? null : draft.tempo;
        if (draft.cluster_rest_seconds !== undefined) updates.cluster_rest_seconds = draft.cluster_rest_seconds === '' ? null : safeInt(draft.cluster_rest_seconds);
        if (draft.cluster_reps_per_burst !== undefined) updates.cluster_reps_per_burst = draft.cluster_reps_per_burst === '' ? null : safeInt(draft.cluster_reps_per_burst);
        if (draft.myo_is_activation !== undefined) updates.myo_is_activation = draft.myo_is_activation;
        if (draft.drop_percentage !== undefined) updates.drop_percentage = draft.drop_percentage === '' ? null : safeInt(draft.drop_percentage);
        if (Object.keys(updates).length > 0) {
          setUpdates.push(
            supabase.from('workout_sets').update(updates).eq('id', setId)
          );
        }
      });

      const exerciseUpdates: PromiseLike<unknown>[] = [];
      exerciseDrafts.forEach((draft, exerciseId) => {
        const updates: Record<string, unknown> = {};
        if (draft.notes !== undefined) updates.notes = draft.notes;
        if (Object.keys(updates).length > 0) {
          exerciseUpdates.push(
            supabase.from('workout_exercises').update(updates).eq('id', exerciseId)
          );
        }
      });

      const results = await Promise.all([...setUpdates, ...exerciseUpdates]) as Array<{ error: { message: string } | null }>;
      const writeFailed = results.find(r => r?.error)?.error;
      if (writeFailed) {
        toast(userFacingError(writeFailed.message, t('errors.generic')), 'error');
        return;
      }

      const workoutUpdates: Record<string, unknown> = {};
      if (workoutName !== currentWorkout.name) workoutUpdates.name = workoutName;
      if (workoutDate && workoutDate !== currentWorkout.date) workoutUpdates.date = workoutDate;
      if (Object.keys(workoutUpdates).length > 0) {
        const { error } = await supabase.from('workouts').update(workoutUpdates).eq('id', currentWorkout.id);
        if (error) {
          toast(userFacingError(error.message, t('errors.generic')), 'error');
          return;
        }
      }

      const paused = pauseTimer(timer);
      const finalDuration = Math.max(1, Math.floor(currentElapsedMs(paused) / 1000));
      const finished = await updateWorkout(currentWorkout.id, {
        completed: true,
        duration_seconds: finalDuration,
      });
      if (finished.error) {
        toast(finished.error === 'quota' ? t('workout.syncQuota') : userFacingError(finished.error, t('errors.generic')), 'error');
        return;
      }
      clearSessionTimer(currentWorkout.id);
      clearFieldDrafts(currentWorkout.id);

      const mergeDrafts = (workout: Workout): Workout => ({
        ...workout,
        name: workoutName || workout.name,
        exercises: (workout.exercises ?? []).map(ex => ({
          ...ex,
          sets: (ex.sets ?? []).map(s => {
            const draft = setDrafts.get(s.id);
            if (!draft) return s;
            return {
              ...s,
              weight_kg: draft.weight_kg !== undefined ? draftLoadToKg(draft.weight_kg, unit) : s.weight_kg,
              reps: draft.reps !== undefined ? (draft.reps === '' ? 0 : safeInt(draft.reps)) : s.reps,
              rir: draft.rir !== undefined ? (draft.rir === '' ? 0 : safeInt(draft.rir)) : s.rir,
              set_type: draft.set_type !== undefined ? draft.set_type : s.set_type,
              duration_seconds: draft.duration_seconds !== undefined ? (draft.duration_seconds === '' ? null : safeInt(draft.duration_seconds)) : s.duration_seconds,
              tempo: draft.tempo !== undefined ? (draft.tempo === '' ? null : draft.tempo) : s.tempo,
            };
          }),
        })),
      });

      await fetchWorkout(currentWorkout.id);
      const fresh = useWorkoutStore.getState().currentWorkout;
      const snapshot = mergeDrafts(fresh ?? currentWorkout);
      setSummaryDuration(finalDuration);
      setSummaryWorkout(snapshot);
    } finally {
      setSaving(false);
    }
  };

  if (summaryWorkout) {
    return (
      <WorkoutSummaryScreen
        workout={summaryWorkout}
        duration={summaryDuration}
        onClose={() => {
          const workoutId = summaryWorkout.id;
          setSummaryWorkout(null);
          void fetchWorkout(workoutId);
          navigate(`/workout/${workoutId}`, { replace: true });
        }}
      />
    );
  }

  if (initError) {
    return (
      <div className="px-4 pt-6">
        <PageHeader title={t('workout.title')} backTo="/workout" />
        <ErrorState title={t('workout.createFailed')} onRetry={() => navigate('/workout')} />
      </div>
    );
  }

  if (!currentWorkout) {
    if (!isNew && lookupDone) {
      return (
        <div className="px-4 pt-6" data-testid="ux50-session-gone">
          <PageHeader title={t('workout.title')} backTo="/exercise-progress" />
          <EmptyState title={t('workout.sessionGone')} body={t('workout.sessionGoneHint')} />
        </div>
      );
    }
    return <PageSkeleton />;
  }

  if (lookupDone && id && currentWorkout.id !== id) {
    return (
      <div className="px-4 pt-6" data-testid="ux50-session-gone">
        <PageHeader title={t('workout.title')} backTo="/exercise-progress" />
        <EmptyState title={t('workout.sessionGone')} body={t('workout.sessionGoneHint')} />
      </div>
    );
  }

  if (currentWorkout.completed && !forceEdit) {
    return (
      <WorkoutRecap
        workout={currentWorkout}
        onEdit={() => setSearchParams({ edit: '1' })}
      />
    );
  }

  return (
    <div className="px-3 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-4" data-workout-logger="true">
      {/* Controls on one line, the session name on its own line: never cut to « L… ». */}
      <div className="flex items-center gap-1">
        <IconButton label={t('common.back')} onClick={handleBack} className="-ml-1 shrink-0">
          <ArrowLeft size={20} />
        </IconButton>
        <div className="flex-1" />
        <div className="flex items-center shrink-0">
          <SessionTimer elapsedSeconds={elapsedSeconds} running={timer.running} onToggle={toggleSessionTimer} />
          {restEnabled && (
          <IconButton
            label={t('workout.restTimer.title')}
            onClick={() => handleStartRestTimer()}
          >
            <Timer size={18} />
          </IconButton>
          )}
          <Button type="button" size="sm" onClick={requestFinish} disabled={saving}>
            {saving ? t('common.saving') : t('workout.finishShort')}
          </Button>
          <IconButton label={t('workout.sessionMenu')} onClick={() => setSessionMenu(v => !v)}>
            <MoreVertical size={18} />
          </IconButton>
        </div>
      </div>
      <div className="mb-3 px-1 min-w-0">
        {isProgramSession ? (
          <h1 className="text-lg sm:text-xl font-semibold text-white break-words" data-testid="ux22-session-label">
            {planSessionLabel}
          </h1>
        ) : (
        <input
          value={workoutName}
          onChange={e => setWorkoutName(e.target.value)}
          placeholder={t('workout.workoutName')}
          aria-label={t('workout.workoutName')}
          className="w-full bg-transparent border-0 p-0 text-lg sm:text-xl font-semibold text-white placeholder-neutral-500 focus:outline-none focus:ring-0"
        />
        )}
      </div>
      {sessionMenu && (
        <div className="mb-3 rounded-xl border border-neutral-800 bg-neutral-950 p-2 space-y-1">
          {solo && (
            <button type="button" className="min-h-11 w-full rounded-lg px-3 text-left text-sm text-white hover:bg-neutral-800" onClick={() => { setSessionMenu(false); setAskOpen(true); }}>
              {t('soloAsk.label')}
            </button>
          )}
          <button type="button" className="min-h-11 w-full rounded-lg px-3 text-left text-sm text-rose-300 hover:bg-rose-500/10" onClick={() => { setSessionMenu(false); setAbandonOpen(true); }}>
            {t('workout.abandonSession')}
          </button>
        </div>
      )}

      {(currentWorkout.exercises?.length ?? 0) > 0 && <SetLegend />}

      {!isProgramSession && (state.offPlan || workoutName === t('nav.addWorkoutOffPlan')) && (
        <p data-testid="workout-off-plan-notice" className="mb-3 text-sm text-neutral-400">
          {t('workout.offPlanNotice')}
        </p>
      )}

      {askOpen && solo && user && currentWorkout && !currentWorkout.completed && (
        <SoloAskBar
          compact
          context={soloAskFromProfile('session', profile, {
            programName: currentWorkout.name || assignment?.program?.name || null,
            programExercises: (currentWorkout.exercises ?? []).map(ex => ex.name),
            recentLiftNames: (currentWorkout.exercises ?? []).map(ex => ex.name),
            currentExerciseName: (currentWorkout.exercises ?? []).find(ex =>
              (ex.sets ?? []).some(s => !s.completed),
            )?.name ?? currentWorkout.exercises?.slice(-1)[0]?.name ?? null,
            catalog: catalogExercises.map(ex => ({
              name: ex.name,
              primary_muscles: ex.primary_muscles,
              secondary_muscles: ex.secondary_muscles,
              equipment: ex.equipment,
            })),
            lastWeightKg: (currentWorkout.exercises ?? [])
              .flatMap(ex => (ex.sets ?? []).filter(isPerformedSet))
              .slice(-1)[0]?.weight_kg ?? null,
            lastReps: (currentWorkout.exercises ?? [])
              .flatMap(ex => (ex.sets ?? []).filter(isPerformedSet))
              .slice(-1)[0]?.reps ?? null,
            missedWeekday: new Date().getDay(),
          })}
          onApplyOnce={async (proposal) => {
            if (proposal.kind === 'swap_exercise') return;
            for (const idea of proposal.exercises) {
              const idx = useWorkoutStore.getState().currentWorkout?.exercises?.length ?? 0;
              const ex = await addExercise(currentWorkout.id, idea.name, idx, {
                prescribed_sets: idea.default_sets,
                prescribed_reps: idea.default_reps,
                prescribed_rir: idea.default_rir,
                prescribed_rest_seconds: idea.default_rest_seconds,
                prescribed_weight_kg: proposal.params.last && typeof proposal.params.last === 'string'
                  ? null
                  : null,
              });
              if (!ex) continue;
              const last = (currentWorkout.exercises ?? [])
                .flatMap(row => (row.sets ?? []).filter(isPerformedSet))
                .slice(-1)[0];
              for (let i = 0; i < idea.default_sets; i++) {
                const set = await addSet(ex.id, i);
                if (set && last) {
                  await updateSet(set.id, {
                    weight_kg: last.weight_kg,
                    reps: idea.default_reps,
                    rir: idea.default_rir,
                  });
                }
              }
            }
          }}
          onSave={async (proposal) => {
            if (proposal.kind !== 'plan_shift' || proposal.shiftWeekday == null) return;
            const program = assignment?.program;
            if (!program || !user) {
              toast(t('programs.createFailed'), 'error');
              return;
            }
            const from = new Date().getDay();
            const days = shiftProgramWeekdays(
              (program.days ?? []).map(d => ({
                weekday: d.weekday,
                name: d.name,
                exercises: (d.exercises ?? []).map(ex => ({
                  name: ex.name,
                  default_sets: ex.default_sets,
                  default_reps: ex.default_reps,
                  default_reps_min: ex.default_reps_min,
                  default_rir: ex.default_rir,
                  default_rest_seconds: ex.default_rest_seconds,
                  default_weight_kg: ex.default_weight_kg,
                })),
              })),
              from,
              proposal.shiftWeekday,
            );
            const { error } = await saveProgram(program.id, {
              name: program.name,
              description: program.description ?? '',
              duration_weeks: program.duration_weeks,
            }, days, program.updated_at);
            if (error) {
              toast(error, 'error');
              return;
            }
            toast(t('programs.created'));
            await fetchMyAssignment(user.id);
          }}
        />
      )}

      {(!online || pendingOps > 0) && (
        <div
          className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2"
          role="status"
        >
          {!online ? <CloudOff size={14} className="text-amber-400 shrink-0" /> : null}
          <p className="text-xs text-amber-200/90 flex-1">
            {!online
              ? pendingOps > 0
                ? `${t('workout.syncOffline')} ${t('workout.syncPending', { n: pendingOps })}`
                : t('workout.syncOffline')
              : t('workout.syncPending', { n: pendingOps })}
          </p>
          {online && pendingOps > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void syncOfflineQueue()}
            >
              <RefreshCw size={14} /> {t('workout.syncRetry')}
            </Button>
          )}
        </div>
      )}

      {deadOps > 0 && (
        <div
          className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 space-y-2"
          role="alert"
        >
          <p className="text-xs text-rose-200/90 flex items-center gap-2">
            <AlertTriangle size={14} className="text-rose-400 shrink-0" />
            {t('workout.syncDeadLetter', { n: deadOps })}
          </p>
          {peekDeadLetterOps().map(op => (
            <div key={op.id} className="flex items-start gap-2">
              <p className="text-xs text-rose-200/70 flex-1">
                {t(offlineOpLabelKey(op.type))}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void retryDeadLetter(op.id)}
              >
                <RefreshCw size={14} /> {t('workout.syncDeadRetry')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {!isProgramSession && sessionMenu && (
      <div className="mb-4">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5 px-1">{t('workout.sessionDate')}</p>
        <DateInput
          aria-label={t('workout.sessionDate')}
          value={workoutDate}
          onChange={dateStr => setWorkoutDate(dateStr)}
        />
      </div>
      )}

      <div className="space-y-4">
        {(currentWorkout.exercises?.length ?? 0) === 0 && (
          <EmptyState title={t('workout.emptySession')} />
        )}
        {(() => {
          const exercises = currentWorkout.exercises ?? [];
          const rendered = new Set<string>();
          const items: React.ReactNode[] = [];

          for (const ex of exercises) {
            if (rendered.has(ex.id)) continue;

            if (ex.superset_group_id) {
              const group = exercises.filter(e => e.superset_group_id === ex.superset_group_id);
              group.forEach(g => rendered.add(g.id));
              items.push(
                <SupersetGroup
                  key={`ss-${ex.superset_group_id}`}
                  exercises={group}
                  onStartRestTimer={handleStartRestTimer}
                />
              );
            } else {
              rendered.add(ex.id);
              items.push(
                <ExerciseCard
                  key={ex.id}
                  exercise={ex}
                  onStartRestTimer={handleStartRestTimer}
                />
              );
            }
          }
          return items;
        })()}
      </div>

      <div className="mt-4 space-y-3">
        {!isProgramSession && (
        <Button variant="secondary" onClick={() => setShowExercisePicker(true)} className="w-full">
          <Plus size={16} /> {t('workout.addExercise')}
        </Button>
        )}
        {/* Any athlete can keep a free session as a personal routine (Vision §7.1). */}
        {user && !isProgramSession && (currentWorkout.exercises?.length ?? 0) > 0 && (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            data-save-routine="true"
            onClick={async () => {
              const name = (workoutName || t('soloAsk.namedDay')).trim();
              const routineId = await createRoutine({ user_id: user.id, name, description: '' });
              if (!routineId) {
                toast(t('programs.createFailed'), 'error');
                return;
              }
              for (const [i, ex] of (currentWorkout.exercises ?? []).entries()) {
                await addRoutineExercise(routineId, {
                  name: ex.name,
                  order_index: i,
                  default_sets: ex.sets?.length || ex.prescribed_sets || 3,
                  default_reps: ex.prescribed_reps || ex.sets?.[0]?.reps || 8,
                  default_rest_seconds: ex.prescribed_rest_seconds ?? 90,
                  catalog_exercise_id: ex.catalog_exercise_id ?? null,
                });
              }
              toast(t('workout.savedAsRoutine'));
              navigate('/routines');
            }}
          >
            {t('workout.saveAsRoutine')}
          </Button>
        )}
      </div>

      {restEnabled && (
      <RestTimer
        key={restEpoch}
        open={showTimer}
        onClose={() => setShowTimer(false)}
        onReopen={() => setShowTimer(true)}
        initialSeconds={restDuration}
        autoStart={restAutoStart}
      />
      )}
      <ExercisePicker open={showExercisePicker} onClose={() => setShowExercisePicker(false)} onSelect={handleAddExercise} multiple />
      <Modal
        open={abandonOpen}
        onClose={() => setAbandonOpen(false)}
        title={t('workout.abandonTitle')}
      >
        <p className="text-neutral-300 mb-6">{t('workout.abandonBody')}</p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setAbandonOpen(false)} className="flex-1">{t('common.cancel')}</Button>
          <Button onClick={() => void abandonSession()} className="flex-1">{t('workout.abandonSession')}</Button>
        </div>
      </Modal>
      <Modal
        open={finishConfirmOpen}
        onClose={() => setFinishConfirmOpen(false)}
        title={t('workout.finishIncompleteTitle')}
      >
        <p className="text-neutral-300 mb-6">
          {t('workout.finishIncompleteBody', {
            count: incompleteWorkingSets(currentWorkout?.exercises).length,
          })}
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setFinishConfirmOpen(false)} className="flex-1">
            {t('workout.backToSession')}
          </Button>
          <Button onClick={() => void handleFinish()} className="flex-1" disabled={saving}>
            {t('workout.finishAnyway')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default function WorkoutForm() {
  return (
    <FullPageLayout>
      <WorkoutDraftProvider>
        <WorkoutFormInner />
      </WorkoutDraftProvider>
    </FullPageLayout>
  );
}
