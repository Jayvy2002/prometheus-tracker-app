import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Clock, ChevronRight, Dumbbell, Trash2, Repeat, Play, TrendingUp, Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast, toastWithUndo } from '../ui/Toast';
import { useAuthStore } from '../../stores/authStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useRoutineStore } from '../../stores/routineStore';
import { formatDate, formatDuration } from '../../lib/utils';
import type { RoutineExercise } from '../../lib/types';
import { usePremium, FREE_LIMITS } from '../../hooks/usePremium';
import { usePaywallStore } from '../../stores/paywallStore';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import PageTransition from '../ui/PageTransition';

export default function WorkoutPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { workouts, loading, fetchWorkouts, fetchWorkout, deleteWorkout, createWorkout, addExercise, addSet, restoreExercise } = useWorkoutStore();
  const { routines, loading: routinesLoading, fetchRoutines, fetchRoutineWithExercises } = useRoutineStore();
  const { canViewWorkout, isPremium } = usePremium();
  const { openPaywall } = usePaywallStore();
  const [filter, setFilter] = useState<'all' | 'completed' | 'incomplete'>('all');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [startingRoutine, setStartingRoutine] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(20);

  const PAGE_SIZE = 20;

  useEffect(() => {
    if (user) {
      fetchWorkouts(user.id);
      fetchRoutines(user.id);
    }
  }, [user]);

  const filtered = workouts.filter(w => {
    if (!canViewWorkout(w.date)) return false;
    if (filter === 'completed') return w.completed;
    if (filter === 'incomplete') return !w.completed;
    return true;
  });

  const hiddenCount = workouts.filter(w => !canViewWorkout(w.date)).length;

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
    let workoutId: string | null = null;
    try {
      const routine = await fetchRoutineWithExercises(routineId);
      if (!routine) return;

      const exercises = (routine as unknown as { routine_exercises?: RoutineExercise[] }).routine_exercises ?? routine.exercises ?? [];
      const now = new Date();
      workoutId = await createWorkout({
        user_id: user.id,
        name: routine.name,
        date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T12:00:00`,
        routine_id: routineId,
      });
      if (!workoutId) return;

      for (const ex of exercises) {
        const addedEx = await addExercise(workoutId, ex.name, ex.order_index);
        if (addedEx) {
          for (let i = 0; i < ex.default_sets; i++) {
            await addSet(addedEx.id, i);
          }
        }
      }
      navigate(`/workout/${workoutId}`);
    } catch {
      if (workoutId) await deleteWorkout(workoutId);
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

      {!routinesLoading && routines.length > 0 && (
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
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {routines.map((r, i) => {
              const exercises = (r as unknown as { routine_exercises?: RoutineExercise[] }).routine_exercises ?? r.exercises ?? [];
              const isStarting = startingRoutine === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => !isStarting && startFromRoutine(r.id)}
                  disabled={isStarting}
                  className="flex-shrink-0 w-40 bg-neutral-900/60 border border-neutral-800/50 rounded-xl p-3 text-left hover:border-blue-600/40 hover:bg-neutral-800 transition-all group disabled:opacity-60 animate-fade-in-scale"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
                      <Repeat size={14} />
                    </div>
                    <div className="w-6 h-6 rounded-full bg-blue-600/10 text-blue-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                      {isStarting ? (
                        <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Play size={10} fill="currentColor" />
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-medium text-white truncate">{r.name}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {exercises.length} {exercises.length !== 1 ? t('workout.exercises') : t('workout.exercise')}
                  </p>
                </button>
              );
            })}
          </div>
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
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-800 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-neutral-800 rounded-md w-2/3" />
                  <div className="h-3 bg-neutral-800/70 rounded-md w-1/3" />
                </div>
                <div className="w-10 h-3 bg-neutral-800 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12">
          <Dumbbell className="mx-auto mb-3 text-neutral-600" size={32} />
          <p className="text-neutral-400 mb-4">{t('workout.noWorkoutsYet')}</p>
          <Button onClick={() => navigate('/workout/new')} size="sm">{t('workout.startFirstWorkout')}</Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {displayed.map((w, i) => (
            <div key={w.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
            <Card
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
            </div>
          ))}
        </div>
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

      {!isPremium && hiddenCount > 0 && (
        <button
          onClick={() => openPaywall('Historique illimité', `${hiddenCount} séance${hiddenCount > 1 ? 's' : ''} masquée${hiddenCount > 1 ? 's' : ''} car antérieure${hiddenCount > 1 ? 's' : ''} à ${FREE_LIMITS.workoutHistoryDays} jours. Passez à Premium pour accéder à tout votre historique.`)}
          className="mt-3 w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/20 hover:bg-amber-500/12 transition-colors"
        >
          <Crown size={14} className="text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300 flex-1 text-left">
            {hiddenCount} {t('workout.hiddenSession')}{hiddenCount > 1 ? 's' : ''} — {t('workout.unlockFullHistory')}
          </p>
        </button>
      )}

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t('workout.deleteTitle')}>
        <p className="text-neutral-300 mb-6">
          {t('workout.deleteConfirm').replace('this workout', deleteTargetWorkout?.name || 'this workout')}
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} className="flex-1" disabled={deleting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleDelete} className="flex-1 !bg-red-600 hover:!bg-red-700" disabled={deleting}>
            {deleting ? t('common.deleting') : t('common.delete')}
          </Button>
        </div>
      </Modal>
    </div>
    </PageTransition>
  );
}
