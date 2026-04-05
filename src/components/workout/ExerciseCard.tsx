import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, StickyNote, History, TrendingUp, Award } from 'lucide-react';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useAuthStore } from '../../stores/authStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import type { WorkoutExercise, SetType } from '../../lib/types';
import type { ExerciseSession } from '../../stores/workoutStore';
import { SET_TYPES } from '../../lib/constants';
import Card from '../ui/Card';
import { useDraftContext } from './WorkoutDraftContext';
import { toastWithUndo } from '../ui/Toast';

interface OverloadResult {
  text: string;
  suggestedWeight: number | null;
  confidence: 'low' | 'medium' | 'high';
}

function getOverloadSuggestion(history: ExerciseSession[]): OverloadResult | null {
  // Filter to sessions that have real working sets
  const sessions = history
    .map(h => ({
      date: h.date,
      workingSets: h.sets.filter(s => s.set_type === 'working' && s.weight_kg > 0 && s.reps > 0),
    }))
    .filter(s => s.workingSets.length > 0);

  if (sessions.length === 0) return null;

  const latest = sessions[0];
  const avgRirLatest = latest.workingSets.reduce((sum, s) => sum + s.rir, 0) / latest.workingSets.length;
  const maxWeightLatest = Math.max(...latest.workingSets.map(s => s.weight_kg));
  const lastSet = latest.workingSets[latest.workingSets.length - 1];

  // Round weight to nearest 1.25kg increment (standard plate)
  const roundTo125 = (w: number) => Math.ceil(w / 1.25) * 1.25;

  if (sessions.length >= 3) {
    const maxWeights = sessions.slice(0, 3).map(s => Math.max(...s.workingSets.map(set => set.weight_kg)));
    const [w0, w1, w2] = maxWeights;

    // Long stagnation: same weight for 3+ sessions
    if (w0 === w1 && w1 === w2) {
      const avgRirAll = sessions.slice(0, 3).flatMap(s => s.workingSets).reduce((sum, s) => sum + s.rir, 0) /
        sessions.slice(0, 3).flatMap(s => s.workingSets).length;

      if (avgRirAll <= 2) {
        // Stuck for 3 sessions → suggest weight jump
        const suggested = roundTo125(w0 * 1.025);
        return { text: `Stagnant 3× → ${suggested}kg`, suggestedWeight: suggested, confidence: 'high' };
      }
      // Stagnant but high RIR → need more effort first
      return { text: `Same weight 3×. Push harder (lower RIR)`, suggestedWeight: null, confidence: 'low' };
    }

    // Consistent progress last 3 sessions → extrapolate next step
    if (w0 > w1 && w1 >= w2 && avgRirLatest <= 2) {
      const increment = w0 - w1;
      const suggested = roundTo125(w0 + increment);
      return { text: `Keep progressing → ${suggested}kg`, suggestedWeight: suggested, confidence: 'high' };
    }
  }

  if (sessions.length >= 2) {
    const maxWeightPrev = Math.max(...sessions[1].workingSets.map(s => s.weight_kg));

    // Weight went up last session and RIR is still low → continue
    if (maxWeightLatest > maxWeightPrev && avgRirLatest <= 2) {
      const suggested = roundTo125(maxWeightLatest * 1.025);
      return { text: `Progressing → try ${suggested}kg`, suggestedWeight: suggested, confidence: 'medium' };
    }

    // Regression detected
    if (maxWeightLatest < maxWeightPrev) {
      return { text: `Below last session (${maxWeightPrev}kg). Aim to match it.`, suggestedWeight: maxWeightPrev, confidence: 'low' };
    }
  }

  // Single session fallback
  if (avgRirLatest <= 1) {
    const suggested = roundTo125(lastSet.weight_kg * 1.025);
    return { text: `${suggested}kg × ${lastSet.reps}`, suggestedWeight: suggested, confidence: 'medium' };
  }
  if (avgRirLatest <= 2) {
    return { text: `${lastSet.weight_kg}kg × ${lastSet.reps + 1}`, suggestedWeight: lastSet.weight_kg, confidence: 'low' };
  }

  return null;
}

