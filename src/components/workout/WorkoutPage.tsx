import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Plus, Clock, ChevronRight, Dumbbell, Trash2, CalendarRange } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast, toastWithUndo } from '../ui/Toast';
import { useAuthStore } from '../../stores/authStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { formatDate, formatDuration, todayStr, programWeekNumber } from '../../lib/utils';
import { lastCompletedWorkout, lastSessionFromWorkout } from '../../lib/coachLastSession';
import { startWorkoutFromTemplate } from '../../lib/startWorkout';
import { isCoachedAthlete } from '../../lib/coachRole';
import { resolveClientGymCard, isProgramDayDue } from '../../lib/clientGym';
import type { ProgramDay, Workout } from '../../lib/types';
import { useCoachingStore } from '../../stores/coachingStore';
import { useProgramStore } from '../../stores/programStore';

import Card from '../ui/Card';
import CardLink from '../ui/CardLink';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import PageTransition from '../ui/PageTransition';
import SessionReadout from './SessionReadout';
import ClientGymCard from '../dashboard/ClientGymCard';

export default function WorkoutPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { workouts, loading, workoutsExhausted, fetchWorkouts, fetchOlderWorkouts, fetchWorkout, peekWorkout, deleteWorkout, createWorkout, restoreExercise } = useWorkoutStore();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const assignment = useProgramStore(s => s.assignment);
  const fetchMyAssignment = useProgramStore(s => s.fetchMyAssignment);
  const coached = isCoachedAthlete(coachingRole, myCoach);

  const [filter, setFilter] = useState<'all' | 'completed' | 'incomplete'>('all');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [startingGym, setStartingGym] = useState(false);
  const [displayCount, setDisplayCount] = useState(20);
  const [lastFull, setLastFull] = useState<Workout | null>(null);

  const PAGE_SIZE = 20;
  const gymCard = resolveClientGymCard({
    hasActiveProgram: assignment?.status === 'active' && !!assignment.program,
    days: assignment?.program?.days,
    workouts,
    todayWeekday: new Date().getDay(),
    todayDate: todayStr(),
    assignmentId: assignment?.id,
  });


  useEffect(() => {
    if (user) {
      fetchWorkouts(user.id);
      void fetchMyAssignment(user.id);
    }
  }, [user, coached]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const hasMoreLocal = filtered.length > displayCount;
  const canFetchOlder = !hasMoreLocal && !workoutsExhausted && filtered.length > 0;

  const handleShowMore = () => {
    if (hasMoreLocal) {
      setDisplayCount(c => c + PAGE_SIZE);
      return;
    }
    // Q05 : l'historique continue sur le serveur — on charge la page suivante.
    if (user && canFetchOlder) {
      void fetchOlderWorkouts(user.id).then(() => setDisplayCount(c => c + PAGE_SIZE));
    }
  };

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

  const startProgramDay = async (day: ProgramDay) => {
    if (!user || !assignment?.program) return;
    setStartingGym(true);
    try {
      const workoutId = await startWorkoutFromTemplate({
        userId: user.id,
        name: day.name || assignment.program.name,
        programAssignmentId: assignment.id,
        programDayId: day.id,
        exercises: (day.exercises ?? []).map(ex => ({
          name: ex.name,
          default_sets: ex.default_sets,
          default_reps: ex.default_reps,
          default_reps_min: ex.default_reps_min,
          default_rir: ex.default_rir,
          default_rest_seconds: ex.default_rest_seconds,
          default_weight_kg: ex.default_weight_kg,
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
      setStartingGym(false);
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
          <Plus size={16} /> {isProgramDayDue(gymCard) ? t('nav.addWorkoutOffPlan') : t('common.new')}
        </Button>
      </div>

      {(coached || !assignment?.program) && (
        <CardLink to="/programs" className="mb-4 flex items-center gap-3">
          <CalendarRange size={16} className="text-blue-400 shrink-0" />
          <span className="text-sm font-medium text-white flex-1">{t('nav.myProgram')}</span>
          <ChevronRight size={16} className="text-neutral-600" />
        </CardLink>
      )}

      <CardLink to="/exercise-progress" className="mb-4 flex items-center gap-3">
        <TrendingUp size={16} className="text-blue-400 shrink-0" />
        <span className="text-sm font-medium text-white flex-1">{t('nav.exerciseProgress')}</span>
        <ChevronRight size={16} className="text-neutral-600" />
      </CardLink>

      {assignment?.program && gymCard.kind !== 'none' && (
        <ClientGymCard
          card={gymCard}
          programName={assignment.program.name}
          programWeek={programWeekNumber(assignment.start_date, assignment.program.duration_weeks)}
          durationWeeks={assignment.program.duration_weeks}
          starting={startingGym}
          onStart={startProgramDay}
          onContinue={workoutId => navigate(`/workout/${workoutId}`)}
          onEditPlan={!coached ? () => navigate('/programs') : undefined}
        />
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
          <Button onClick={() => navigate('/workout/new')} size="sm">
            {isProgramDayDue(gymCard) ? t('nav.addWorkoutOffPlan') : t('workout.startFirstWorkout')}
          </Button>
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
                  <p className="font-medium text-white truncate">{w.name || t('workout.unnamed')}</p>
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

      {(hasMoreLocal || canFetchOlder) && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={handleShowMore}
            disabled={loading}
            className="px-5 py-2 rounded-xl bg-neutral-900 border border-neutral-800/50 text-sm text-neutral-400 hover:text-white hover:border-neutral-700 transition-all disabled:opacity-50"
          >
            {hasMoreLocal
              ? t('workout.loadMore', { count: filtered.length - displayCount })
              : t('workout.loadOlder')}
          </button>
        </div>
      )}


      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t('workout.deleteTitle')}>
        <p className="text-neutral-300 mb-6">
          {t('workout.deleteConfirm', { name: deleteTargetWorkout?.name || t('workout.unnamed') })}
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
