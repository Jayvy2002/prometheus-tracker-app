import { useState, useEffect } from 'react';
import { Plus, ChevronDown, ChevronUp, Award, Disc3, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWorkoutStore } from '../../stores/workoutStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { useClientTracking } from '../../lib/useClientTracking';
import { repsInputMode, showTrainingField } from '../../lib/clientTracking';
import { showLoggingRir } from '../../lib/clientGym';
import { isCoachedAthlete, isSoloAthlete } from '../../lib/coachRole';
import { useCoachingStore } from '../../stores/coachingStore';
import type { WorkoutExercise, WorkoutSet } from '../../lib/types';
import { formatWeight, kgToLbs } from '../../lib/utils';
import { useProfileStore } from '../../stores/profileStore';
import Card from '../ui/Card';
import { useDraftContext } from './WorkoutDraftContext';
import { toastWithUndo } from '../ui/Toast';
import { isPerformedSet } from '../../lib/performedSets';
import { nextBlankSetId } from '../../lib/workoutSetComplete';
import { resolveRestSeconds, shouldAutoStartRest } from '../../lib/restTimer';
import { useExerciseStore } from '../../stores/exerciseStore';
import { findCatalogExercise } from '../../lib/exerciseCatalog';
import ExerciseMedia from './ExerciseMedia';
import PlateCalc from './PlateCalc';
import ExercisePicker from './ExercisePicker';
import SoloAskBar from '../solo/SoloAskBar';
import { soloAskFromProfile } from '../../lib/soloAskDefaults';
import OverflowMenu, { type OverflowAction } from '../ui/OverflowMenu';
import Modal from '../ui/Modal';
import { useAuthStore } from '../../stores/authStore';
import DeclareConstraintForm from '../constraints/DeclareConstraintForm';
import { SetRow, SupersetLinkPicker } from './SetRow';
import { getOverloadSuggestion, SUGGESTION_KEY } from '../../features/workout/domain/overloadSuggestion';
import { useExerciseHistory } from '../../features/workout/hooks/useExerciseHistory';
import { prescriptionBadgeParts } from '../../features/workout/domain/prescriptionBadge';
import { repsColumnKind, timedExerciseShowsLoad } from '../../features/workout/domain/timedExercise';
export type { OverloadSuggestionKind } from '../../features/workout/domain/overloadSuggestion';

// --- Main ExerciseCard ---

