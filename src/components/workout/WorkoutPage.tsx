import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight, Dumbbell, Trash2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast, toastWithUndo } from '../ui/Toast';
import { useAuthStore } from '../../stores/authStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { formatDate, formatDuration, formatWeight, programWeekNumber } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { lastCompletedWorkout, lastSessionFromWorkout } from '../../lib/coachLastSession';
import { startWorkoutFromTemplate } from '../../lib/startWorkout';
import { toWorkoutTemplateExercise } from '../../lib/programSetPrescription';
import { isCoachedAthlete } from '../../lib/coachRole';
import { useResourcePermissions } from '../../lib/useResourcePermissions';
import { isProgramDayDue, resolveAssignmentGymCard } from '../../lib/clientGym';
import { assignStartLabel } from '../../lib/programWrite';
import type { ProgramDay, Workout } from '../../lib/types';
import { useCoachingStore } from '../../stores/coachingStore';
import { useProgramStore } from '../../stores/programStore';
import { useProfileStore } from '../../stores/profileStore';
import { useProgramCivilClock } from '../../features/programs/hooks/useProgramCivilClock';
import { effectiveVersionStart } from '../../features/programs/domain/programPhases';
import { isPerformedSet } from '../../lib/performedSets';
import SoloAskBar from '../solo/SoloAskBar';
import type { SoloAskContext } from '../../lib/soloAsk';
import { shiftProgramWeekdays } from '../../lib/soloAsk';
import { loadMessageDraft, saveMessageDraft } from '../../lib/messageDrafts';

import Card from '../ui/Card';
import Button from '../ui/Button';
import { useRoutineStore } from '../../stores/routineStore';
import PageTransition from '../ui/PageTransition';
import SessionReadout from './SessionReadout';
import ClientGymCard from '../dashboard/ClientGymCard';

