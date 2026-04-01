import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Clock, ChevronRight, Dumbbell, Trash2, Repeat, Play, TrendingUp } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useRoutineStore } from '../../stores/routineStore';
import { formatDate, formatDuration } from '../../lib/utils';
import type { RoutineExercise } from '../../lib/types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import PageTransition from '../ui/PageTransition';

export default function WorkoutPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { workouts, loading, fetchWorkouts, deleteWorkout, createWorkout, addExercise, addSet } = useWorkoutStore();
  const { routines, loading: routinesLoading, fetchRoutines, fetchRoutineWithExercises } = useRoutineStore();
  const [filter, setFilter] = useState<'all' | 'completed' | 'incomplete'>('all');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [startingRoutine, setStartingRoutine] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchWorkouts(user.id);
      fetchRoutines(user.id);
    }
  }, [user]);

  const filtered = workouts.filter(w => {
    if (filter === 'completed') return w.completed;
    if (filter === 'incomplete') return !w.completed;
    return true;
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await deleteWorkout(deleteTarget);
    setDeleting(false);
    setDeleteTarget(null);
  };

  const startFromRoutine = async (routineId: string) => {
    if (!user) return;
    setStartingRoutine(routineId);
    const routine = await fetchRoutineWithExercises(routineId);
    if (!routine) { setStartingRoutine(null); return; }

    const exercises = (routine as unknown as { routine_exercises?: RoutineExercise[] }).routine_exercises ?? routine.exercises ?? [];
    const workoutId = await createWorkout({
      user_id: user.id,
      name: routine.name,
      date: (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}T12:00:00`; })(),
      routine_id: routineId,
    });
    if (!workoutId) { setStartingRoutine(null); return; }

    for (const ex of exercises) {
      const addedEx = await addExercise(workoutId, ex.name, ex.order_index);
      if (addedEx) {
        for (let i = 0; i < ex.default_sets; i++) {
          await addSet(addedEx.id, i);
        }
      }
    }
    setStartingRoutine(null);
    navigate(`/workout/${workoutId}`);
  };

  const deleteTargetWorkout = workouts.find(w => w.id === deleteTarget);

  return (
    <PageTransition>
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between mb-6 animate-fade-in-down">
        <h1 className="text-2xl font-bold text-white">Workouts</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/exercise-progress')}
            className="p-2 rounded-xl bg-neutral-900 text-neutral-400 hover:text-white transition-colors"
            title="Exercise Progress"
          >
            <TrendingUp size={18} />
          </button>
          <Button onClick={() => navigate('/workout/new')} size="sm">
            <Plus size={16} /> New
          </Button>
        </div>
      </div>

      {!routinesLoading && routines.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">My Routines</h2>
            <button
              onClick={() => navigate('/routines')}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Manage
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
                  <p className="text-xs text-neutral-500 mt-0.5">{exercises.length} exercise{exercises.length !== 1 ? 's' : ''}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">History</h2>
        <div className="flex gap-1.5">
          {(['all', 'completed', 'incomplete'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors
                ${filter === f ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-400 hover:text-neutral-300'}`}
            >
              {f}
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
          <p className="text-neutral-400 mb-4">No workouts yet</p>
          <Button onClick={() => navigate('/workout/new')} size="sm">Start your first workout</Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((w, i) => (
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

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Workout">
        <p className="text-neutral-300 mb-6">
          Are you sure you want to delete <span className="font-semibold text-white">{deleteTargetWorkout?.name || 'this workout'}</span>? This action cannot be undone.
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