function SetRow({
  set,
  index,
  showRir,
  suggestedWeight,
  onDelete,
  onSetComplete,
}: {
  set: { id: string; set_type: string; weight_kg: number; reps: number; rir: number };
  index: number;
  showRir: boolean;
  suggestedWeight?: number | null;
  onDelete: () => void;
  onSetComplete?: () => void;
}) {
  const { initSetDraft, getSetDraft, updateSetDraft, updateSetType, clearSetDraft } = useDraftContext();
  const { updateSet } = useWorkoutStore();
  const [localWeight, setLocalWeight] = useState('');
  const [localReps, setLocalReps] = useState('');
  const [localRir, setLocalRir] = useState('');
  const [localType, setLocalType] = useState(set.set_type);

  useEffect(() => {
    initSetDraft(set.id, set.weight_kg, set.reps, set.rir, set.set_type as SetType);
    const draft = getSetDraft(set.id);
    setLocalWeight(draft.weight_kg ?? (set.weight_kg ? String(set.weight_kg) : ''));
    setLocalReps(draft.reps ?? (set.reps ? String(set.reps) : ''));
    setLocalRir(draft.rir ?? (set.rir ? String(set.rir) : ''));
    setLocalType(draft.set_type ?? set.set_type);
  }, [set.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const draft = getSetDraft(set.id);
    if (!draft.weight_kg || draft.weight_kg === localWeight) {
      const newVal = set.weight_kg ? String(set.weight_kg) : '';
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
    if (!showRir && localReps && onSetComplete) {
      onSetComplete();
    }
  };

  const handleRirBlur = () => {
    const r = parseInt(localRir, 10);
    updateSet(set.id, { rir: isNaN(r) ? 0 : r });
    if (localReps && onSetComplete) {
      onSetComplete();
    }
  };

  useEffect(() => {
    return () => { clearSetDraft(set.id); };
  }, [set.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cols = showRir ? 'grid-cols-12' : 'grid-cols-11';
  const weightPlaceholder = suggestedWeight && !localWeight ? String(suggestedWeight) : '0';

  return (
    <div className={`grid ${cols} gap-2 items-center p-2 rounded-lg bg-neutral-900/60`}>
      <div className="col-span-1 text-xs text-neutral-500 font-medium">{index + 1}</div>
      <div className="col-span-3">
        <select
          value={localType}
          onChange={e => {
            setLocalType(e.target.value);
            updateSetType(set.id, e.target.value as SetType);
          }}
          className="w-full bg-transparent text-xs border-0 p-0 focus:ring-0 text-neutral-300"
        >
          {SET_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className={showRir ? 'col-span-3' : 'col-span-4'}>
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
            updateSet(set.id, { weight_kg: isNaN(w) ? 0 : w });
          }}
          className={`w-full rounded px-2 py-1 text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500
            ${suggestedWeight && !localWeight && !set.weight_kg ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-neutral-800/60'}`}
          placeholder={weightPlaceholder}
        />
      </div>
      <div className={showRir ? 'col-span-2' : 'col-span-2'}>
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
          className="w-full bg-neutral-800/60 rounded px-2 py-1 text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="0"
        />
      </div>
      {showRir && (
        <div className="col-span-2">
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
            className="w-full bg-neutral-800/60 rounded px-2 py-1 text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="0"
          />
        </div>
      )}
      <div className="col-span-1 flex items-center justify-end">
        <button
          onClick={onDelete}
          className="text-neutral-600 hover:text-rose-400 transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

export default function ExerciseCard({
  exercise,
  onStartRestTimer,
}: {
  exercise: WorkoutExercise;
  onStartRestTimer?: () => void;
}) {
  const { addSet, deleteSet, restoreSet, deleteExercise, restoreExercise, updateExercise, currentWorkout, fetchExerciseHistory } = useWorkoutStore();
  const { user } = useAuthStore();
  const { showRir } = usePreferencesStore();
  const { initExerciseDraft, getExerciseDraft, updateExerciseDraft, clearExerciseDraft } = useDraftContext();
  const [expanded, setExpanded] = useState(true);
  const [showNotes, setShowNotes] = useState(!!exercise.notes);
  const [localNotes, setLocalNotes] = useState('');
  const [localName, setLocalName] = useState(exercise.name);
  const [history, setHistory] = useState<ExerciseSession[]>([]);

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
    if (!user || !currentWorkout) return;
    fetchExerciseHistory(user.id, exercise.name, currentWorkout.id, 5).then(setHistory);
  }, [user?.id, exercise.name, currentWorkout?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddSet = () => {
    const idx = exercise.sets?.length ?? 0;
    addSet(exercise.id, idx);
  };

  const suggestion = getOverloadSuggestion(history);
  const prevSets = history[0]?.sets ?? [];

  // Check for all-time PRs among history
  const maxHistoricalWeight = history.length > 0
    ? Math.max(...history.flatMap(h => h.sets.filter(s => s.set_type === 'working').map(s => s.weight_kg)).filter(w => w > 0))
    : 0;
  const currentMaxWeight = exercise.sets
    ? Math.max(...(exercise.sets.filter(s => s.set_type === 'working' && s.weight_kg > 0).map(s => s.weight_kg)), 0)
    : 0;
  const isPR = currentMaxWeight > 0 && maxHistoricalWeight > 0 && currentMaxWeight > maxHistoricalWeight;

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
          placeholder="Exercise name"
          readOnly
        />
        {isPR && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 rounded px-1.5 py-0.5 font-bold">
            <Award size={10} />
            PR
          </span>
        )}
        <button
          onClick={() => setShowNotes(!showNotes)}
          className={`p-1 transition-colors ${showNotes || localNotes ? 'text-blue-400 hover:text-blue-300' : 'text-neutral-600 hover:text-neutral-400'}`}
        >
          <StickyNote size={16} />
        </button>
        <button
          onClick={() => {
            const exerciseSnapshot = { ...exercise, sets: [...(exercise.sets ?? [])] };
            const workoutId = currentWorkout?.id;
            deleteExercise(exercise.id);
            toastWithUndo('Exercise removed', () => {
              if (workoutId) restoreExercise(workoutId, exerciseSnapshot);
            });
          }}
          className="p-1 text-neutral-600 hover:text-rose-400 transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Previous session info + overload suggestion */}
      {prevSets.length > 0 && (
        <div className="px-4 pb-1 animate-fade-in">
          <div className="flex items-start gap-1.5 flex-wrap">
            <div className="flex items-center gap-1 text-neutral-600 mt-0.5">
              <History size={11} />
              <span className="text-[10px] font-medium uppercase tracking-wider">Last</span>
            </div>
            {prevSets.filter(s => s.set_type === 'working').map((s, i) => (
              <span key={i} className="text-[11px] text-neutral-500 bg-neutral-900/60 rounded px-1.5 py-0.5">
                {s.weight_kg > 0 ? `${s.weight_kg}kg` : '—'} × {s.reps > 0 ? s.reps : '—'}
                {showRir && s.rir > 0 ? <span className="text-neutral-600"> @{s.rir}</span> : null}
              </span>
            ))}
          </div>

          {/* History trend dots (up to 5 sessions) */}
          {history.length >= 2 && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[9px] text-neutral-700 uppercase tracking-wider mr-0.5">Trend</span>
              {history.slice(0, 5).reverse().map((h, i) => {
                const maxW = Math.max(...h.sets.filter(s => s.set_type === 'working' && s.weight_kg > 0).map(s => s.weight_kg), 0);
                const prevH = history.slice(0, 5).reverse()[i - 1];
                const prevMaxW = prevH ? Math.max(...prevH.sets.filter(s => s.set_type === 'working' && s.weight_kg > 0).map(s => s.weight_kg), 0) : 0;
                const isUp = i > 0 && maxW > prevMaxW;
                const isDown = i > 0 && maxW < prevMaxW;
                return (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      i === history.slice(0, 5).length - 1 ? 'bg-blue-400' :
                      isUp ? 'bg-emerald-500' : isDown ? 'bg-rose-500' : 'bg-neutral-600'
                    }`} />
                    {maxW > 0 && (
                      <span className="text-[8px] text-neutral-700">{maxW}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Overload suggestion */}
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
                {suggestion.text}
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
            placeholder="Notes : tempo, indications, variante..."
            rows={2}
            className="w-full bg-neutral-900/60 border border-neutral-800/50 rounded-lg px-3 py-2 text-sm text-neutral-300 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
          />
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-4 animate-fade-in">
          {(exercise.sets?.length ?? 0) > 0 && (
            <div className={`grid ${showRir ? 'grid-cols-12' : 'grid-cols-11'} gap-2 text-[10px] text-neutral-500 font-medium uppercase tracking-wider mb-2 px-1`}>
              <div className="col-span-1">#</div>
              <div className="col-span-3">Type</div>
              <div className={showRir ? 'col-span-3' : 'col-span-4'}>Kg</div>
              <div className="col-span-2">Reps</div>
              {showRir && <div className="col-span-2">RIR</div>}
              <div className="col-span-1"></div>
            </div>
          )}

          <div className="space-y-1.5">
            {exercise.sets?.map((set, i) => (
              <SetRow
                key={set.id}
                set={set}
                index={i}
                showRir={showRir}
                suggestedWeight={suggestion?.suggestedWeight}
                onSetComplete={onStartRestTimer}
                onDelete={() => {
                  const setSnapshot = { ...set } as import('../../lib/types').WorkoutSet;
                  const exerciseId = exercise.id;
                  deleteSet(setSnapshot.id);
                  toastWithUndo('Set removed', () => restoreSet(exerciseId, setSnapshot));
                }}
              />
            ))}
          </div>

          <button
            onClick={handleAddSet}
            className="mt-2 w-full py-2 text-xs text-neutral-400 hover:text-blue-400 font-medium flex items-center justify-center gap-1 transition-colors"
          >
            <Plus size={14} /> Add Set
          </button>
        </div>
      )}
    </Card>
  );
}
