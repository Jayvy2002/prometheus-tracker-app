import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, StickyNote, History, TrendingUp, Award, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useAuthStore } from '../../stores/authStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import type { WorkoutExercise, WorkoutSet, SetType } from '../../lib/types';
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

  const roundTo125 = (w: number) => Math.ceil(w / 1.25) * 1.25;

  if (sessions.length >= 3) {
    const maxWeights = sessions.slice(0, 3).map(s => Math.max(...s.workingSets.map(set => set.weight_kg)));
    const [w0, w1, w2] = maxWeights;

    if (w0 === w1 && w1 === w2) {
      const avgRirAll = sessions.slice(0, 3).flatMap(s => s.workingSets).reduce((sum, s) => sum + s.rir, 0) /
        sessions.slice(0, 3).flatMap(s => s.workingSets).length;

      if (avgRirAll <= 2) {
        const suggested = roundTo125(w0 * 1.025);
        return { text: `Stagnant 3× → ${suggested}kg`, suggestedWeight: suggested, confidence: 'high' };
      }
      return { text: `Same weight 3×. Push harder (lower RIR)`, suggestedWeight: null, confidence: 'low' };
    }

    if (w0 > w1 && w1 >= w2 && avgRirLatest <= 2) {
      const increment = w0 - w1;
      const suggested = roundTo125(w0 + increment);
      return { text: `Keep progressing → ${suggested}kg`, suggestedWeight: suggested, confidence: 'high' };
    }
  }

  if (sessions.length >= 2) {
    const maxWeightPrev = Math.max(...sessions[1].workingSets.map(s => s.weight_kg));

    if (maxWeightLatest > maxWeightPrev && avgRirLatest <= 2) {
      const suggested = roundTo125(maxWeightLatest * 1.025);
      return { text: `Progressing → try ${suggested}kg`, suggestedWeight: suggested, confidence: 'medium' };
    }

    if (maxWeightLatest < maxWeightPrev) {
      return { text: `Below last session (${maxWeightPrev}kg). Aim to match it.`, suggestedWeight: maxWeightPrev, confidence: 'low' };
    }
  }

  if (avgRirLatest <= 1) {
    const suggested = roundTo125(lastSet.weight_kg * 1.025);
    return { text: `${suggested}kg × ${lastSet.reps}`, suggestedWeight: suggested, confidence: 'medium' };
  }
  if (avgRirLatest <= 2) {
    return { text: `${lastSet.weight_kg}kg × ${lastSet.reps + 1}`, suggestedWeight: lastSet.weight_kg, confidence: 'low' };
  }

  return null;
}

