import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Clock, ChevronRight, Dumbbell, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast, toastWithUndo } from '../ui/Toast';
import { useAuthStore } from '../../stores/authStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { formatDate, formatDuration, todayStr } from '../../lib/utils';
import { lastCompletedWorkout, lastSessionFromWorkout } from '../../lib/coachLastSession';
import type { Workout } from '../../lib/types';

import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import PageTransition from '../ui/PageTransition';
import SessionReadout from './SessionReadout';

export default function WorkoutPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { workouts, loading, fetchWorkouts, fetchWorkout, peekWorkout, deleteWorkout, createWorkout, restoreExercise } = useWorkoutStore();

  const [filter, setFilter] = useState<'all' | 'completed' | 'incomplete'>('all');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [displayCount, setDisplayCount] = useState(20);
  const [lastFull, setLastFull] = useState<Workout | null>(null);

  const PAGE_SIZE = 20;

  useEffect(() => {
    if (user) {
      fetchWorkouts(user.id);
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
        <Button onClick={() => navigate('/workout/new')} size="sm">
          <Plus size={16} /> {t('common.new')}
        </Button>
      </div>

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
