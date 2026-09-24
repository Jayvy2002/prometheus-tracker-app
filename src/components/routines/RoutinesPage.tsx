import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Repeat, Trash2, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useRoutineStore } from '../../stores/routineStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { formatDate } from '../../lib/utils';

import Card from '../ui/Card';
import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';
import PageTransition from '../ui/PageTransition';
import RoutineForm from './RoutineForm';
import { startWorkoutFromTemplate } from '../../lib/startWorkout';
import type { Routine } from '../../lib/types';

/**
 * Routines = reusable sessions (Vision §7.1). Solo and Coaché both keep them:
 * a program, even one assigned by a coach, never forbids another routine.
 */
export default function RoutinesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { routines, loading, fetchRoutines, deleteRoutine, fetchRoutineWithExercises } = useRoutineStore();
  const { workouts, fetchWorkouts } = useWorkoutStore();

  const [showForm, setShowForm] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchRoutines(user.id);
    if (workouts.length === 0) fetchWorkouts(user.id);
  }, [user]);

  const getRoutineStats = (routineId: string) => {
    const used = workouts.filter(w => w.routine_id === routineId && w.completed);
    if (used.length === 0) return null;
    const sorted = [...used].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return {
      count: used.length,
      lastDate: sorted[0].date,
    };
  };

  const startFromRoutine = async (routineId: string) => {
    if (!user || starting) return;
    setStarting(routineId);
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
      if (workoutId) navigate(`/workout/${workoutId}`);
    } finally {
      setStarting(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await deleteRoutine(deleteTarget);
    setDeleting(false);
    setDeleteTarget(null);
  };

  const openNew = () => {
    setEditingRoutine(null);
    setShowForm(true);
  };

  const deleteTargetRoutine = routines.find(r => r.id === deleteTarget);

  return (
    <PageTransition>
    <div className="px-4 pt-6 pb-28">
      <PageHeader
        title={t('routines.title')}
        subtitle={t('routines.subtitle')}
        backTo="/workout"
        actions={routines.length > 0 ? (
          <Button onClick={openNew} size="sm">
            <Plus size={16} aria-hidden="true" /> {t('common.new')}
          </Button>
        ) : undefined}
      />

      {loading ? (
        <div className="text-center py-12 text-neutral-500">{t('common.loading')}</div>
      ) : routines.length === 0 ? (
        <Card className="text-center py-12">
          <Repeat className="mx-auto mb-3 text-neutral-600" size={32} aria-hidden="true" />
          <p className="text-neutral-400 mb-4">{t('routines.noRoutines')}</p>
          <Button onClick={openNew} size="sm">{t('routines.createFirstRoutine')}</Button>
        </Card>
      ) : (
        <ul className="space-y-3">
          {routines.map(r => {
            const exercises = r.exercises ?? [];
            const stats = getRoutineStats(r.id);
            return (
              <li key={r.id}>
                <Card>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditingRoutine(r); setShowForm(true); }}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                      aria-label={t('routines.edit', { name: r.name })}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400" aria-hidden="true">
                        <Repeat size={18} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-white">{r.name}</span>
                        <span className="block text-xs text-neutral-500">
                          {exercises.length} {exercises.length !== 1 ? t('routines.exercises') : t('routines.exercise')}
                          {stats && <> · {stats.count}× · {t('routines.lastUsed', { date: formatDate(stats.lastDate) })}</>}
                        </span>
                      </span>
                    </button>
                    <IconButton
                      label={t('routines.remove', { name: r.name })}
                      onClick={() => setDeleteTarget(r.id)}
                      className="text-neutral-600 hover:text-rose-400"
                    >
                      <Trash2 size={16} />
                    </IconButton>
                    <IconButton
                      label={t('routines.start', { name: r.name })}
                      loading={starting === r.id}
                      onClick={() => void startFromRoutine(r.id)}
                      className="bg-blue-600 text-white hover:bg-blue-500 hover:text-white"
                    >
                      <Play size={16} />
                    </IconButton>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {showForm && (
        <RoutineForm
          routine={editingRoutine}
          onClose={() => { setShowForm(false); setEditingRoutine(null); if (user) fetchRoutines(user.id); }}
        />
      )}

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t('routines.deleteTitle')}>
        <p className="text-neutral-300 mb-1 font-semibold">{deleteTargetRoutine?.name}</p>
        <p className="text-sm text-neutral-400 mb-6">{t('routines.deleteConfirm')}</p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} className="flex-1" disabled={deleting}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={handleDelete} className="flex-1" loading={deleting}>
            {t('common.delete')}
          </Button>
        </div>
      </Modal>
    </div>
    </PageTransition>
  );
}