function SetTypePicker({ currentType, onChange, onClose }: { currentType: string; onChange: (type: SetType) => void; onClose: () => void }) {
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
            <span className={`w-2 h-2 rounded-full ${t.color.replace('text-', 'bg-')}`} />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SetRow({
  set,
  index,
  showRir,
  suggestedWeight,
  prevSet,
  onDelete,
  onDuplicate,
  onSetComplete,
}: {
  set: WorkoutSet;
  index: number;
  showRir: boolean;
  suggestedWeight?: number | null;
  prevSet?: { weight_kg: number; reps: number; rir: number } | null;
  onDelete: () => void;
  onDuplicate: () => void;
  onSetComplete?: () => void;
}) {
  const { initSetDraft, getSetDraft, updateSetDraft, updateSetType, clearSetDraft } = useDraftContext();
  const { updateSet } = useWorkoutStore();
  const [localWeight, setLocalWeight] = useState('');
  const [localReps, setLocalReps] = useState('');
  const [localRir, setLocalRir] = useState('');
  const [localDuration, setLocalDuration] = useState('');
  const [localTempo, setLocalTempo] = useState('');
  const [localType, setLocalType] = useState(set.set_type);
  const [showTypePicker, setShowTypePicker] = useState(false);

  const isIsometric = localType === 'isometric';
  const isTempo = localType === 'tempo';

  useEffect(() => {
    initSetDraft(set.id, set.weight_kg, set.reps, set.rir, set.set_type as SetType, set.duration_seconds, set.tempo);
    const draft = getSetDraft(set.id);
    setLocalWeight(draft.weight_kg ?? (set.weight_kg ? String(set.weight_kg) : ''));
    setLocalReps(draft.reps ?? (set.reps ? String(set.reps) : ''));
    setLocalRir(draft.rir ?? (set.rir ? String(set.rir) : ''));
    setLocalDuration(draft.duration_seconds ?? (set.duration_seconds ? String(set.duration_seconds) : ''));
    setLocalTempo(draft.tempo ?? (set.tempo || ''));
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

  const handleFieldComplete = () => {
    const hasWeight = !!localWeight;
    const hasReps = isIsometric ? !!localDuration : !!localReps;
    const hasRir = !showRir || !!localRir;
    if (hasWeight && hasReps && hasRir && onSetComplete) {
      onSetComplete();
    }
  };

  const handleRepsBlur = () => {
    const r = parseInt(localReps, 10);
    updateSet(set.id, { reps: isNaN(r) ? 0 : r });
    if (!showRir) handleFieldComplete();
  };

  const handleRirBlur = () => {
    const r = parseInt(localRir, 10);
    updateSet(set.id, { rir: isNaN(r) ? 0 : r });
    handleFieldComplete();
  };

  const handleDurationBlur = () => {
    const d = parseInt(localDuration, 10);
    updateSet(set.id, { duration_seconds: isNaN(d) ? 0 : d });
    if (!showRir) handleFieldComplete();
  };

  const handleTempoBlur = () => {
    updateSet(set.id, { tempo: localTempo || null });
  };

  const handleTypeChange = (newType: SetType) => {
    setLocalType(newType);
    updateSetType(set.id, newType);
    updateSet(set.id, { set_type: newType });
  };

  useEffect(() => {
    return () => { clearSetDraft(set.id); };
  }, [set.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeInfo = SET_TYPES.find(t => t.value === localType) || SET_TYPES[1];
  const weightPlaceholder = suggestedWeight && !localWeight ? String(suggestedWeight) : prevSet?.weight_kg ? String(prevSet.weight_kg) : '0';
  const repsPlaceholder = prevSet?.reps ? String(prevSet.reps) : '0';

  const isFilled = !!localWeight && (isIsometric ? !!localDuration : !!localReps);

  return (
    <div className={`relative rounded-xl transition-all ${isFilled ? 'bg-neutral-900/80 ring-1 ring-emerald-500/20' : 'bg-neutral-900/60'}`}>
      <div className="flex items-center gap-1.5 p-2">
        {/* Index */}
        <div className="w-5 text-center text-[11px] text-neutral-600 font-semibold shrink-0">
          {index + 1}
        </div>

        {/* Type chip */}
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

        {/* Weight */}
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
              updateSet(set.id, { weight_kg: isNaN(w) ? 0 : w });
            }}
            className={`w-full rounded-lg px-2 py-1.5 text-xs text-white text-center font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all
              ${suggestedWeight && !localWeight && !set.weight_kg ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-neutral-800/80 border border-transparent'}`}
            placeholder={weightPlaceholder}
          />
        </div>

        {/* Reps or Duration */}
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
              className="w-full bg-neutral-800/80 border border-transparent rounded-lg px-2 py-1.5 text-xs text-white text-center font-medium focus:outline-none focus:ring-1 focus:ring-orange-500"
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
              className="w-full bg-neutral-800/80 border border-transparent rounded-lg px-2 py-1.5 text-xs text-white text-center font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={repsPlaceholder}
            />
          )}
        </div>

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
              className="w-full bg-neutral-800/80 border border-transparent rounded-lg px-2 py-1.5 text-xs text-white text-center font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="RIR"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onDuplicate}
            className="p-1 text-neutral-700 hover:text-blue-400 transition-colors"
            title="Duplicate"
          >
            <Copy size={11} />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-neutral-700 hover:text-rose-400 transition-colors"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Tempo row -- shown below the main row */}
      {isTempo && (
        <div className="px-2 pb-2 -mt-0.5 animate-fade-in">
          <div className="flex items-center gap-2 pl-6">
            <span className="text-[10px] text-teal-400/70 font-medium shrink-0">Tempo</span>
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

      {/* Completion indicator */}
      {isFilled && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-emerald-500/60" />
      )}
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
  const { t } = useTranslation();
  const { addSet, deleteSet, restoreSet, deleteExercise, restoreExercise, updateExercise, updateSet, currentWorkout, fetchExerciseHistory } = useWorkoutStore();
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
      });
    }
  };

  const suggestion = getOverloadSuggestion(history);
  const prevSets = history[0]?.sets ?? [];

  const maxHistoricalWeight = history.length > 0
    ? Math.max(...history.flatMap(h => h.sets.filter(s => s.set_type === 'working').map(s => s.weight_kg)).filter(w => w > 0))
    : 0;
  const currentMaxWeight = exercise.sets
    ? Math.max(...(exercise.sets.filter(s => s.set_type === 'working' && s.weight_kg > 0).map(s => s.weight_kg)), 0)
    : 0;
  const isPR = currentMaxWeight > 0 && maxHistoricalWeight > 0 && currentMaxWeight > maxHistoricalWeight;

  const completedCount = exercise.sets?.filter(s => {
    const hasWeight = s.weight_kg > 0;
    const hasReps = s.set_type === 'isometric' ? (s.duration_seconds ?? 0) > 0 : s.reps > 0;
    return hasWeight && hasReps;
  }).length ?? 0;
  const totalSets = exercise.sets?.length ?? 0;

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
            toastWithUndo(t('workout.exerciseCard.exerciseRemoved'), () => {
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
              <span className="text-[10px] font-medium uppercase tracking-wider">{t('workout.exerciseCard.last')}</span>
            </div>
            {prevSets.filter(s => s.set_type === 'working').map((s, i) => (
              <span key={i} className="text-[11px] text-neutral-500 bg-neutral-900/60 rounded px-1.5 py-0.5">
                {s.weight_kg > 0 ? `${s.weight_kg}kg` : '—'} × {s.reps > 0 ? s.reps : '—'}
                {showRir && s.rir > 0 ? <span className="text-neutral-600"> @{s.rir}</span> : null}
              </span>
            ))}
          </div>

          {history.length >= 2 && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[9px] text-neutral-700 uppercase tracking-wider mr-0.5">{t('workout.exerciseCard.trend')}</span>
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
              <div className="w-5 text-center">#</div>
              <div className="shrink-0 w-8">{t('workout.exerciseCard.type')}</div>
              <div className="flex-1 text-center">{t('workout.exerciseCard.weight')}</div>
              <div className="flex-1 text-center">
                {exercise.sets?.some(s => s.set_type === 'isometric') ? t('workout.exerciseCard.reps') + '/s' : t('workout.exerciseCard.reps')}
              </div>
              {showRir && <div className="w-12 text-center">{t('workout.exerciseCard.rir')}</div>}
              <div className="w-12"></div>
            </div>
          )}

          <div className="space-y-1.5">
            {exercise.sets?.map((set, i) => {
              const prevWorkingIndex = prevSets.filter(s => s.set_type === 'working');
              const matchingPrev = prevWorkingIndex[i] ?? null;
              return (
                <SetRow
                  key={set.id}
                  set={set}
                  index={i}
                  showRir={showRir}
                  suggestedWeight={suggestion?.suggestedWeight}
                  prevSet={matchingPrev}
                  onSetComplete={onStartRestTimer}
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

          <button
            onClick={handleAddSet}
            className="mt-3 w-full py-2.5 text-xs text-neutral-400 hover:text-blue-400 font-medium flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-800 hover:border-blue-500/30 transition-all"
          >
            <Plus size={14} /> {t('workout.exerciseCard.addSet')}
          </button>
        </div>
      )}
    </Card>
  );
}
