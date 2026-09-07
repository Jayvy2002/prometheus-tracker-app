import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Plus, Repeat, ChevronRight, Trash2, Play, ArrowLeft, BarChart2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useRoutineStore } from '../../stores/routineStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { isSoloAthlete } from '../../lib/coachRole';
import { formatDate } from '../../lib/utils';

import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import PageTransition from '../ui/PageTransition';
import RoutineForm from './RoutineForm';
import { startWorkoutFromTemplate } from '../../lib/startWorkout';
import type { Routine } from '../../lib/types';

export default function RoutinesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const { routines, loading, fetchRoutines, deleteRoutine, fetchRoutineWithExercises } = useRoutineStore();
  const { workouts, fetchWorkouts } = useWorkoutStore();

  const [showForm, setShowForm] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchRoutines(user.id);
    if (workouts.length === 0) fetchWorkouts(user.id);
  }, [user]);

  if (isSoloAthlete(coachingRole, myCoach)) {
    return <Navigate to="/programs" replace />;
  }

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
    if (!user) return;
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
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await deleteRoutine(deleteTarget);
    setDeleting(false);
    setDeleteTarget(null);
  };

  const deleteTargetRoutine = routines.find(r => r.id === deleteTarget);

  return (
    <PageTransition>
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/profile')}
            className="p-2 -ml-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-white">{t('routines.title')}</h1>
        </div>
        <Button
          onClick={() => {
            setEditingRoutine(null);
            setShowForm(true);
          }}
          size="sm"
        >
          <Plus size={16} /> {t('common.new')}
        </Button>
      </div>


      {loading ? (
        <div className="text-center py-12 text-neutral-500">{t('common.loading')}</div>
      ) : routines.length === 0 ? (
        <Card className="text-center py-12">
          <Repeat className="mx-auto mb-3 text-neutral-600" size={32} />
          <p className="text-neutral-400 mb-4">{t('routines.noRoutines')}</p>
          <Button onClick={() => setShowForm(true)} size="sm">{t('routines.createFirstRoutine')}</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {routines.map((r, i) => {
            const exercises = r.exercises ?? [];
            const stats = getRoutineStats(r.id);
            return (
              <div key={r.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
              <Card className="group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
                    <Repeat size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{r.name}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-xs text-neutral-500">
                        {exercises.length} {exercises.length !== 1 ? t('routines.exercises') : t('routines.exercise')}
                      </span>
                      {stats && (
                        <>
                          <span className="text-neutral-700">·</span>
                          <span className="flex items-center gap-1 text-xs text-neutral-500">
                            <BarChart2 size={10} className="text-neutral-600" />
                            {stats.count}×
                          </span>
                          <span className="text-neutral-700">·</span>
                          <span className="text-xs text-neutral-500">{t('routines.lastUsed', { date: formatDate(stats.lastDate) })}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startFromRoutine(r.id)}
                      className="p-2 rounded-lg text-blue-400 hover:bg-blue-600/20 transition-colors"
                    >
                      <Play size={16} />
                    </button>
                    <button
                      onClick={() => { setEditingRoutine(r); setShowForm(true); }}
                      className="p-2 rounded-lg text-neutral-400 hover:text-white transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(r.id)}
                      className="p-2 rounded-lg text-neutral-600 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </Card>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <RoutineForm
          routine={editingRoutine}
          onClose={() => { setShowForm(false); setEditingRoutine(null); if (user) fetchRoutines(user.id); }}
        />
      )}

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t('routines.deleteTitle')}>
        <p className="text-neutral-300 mb-6">
          {t('routines.deleteConfirm')} <span className="font-semibold text-white">{deleteTargetRoutine?.name}</span>
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
