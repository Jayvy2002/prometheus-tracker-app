import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import FullPageLayout from '../layout/FullPageLayout';
import { ArrowLeft, Plus, Check, Timer, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { supabase } from '../../lib/supabase';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import IconButton from '../ui/IconButton';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import { PageSkeleton } from '../ui/PageSkeleton';
import PageHeader from '../ui/PageHeader';
import { toast } from '../ui/Toast';
import { userFacingError } from '../../lib/userFacingError';
import { incompleteWorkingSets, shouldConfirmIncompleteFinish } from '../../lib/workoutFinish';
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
import {
  loadSessionTimer, saveSessionTimer, clearSessionTimer,
  currentElapsedMs, startTimer, pauseTimer, emptyTimer,
  type SessionTimerState,
} from '../../lib/sessionTimer';
import type { Workout, WorkoutTemplateExercise } from '../../lib/types';
import { useClientTracking } from '../../lib/useClientTracking';
import { showTrainingField } from '../../lib/clientTracking';
import { useOnline } from '../../lib/useOnline';
import { peekDeadLetterOps } from '../../lib/offlineQueue';

interface LocationState {
  routineId?: string;
  programAssignmentId?: string;
  programDayId?: string;
  programName?: string;
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
    currentWorkout, fetchWorkout, createWorkout, updateWorkout, deleteWorkout, addExercise, addSet, setCurrentWorkout,
    pendingOps, deadOps, syncOfflineQueue, retryDeadLetter,
  } = useWorkoutStore();
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
  const [saving, setSaving] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [summaryWorkout, setSummaryWorkout] = useState<Workout | null>(null);
  const [summaryDuration, setSummaryDuration] = useState(0);
  const [initError, setInitError] = useState(false);
  const [timer, setTimer] = useState<SessionTimerState>(emptyTimer());
  const [elapsedTick, setElapsedTick] = useState(0);
  const createdRef = useRef(false);
  const routineAppliedRef = useRef(false);
  const leavingRef = useRef(false);
  const { fetchRoutineWithExercises } = useRoutineStore();
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
            exercises = (data ?? []).map((ex, i) => ({
              name: ex.name as string,
              default_sets: (ex.default_sets as number) ?? 3,
              default_reps: (ex.default_reps as number) ?? 10,
              default_reps_min: (ex.default_reps_min as number | null) ?? null,
              default_rir: (ex.default_rir as number | null) ?? null,
              default_rest_seconds: (ex.default_rest_seconds as number) ?? 90,
              default_weight_kg: (ex.default_weight_kg as number | null) ?? null,
              order_index: (ex.order_index as number) ?? i,
            }));
            if (!name) {
              const { data: day } = await supabase.from('program_days').select('name').eq('id', state.programDayId).maybeSingle();
              name = (day?.name as string) || t('workout.title');
            }
          } else if (routineId) {
            const routine = await fetchRoutineWithExercises(routineId);
            if (routine) {
              name = routine.name;
              exercises = (routine.exercises ?? []).map(ex => ({
                name: ex.name,
                default_sets: ex.default_sets,
                default_reps: ex.default_reps,
                order_index: ex.order_index,
              }));
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
        const workoutId = await createWorkout({ user_id: user.id, name: '', date: localDate });
        if (!workoutId) {
          if (useWorkoutStore.getState().queueBlocked === 'quota') {
            toast(t('workout.syncQuota'), 'error');
          }
          setInitError(true);
          return;
        }
        navigate(`/workout/${workoutId}`, { replace: true });
      };

      seed().catch(() => setInitError(true));
    } else if (id) {
      fetchWorkout(id);
    }
  }, [user, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentWorkout || !routineId || routineAppliedRef.current || !isNew) return;
    // Seeding is handled in startWorkoutFromTemplate for /new + routineId.
    routineAppliedRef.current = true;
  }, [currentWorkout?.id, routineId, isNew]);

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

  const elapsedSeconds = Math.floor(currentElapsedMs(timer) / 1000);
  void elapsedTick;

  const toggleSessionTimer = () => {
    const next = timer.running ? pauseTimer(timer) : startTimer(timer);
    setTimer(next);
    if (currentWorkout) saveSessionTimer(currentWorkout.id, next);
  };

  const workoutIsEmpty = () => {
    if (!currentWorkout) return true;
    const exercises = currentWorkout.exercises ?? [];
    if (exercises.length === 0) return true;
    return !exercises.some(ex => (ex.sets ?? []).some(s => s.weight_kg > 0 || s.reps > 0 || (s.duration_seconds ?? 0) > 0));
  };

  const handleBack = async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    persistNow();
    if (currentWorkout) {
      saveSessionTimer(currentWorkout.id, pauseTimer(timer));
      const seconds = Math.floor(currentElapsedMs(timer) / 1000);
      if (seconds > 0 && !currentWorkout.completed) {
        await updateWorkout(currentWorkout.id, { duration_seconds: seconds });
      }
      if (!currentWorkout.completed && workoutIsEmpty()) {
        await deleteWorkout(currentWorkout.id);
        clearSessionTimer(currentWorkout.id);
        clearFieldDrafts(currentWorkout.id);
      }
    }
    setCurrentWorkout(null);
    navigate(currentWorkout?.program_day_id ? '/dashboard' : '/workout');
  };

  const handleAddExercise = async (name: string) => {
    if (!currentWorkout) return;
    const idx = currentWorkout.exercises?.length ?? 0;
    const ex = await addExercise(currentWorkout.id, name, idx);
    if (ex) await addSet(ex.id, 0);
    setShowExercisePicker(false);
  };

  const handleStartRestTimer = (overrideDuration?: number) => {
    if (typeof overrideDuration === 'number' && overrideDuration > 0) {
      setRestDuration(overrideDuration);
      setRestAutoStart(true);
      setRestEpoch(n => n + 1);
    } else {
      setRestAutoStart(false);
    }
    setShowTimer(true);
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

      const safeFloat = (v: string) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
      const safeInt = (v: string) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };

      const setUpdates: PromiseLike<unknown>[] = [];
      setDrafts.forEach((draft, setId) => {
        const updates: Record<string, unknown> = {};
        if (draft.weight_kg !== undefined) updates.weight_kg = draft.weight_kg === '' ? 0 : safeFloat(draft.weight_kg);
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

      const mergedExercises = (currentWorkout.exercises ?? []).map(ex => ({
        ...ex,
        sets: (ex.sets ?? []).map(s => {
          const draft = setDrafts.get(s.id);
          if (!draft) return s;
          return {
            ...s,
            weight_kg: draft.weight_kg !== undefined ? (draft.weight_kg === '' ? 0 : safeFloat(draft.weight_kg)) : s.weight_kg,
            reps: draft.reps !== undefined ? (draft.reps === '' ? 0 : safeInt(draft.reps)) : s.reps,
            rir: draft.rir !== undefined ? (draft.rir === '' ? 0 : safeInt(draft.rir)) : s.rir,
            set_type: draft.set_type !== undefined ? draft.set_type : s.set_type,
            duration_seconds: draft.duration_seconds !== undefined ? (draft.duration_seconds === '' ? null : safeInt(draft.duration_seconds)) : s.duration_seconds,
            tempo: draft.tempo !== undefined ? (draft.tempo === '' ? null : draft.tempo) : s.tempo,
          };
        }),
      }));

      const snapshot = { ...currentWorkout, name: workoutName || currentWorkout.name, exercises: mergedExercises };
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
    return <PageSkeleton />;
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
    <div className="px-4 pt-4 pb-6">
      <div className="flex items-center gap-3 mb-4">
        <IconButton label={t('common.back')} onClick={handleBack} className="-ml-2">
          <ArrowLeft size={20} />
        </IconButton>
        {isProgramSession ? (
          <p className="flex-1 text-lg font-semibold text-white truncate">{workoutName || t('workout.title')}</p>
        ) : (
        <Input
          value={workoutName}
          onChange={e => setWorkoutName(e.target.value)}
          placeholder={t('workout.workoutName')}
          className="text-lg font-semibold bg-transparent border-0 px-0 focus:ring-0"
        />
        )}
        <SessionTimer elapsedSeconds={elapsedSeconds} running={timer.running} onToggle={toggleSessionTimer} />
        {restEnabled && (
        <IconButton
          label={t('workout.restTimer.title')}
          onClick={() => handleStartRestTimer()}
        >
          <Timer size={18} />
        </IconButton>
        )}
      </div>

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
              <p className="text-xs text-rose-200/70 flex-1 break-all">
                {op.type}{op.lastError ? ` — ${op.lastError}` : ''}
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

      {!isProgramSession && (
      <div className="mb-4">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5 px-1">{t('workout.sessionDate')}</p>
        <DateInput
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
        <Button onClick={requestFinish} disabled={saving} className="w-full">
          <Check size={16} /> {saving ? t('common.saving') : t('workout.finishWorkout')}
        </Button>
      </div>

      {restEnabled && (
      <RestTimer
        key={restEpoch}
        open={showTimer}
        onClose={() => setShowTimer(false)}
        initialSeconds={restDuration}
        autoStart={restAutoStart}
      />
      )}
      <ExercisePicker open={showExercisePicker} onClose={() => setShowExercisePicker(false)} onSelect={handleAddExercise} />
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
