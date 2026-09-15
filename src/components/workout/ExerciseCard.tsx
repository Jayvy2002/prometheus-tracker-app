import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, StickyNote, History, TrendingUp, Award, Copy, Link2, Check, Info, Weight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useAuthStore } from '../../stores/authStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { useClientTracking } from '../../lib/useClientTracking';
import { formatExercisePrescription, showTrainingField } from '../../lib/clientTracking';
import { showLoggingRir } from '../../lib/clientGym';
import { isCoachedAthlete, isSoloAthlete } from '../../lib/coachRole';
import { useCoachingStore } from '../../stores/coachingStore';
import type { WorkoutExercise, WorkoutSet, SetType } from '../../lib/types';
import type { ExerciseSession } from '../../stores/workoutStore';
import { SET_TYPES } from '../../lib/constants';
import { formatWeight, kgToLbs, lbsToKg } from '../../lib/utils';
import { useProfileStore } from '../../stores/profileStore';
import Card from '../ui/Card';
import { useDraftContext } from './WorkoutDraftContext';
import { toastWithUndo } from '../ui/Toast';
import { optionLabel } from '../../lib/optionLabels';
import { applySetPlaceholders } from '../../lib/workoutSetComplete';
import { resolveRestSeconds } from '../../lib/restTimer';
import { parseDropSegments, emptyDropSegments } from '../../lib/programSetPrescription';
import { useExerciseStore } from '../../stores/exerciseStore';
import { findCatalogExercise } from '../../lib/exerciseCatalog';
import ExerciseMedia from './ExerciseMedia';
import PlateCalc from './PlateCalc';
import SoloAskBar from '../solo/SoloAskBar';
import { soloAskFromProfile } from '../../lib/soloAskDefaults';

export type OverloadSuggestionKind =
  | 'stagnant'
  | 'push_harder'
  | 'keep_progressing'
  | 'progressing'
  | 'below_last'
  | 'add_weight'
  | 'add_rep';

interface OverloadResult {
  kind: OverloadSuggestionKind;
  /** Poids suggéré en kg (canonique) — l'affichage convertit selon l'unité. */
  suggestedWeight: number | null;
  reps: number | null;
  confidence: 'low' | 'medium' | 'high';
}

/** Q03 : la suggestion est structurée — le texte est localisé au rendu, jamais codé en dur. */
function getOverloadSuggestion(history: ExerciseSession[]): OverloadResult | null {
  const sessions = history
    .map(h => ({
      date: h.date,
      workingSets: h.sets.filter(s => isPerformedSet(s) && s.weight_kg > 0 && s.reps > 0),
    }))
    .filter(s => s.workingSets.length > 0);

  if (sessions.length === 0) return null;

  const latest = sessions[0];
  const avgRirLatest = latest.workingSets.reduce((sum, s) => sum + s.rir, 0) / latest.workingSets.length;
  const maxWeightLatest = Math.max(...latest.workingSets.map(s => s.weight_kg));
  const lastSet = latest.workingSets[latest.workingSets.length - 1];

  const roundTo125 = (w: number) => Math.ceil(w / 1.25) * 1.25;

  if (sessions.length >= 3) {
    const maxWeights = sessions.slice(0, 3).map(s => Math.max(...s.workingSets.map(set => set.weight_kg)));
    const [w0, w1, w2] = maxWeights;

    if (w0 === w1 && w1 === w2) {
      const avgRirAll = sessions.slice(0, 3).flatMap(s => s.workingSets).reduce((sum, s) => sum + s.rir, 0) /
        sessions.slice(0, 3).flatMap(s => s.workingSets).length;

      if (avgRirAll <= 2) {
        const suggested = roundTo125(w0 * 1.025);
        return { kind: 'stagnant', suggestedWeight: suggested, reps: null, confidence: 'high' };
      }
      return { kind: 'push_harder', suggestedWeight: null, reps: null, confidence: 'low' };
    }

    if (w0 > w1 && w1 >= w2 && avgRirLatest <= 2) {
      const increment = w0 - w1;
      const suggested = roundTo125(w0 + increment);
      return { kind: 'keep_progressing', suggestedWeight: suggested, reps: null, confidence: 'high' };
    }
  }

  if (sessions.length >= 2) {
    const maxWeightPrev = Math.max(...sessions[1].workingSets.map(s => s.weight_kg));

    if (maxWeightLatest > maxWeightPrev && avgRirLatest <= 2) {
      const suggested = roundTo125(maxWeightLatest * 1.025);
      return { kind: 'progressing', suggestedWeight: suggested, reps: null, confidence: 'medium' };
    }

    if (maxWeightLatest < maxWeightPrev) {
      return { kind: 'below_last', suggestedWeight: maxWeightPrev, reps: null, confidence: 'low' };
    }
  }

  if (avgRirLatest <= 1) {
    const suggested = roundTo125(lastSet.weight_kg * 1.025);
    return { kind: 'add_weight', suggestedWeight: suggested, reps: lastSet.reps, confidence: 'medium' };
  }
  if (avgRirLatest <= 2) {
    return { kind: 'add_rep', suggestedWeight: lastSet.weight_kg, reps: lastSet.reps + 1, confidence: 'low' };
  }

  return null;
}