export default function ExerciseCard({
  exercise,
  onStartRestTimer,
  isInSuperset = false,
  restAfterComplete = true,
}: {
  exercise: WorkoutExercise;
  onStartRestTimer: (overrideDuration?: number) => void;
  isInSuperset?: boolean;
  restAfterComplete?: boolean;
}) {
  const { t } = useTranslation();
  const { addSet, deleteSet, restoreSet, deleteExercise, restoreExercise, updateExercise, updateSet, currentWorkout } = useWorkoutStore();
  const { showRir: prefRir, autoStartRest } = usePreferencesStore();
  const { profile } = useProfileStore();
  /** Q03 : kg canoniques en base, affichage selon la préférence (jamais l'inverse). */
  const weightUnit: 'kg' | 'lbs' = profile?.unit_weight === 'lbs' ? 'lbs' : 'kg';
  const tracking = useClientTracking();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const hasCoach = isCoachedAthlete(coachingRole, myCoach);
  const solo = isSoloAthlete(coachingRole, myCoach);
  const showRir = showLoggingRir(showTrainingField(tracking, 'rir'), prefRir, hasCoach);
  // A timed hold (isometric sets) shows time, and a load only when one is known.
  const showLoad = showTrainingField(tracking, 'load') && timedExerciseShowsLoad(exercise);
  const showReps = showTrainingField(tracking, 'reps') || showTrainingField(tracking, 'reps_range');
  const showSets = showTrainingField(tracking, 'sets');
  const restOn = showTrainingField(tracking, 'rest');
  const planLocked = !!currentWorkout?.program_day_id;
  const { initExerciseDraft, getExerciseDraft, updateExerciseDraft, clearExerciseDraft } = useDraftContext();
  const [expanded, setExpanded] = useState(true);
  const [showNotes, setShowNotes] = useState(!!exercise.notes);
  const [localNotes, setLocalNotes] = useState('');
  const [localName, setLocalName] = useState(exercise.name);
  const history = useExerciseHistory(exercise.name, currentWorkout?.id, exercise.catalog_exercise_id);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [plateOpen, setPlateOpen] = useState(false);
  const [showAsk, setShowAsk] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [painOpen, setPainOpen] = useState(false);
  /** After a pain report: adapt today (temporary), and see a professional when it is serious. */
  const [painNote, setPainNote] = useState<null | 'adapt' | 'advice'>(null);
  const athleteId = useAuthStore(s => s.user?.id ?? null);
  const catalogExercises = useExerciseStore(s => s.exercises);
  const fetchExercises = useExerciseStore(s => s.fetchExercises);
  const catalog = findCatalogExercise(catalogExercises, exercise.name);

  useEffect(() => {
    initExerciseDraft(exercise.id, exercise.notes || '');
    const draft = getExerciseDraft(exercise.id);
    setLocalNotes(draft.notes ?? exercise.notes ?? '');
    setLocalName(exercise.name);
  }, [exercise.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { clearExerciseDraft(exercise.id); };
  }, [exercise.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void fetchExercises();
  }, [fetchExercises]);

  const handleAddSet = () => {
    const sets = exercise.sets ?? [];
    const idx = sets.length;
    addSet(exercise.id, idx);
  };

  const reusePayload = (sourceSet: WorkoutSet) => ({
    weight_kg: sourceSet.weight_kg,
    reps: sourceSet.reps,
    rir: sourceSet.rir,
    set_type: sourceSet.set_type,
    duration_seconds: sourceSet.duration_seconds,
    tempo: sourceSet.tempo,
    cluster_rest_seconds: sourceSet.cluster_rest_seconds,
    cluster_reps_per_burst: sourceSet.cluster_reps_per_burst,
    myo_is_activation: false,
    drop_percentage: sourceSet.drop_percentage,
  });

  const handleDuplicateSet = async (sourceSet: WorkoutSet) => {
    const sets = exercise.sets ?? [];
    const nextId = nextBlankSetId(sets, sourceSet.id);
    if (nextId) {
      await updateSet(nextId, reusePayload(sourceSet));
      return;
    }
    const newSet = await addSet(exercise.id, sets.length);
    if (newSet) await updateSet(newSet.id, reusePayload(sourceSet));
  };

  const handleSetComplete = () => {
    if (!shouldAutoStartRest({
      preferenceOn: autoStartRest,
      restModuleOn: restOn,
      afterCompletedSet: true,
      restAfterThisSet: !(isInSuperset && !restAfterComplete),
    })) return;
    onStartRestTimer(resolveRestSeconds(exercise.prescribed_rest_seconds) ?? 90);
  };

  const suggestion = getOverloadSuggestion(history);
  const prevPerformed = (history[0]?.sets ?? []).filter(isPerformedSet);

  const maxHistoricalWeight = history.length > 0
    ? Math.max(...history.flatMap(h => h.sets.filter(isPerformedSet).map(s => s.weight_kg)).filter(w => w > 0), 0)
    : 0;
  const currentMaxWeight = exercise.sets
    ? Math.max(...(exercise.sets.filter(s => isPerformedSet(s) && s.weight_kg > 0).map(s => s.weight_kg)), 0)
    : 0;
  const isPR = currentMaxWeight > 0 && maxHistoricalWeight > 0 && currentMaxWeight > maxHistoricalWeight;

  const completedCount = exercise.sets?.filter(s => s.completed).length ?? 0;
  const totalSets = exercise.sets?.length ?? 0;
  const prescriptionText = prescriptionBadgeParts({
    sets: exercise.prescribed_sets,
    reps: exercise.prescribed_reps,
    repsMin: exercise.prescribed_reps_min,
    rir: exercise.prescribed_rir,
    restSeconds: exercise.prescribed_rest_seconds,
    weightKg: exercise.prescribed_weight_kg,
  }, {
    sets: showSets,
    reps: repsInputMode(tracking),
    load: showTrainingField(tracking, 'load'),
    rir: showTrainingField(tracking, 'rir'),
    rest: restOn,
  })
    .map(part => (part.key === 'load'
      ? formatWeight(part.params.kg, weightUnit)
      : t(`workout.prescription.${part.key}`, part.params)))
    .join(' · ');
  const repsColumn = repsColumnKind(exercise.sets);
  const plateKg = exercise.sets?.find(s => s.weight_kg > 0)?.weight_kg
    ?? exercise.prescribed_weight_kg
    ?? 0;
  const plateLoad = weightUnit === 'lbs' ? kgToLbs(plateKg) : Math.round(plateKg * 10) / 10;

  // Myo-rep total reps counter
  const myoSets = exercise.sets?.filter(s => s.set_type === 'myo') ?? [];
  const myoTotalReps = myoSets.reduce((sum, s) => sum + (s.reps || 0), 0);

  const overflowActions: OverflowAction[] = [
    ...(catalog ? [{
      id: 'media',
      label: t('workout.exercisePicker.form'),
      onSelect: () => setShowMedia(v => !v),
    }] : []),
    {
      id: 'notes',
      label: t('workout.exerciseCard.notes'),
      onSelect: () => setShowNotes(v => !v),
    },
    ...(!isInSuperset && !exercise.superset_group_id ? [{
      id: 'link',
      label: t('workout.exerciseCard.linkWith'),
      onSelect: () => setShowLinkPicker(true),
    }] : []),
    ...(solo ? [{
      id: 'ask',
      label: t('workout.exerciseCard.ask'),
      onSelect: () => setShowAsk(v => !v),
    }] : []),
    {
      id: 'replace-today',
      label: t('workout.exerciseCard.replaceToday'),
      onSelect: () => setReplaceOpen(true),
    },
    // Vision §7.6: a pain is declared where it happens, even offline.
    ...(athleteId && currentWorkout?.user_id === athleteId ? [{
      id: 'pain',
      label: t('constraints.reportPain'),
      onSelect: () => { setPainNote(null); setPainOpen(true); },
    }] : []),
    {
      id: 'skip-today',
      label: t('workout.exerciseCard.skipToday'),
      onSelect: () => {
        // Passing today removes the sets not performed; the prescription stays
        // on the exercise, the plan is untouched and the note says why.
        const unperformed = (exercise.sets ?? []).filter(row => !isPerformedSet(row));
        for (const row of unperformed) void deleteSet(row.id);
        const note = [exercise.notes?.trim(), t('workout.exerciseCard.skippedNote')].filter(Boolean).join('\n');
        setLocalNotes(note);
        void updateExercise(exercise.id, { notes: note });
      },
    },
    ...(!planLocked ? [{
      id: 'delete',
      label: t('common.delete'),
      onSelect: () => {
        const exerciseSnapshot = { ...exercise, sets: [...(exercise.sets ?? [])] };
        const workoutId = currentWorkout?.id;
        deleteExercise(exercise.id);
        toastWithUndo(t('workout.exerciseCard.exerciseRemoved'), () => {
          if (workoutId) restoreExercise(workoutId, exerciseSnapshot);
        });
      },
      danger: true,
    }] : []),
  ];

  return (
    <Card padding={false} className="animate-fade-in-up">
      <div className="flex items-start gap-2 p-3 sm:p-4 pb-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="min-h-11 min-w-11 shrink-0 inline-flex items-center justify-center text-neutral-400 hover:text-white"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        <div className="flex-1 min-w-0 pt-2">
          {/* Long names wrap on two lines instead of « Soulevé de terre ro… ». */}
          <p className="text-white font-semibold leading-snug line-clamp-2 break-words">{localName || t('workout.exerciseCard.exerciseNamePlaceholder')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {prescriptionText ? (
              <span className="text-xs text-blue-300/90 bg-blue-500/10 px-1.5 py-0.5 rounded" data-prescription-badge="true">
                {prescriptionText}
              </span>
            ) : null}
            {isPR && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 rounded px-1.5 py-0.5 font-bold">
                <Award size={10} />
                PR
              </span>
            )}
            {totalSets > 0 && (
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${completedCount === totalSets ? 'text-emerald-400 bg-emerald-400/10' : 'text-neutral-500 bg-neutral-800/50'}`}
                aria-label={t('workout.exerciseCard.setsProgress', { done: completedCount, total: totalSets })}
              >
                <span aria-hidden="true">{completedCount}/{totalSets}</span>
              </span>
            )}
          </div>
        </div>
        <div className="relative shrink-0 flex items-center">
          {showLinkPicker && (
            <SupersetLinkPicker
              currentExerciseId={exercise.id}
              onClose={() => setShowLinkPicker(false)}
            />
          )}
          {/* Plate calculator (barbell only): a disc with its name, not a mute padlock-like icon. */}
          {showLoad && catalog?.equipment === 'barbell' && (
            <button
              type="button"
              data-plates-open="true"
              onClick={() => setPlateOpen(true)}
              className="min-h-11 min-w-11 px-1 inline-flex flex-col items-center justify-center gap-0.5 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800"
              aria-label={t('workout.plates.open')}
              title={t('workout.plates.open')}
            >
              <Disc3 size={16} aria-hidden="true" />
              <span className="text-[10px] leading-none" aria-hidden="true">{t('workout.plates.title')}</span>
            </button>
          )}
          <OverflowMenu label={t('workout.exerciseCard.moreActions')} actions={overflowActions} />
        </div>
      </div>

      {painNote && (
        <div role="status" className="mx-3 sm:mx-4 mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 space-y-2">
          <p>{t('constraints.adaptToday')}</p>
          {painNote === 'advice' && <p>{t('constraints.professionalAdvice')}</p>}
          <div className="flex gap-2">
            <button type="button" className="min-h-11 text-amber-200 underline" onClick={() => setReplaceOpen(true)}>{t('workout.exerciseCard.replaceToday')}</button>
            <button type="button" className="min-h-11 text-neutral-300" onClick={() => setPainNote(null)}>{t('common.dismiss')}</button>
          </div>
        </div>
      )}

      {showMedia && catalog && (
        <div className="px-3 sm:px-4 pb-3 animate-fade-in">
          <ExerciseMedia exercise={catalog} compact />
        </div>
      )}

      {solo && showAsk && (
        <div className="px-3">
          <SoloAskBar
            compact
            context={soloAskFromProfile('exercise', profile, {
              currentExerciseName: exercise.name,
              catalog: catalogExercises.map(ex => ({
                name: ex.name,
                primary_muscles: ex.primary_muscles,
                secondary_muscles: ex.secondary_muscles,
                equipment: ex.equipment,
              })),
              lastWeightKg: (exercise.sets ?? []).filter(isPerformedSet).slice(-1)[0]?.weight_kg
                ?? prevPerformed.slice(-1)[0]?.weight_kg
                ?? null,
              lastReps: (exercise.sets ?? []).filter(isPerformedSet).slice(-1)[0]?.reps
                ?? prevPerformed.slice(-1)[0]?.reps
                ?? null,
              lastRestSeconds: exercise.prescribed_rest_seconds ?? null,
            })}
            onApplyOnce={async (proposal) => {
              if (proposal.kind !== 'swap_exercise' || !proposal.swapTo) return;
              await updateExercise(exercise.id, { name: proposal.swapTo });
              setLocalName(proposal.swapTo);
            }}
            onSave={() => undefined}
          />
        </div>
      )}

      {/* Previous values live in the « Préc. » column; one line for the suggestion. */}
      {suggestion && (
        <div className="px-3 sm:px-4 pb-1 animate-fade-in">
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg w-fit
            ${suggestion.confidence === 'high'
              ? 'bg-blue-600/15 border border-blue-500/30'
              : suggestion.confidence === 'medium'
              ? 'bg-blue-600/10 border border-blue-500/20'
              : 'bg-neutral-800/60 border border-neutral-700/40'
            }`}>
            <TrendingUp size={12} className={suggestion.confidence === 'high' ? 'text-blue-400' : suggestion.confidence === 'medium' ? 'text-blue-400/70' : 'text-neutral-500'} />
            <span className={`text-xs font-medium ${suggestion.confidence === 'high' ? 'text-blue-300' : suggestion.confidence === 'medium' ? 'text-blue-400/80' : 'text-neutral-400'}`}>
              {t(SUGGESTION_KEY[suggestion.kind], {
                weight: suggestion.suggestedWeight != null ? formatWeight(suggestion.suggestedWeight, weightUnit) : '—',
                reps: suggestion.reps ?? '—',
              })}
            </span>
          </div>
        </div>
      )}

      {showNotes && (
        <div className="px-3 sm:px-4 pb-2 animate-fade-in">
          <textarea
            value={localNotes}
            onChange={e => {
              setLocalNotes(e.target.value);
              updateExerciseDraft(exercise.id, 'notes', e.target.value);
            }}
            onBlur={() => updateExercise(exercise.id, { notes: localNotes })}
            placeholder={t('workout.exerciseCard.notesPlaceholder')}
            rows={2}
            className="w-full bg-neutral-900/60 border border-neutral-800/50 rounded-lg px-3 py-2 text-sm text-neutral-300 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
          />
        </div>
      )}

      {expanded && (
        <div className="px-3 sm:px-4 pb-4 animate-fade-in">
          {(exercise.sets?.length ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-600 font-medium uppercase tracking-wider mb-2 px-1">
              <div className="w-11 text-center shrink-0">{t('workout.exerciseCard.setColumn')}</div>
              <div className="w-14 text-center shrink-0">{t('workout.exerciseCard.previousColumn')}</div>
              <div className={`flex-1 min-w-0 grid gap-1.5 ${
                [showLoad, showReps, showRir].filter(Boolean).length >= 3
                  ? 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_3.5rem]'
                  : [showLoad, showReps, showRir].filter(Boolean).length === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-1'
              }`}>
                {showLoad && <div className="text-center">{t(weightUnit === 'lbs' ? 'workout.exerciseCard.weightLbs' : 'workout.exerciseCard.weight')}</div>}
                {showReps && (
                  <div className="text-center">
                    {repsColumn === 'duration'
                      ? t('workout.exerciseCard.durationColumn')
                      : repsColumn === 'mixed'
                        ? t('workout.exerciseCard.repsOrDurationColumn')
                        : t('workout.exerciseCard.reps')}
                  </div>
                )}
                {showRir && <div className="text-center">{t('workout.exerciseCard.rir')}</div>}
              </div>
              <div className="w-11 shrink-0" />
            </div>
          )}

          <div className="space-y-1.5">
            {exercise.sets?.map((set, i) => {
              const matchingPrev = prevPerformed[i] ?? null;
              const previousSetInList = i > 0 ? (exercise.sets?.[i - 1] ?? null) : null;
              return (
                <SetRow
                  key={set.id}
                  set={set}
                  index={i}
                  showRir={showRir}
                  showLoad={showLoad}
                  showReps={showReps}
                  showSets={showSets}
                  weightUnit={weightUnit}
                  suggestedWeight={suggestion?.suggestedWeight}
                  prescription={{
                    reps: exercise.prescribed_reps,
                    repsMin: exercise.prescribed_reps_min,
                    weightKg: exercise.prescribed_weight_kg,
                  }}
                  prevSet={matchingPrev}
                  previousSet={previousSetInList}
                  onSetComplete={handleSetComplete}
                  onDuplicate={() => handleDuplicateSet(set)}
                  onDelete={() => {
                    const setSnapshot = { ...set } as WorkoutSet;
                    const exerciseId = exercise.id;
                    deleteSet(setSnapshot.id);
                    toastWithUndo(t('workout.exerciseCard.setRemoved'), () => restoreSet(exerciseId, setSnapshot));
                  }}
                />
              );
            })}
          </div>

          {/* Myo-rep total reps counter */}
          {myoSets.length > 1 && myoTotalReps > 0 && (
            <div className="mt-1.5 px-1">
              <span className="text-[10px] text-rose-400/70 font-medium">
                {t('workout.exerciseCard.myoTotal', { reps: myoTotalReps, sets: myoSets.length })}
              </span>
            </div>
          )}

          {showSets && (
          <button
            onClick={handleAddSet}
            className="mt-3 w-full py-2.5 text-xs text-neutral-400 hover:text-blue-400 font-medium flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-800 hover:border-blue-500/30 transition-all"
          >
            <Plus size={14} /> {t('workout.exerciseCard.addSet')}
          </button>
          )}
        </div>
      )}
      <ExercisePicker
        open={replaceOpen}
        onClose={() => setReplaceOpen(false)}
        onSelect={(name, catalogId) => {
          // Today only: the program is untouched; the note keeps the trace.
          const note = [
            exercise.notes?.trim(),
            t('workout.exerciseCard.replacedNote', { from: exercise.name }),
          ].filter(Boolean).join('\n');
          setLocalNotes(note);
          void updateExercise(exercise.id, { name, catalog_exercise_id: catalogId ?? null, notes: note });
          setLocalName(name);
        }}
      />
      <Modal open={painOpen} onClose={() => setPainOpen(false)} title={t('constraints.reportPain')}>
        {athleteId && (
          <DeclareConstraintForm
            userId={athleteId}
            exerciseName={localName || exercise.name}
            workoutId={currentWorkout?.id ?? null}
            onCancel={() => setPainOpen(false)}
            onDone={({ queued, advice }) => {
              setPainOpen(false);
              setPainNote(advice ? 'advice' : 'adapt');
              if (queued) useWorkoutStore.getState().refreshPendingOps();
            }}
          />
        )}
      </Modal>
      <PlateCalc
        open={plateOpen}
        onClose={() => setPlateOpen(false)}
        load={plateLoad}
        unit={weightUnit}
      />
    </Card>
  );
}
