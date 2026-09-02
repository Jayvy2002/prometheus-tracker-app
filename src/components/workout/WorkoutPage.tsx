import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Clock, ChevronRight, Dumbbell, Trash2, Repeat, Play, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast, toastWithUndo } from '../ui/Toast';
import { useAuthStore } from '../../stores/authStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useRoutineStore } from '../../stores/routineStore';
import { formatDate, formatDuration, todayStr } from '../../lib/utils';
import { lastCompletedWorkout, lastSessionFromWorkout } from '../../lib/coachLastSession';
import { startWorkoutFromTemplate } from '../../lib/startWorkout';
import { isCoachedAthlete } from '../../lib/coachRole';
import type { Workout } from '../../lib/types';
import { useCoachingStore } from '../../stores/coachingStore';

import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import PageTransition from '../ui/PageTransition';
import AnimatedList from '../ui/AnimatedList';
import GymLoader from '../ui/GymLoader';
import SessionReadout from './SessionReadout';

export default function WorkoutPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { workouts, loading, fetchWorkouts, fetchWorkout, peekWorkout, deleteWorkout, createWorkout, restoreExercise } = useWorkoutStore();
  const { routines, loading: routinesLoading, fetchRoutines, fetchRoutineWithExercises } = useRoutineStore();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const coached = isCoachedAthlete(coachingRole, myCoach);

  const [filter, setFilter] = useState<'all' | 'completed' | 'incomplete'>('all');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [startingRoutine, setStartingRoutine] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(20);
  const [lastFull, setLastFull] = useState<Workout | null>(null);

  const PAGE_SIZE = 20;

  useEffect(() => {
    if (user) {
      fetchWorkouts(user.id);
      fetchRoutines(user.id);
    }
  }, [user]);

  const lastCompleted = lastCompletedWorkout(workouts, todayStr());
  const lastCompletedId = lastCompleted?.id ?? '';

  useEffect(() => {
    if (!lastCompletedId) {
      setLastFull(null);
      return;
    }
    let cancelled = false;
    peekWorkout(lastCompletedId).then(full => {
      if (!cancelled) setLastFull(full);
    });
    return () => { cancelled = true; };
  }, [lastCompletedId, peekWorkout]);

  const filtered = workouts.filter(w => {
    if (filter === 'completed') return w.completed;
    if (filter === 'incomplete') return !w.completed;
    return true;
  });

  const displayed = filtered.slice(0, displayCount);
  const hasMore = filtered.length > displayCount;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const targetWorkout = workouts.find(w => w.id === deleteTarget);
    setDeleting(true);

    try {
      await fetchWorkout(deleteTarget);
      const { currentWorkout: fullWorkout } = useWorkoutStore.getState();

      await deleteWorkout(deleteTarget);

      if (targetWorkout) {
        toastWithUndo(`"${targetWorkout.name}" deleted`, async () => {
          if (!user) return;
          const restoredId = await createWorkout({
            user_id: user.id,
            name: targetWorkout.name,
            date: targetWorkout.date,
            duration_seconds: targetWorkout.duration_seconds,
            notes: targetWorkout.notes,
            completed: targetWorkout.completed,
            routine_id: targetWorkout.routine_id,
          });
          if (restoredId && fullWorkout?.exercises?.length) {
            for (const ex of fullWorkout.exercises) {
              await restoreExercise(restoredId, ex);
            }
          }
          toast(t('workout.restored'), 'success');
        });
      } else {
        toast(t('workout.deleted'), 'info');
      }
    } catch {
      toast(t('workout.deleteFailed'), 'error');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const startFromRoutine = async (routineId: string) => {
    if (!user) return;
    setStartingRoutine(routineId);
    try {
      const routine = await fetchRoutineWithExercises(routineId);
      if (!routine) return;
      const workoutId = await startWorkoutFromTemplate({
        userId: user.id,
        name: routine.name,
        routineId,
        exercises: (routine.exercises ?? []).map(ex => ({
          name: ex.name,
          default_sets: ex.default_sets,
          default_reps: ex.default_reps,
          order_index: ex.order_index,
        })),
      });
      if (!workoutId) {
        toast(t('workout.startRoutineFailed'), 'error');
        return;
      }
      navigate(`/workout/${workoutId}`);
    } catch {
      toast(t('workout.startRoutineFailed'), 'error');
    } finally {
      setStartingRoutine(null);
    }
  };

  const deleteTargetWorkout = workouts.find(w => w.id === deleteTarget);

  const filterLabels = {
    all: t('workout.filters.all'),
    completed: t('workout.filters.completed'),
    incomplete: t('workout.filters.incomplete'),
  };

  return (
    <PageTransition>
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between mb-6 animate-fade-in-down">
        <h1 className="text-2xl font-bold text-white">{t('workout.title')}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/exercise-progress')}
            className="p-2 rounded-xl bg-neutral-900 text-neutral-400 hover:text-white transition-colors"
          >
            <TrendingUp size={18} />
          </button>
          <Button onClick={() => navigate('/workout/new')} size="sm">
            <Plus size={16} /> {t('common.new')}
          </Button>
        </div>
      </div>

      {!coached && !routinesLoading && routines.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">{t('workout.myRoutines')}</h2>
            <button
              onClick={() => navigate('/routines')}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              {t('common.manage')}
            </button>
          </div>
          <AnimatedList className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {routines.map(r => {
              const exercises = r.exercises ?? [];
              const isStarting = startingRoutine === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => !isStarting && startFromRoutine(r.id)}
                  disabled={isStarting}
                  className="flex-shrink-0 w-40 text-left disabled:opacity-60"
                >
                  <Card className="!p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
                        <Repeat size={14} />
                      </div>
                      <div className="w-6 h-6 rounded-full bg-blue-600/10 text-blue-400 flex items-center justify-center ml-auto">
                        {isStarting ? (
                          <Play size={10} className="animate-pulse" fill="currentColor" />
                        ) : (
                          <Play size={10} fill="currentColor" />
                        )}
                      </div>
                    </div>
                    <p className="text-sm font-medium text-white truncate">{r.name}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {exercises.length} {exercises.length !== 1 ? t('workout.exercises') : t('workout.exercise')}
                    </p>
                  </Card>
                </button>
              );
            })}
          </AnimatedList>
        </div>
      )}

      {lastCompleted && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">{t('workout.lastSession')}</h2>
            <button
              type="button"
              onClick={() => navigate(`/workout/${lastCompleted.id}`)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {t('workout.lastSessionOpen')}
            </button>
          </div>
          <Card className="!p-4">
            <p className="text-sm font-medium text-white truncate">{lastCompleted.name || t('workout.title')}</p>
            <p className="text-xs text-neutral-500 mb-3">{formatDate(lastCompleted.date)}</p>
            {lastFull && lastFull.id === lastCompleted.id ? (
              <SessionReadout session={lastSessionFromWorkout(lastFull)} />
            ) : null}
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">{t('workout.history')}</h2>
        <div className="flex gap-1.5">
          {(['all', 'completed', 'incomplete'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setDisplayCount(PAGE_SIZE); }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors
                ${filter === f ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-400 hover:text-neutral-300'}`}
            >
              {filterLabels[f]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <GymLoader size="sm" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12">
          <Dumbbell className="mx-auto mb-3 text-neutral-600" size={32} />
          <p className="text-neutral-400 mb-4">{t('workout.noWorkoutsYet')}</p>
          <Button onClick={() => navigate('/workout/new')} size="sm">{t('workout.startFirstWorkout')}</Button>
        </Card>
      ) : (
        <AnimatedList className="space-y-2">
          {displayed.map(w => (
            <Card
              key={w.id}
              className="flex items-center gap-3"
            >
              <div
                className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                onClick={() => navigate(`/workout/${w.id}`)}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                  ${w.completed ? 'bg-blue-600/20 text-blue-400' : 'bg-neutral-800 text-neutral-400'}`}>
                  <Dumbbell size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{w.name || 'Workout'}</p>
                  <p className="text-xs text-neutral-500">{formatDate(w.date)}</p>
                </div>
                {w.duration_seconds > 0 && (
                  <div className="flex items-center gap-1 text-xs text-neutral-500">
                    <Clock size={12} />
                    {formatDuration(w.duration_seconds)}
                  </div>
                )}
                <ChevronRight size={16} className="text-neutral-600 shrink-0" />
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(w.id); }}
                className="p-2 rounded-lg text-neutral-600 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
              >
                <Trash2 size={16} />
              </button>
            </Card>
          ))}
        </AnimatedList>
      )}

      {hasMore && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={() => setDisplayCount(c => c + PAGE_SIZE)}
            className="px-5 py-2 rounded-xl bg-neutral-900 border border-neutral-800/50 text-sm text-neutral-400 hover:text-white hover:border-neutral-700 transition-all"
          >
            {t('workout.loadMore', { count: filtered.length - displayCount })}
          </button>
        </div>
      )}


      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t('workout.deleteTitle')}>
        <p className="text-neutral-300 mb-6">
          {t('workout.deleteConfirm').replace('this workout', deleteTargetWorkout?.name || 'this workout')}
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} className="flex-1" disabled={deleting}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={handleDelete} className="flex-1" disabled={deleting}>
            {deleting ? t('common.deleting') : t('common.delete')}
          </Button>
        </div>
      </Modal>
    </div>
    </PageTransition>
  );
}