const SUGGESTION_KEY: Record<OverloadSuggestionKind, string> = {
  stagnant: 'workout.exerciseCard.suggestStagnant',
  push_harder: 'workout.exerciseCard.suggestPushHarder',
  keep_progressing: 'workout.exerciseCard.suggestKeepProgressing',
  progressing: 'workout.exerciseCard.suggestProgressing',
  below_last: 'workout.exerciseCard.suggestBelowLast',
  add_weight: 'workout.exerciseCard.suggestAddWeight',
  add_rep: 'workout.exerciseCard.suggestAddRep',
};

// --- Set Type Picker ---

function SetTypePicker({ currentType, onChange, onClose }: { currentType: string; onChange: (type: SetType) => void; onClose: () => void }) {
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
    </div>
  );
}

// --- Set Row ---

function SetRow({
  set,
  index,
  showRir,
  showLoad,
  showReps,
  showSets,
  suggestedWeight,
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
  const displaySuggested = suggestedWeight ? toDisplay(suggestedWeight) : 0;
  const displayPrev = prevSet?.weight_kg ? toDisplay(prevSet.weight_kg) : 0;
  const weightPlaceholder = suggestedWeight && !localWeight ? String(displaySuggested) : prevSet?.weight_kg ? String(displayPrev) : '0';
  const repsPlaceholder = prevSet?.reps ? String(prevSet.reps) : '0';

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
      const w = parseFloat(filled.weight);
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
    : !!localWeight && (isIsometric ? !!localDuration : !!localReps);

  // Drop percentage badge (ratio — computed in display units consistently)
  const prevDisplay = previousSet && previousSet.weight_kg > 0 ? toDisplay(previousSet.weight_kg) : 0;
  const dropPct = isDrop && previousSet && previousSet.weight_kg > 0 && localWeight
    ? Math.round((1 - parseFloat(localWeight) / prevDisplay) * 100)
    : set.drop_percentage;

  // Myo activation badge
  const isMyoActivation = isMyo && set.myo_is_activation;

  return (
    <div className={`relative rounded-xl transition-all
      ${set.completed ? 'bg-emerald-950/30 ring-1 ring-emerald-500/30' : isFilled ? 'bg-neutral-900/80 ring-1 ring-emerald-500/20' : 'bg-neutral-900/60'}
      ${isDrop && index > 0 ? '-mt-0.5' : ''}
    `}>
      <div className="flex items-center gap-1.5 p-2">
        {/* Index */}
        {showSets && (
        <div className="w-5 text-center text-[11px] text-neutral-600 font-semibold shrink-0">
          {index + 1}
        </div>
        )}

        {/* Type chip — always visible; program sessions seed the type from the plan */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowTypePicker(!showTypePicker)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold tracking-wide uppercase transition-all
              ${typeInfo.bgColor} ${typeInfo.color} hover:brightness-125`}
          >
            {typeInfo.shortLabel}
          </button>
          {showTypePicker && (
            <SetTypePicker
              currentType={localType}
              onChange={handleTypeChange}
              onClose={() => setShowTypePicker(false)}
            />
          )}
        </div>

        {/* Drop % badge */}
        {isDrop && dropPct != null && dropPct > 0 && (
          <span className="text-[9px] font-bold text-sky-400/70 shrink-0">-{dropPct}%</span>
        )}

        {/* Myo activation badge */}
        {isMyoActivation && (
          <span className="text-[9px] font-bold text-rose-400/70 shrink-0">{t('workout.exerciseCard.act')}</span>
        )}
        {isMyo && !isMyoActivation && (
          <span className="text-[9px] font-medium text-rose-400/50 shrink-0">{t('workout.exerciseCard.mini')}</span>
        )}

        {/* Weight */}
        {showLoad && !isDrop && (
        <div className="flex-1 min-w-0">
          <input
            type="number"
            inputMode="decimal"
            value={localWeight}
            onChange={e => {
              setLocalWeight(e.target.value);
              updateSetDraft(set.id, 'weight_kg', e.target.value);
            }}
            onFocus={e => e.target.select()}
            onBlur={() => {
              const w = parseFloat(localWeight);
              updateSet(set.id, { weight_kg: isNaN(w) ? 0 : toStorage(w) });
            }}
            className={`w-full min-h-11 rounded-lg px-2 py-2.5 text-base text-white text-center font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all
              ${suggestedWeight && !localWeight && !set.weight_kg ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-neutral-800/80 border border-transparent'}`}
            placeholder={weightPlaceholder}
          />
        </div>
        )}

        {/* Reps or Duration */}
        {showReps && !isDrop && (
        <div className="flex-1 min-w-0">
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
              className="w-full min-h-11 bg-neutral-800/80 border border-transparent rounded-lg px-2 py-2.5 text-base text-white text-center font-medium focus:outline-none focus:ring-1 focus:ring-orange-500"
              placeholder="sec"
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
              className="w-full min-h-11 bg-neutral-800/80 border border-transparent rounded-lg px-2 py-2.5 text-base text-white text-center font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={repsPlaceholder}
            />
          )}
        </div>
        )}

        {/* RIR */}
        {showRir && (
          <div className="w-12 shrink-0">
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
              className="w-full min-h-11 bg-neutral-800/80 border border-transparent rounded-lg px-2 py-2.5 text-base text-white text-center font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="RIR"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={onDuplicate}
                className="p-1 text-neutral-700 hover:text-blue-400 transition-colors"
                title={t('workout.exerciseCard.duplicateSet')}
              >
                <Copy size={11} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="p-1 text-neutral-700 hover:text-rose-400 transition-colors"
                title={t('workout.exerciseCard.setRemoved')}
              >
                <Trash2 size={11} />
              </button>
          <button
            type="button"
            onClick={() => void handleToggleComplete()}
            aria-pressed={set.completed}
            aria-label={t(set.completed ? 'workout.exerciseCard.uncompleteSet' : 'workout.exerciseCard.completeSet')}
            className={`min-h-11 min-w-11 flex items-center justify-center rounded-lg transition-colors ${
              set.completed
                ? 'bg-emerald-600 text-white'
                : 'bg-neutral-800 text-neutral-500 hover:text-emerald-400'
            }`}
          >
            <Check size={16} />
          </button>
        </div>
      </div>

      {isDrop && (
        <div className="px-2 pb-2 space-y-1" data-drop-segments="true">
          {segments.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5 pl-6">
              <span className="text-[10px] text-sky-400/70 w-4">{i + 1}</span>
              {showLoad && (
                <input
                  type="number"
                  inputMode="decimal"
                  value={row.weight_kg ? String(toDisplay(row.weight_kg)) : ''}
                  onChange={e => {
                    const w = parseFloat(e.target.value);
                    const next = segments.map((s, j) => j === i ? { ...s, weight_kg: isNaN(w) ? 0 : toStorage(w) } : s);
                    setSegments(next);
                  }}
                  onBlur={() => updateSet(set.id, { drop_segments: segments, weight_kg: segments[0]?.weight_kg ?? 0 })}
                  className="flex-1 min-h-11 rounded-lg px-2 py-2 text-sm text-white text-center bg-neutral-800/80"
                  placeholder={weightPlaceholder}
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
                  placeholder={repsPlaceholder}
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
            <span className="text-[10px] text-teal-400/70 font-medium shrink-0">{optionLabel(t, 'setTypes', 'tempo')}</span>
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
            <span className="text-[10px] text-cyan-400/70 font-medium shrink-0">{optionLabel(t, 'setTypes', 'cluster')}</span>
            <input
              type="number"
              inputMode="numeric"
              value={localClusterBurst}
              onChange={e => setLocalClusterBurst(e.target.value)}
              onBlur={handleClusterBurstBlur}
              className="w-12 bg-neutral-800/60 border border-cyan-500/20 rounded-lg px-2 py-1 text-xs text-cyan-300 text-center focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder-neutral-600"
              placeholder={t('workout.exerciseCard.repsShort')}
            />
            <span className="text-[10px] text-neutral-600">{t('workout.exerciseCard.burst')}</span>
            <input
              type="number"
              inputMode="numeric"
              value={localClusterRest}
              onChange={e => setLocalClusterRest(e.target.value)}
              onBlur={handleClusterRestBlur}
              className="w-12 bg-neutral-800/60 border border-cyan-500/20 rounded-lg px-2 py-1 text-xs text-cyan-300 text-center focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder-neutral-600"
              placeholder="20"
            />
            <span className="text-[10px] text-neutral-600">{t('workout.exerciseCard.restSeconds')}</span>
          </div>
          {localClusterBurst && localReps && (
            <div className="pl-6 mt-1">
              <span className="text-[10px] text-cyan-400/60 font-medium">
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

function SupersetLinkPicker({ currentExerciseId, onClose }: { currentExerciseId: string; onClose: () => void }) {
  const { t } = useTranslation();
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
      <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider mb-1.5 px-1">{t('workout.exerciseCard.linkWith')}</p>
      <div className="space-y-1">
        {exercises.map(ex => (
          <button
            key={ex.id}
            onClick={() => handleSelect(ex.id)}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
          >
            {ex.name}
          </button>
        ))}
      </div>
    </div>
  );
}

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
  const { addSet, deleteSet, restoreSet, deleteExercise, restoreExercise, updateExercise, updateSet, currentWorkout, fetchExerciseHistory } = useWorkoutStore();
  const { user } = useAuthStore();
  const { showRir: prefRir } = usePreferencesStore();
  const { profile } = useProfileStore();
  /** Q03 : kg canoniques en base, affichage selon la préférence (jamais l'inverse). */
  const weightUnit: 'kg' | 'lbs' = profile?.unit_weight === 'lbs' ? 'lbs' : 'kg';
  const tracking = useClientTracking();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const hasCoach = isCoachedAthlete(coachingRole, myCoach);
  const solo = isSoloAthlete(coachingRole, myCoach);
  const showRir = showLoggingRir(showTrainingField(tracking, 'rir'), prefRir, hasCoach);
  const showLoad = showTrainingField(tracking, 'load');
  const showReps = showTrainingField(tracking, 'reps') || showTrainingField(tracking, 'reps_range');
  const showSets = showTrainingField(tracking, 'sets');
  const restOn = showTrainingField(tracking, 'rest');
  const planLocked = !!currentWorkout?.program_day_id;
  const { initExerciseDraft, getExerciseDraft, updateExerciseDraft, clearExerciseDraft } = useDraftContext();
  const [expanded, setExpanded] = useState(true);
  const [showNotes, setShowNotes] = useState(!!exercise.notes);
  const [localNotes, setLocalNotes] = useState('');
  const [localName, setLocalName] = useState(exercise.name);
  const [history, setHistory] = useState<ExerciseSession[]>([]);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [plateOpen, setPlateOpen] = useState(false);
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

  useEffect(() => {
    if (!user || !currentWorkout) return;
    fetchExerciseHistory(user.id, exercise.name, currentWorkout.id, 5).then(setHistory);
  }, [user?.id, exercise.name, currentWorkout?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddSet = () => {
    const sets = exercise.sets ?? [];
    const idx = sets.length;
    addSet(exercise.id, idx);
  };

  const handleDuplicateSet = async (sourceSet: WorkoutSet) => {
    const sets = exercise.sets ?? [];
    const idx = sets.length;
    const newSet = await addSet(exercise.id, idx);
    if (newSet) {
      await updateSet(newSet.id, {
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
    }
  };

  const handleSetComplete = () => {
    if (!restOn) return;
    if (isInSuperset && !restAfterComplete) return;
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
  const plateKg = exercise.sets?.find(s => s.weight_kg > 0)?.weight_kg
    ?? exercise.prescribed_weight_kg
    ?? 0;
  const plateLoad = weightUnit === 'lbs' ? kgToLbs(plateKg) : Math.round(plateKg * 10) / 10;

  // Myo-rep total reps counter
  const myoSets = exercise.sets?.filter(s => s.set_type === 'myo') ?? [];
  const myoTotalReps = myoSets.reduce((sum, s) => sum + (s.reps || 0), 0);

  return (
    <Card padding={false} className="animate-fade-in-up">
      <div className="flex items-center gap-3 p-4 pb-2">
        <button onClick={() => setExpanded(!expanded)} className="text-neutral-400 hover:text-white">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <input
          value={localName}
          onChange={e => setLocalName(e.target.value)}
          className="flex-1 bg-transparent text-white font-semibold focus:outline-none"
          placeholder={t('workout.exerciseCard.exerciseNamePlaceholder')}
          readOnly
        />
        {exercise.prescribed_sets || exercise.prescribed_reps ? (
          <span className="text-[10px] text-blue-400/80 bg-blue-500/10 px-1.5 py-0.5 rounded whitespace-nowrap">
            {formatExercisePrescription({
              default_sets: exercise.prescribed_sets ?? 0,
              default_reps: exercise.prescribed_reps ?? 0,
              default_reps_min: exercise.prescribed_reps_min,
              default_rir: exercise.prescribed_rir,
              default_rest_seconds: exercise.prescribed_rest_seconds,
              default_weight_kg: exercise.prescribed_weight_kg,
            }, tracking, weightUnit) || t('workout.prescribedShort', { sets: exercise.prescribed_sets ?? 0, reps: exercise.prescribed_reps ?? 0 })}
            {' → '}{completedCount}
          </span>
        ) : null}
        {isPR && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 rounded px-1.5 py-0.5 font-bold">
            <Award size={10} />
            PR
          </span>
        )}
        {totalSets > 0 && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${completedCount === totalSets ? 'text-emerald-400 bg-emerald-400/10' : 'text-neutral-500 bg-neutral-800/50'}`}>
            {completedCount}/{totalSets}
          </span>
        )}
        {/* Superset link button -- only if not already in a superset */}
        {!isInSuperset && !exercise.superset_group_id && (
          <div className="relative">
            <button
              onClick={() => setShowLinkPicker(!showLinkPicker)}
              className="p-1 text-neutral-600 hover:text-green-400 transition-colors"
              title="Link superset"
            >
              <Link2 size={14} />
            </button>
            {showLinkPicker && (
              <SupersetLinkPicker
                currentExerciseId={exercise.id}
                onClose={() => setShowLinkPicker(false)}
              />
            )}
          </div>
        )}
        {showLoad && (
          <button
            type="button"
            data-plates-open="true"
            onClick={() => setPlateOpen(true)}
            className="p-1 text-neutral-600 hover:text-white transition-colors"
            aria-label={t('workout.plates.title')}
          >
            <Weight size={16} />
          </button>
        )}
        {catalog && (
          <button
            type="button"
            onClick={() => setShowMedia(v => !v)}
            className={`p-1 transition-colors ${showMedia ? 'text-rose-400 hover:text-rose-300' : 'text-neutral-600 hover:text-rose-400'}`}
            aria-label={t('workout.exercisePicker.form')}
          >
            <Info size={16} />
          </button>
        )}
        <button
          onClick={() => setShowNotes(!showNotes)}
          className={`p-1 transition-colors ${showNotes || localNotes ? 'text-blue-400 hover:text-blue-300' : 'text-neutral-600 hover:text-neutral-400'}`}
        >
          <StickyNote size={16} />
        </button>
        {!planLocked && (
        <button
          onClick={() => {
            const exerciseSnapshot = { ...exercise, sets: [...(exercise.sets ?? [])] };
            const workoutId = currentWorkout?.id;
            deleteExercise(exercise.id);
            toastWithUndo(t('workout.exerciseCard.exerciseRemoved'), () => {
              if (workoutId) restoreExercise(workoutId, exerciseSnapshot);
            });
          }}
          className="p-1 text-neutral-600 hover:text-rose-400 transition-colors"
        >
          <Trash2 size={16} />
        </button>
        )}
      </div>

      {showMedia && catalog && (
        <div className="px-4 pb-3 animate-fade-in">
          <ExerciseMedia exercise={catalog} compact />
        </div>
      )}

      {solo && (
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

      {/* Previous session info + overload suggestion */}
      {prevPerformed.length > 0 && (
        <div className="px-4 pb-1 animate-fade-in">
          <div className="flex items-start gap-1.5 flex-wrap">
            <div className="flex items-center gap-1 text-neutral-600 mt-0.5">
              <History size={11} />
              <span className="text-[10px] font-medium uppercase tracking-wider">{t('workout.exerciseCard.last')}</span>
            </div>
            {prevPerformed.map((s, i) => (
              <span key={i} className="text-[11px] text-neutral-500 bg-neutral-900/60 rounded px-1.5 py-0.5">
                {s.weight_kg > 0 ? formatWeight(s.weight_kg, weightUnit) : '\u2014'} \u00d7 {s.reps > 0 ? s.reps : '\u2014'}
                {showRir && s.rir > 0 ? <span className="text-neutral-600"> @{s.rir}</span> : null}
              </span>
            ))}
          </div>

          {history.length >= 2 && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[9px] text-neutral-700 uppercase tracking-wider mr-0.5">{t('workout.exerciseCard.trend')}</span>
              {history.slice(0, 5).reverse().map((h, i) => {
                const maxW = Math.max(...h.sets.filter(s => isPerformedSet(s) && s.weight_kg > 0).map(s => s.weight_kg), 0);
                const prevH = history.slice(0, 5).reverse()[i - 1];
                const prevMaxW = prevH ? Math.max(...prevH.sets.filter(s => isPerformedSet(s) && s.weight_kg > 0).map(s => s.weight_kg), 0) : 0;
                const isUp = i > 0 && maxW > prevMaxW;
                const isDown = i > 0 && maxW < prevMaxW;
                return (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      i === history.slice(0, 5).length - 1 ? 'bg-blue-400' :
                      isUp ? 'bg-emerald-500' : isDown ? 'bg-rose-500' : 'bg-neutral-600'
                    }`} />
                    {maxW > 0 && (
                      <span className="text-[8px] text-neutral-700">{weightUnit === 'lbs' ? kgToLbs(maxW) : maxW}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {suggestion && (
            <div className={`mt-1.5 flex items-center gap-1.5 px-2 py-1 rounded-lg w-fit
              ${suggestion.confidence === 'high'
                ? 'bg-blue-600/15 border border-blue-500/30'
                : suggestion.confidence === 'medium'
                ? 'bg-blue-600/10 border border-blue-500/20'
                : 'bg-neutral-800/60 border border-neutral-700/40'
              }`}>
              <TrendingUp size={10} className={suggestion.confidence === 'high' ? 'text-blue-400' : suggestion.confidence === 'medium' ? 'text-blue-400/70' : 'text-neutral-500'} />
              <span className={`text-[11px] font-medium ${suggestion.confidence === 'high' ? 'text-blue-300' : suggestion.confidence === 'medium' ? 'text-blue-400/80' : 'text-neutral-400'}`}>
                {t(SUGGESTION_KEY[suggestion.kind], {
                  weight: suggestion.suggestedWeight != null ? formatWeight(suggestion.suggestedWeight, weightUnit) : '—',
                  reps: suggestion.reps ?? '—',
                })}
              </span>
            </div>
          )}
        </div>
      )}

      {showNotes && (
        <div className="px-4 pb-2 animate-fade-in">
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
        <div className="px-4 pb-4 animate-fade-in">
          {/* Column headers */}
          {(exercise.sets?.length ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-600 font-medium uppercase tracking-wider mb-2 px-1">
              {showSets && <div className="w-5 text-center">#</div>}
              <div className="shrink-0 w-8">{t('workout.exerciseCard.type')}</div>
              {showLoad && <div className="flex-1 text-center">{t(weightUnit === 'lbs' ? 'workout.exerciseCard.weightLbs' : 'workout.exerciseCard.weight')}</div>}
              {showReps && (
                <div className="flex-1 text-center">
                  {exercise.sets?.some(s => s.set_type === 'isometric') ? t('workout.exerciseCard.reps') + '/s' : t('workout.exerciseCard.reps')}
                </div>
              )}
              {showRir && <div className="w-12 text-center">{t('workout.exerciseCard.rir')}</div>}
              <div className="w-12" />
              <div className="w-11" />
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
                Myo total: {myoTotalReps} reps ({myoSets.length} sets)
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
      <PlateCalc
        open={plateOpen}
        onClose={() => setPlateOpen(false)}
        load={plateLoad}
        unit={weightUnit}
      />
    </Card>
  );
}
