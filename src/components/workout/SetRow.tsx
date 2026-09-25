import { useState, useEffect, useRef } from 'react';
import { Trash2, Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWorkoutStore } from '../../stores/workoutStore';
import type { WorkoutSet, SetType } from '../../lib/types';
import { SET_TYPES } from '../../lib/constants';
import { kgToLbs, lbsToKg } from '../../lib/utils';
import { useDraftContext } from './WorkoutDraftContext';
import { optionLabel } from '../../lib/optionLabels';
import { applySetPlaceholders, parseDecimalInput } from '../../lib/workoutSetComplete';
import { parseDropSegments, emptyDropSegments } from '../../lib/programSetPrescription';
import { placeholderLoadKg, placeholderReps, prescriptionAppliesToSet } from '../../features/workout/domain/setPlaceholders';
import { useExerciseDisplayName } from '../../features/workout/hooks/useExerciseDisplayName';

// --- Set Type Picker ---

function SetTypePicker({ currentType, onChange, onClose, onDuplicate, onDelete }: {
  currentType: string;
  onChange: (type: SetType) => void;
  onClose: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { t: tr } = useTranslation();
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={pickerRef} className="absolute top-full left-0 mt-1 z-50 bg-neutral-900 border border-neutral-700/50 rounded-xl p-1.5 shadow-xl animate-fade-in min-w-[180px]">
      <div className="grid grid-cols-2 gap-1">
        {SET_TYPES.map(t => (
          <button
            key={t.value}
            onClick={() => { onChange(t.value as SetType); onClose(); }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all
              ${currentType === t.value
                ? `${t.bgColor} ${t.color} ring-1 ring-current/30`
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
          >
            <span className={`w-2 h-2 rounded-full ${t.dotColor}`} />
            {optionLabel(tr, 'setTypes', t.value, t.label)}
          </button>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1 border-t border-neutral-800 pt-1.5">
        <button
          type="button"
          onClick={() => { onClose(); onDuplicate(); }}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-neutral-200 hover:bg-neutral-800"
        >
          <Copy size={13} /> {tr('workout.exerciseCard.duplicateSet')}
        </button>
        <button
          type="button"
          onClick={() => { onClose(); onDelete(); }}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-rose-300 hover:bg-rose-500/10"
        >
          <Trash2 size={13} /> {tr('common.delete')}
        </button>
      </div>
    </div>
  );
}

// --- Set Row ---

export function SetRow({
  set,
  index,
  showRir,
  showLoad,
  showReps,
  showSets,
  suggestedWeight,
  prescription,
  prevSet,
  previousSet,
  onDelete,
  onDuplicate,
  onSetComplete,
  weightUnit,
}: {
  set: WorkoutSet;
  index: number;
  showRir: boolean;
  showLoad: boolean;
  showReps: boolean;
  showSets: boolean;
  suggestedWeight?: number | null;
  /** The exercise's prescription: the fallback when the last session says nothing. */
  prescription?: { reps?: number | null; repsMin?: number | null; weightKg?: number | null } | null;
  prevSet?: { weight_kg: number; reps: number; rir: number } | null;
  previousSet?: WorkoutSet | null;
  onDelete: () => void;
  onDuplicate: () => void;
  onSetComplete: (restOverride?: number) => void;
  weightUnit: 'kg' | 'lbs';
}) {
  const { t } = useTranslation();
  const { initSetDraft, getSetDraft, updateSetDraft, updateSetType, clearSetDraft } = useDraftContext();
  const { updateSet } = useWorkoutStore();
  /** Q03 : saisie/affichage dans l'unité du profil, stockage canonique en kg. */
  const toDisplay = (kg: number) => (weightUnit === 'lbs' ? kgToLbs(kg) : Math.round(kg * 10) / 10);
  const toStorage = (display: number) => (weightUnit === 'lbs' ? lbsToKg(display) : display);
  const [localWeight, setLocalWeight] = useState('');
  const [localReps, setLocalReps] = useState('');
  const [localRir, setLocalRir] = useState('');
  const [localDuration, setLocalDuration] = useState('');
  const [localTempo, setLocalTempo] = useState('');
  const [localClusterRest, setLocalClusterRest] = useState('');
  const [localClusterBurst, setLocalClusterBurst] = useState('');
  const [localType, setLocalType] = useState(set.set_type);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [segments, setSegments] = useState(() => {
    const parsed = parseDropSegments(set.drop_segments);
    return parsed.length >= 2 ? parsed : emptyDropSegments(2);
  });

  const isIsometric = localType === 'isometric';
  const isTempo = localType === 'tempo';
  const isCluster = localType === 'cluster';
  const isDrop = localType === 'drop';
  const isMyo = localType === 'myo';

  useEffect(() => {
    initSetDraft(set.id, toDisplay(set.weight_kg), set.reps, set.rir, set.set_type as SetType, set.duration_seconds, set.tempo);
    const draft = getSetDraft(set.id);
    setLocalWeight(draft.weight_kg ?? (set.weight_kg ? String(toDisplay(set.weight_kg)) : ''));
    setLocalReps(draft.reps ?? (set.reps ? String(set.reps) : ''));
    setLocalRir(draft.rir ?? (set.rir ? String(set.rir) : ''));
    setLocalDuration(draft.duration_seconds ?? (set.duration_seconds ? String(set.duration_seconds) : ''));
    setLocalTempo(draft.tempo ?? (set.tempo || ''));
    setLocalClusterRest(draft.cluster_rest_seconds ?? (set.cluster_rest_seconds ? String(set.cluster_rest_seconds) : '20'));
    setLocalClusterBurst(draft.cluster_reps_per_burst ?? (set.cluster_reps_per_burst ? String(set.cluster_reps_per_burst) : ''));
    setLocalType(draft.set_type ?? set.set_type);
  }, [set.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Q03 : changement d'unité en cours de saisie — rebase l'affichage sur le kg stocké.
  useEffect(() => {
    const display = set.weight_kg ? String(toDisplay(set.weight_kg)) : '';
    setLocalWeight(display);
    updateSetDraft(set.id, 'weight_kg', display);
  }, [weightUnit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const draft = getSetDraft(set.id);
    if (!draft.weight_kg || draft.weight_kg === localWeight) {
      const newVal = set.weight_kg ? String(toDisplay(set.weight_kg)) : '';
      setLocalWeight(newVal);
      updateSetDraft(set.id, 'weight_kg', newVal);
    }
  }, [set.weight_kg]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const draft = getSetDraft(set.id);
    if (!draft.reps || draft.reps === localReps) {
      const newVal = set.reps ? String(set.reps) : '';
      setLocalReps(newVal);
      updateSetDraft(set.id, 'reps', newVal);
    }
  }, [set.reps]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const draft = getSetDraft(set.id);
    if (!draft.rir || draft.rir === localRir) {
      const newVal = set.rir ? String(set.rir) : '';
      setLocalRir(newVal);
      updateSetDraft(set.id, 'rir', newVal);
    }
  }, [set.rir]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRepsBlur = () => {
    const r = parseInt(localReps, 10);
    updateSet(set.id, { reps: isNaN(r) ? 0 : r });
  };

  const handleRirBlur = () => {
    const r = parseInt(localRir, 10);
    updateSet(set.id, { rir: isNaN(r) ? 0 : r });
  };

  const handleDurationBlur = () => {
    const d = parseInt(localDuration, 10);
    updateSet(set.id, { duration_seconds: isNaN(d) ? 0 : d });
  };

  const handleTempoBlur = () => {
    updateSet(set.id, { tempo: localTempo || null });
  };

  const handleClusterRestBlur = () => {
    const v = parseInt(localClusterRest, 10);
    updateSet(set.id, { cluster_rest_seconds: isNaN(v) ? null : v });
    updateSetDraft(set.id, 'cluster_rest_seconds', localClusterRest);
  };

  const handleClusterBurstBlur = () => {
    const v = parseInt(localClusterBurst, 10);
    updateSet(set.id, { cluster_reps_per_burst: isNaN(v) ? null : v });
    updateSetDraft(set.id, 'cluster_reps_per_burst', localClusterBurst);
  };

  const handleTypeChange = (newType: SetType) => {
    setLocalType(newType);
    updateSetType(set.id, newType);
    const updates: Partial<WorkoutSet> = { set_type: newType };

    if (newType === 'myo' && index === 0) {
      updates.myo_is_activation = true;
    }
    if (newType === 'drop' && previousSet) {
      const dropWeightKg = Math.round(previousSet.weight_kg * 0.8 * 4) / 4;
      const pct = previousSet.weight_kg > 0 ? Math.round((1 - dropWeightKg / previousSet.weight_kg) * 100) : 20;
      updates.drop_percentage = pct;
      if (!localWeight) {
        const display = String(toDisplay(dropWeightKg));
        setLocalWeight(display);
        updateSetDraft(set.id, 'weight_kg', display);
        updates.weight_kg = dropWeightKg;
      }
    }
    if (newType === 'drop') {
      const parsed = parseDropSegments(set.drop_segments);
      const next = parsed.length >= 2 ? parsed : emptyDropSegments(2);
      setSegments(next);
      updates.drop_segments = next;
    }
    updateSet(set.id, updates);
  };

  useEffect(() => {
    return () => { clearSetDraft(set.id); };
  }, [set.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeInfo = SET_TYPES.find(t => t.value === localType) || SET_TYPES[1];
  const displayPrev = prevSet?.weight_kg ? toDisplay(prevSet.weight_kg) : 0;
  // Last session first, then the prescription; unknown stays empty — never « 0 ».
  const usePrescription = prescriptionAppliesToSet({ set_type: localType, myo_is_activation: set.myo_is_activation });
  const loadKg = placeholderLoadKg({
    suggestedKg: suggestedWeight,
    previousKg: prevSet?.weight_kg,
    prescribedKg: prescription?.weightKg,
    usePrescription,
  });
  const repsValue = placeholderReps({
    previousReps: prevSet?.reps,
    prescribedReps: prescription?.reps,
    prescribedRepsMin: prescription?.repsMin,
    usePrescription,
  });
  /** Values a single tap records (see applySetPlaceholders). */
  const weightPlaceholder = loadKg != null ? String(toDisplay(loadKg)) : '';
  const repsPlaceholder = repsValue != null ? String(repsValue) : '';
  /** What the empty box shows: the value, or a neutral unit hint. */
  const weightHint = weightPlaceholder || weightUnit;
  const repsHint = repsPlaceholder || t('workout.exerciseCard.repsPlaceholder');

  const handleToggleComplete = () => {
    if (set.completed) {
      updateSet(set.id, { completed: false });
      return;
    }
    const filled = applySetPlaceholders({
      weight: localWeight,
      reps: localReps,
      duration: localDuration,
      isIsometric,
      showLoad,
      showReps,
      weightPlaceholder,
      repsPlaceholder,
    });
    const updates: Partial<WorkoutSet> = { completed: true };
    if (isDrop) {
      updates.drop_segments = segments;
      updates.weight_kg = segments[0]?.weight_kg ?? 0;
      updates.reps = segments.reduce((sum, row) => sum + (row.reps || 0), 0);
      updateSet(set.id, updates);
      onSetComplete();
      return;
    }
    if (filled.weight !== localWeight) {
      setLocalWeight(filled.weight);
      updateSetDraft(set.id, 'weight_kg', filled.weight);
      const w = parseDecimalInput(filled.weight);
      if (!isNaN(w)) updates.weight_kg = toStorage(w);
    }
    if (filled.reps !== localReps) {
      setLocalReps(filled.reps);
      updateSetDraft(set.id, 'reps', filled.reps);
      const r = parseInt(filled.reps, 10);
      if (!isNaN(r)) updates.reps = r;
    }
    updateSet(set.id, updates);
    onSetComplete();
  };

  const isFilled = isDrop
    ? segments.every(row => row.weight_kg > 0 && row.reps > 0)
    : (!showLoad || !!localWeight) && (isIsometric ? !!localDuration : !!localReps);

  // Drop percentage badge (ratio — computed in display units consistently)
  const prevDisplay = previousSet && previousSet.weight_kg > 0 ? toDisplay(previousSet.weight_kg) : 0;
  const dropPct = isDrop && previousSet && previousSet.weight_kg > 0 && localWeight
    ? Math.round((1 - parseDecimalInput(localWeight) / prevDisplay) * 100)
    : set.drop_percentage;

  // Myo activation badge
  const isMyoActivation = isMyo && set.myo_is_activation;
  const inputCount = [showLoad && !isDrop, showReps && !isDrop, showRir].filter(Boolean).length;
  const inputGrid =
    inputCount >= 3
      ? 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_3.5rem]'
      : inputCount === 2
        ? 'grid-cols-2'
        : 'grid-cols-1';

  return (
    <div
      data-set-row="true"
      className={`relative rounded-xl transition-all
      ${set.completed ? 'bg-emerald-950/30 ring-1 ring-emerald-500/30' : isFilled ? 'bg-neutral-900/80 ring-1 ring-emerald-500/20' : 'bg-neutral-900/60'}
      ${isDrop && index > 0 ? '-mt-0.5' : ''}
    `}>
      <div
        className="flex items-center gap-1.5 p-2 touch-pan-y"
        onPointerDown={(event) => {
          const node = event.target as HTMLElement;
          if (node.closest('input, button')) return;
          const startX = event.clientX;
          const target = event.currentTarget;
          const move = (ev: PointerEvent) => {
            if (startX - ev.clientX > 72) {
              target.removeEventListener('pointermove', move);
              onDelete();
            }
          };
          const up = () => {
            target.removeEventListener('pointermove', move);
            target.removeEventListener('pointerup', up);
          };
          target.addEventListener('pointermove', move);
          target.addEventListener('pointerup', up);
        }}
      >
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label={t('workout.exerciseCard.setActions')}
            onClick={() => setShowTypePicker(!showTypePicker)}
            onContextMenu={(event) => {
              event.preventDefault();
              onDuplicate();
            }}
            className={`min-h-11 min-w-11 flex flex-col items-center justify-center rounded-lg text-xs font-bold tracking-wide uppercase transition-all
              ${typeInfo.bgColor} ${typeInfo.color} hover:brightness-125`}
          >
            {showSets ? <span>{index + 1}</span> : null}
            <span>{optionLabel(t, 'setTypeShort', typeInfo.value, typeInfo.shortLabel)}</span>
          </button>
          {showTypePicker && (
            <SetTypePicker
              currentType={localType}
              onChange={handleTypeChange}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onClose={() => setShowTypePicker(false)}
            />
          )}
        </div>

        <span className="w-14 shrink-0 text-center text-xs text-neutral-500" data-prev-set="true">
          {prevSet && (prevSet.weight_kg || prevSet.reps) ? `${displayPrev || '—'}×${prevSet.reps || '—'}` : '—'}
        </span>
        {isDrop && dropPct != null && dropPct > 0 && (
          <span className="text-xs font-bold text-sky-400/70 shrink-0">-{dropPct}%</span>
        )}
        {isMyoActivation && (
          <span className="text-xs font-bold text-rose-400/70 shrink-0">{t('workout.exerciseCard.act')}</span>
        )}
        {isMyo && !isMyoActivation && (
          <span className="text-xs font-medium text-rose-400/50 shrink-0">{t('workout.exerciseCard.mini')}</span>
        )}

        <div className={`flex-1 min-w-0 grid gap-1.5 ${inputGrid}`}>
          {showLoad && !isDrop && (
          <div className="min-w-0">
            <input
              type="text"
              inputMode="decimal"
              value={localWeight}
              onChange={e => {
                setLocalWeight(e.target.value);
                updateSetDraft(set.id, 'weight_kg', e.target.value);
              }}
              onFocus={e => e.target.select()}
              onBlur={() => {
                const w = parseDecimalInput(localWeight);
                updateSet(set.id, { weight_kg: isNaN(w) ? 0 : toStorage(w) });
              }}
              className={`w-full min-h-11 rounded-lg px-1.5 py-2.5 text-base text-white text-center font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all
                ${suggestedWeight && !localWeight && !set.weight_kg ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-neutral-800/80 border border-transparent'}`}
              placeholder={weightHint}
            />
          </div>
          )}

          {showReps && !isDrop && (
          <div className="min-w-0">
            {isIsometric ? (
              <input
                type="number"
                inputMode="numeric"
                value={localDuration}
                onChange={e => {
                  setLocalDuration(e.target.value);
                  updateSetDraft(set.id, 'duration_seconds', e.target.value);
                }}
                onFocus={e => e.target.select()}
                onBlur={handleDurationBlur}
                className="w-full min-h-11 bg-neutral-800/80 border border-transparent rounded-lg px-1.5 py-2.5 text-base text-white text-center font-medium focus:outline-none focus:ring-1 focus:ring-orange-500"
                placeholder={t('workout.restTimer.customPlaceholder')}
              />
            ) : (
              <input
                type="number"
                inputMode="numeric"
                value={localReps}
                onChange={e => {
                  setLocalReps(e.target.value);
                  updateSetDraft(set.id, 'reps', e.target.value);
                }}
                onFocus={e => e.target.select()}
                onBlur={handleRepsBlur}
                className="w-full min-h-11 bg-neutral-800/80 border border-transparent rounded-lg px-1.5 py-2.5 text-base text-white text-center font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={repsHint}
              />
            )}
          </div>
          )}

          {showRir && (
            <div className="min-w-0">
              <input
                type="number"
                inputMode="numeric"
                value={localRir}
                onChange={e => {
                  setLocalRir(e.target.value);
                  updateSetDraft(set.id, 'rir', e.target.value);
                }}
                onFocus={e => e.target.select()}
                onBlur={handleRirBlur}
                className="w-full min-h-11 bg-neutral-800/80 border border-transparent rounded-lg px-1 py-2.5 text-base text-white text-center font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={t('workout.exerciseCard.rirShort', { defaultValue: 'RIR' })}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleToggleComplete()}
          aria-pressed={set.completed}
          aria-label={t(set.completed ? 'workout.exerciseCard.uncompleteSet' : 'workout.exerciseCard.completeSet')}
          className={`min-h-11 min-w-11 shrink-0 flex items-center justify-center rounded-lg transition-colors ${
            set.completed
              ? 'bg-emerald-600 text-white'
              : 'bg-neutral-800 text-neutral-500 hover:text-emerald-400'
          }`}
        >
          <Check size={16} />
        </button>
      </div>

      {isDrop && (
        <div className="px-2 pb-2 space-y-1" data-drop-segments="true">
          {segments.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5 pl-6">
              <span className="text-[11px] text-sky-400/70 w-4">{i + 1}</span>
              {showLoad && (
                <input
                  type="number"
                  inputMode="decimal"
                  value={row.weight_kg ? String(toDisplay(row.weight_kg)) : ''}
                  onChange={e => {
                    const w = parseDecimalInput(e.target.value);
                    const next = segments.map((s, j) => j === i ? { ...s, weight_kg: isNaN(w) ? 0 : toStorage(w) } : s);
                    setSegments(next);
                  }}
                  onBlur={() => updateSet(set.id, { drop_segments: segments, weight_kg: segments[0]?.weight_kg ?? 0 })}
                  className="flex-1 min-h-11 rounded-lg px-2 py-2 text-sm text-white text-center bg-neutral-800/80"
                  placeholder={weightHint}
                />
              )}
              {showReps && (
                <input
                  type="number"
                  inputMode="numeric"
                  value={row.reps ? String(row.reps) : ''}
                  onChange={e => {
                    const r = parseInt(e.target.value, 10);
                    const next = segments.map((s, j) => j === i ? { ...s, reps: isNaN(r) ? 0 : r } : s);
                    setSegments(next);
                  }}
                  onBlur={() => updateSet(set.id, { drop_segments: segments, reps: segments.reduce((sum, s) => sum + s.reps, 0) })}
                  className="flex-1 min-h-11 rounded-lg px-2 py-2 text-sm text-white text-center bg-neutral-800/80"
                  placeholder={repsHint}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tempo row */}
      {isTempo && (
        <div className="px-2 pb-2 -mt-0.5 animate-fade-in">
          <div className="flex items-center gap-2 pl-6">
            <span className="text-[11px] text-teal-400/70 font-medium shrink-0">{optionLabel(t, 'setTypes', 'tempo')}</span>
            <input
              type="text"
              value={localTempo}
              onChange={e => {
                setLocalTempo(e.target.value);
                updateSetDraft(set.id, 'tempo', e.target.value);
              }}
              onBlur={handleTempoBlur}
              className="flex-1 bg-neutral-800/60 border border-teal-500/20 rounded-lg px-2 py-1 text-xs text-teal-300 text-center focus:outline-none focus:ring-1 focus:ring-teal-500 placeholder-neutral-600"
              placeholder="3-1-2-0"
            />
          </div>
        </div>
      )}

      {/* Cluster row */}
      {isCluster && (
        <div className="px-2 pb-2 -mt-0.5 animate-fade-in">
          <div className="flex items-center gap-2 pl-6">
            <span className="text-[11px] text-cyan-400/70 font-medium shrink-0">{optionLabel(t, 'setTypes', 'cluster')}</span>
            <input
              type="number"
              inputMode="numeric"
              value={localClusterBurst}
              onChange={e => setLocalClusterBurst(e.target.value)}
              onBlur={handleClusterBurstBlur}
              className="w-12 bg-neutral-800/60 border border-cyan-500/20 rounded-lg px-2 py-1 text-xs text-cyan-300 text-center focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder-neutral-600"
              placeholder={t('workout.exerciseCard.repsShort')}
            />
            <span className="text-[11px] text-neutral-600">{t('workout.exerciseCard.burst')}</span>
            <input
              type="number"
              inputMode="numeric"
              value={localClusterRest}
              onChange={e => setLocalClusterRest(e.target.value)}
              onBlur={handleClusterRestBlur}
              className="w-12 bg-neutral-800/60 border border-cyan-500/20 rounded-lg px-2 py-1 text-xs text-cyan-300 text-center focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder-neutral-600"
              placeholder="20"
            />
            <span className="text-[11px] text-neutral-600">{t('workout.exerciseCard.restSeconds')}</span>
          </div>
          {localClusterBurst && localReps && (
            <div className="pl-6 mt-1">
              <span className="text-[11px] text-cyan-400/60 font-medium">
                {Math.ceil(parseInt(localReps, 10) / (parseInt(localClusterBurst, 10) || 1))}\u00d7{localClusterBurst} @ {localClusterRest}s
              </span>
            </div>
          )}
        </div>
      )}

      {/* Completion indicator */}
      {set.completed && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-emerald-500/80" />
      )}
    </div>
  );
}

// --- Superset Link Picker ---

export function SupersetLinkPicker({ currentExerciseId, onClose }: { currentExerciseId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const exerciseName = useExerciseDisplayName();
  const { currentWorkout, linkSuperset } = useWorkoutStore();
  const pickerRef = useRef<HTMLDivElement>(null);
  const exercises = currentWorkout?.exercises?.filter(e => e.id !== currentExerciseId && !e.superset_group_id) ?? [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleSelect = (targetId: string) => {
    linkSuperset([currentExerciseId, targetId]);
    onClose();
  };

  if (exercises.length === 0) return null;

  return (
    <div ref={pickerRef} className="absolute top-full right-0 mt-1 z-50 bg-neutral-900 border border-neutral-700/50 rounded-xl p-2 shadow-xl animate-fade-in min-w-[200px]">
      <p className="text-[11px] text-neutral-500 font-medium uppercase tracking-wider mb-1.5 px-1">{t('workout.exerciseCard.linkWith')}</p>
      <div className="space-y-1">
        {exercises.map(ex => (
          <button
            key={ex.id}
            onClick={() => handleSelect(ex.id)}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
          >
            {exerciseName(ex.name, ex.catalog_exercise_id)}
          </button>
        ))}
      </div>
    </div>
  );
}