export default function WorkoutPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { workouts, loading, workoutsExhausted, fetchWorkouts, fetchOlderWorkouts, fetchWorkout, peekWorkout, deleteWorkout, restoreExercise } = useWorkoutStore();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const assignment = useProgramStore(s => s.assignment);
  const fetchMyAssignment = useProgramStore(s => s.fetchMyAssignment);
  const createProgram = useProgramStore(s => s.createProgram);
  const saveProgram = useProgramStore(s => s.saveProgram);
  const { profile } = useProfileStore();
  const programClock = useProgramCivilClock();
  const { canUpdateOwnAssignedProgram: canEditOwnPlan, canProposeAssignedProgramChange } = useResourcePermissions();
  const coached = isCoachedAthlete(coachingRole, myCoach);

  const [filter, setFilter] = useState<'all' | 'completed'>('all');
  const [askOpen, setAskOpen] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, { volume: number; names: string[] }>>({});
  const routines = useRoutineStore(s => s.routines);
  const fetchRoutines = useRoutineStore(s => s.fetchRoutines);
  const [startingGym, setStartingGym] = useState(false);
  const [displayCount, setDisplayCount] = useState(20);
  const [lastFull, setLastFull] = useState<Workout | null>(null);

  const PAGE_SIZE = 20;
  const gymCard = resolveAssignmentGymCard({
    assignment,
    workouts,
    todayWeekday: programClock.weekday,
    todayDate: programClock.today,
  });


  useEffect(() => {
    if (user) {
      fetchWorkouts(user.id);
      void fetchMyAssignment(user.id);
      void fetchRoutines(user.id);
    }
  }, [user, coached]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastCompleted = lastCompletedWorkout(workouts, programClock.today);
  const lastCompletedId = lastCompleted?.id ?? '';
  const lastPerformed = (lastFull?.exercises ?? [])
    .flatMap(ex => (ex.sets ?? []).filter(isPerformedSet))
    .slice(-1)[0];

  const askContext: Omit<SoloAskContext, 'question'> = {
    surface: 'workout',
    injuries: profile?.injuries_limitations ?? '',
    experience: profile?.training_experience ?? '',
    frequency: profile?.training_frequency ?? 0,
    focus: profile?.training_focus ?? '',
    programName: assignment?.program?.name ?? null,
    programExercises: (assignment?.program?.days ?? []).flatMap(d => (d.exercises ?? []).map(e => e.name)),
    recentLiftNames: workouts.slice(0, 5).map(w => w.name),
    calorieTarget: profile?.daily_calorie_target ?? 0,
    proteinTarget: profile?.protein_target ?? 0,
    carbsTarget: profile?.carbs_target ?? 0,
    fatTarget: profile?.fat_target ?? 0,
    consumedCalories: 0,
    consumedProtein: 0,
    consumedCarbs: 0,
    consumedFat: 0,
    allergies: profile?.food_allergies ?? [],
    dietType: profile?.diet_type ?? 'omnivore',
    currentExerciseName: null,
    catalog: [],
    lastWeightKg: lastPerformed?.weight_kg ?? null,
    lastReps: lastPerformed?.reps ?? null,
    lastRestSeconds: null,
    missedWeekday: new Date().getDay(),
    coachName: myCoach?.full_name ?? null,
  };

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

  const filtered = workouts.filter(w => filter === 'completed' ? w.completed : true);

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

  const handleDelete = async (id: string) => {
    const targetWorkout = workouts.find(w => w.id === id);
    try {
      await fetchWorkout(id);
      const { currentWorkout: fullWorkout } = useWorkoutStore.getState();

      await deleteWorkout(id);

      if (targetWorkout) {
        toastWithUndo(t('workout.deletedNamed', { name: targetWorkout.name }), async () => {
          if (!user) return;
          const { error: restoreError } = await supabase.from('workouts').insert({
            id: targetWorkout.id,
            user_id: user.id,
            name: targetWorkout.name,
            date: targetWorkout.date,
            duration_seconds: targetWorkout.duration_seconds,
            notes: targetWorkout.notes,
            completed: targetWorkout.completed,
            routine_id: targetWorkout.routine_id,
            program_day_id: targetWorkout.program_day_id ?? null,
            program_assignment_id: targetWorkout.program_assignment_id ?? null,
            program_phase_id: targetWorkout.program_phase_id ?? null,
            program_id: targetWorkout.program_id ?? null,
          });
          const restoredId = restoreError ? null : targetWorkout.id;
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
        exercises: (day.exercises ?? []).map((ex, i) => toWorkoutTemplateExercise(ex, i)),
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


  const filterLabels = {
    all: t('workout.filters.all'),
    completed: t('workout.filters.completed'),
  };

  const displayedIds = displayed.map(w => w.id).join(',');
  useEffect(() => {
    const ids = displayedIds ? displayedIds.split(',') : [];
    if (ids.length === 0) return;
    let cancelled = false;
    void supabase
      .from('workout_exercises')
      .select('workout_id, name, order_index, workout_sets(weight_kg, reps, completed)')
      .in('workout_id', ids)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const grouped: Record<string, { volume: number; names: string[] }> = {};
        for (const row of data as Array<{ workout_id: string; name: string; order_index: number; workout_sets: Array<{ weight_kg: number; reps: number; completed: boolean }> | null }>) {
          const bucket = grouped[row.workout_id] ?? { volume: 0, names: [] };
          bucket.names.push(row.name);
          for (const set of row.workout_sets ?? []) {
            if (set.completed && set.weight_kg > 0 && set.reps > 0) bucket.volume += Number(set.weight_kg) * Number(set.reps);
          }
          grouped[row.workout_id] = bucket;
        }
        setSummaries(grouped);
      });
    return () => { cancelled = true; };
  }, [displayedIds]);

  return (
    <PageTransition>
    <div className="px-3 pt-5 sm:px-4 sm:pt-6">
      <div className="flex items-center justify-between gap-3 mb-6 animate-fade-in-down">
        <h1 className="text-2xl font-bold text-white min-w-0 truncate">{t('workout.title')}</h1>
        <button type="button" aria-label={t('soloAsk.label')} onClick={() => setAskOpen(v => !v)} className="min-h-11 min-w-11 rounded-xl text-neutral-300">
          <Sparkles size={18} />
        </button>
        <Button
          onClick={() => navigate('/workout/new', { state: isProgramDayDue(gymCard) ? { offPlan: true } : undefined })}
          size="sm"
          className="shrink-0"
        >
          <Plus size={16} /> {isProgramDayDue(gymCard) ? t('nav.addWorkoutOffPlan') : t('common.new')}
        </Button>
      </div>

      {askOpen && canEditOwnPlan && user && (
        <SoloAskBar
          context={askContext}
          onApplyOnce={async (proposal) => {
            const workoutId = await startWorkoutFromTemplate({
              userId: user.id,
              name: proposal.dayName || t('workout.title'),
              exercises: proposal.exercises,
            });
            if (!workoutId) {
              toast(t('workout.startRoutineFailed'), 'error');
              return;
            }
            navigate(`/workout/${workoutId}`);
          }}
          onSave={async (proposal) => {
            if (proposal.kind === 'plan_shift') {
              const program = assignment?.program;
              if (!program || proposal.shiftWeekday == null) {
                toast(t('programs.createFailed'), 'error');
                return;
              }
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
                askContext.missedWeekday ?? new Date().getDay(),
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
              return;
            }
            const name = proposal.dayName.trim() || t('soloAsk.namedDay');
            const id = await createProgram({
              owner_id: user.id,
              name,
              description: '',
              duration_weeks: 1,
            }, [{
              weekday: new Date().getDay(),
              name,
              routine_id: null,
              order_index: 0,
              exercises: proposal.exercises,
            }]);
            if (!id) {
              toast(t('programs.createFailed'), 'error');
              return;
            }
            toast(t('programs.created'));
            navigate('/programs');
          }}
        />
      )}

      {askOpen && canProposeAssignedProgramChange && user && myCoach && (
        <>
        <p className="text-xs text-neutral-500 mb-2" data-testid="ux19-assigned-plan-untouched">
          {t('coaching.ux19.assignedPlanUntouched')}
        </p>
        <SoloAskBar
          context={{ ...askContext, surface: 'coached', coachName: myCoach.full_name }}
          onApplyOnce={() => undefined}
          onSave={(proposal) => {
            const prev = loadMessageDraft(user.id, myCoach.id);
            saveMessageDraft(
              user.id,
              myCoach.id,
              [prev, proposal.messageDraft].filter(Boolean).join('\n\n'),
            );
            toast(t('soloAsk.saveDraft'));
            navigate('/messages');
          }}
        />
        </>
      )}

      {routines.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-neutral-300 mb-2">{t('nav.routines')}</h2>
          <div className="space-y-2">
            {routines.slice(0, 3).map(routine => (
              <button
                key={routine.id}
                type="button"
                className="min-h-11 w-full rounded-xl bg-neutral-900 px-3 text-left text-sm text-white"
                onClick={() => navigate('/workout/new', { state: { routineId: routine.id } })}
              >
                {routine.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {assignment?.program && gymCard.kind !== 'none' && (
        <ClientGymCard
          card={gymCard}
          programName={assignment.program.name}
          programWeek={programWeekNumber(
            effectiveVersionStart(assignment.start_date, assignment.program.phase_anchor_on) ?? assignment.start_date,
            assignment.program.duration_weeks,
            programClock.today,
          )}
          durationWeeks={assignment.program.duration_weeks}
          starting={startingGym}
          onStart={startProgramDay}
          onContinue={workoutId => navigate(`/workout/${workoutId}`)}
          onEditPlan={canEditOwnPlan ? () => navigate('/programs') : undefined}
          phaseName={gymCard.phase?.name}
          plannedChange={assignment.program.scheduled_activates_on
            ? t('programs.plannedChangeOn', {
              date: assignStartLabel(assignment.program.scheduled_activates_on, i18n.language),
            })
            : null}
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

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">{t('workout.history')}</h2>
        <div className="flex gap-1.5">
          {(['all', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setDisplayCount(PAGE_SIZE); }}
              className={`min-h-11 px-3 rounded-lg text-xs font-medium capitalize transition-colors
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
          <Button
            onClick={() => navigate('/workout/new', { state: isProgramDayDue(gymCard) ? { offPlan: true } : undefined })}
            size="sm"
          >
            {isProgramDayDue(gymCard) ? t('nav.addWorkoutOffPlan') : t('workout.startFirstWorkout')}
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {displayed.map((w) => {
            const summary = summaries[w.id];
            const names = summary?.names ?? [];
            const preview = names.slice(0, 3).join(', ');
            const extra = names.length > 3 ? t('workout.historyMore', { count: names.length - 3 }) : '';
            const unit = profile?.unit_weight === 'lbs' ? 'lbs' : 'kg';
            return (
            <Card key={w.id} className="flex items-center gap-3">
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
                  <p className="text-sm text-neutral-400">
                    {formatDate(w.date)}
                    {w.duration_seconds > 0 ? ` · ${formatDuration(w.duration_seconds)}` : ''}
                    {summary && summary.volume > 0 ? ` · ${formatWeight(summary.volume, unit)}` : ''}
                  </p>
                  {preview ? <p className="text-sm text-neutral-500 truncate">{preview}{extra ? ` ${extra}` : ''}</p> : null}
                </div>
                <ChevronRight size={16} className="text-neutral-600 shrink-0" />
              </div>
              <button
                type="button"
                aria-label={t('common.delete')}
                onClick={(e) => { e.stopPropagation(); void handleDelete(w.id); }}
                className="min-h-11 min-w-11 rounded-lg text-neutral-500 hover:text-red-400"
              >
                <Trash2 size={16} className="mx-auto" />
              </button>
            </Card>
            );
          })}
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


    </div>
    </PageTransition>
  );
}
