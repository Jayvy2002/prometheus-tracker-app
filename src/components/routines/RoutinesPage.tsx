import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Repeat, ChevronRight, Trash2, Play, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useRoutineStore } from '../../stores/routineStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import PageTransition from '../ui/PageTransition';
import RoutineForm from './RoutineForm';
import type { Routine, RoutineExercise } from '../../lib/types';

export default function RoutinesPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { routines, loading, fetchRoutines, deleteRoutine, fetchRoutineWithExercises } = useRoutineStore();
  const { createWorkout, addExercise, addSet } = useWorkoutStore();
  const [showForm, setShowForm] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user) fetchRoutines(user.id);
  }, [user]);

  const startFromRoutine = async (routineId: string) => {
    if (!user) return;
    const routine = await fetchRoutineWithExercises(routineId);
    if (!routine) return;

    const exercises = (routine as unknown as { routine_exercises?: RoutineExercise[] }).routine_exercises ?? routine.exercises ?? [];
    const workoutId = await createWorkout({
      user_id: user.id,
      name: routine.name,
      date: new Date().toISOString(),
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
          <h1 className="text-2xl font-bold text-white">Routines</h1>
        </div>
        <Button onClick={() => { setEditingRoutine(null); setShowForm(true); }} size="sm">
          <Plus size={16} /> New
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-neutral-500">Loading...</div>
      ) : routines.length === 0 ? (
        <Card className="text-center py-12">
          <Repeat className="mx-auto mb-3 text-neutral-600" size={32} />
          <p className="text-neutral-400 mb-4">No routines yet</p>
          <Button onClick={() => setShowForm(true)} size="sm">Create your first routine</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {routines.map((r, i) => {
            const exercises = (r as unknown as { routine_exercises?: RoutineExercise[] }).routine_exercises ?? r.exercises ?? [];
            return (
              <div key={r.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
              <Card className="group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
                    <Repeat size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{r.name}</p>
                    <p className="text-xs text-neutral-500">{exercises.length} exercises</p>
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

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Routine">
        <p className="text-neutral-300 mb-6">
          Are you sure you want to delete <span className="font-semibold text-white">{deleteTargetRoutine?.name || 'this routine'}</span>? This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} className="flex-1" disabled={deleting}>
            Cancel
          </Button>
          <Button onClick={handleDelete} className="flex-1 !bg-red-600 hover:!bg-red-700" disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </Modal>
    </div>
    </PageTransition>
  );
}
