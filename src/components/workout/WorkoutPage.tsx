import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight, ChevronDown, ChevronUp, Dumbbell, Trash2, Sparkles, Play, Repeat } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast, toastWithUndo } from '../ui/Toast';
import { useAuthStore } from '../../stores/authStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { formatDate, formatDuration, programWeekNumber } from '../../lib/utils';
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
import Modal from '../ui/Modal';
import { canUndoWorkoutDelete } from '../../features/workout/domain/workoutUndo';
import { pickNextRoutine, routineTemplateExercises } from '../../features/workout/domain/nextRoutine';
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
  const [confirmDelete, setConfirmDelete] = useState<Workout | null>(null);
  const [summaries, setSummaries] = useState<Record<string, { names: string[] }>>({});
  const routines = useRoutineStore(s => s.routines);
  const fetchRoutines = useRoutineStore(s => s.fetchRoutines);
  const fetchRoutineWithExercises = useRoutineStore(s => s.fetchRoutineWithExercises);
  const [routinesReady, setRoutinesReady] = useState(false);
  const [startingRoutine, setStartingRoutine] = useState(false);
  const [lastDetailOpen, setLastDetailOpen] = useState(false);
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
      void fetchRoutines(user.id).finally(() => setRoutinesReady(true));
    }
  }, [user, coached]); // eslint-disable-line react-hooks/exhaustive-deps

  // Solo without a plan for today: offer the next routine, same rule as the Dashboard.
  const hasActiveProgram = !!assignment?.program && assignment.status === 'active';
  const showsGymCard = !!assignment?.program && gymCard.kind !== 'none';
  const soloWithoutPlan = !coached && !hasActiveProgram && !showsGymCard;
  const alreadyTrainedToday = workouts.some(w => w.completed && w.date?.startsWith(programClock.today));
  const nextRoutine = soloWithoutPlan ? pickNextRoutine(routines, programClock.weekday, alreadyTrainedToday) : null;
  const showRoutineIntro = soloWithoutPlan && routinesReady && routines.length === 0;
  const otherRoutines = nextRoutine ? routines.filter(r => r.id !== nextRoutine.routine.id) : routines;

  // A refused start is always said (toast), never a button that silently does nothing.
  const startRoutine = async (routineId: string) => {
    if (!user || startingRoutine) return;
    setStartingRoutine(true);
    try {
      const routine = await fetchRoutineWithExercises(routineId);
      if (!routine) {
        toast(t('workout.startRoutineFailed'), 'error');
        return;
      }
      const workoutId = await startWorkoutFromTemplate({
        userId: user.id,
        name: routine.name,
        routineId,
        exercises: routineTemplateExercises(routine.exercises),
      });
      if (workoutId) navigate(`/workout/${workoutId}`);
      else toast(t('workout.startRoutineFailed'), 'error');
    } catch {
      toast(t('workout.startRoutineFailed'), 'error');
    } finally {
      setStartingRoutine(false);
    }
  };

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

  // Undo re-creates a free or routine session only; success is said once the rows are back.
  const restoreDeleted = async (target: Workout, full: Workout | null) => {
    if (!user) return;
    const { error: restoreError } = await supabase.from('workouts').insert({
      id: target.id,
      user_id: user.id,
      name: target.name,
      date: target.date,
      duration_seconds: target.duration_seconds,
      notes: target.notes,
      completed: target.completed,
      routine_id: target.routine_id ?? null,
      session_started_at: target.session_started_at ?? null,
    });
    if (restoreError) {
      toast(t('workout.restoreFailed'), 'error');
      return;
    }
    let complete = true;
    for (const ex of full?.exercises ?? []) {
      if (!(await restoreExercise(target.id, ex))) complete = false;
    }
    await fetchWorkouts(user.id);
    toast(t(complete ? 'workout.restored' : 'workout.restoreFailed'), complete ? 'success' : 'error');
  };

  const handleDelete = async (id: string) => {
    const targetWorkout = workouts.find(w => w.id === id);
    try {
      await fetchWorkout(id);
      const { currentWorkout: fullWorkout } = useWorkoutStore.getState();

      await deleteWorkout(id);

      if (targetWorkout && canUndoWorkoutDelete(targetWorkout)) {
        toastWithUndo(t('workout.deletedNamed', { name: targetWorkout.name }), () => restoreDeleted(targetWorkout, fullWorkout));
      } else {
        toast(t('workout.deleted'), 'info');
      }
    } catch {
      toast(t('workout.deleteFailed'), 'error');
    }
  };

  // A program session cannot be undone: it is deleted only after an explicit yes.
  const requestDelete = (w: Workout) => {
    if (canUndoWorkoutDelete(w)) void handleDelete(w.id);
    else setConfirmDelete(w);
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
      .select('workout_id, name, order_index')
      .in('workout_id', ids)
      .order('order_index')
      .then(({ data }) => {
        if (cancelled || !data) return;
        const grouped: Record<string, { names: string[] }> = {};
        for (const row of data as Array<{ workout_id: string; name: string; order_index: number }>) {
          const bucket = grouped[row.workout_id] ?? { names: [] };
          bucket.names.push(row.name);
          grouped[row.workout_id] = bucket;
        }
        setSummaries(grouped);
      });
    return () => { cancelled = true; };
  }, [displayedIds]);

  return (
    <PageTransition>
    <div className="px-3 pt-5 sm:px-4 sm:pt-6">
      {/* The title never breaks mid-word: on a narrow phone the actions wrap below it. */}
      <div className="flex flex-wrap items-center gap-2 mb-6 animate-fade-in-down">
        <h1 className="mr-auto text-2xl font-bold text-white whitespace-nowrap">{t('workout.title')}</h1>
        <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          aria-label={t('soloAsk.label')}
          aria-expanded={askOpen}
          onClick={() => setAskOpen(v => !v)}
          className={`min-h-11 shrink-0 rounded-xl flex items-center justify-center gap-1.5 px-3 text-sm font-medium ${askOpen ? 'bg-blue-600/20 text-blue-300' : 'text-neutral-300 hover:bg-neutral-800'}`}
        >
          <Sparkles size={16} aria-hidden="true" />
          <span aria-hidden="true">{t('soloAsk.short')}</span>
        </button>
        <Button
          onClick={() => navigate('/workout/new', { state: isProgramDayDue(gymCard) ? { offPlan: true } : undefined })}
          size="sm"
          variant={showsGymCard || nextRoutine ? 'secondary' : 'primary'}
          className="shrink-0"
        >
          <Plus size={16} aria-hidden="true" /> {t('nav.addWorkoutOffPlan')}
        </Button>
        </div>
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

      {nextRoutine && (
        <Card className="mb-4 !p-4 !border-blue-500/30 !bg-blue-600/10">
          <div className="flex items-start gap-3" data-testid="workout-next-routine">
            <div className="w-11 h-11 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0" aria-hidden="true">
              <Play size={18} className="text-blue-400 ml-0.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-blue-300">
                {t(nextRoutine.scheduledToday ? 'workout.nextRoutine.scheduledToday' : 'workout.nextRoutine.next')}
              </p>
              <p className="text-base font-semibold text-white line-clamp-2 break-words">{nextRoutine.routine.name}</p>
              {(nextRoutine.routine.exercises?.length ?? 0) > 0 ? (
                <p className="text-xs text-neutral-400 mt-0.5">
                  {t('workout.exerciseCount', { count: nextRoutine.routine.exercises?.length ?? 0 })}
                </p>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            className="mt-3 w-full"
            loading={startingRoutine}
            onClick={() => void startRoutine(nextRoutine.routine.id)}
          >
            {t('workout.nextRoutine.start')}
          </Button>
        </Card>
      )}

      {showRoutineIntro ? (
        <Card className="mb-4 !p-4">
          <div className="flex items-start gap-3" data-testid="workout-routine-intro">
            <div className="w-10 h-10 rounded-xl bg-neutral-800 text-neutral-300 flex items-center justify-center shrink-0" aria-hidden="true">
              <Repeat size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-white">{t('workout.routineIntro.title')}</h2>
              <p className="text-sm text-neutral-400 mt-1">{t('workout.routineIntro.body')}</p>
            </div>
          </div>
          <Button type="button" variant="secondary" className="mt-3 w-full" onClick={() => navigate('/routines')}>
            <Plus size={16} aria-hidden="true" /> {t('routines.createFirstRoutine')}
          </Button>
        </Card>
      ) : (
      /* Routines stay available with a program, coached or not (Vision §7.1). */
      <div className="mb-4" data-testid="workout-routines">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-neutral-300">{t('nav.routines')}</h2>
          <button type="button" onClick={() => navigate('/routines')} className="min-h-11 px-2 text-sm text-blue-400 hover:text-blue-300">
            {routines.length > 0 ? t('workout.seeAllRoutines') : t('routines.createFirstRoutine')}
          </button>
        </div>
        {otherRoutines.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {otherRoutines.slice(0, 6).map(routine => (
              <button
                key={routine.id}
                type="button"
                className="min-h-11 shrink-0 rounded-xl border border-neutral-800 bg-neutral-900 px-3 text-left text-sm text-white hover:border-neutral-700"
                onClick={() => navigate('/workout/new', { state: { routineId: routine.id } })}
              >
                {routine.name}
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      {lastCompleted && (() => {
        const detail = lastFull && lastFull.id === lastCompleted.id ? lastFull : null;
        const exerciseCount = detail?.exercises?.length ?? summaries[lastCompleted.id]?.names.length ?? 0;
        const facts = [
          formatDate(lastCompleted.date),
          exerciseCount > 0 ? t('workout.exerciseCount', { count: exerciseCount }) : '',
          lastCompleted.duration_seconds > 0 ? formatDuration(lastCompleted.duration_seconds) : '',
        ].filter(Boolean).join(' · ');
        return (
        <div className="mb-6" data-testid="workout-last-session">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">{t('workout.lastSession')}</h2>
            {/* Opens that finished session (its recap); it does not start a new one. */}
            <button
              type="button"
              onClick={() => navigate(`/workout/${lastCompleted.id}`)}
              className="min-h-11 px-2 text-xs text-blue-400 hover:text-blue-300"
            >
              {t('workout.lastSessionOpen')}
            </button>
          </div>
          <Card padding={false}>
            <button
              type="button"
              onClick={() => setLastDetailOpen(v => !v)}
              aria-expanded={lastDetailOpen}
              className="flex w-full min-h-11 items-center gap-3 px-4 py-3 text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{lastCompleted.name || t('workout.unnamed')}</p>
                <p className="text-xs text-neutral-500">{facts}</p>
              </div>
              <span className="shrink-0 inline-flex items-center gap-1 text-xs text-blue-400">
                {t(lastDetailOpen ? 'workout.lastSessionHideDetail' : 'workout.lastSessionShowDetail')}
                {lastDetailOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
              </span>
            </button>
            {lastDetailOpen && (
              <div className="px-4 pb-4">
                {detail ? (
                  <SessionReadout session={lastSessionFromWorkout(detail)} />
                ) : (
                  <div className="h-16 rounded-xl bg-neutral-800/60 animate-pulse" aria-busy="true" />
                )}
              </div>
            )}
          </Card>
        </div>
        );
      })()}

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
            {t('workout.startFirstWorkout')}
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {displayed.map((w) => {
            const summary = summaries[w.id];
            const names = summary?.names ?? [];
            const preview = names.slice(0, 3).join(', ');
            const extra = names.length > 3 ? t('workout.historyMore', { count: names.length - 3 }) : '';
            return (
            <Card key={w.id} className="flex items-center gap-3">
              <button
                type="button"
                className="flex items-center gap-3 flex-1 min-w-0 min-h-11 text-left"
                onClick={() => navigate(`/workout/${w.id}`)}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                  ${w.completed ? 'bg-blue-600/20 text-blue-400' : 'bg-neutral-800 text-neutral-400'}`}>
                  <Dumbbell size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{w.name || t('workout.unnamed')}</p>
                  {/* Date, duration and exercises; the tonnage stays in the session detail. */}
                  <p className="text-sm text-neutral-400">
                    {formatDate(w.date)}
                    {w.duration_seconds > 0 ? ` · ${formatDuration(w.duration_seconds)}` : ''}
                  </p>
                  {preview ? <p className="text-sm text-neutral-500 truncate">{preview}{extra ? ` ${extra}` : ''}</p> : null}
                </div>
                <ChevronRight size={16} className="text-neutral-600 shrink-0" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t('common.delete')}
                onClick={(e) => { e.stopPropagation(); requestDelete(w); }}
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

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={t('common.delete')}>
        <p className="text-sm text-neutral-300 mb-6">
          {t('workout.deleteConfirm', { name: confirmDelete?.name || t('workout.unnamed') })}
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)} className="flex-1">
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => {
              const target = confirmDelete;
              setConfirmDelete(null);
              if (target) void handleDelete(target.id);
            }}
          >
            {t('common.delete')}
          </Button>
        </div>
      </Modal>
    </div>
    </PageTransition>
  );
}
