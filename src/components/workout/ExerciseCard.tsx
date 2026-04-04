import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, StickyNote, History, TrendingUp } from 'lucide-react';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useAuthStore } from '../../stores/authStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import type { WorkoutExercise, SetType } from '../../lib/types';
import { SET_TYPES } from '../../lib/constants';
import Card from '../ui/Card';
import { useDraftContext } from './WorkoutDraftContext';
import { toastWithUndo } from '../ui/Toast';

interface PreviousSet {
  weight_kg: number;
  reps: number;
  rir: number;
  set_type: string;
  order_index: number;
}

function getOverloadSuggestion(prevSets: PreviousSet[]): string | null {
  const workingSets = prevSets.filter(s => s.set_type === 'working' && s.weight_kg > 0 && s.reps > 0);
  if (workingSets.length === 0) return null;
  const avgRir = workingSets.reduce((sum, s) => sum + s.rir, 0) / workingSets.length;
  const lastSet = workingSets[workingSets.length - 1];
  if (avgRir <= 1) {
    // Near failure — suggest ~2.5% increase rounded to nearest 1.25 kg
    const raw = lastSet.weight_kg * 1.025;
    const suggested = Math.ceil(raw / 1.25) * 1.25;
    return `Try ${suggested}kg × ${lastSet.reps}`;
  }
  if (avgRir <= 2) {
    return `Try ${lastSet.weight_kg}kg × ${lastSet.reps + 1}`;
  }
  return null;
}

function SetRow({
  set,
  index,
  showRir,
  onDelete,
  onSetComplete,
}: {
  set: { id: string; set_type: string; weight_kg: number; reps: number; rir: number };
  index: number;
  showRir: boolean;
  onDelete: () => void;
  onSetComplete?: () => void;
}) {
  const { initSetDraft, getSetDraft, updateSetDraft, updateSetType } = useDraftContext();
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

  const cols = showRir ? 'grid-cols-12' : 'grid-cols-11';

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
          className="w-full bg-neutral-800/60 rounded px-2 py-1 text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="0"
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
  const { addSet, deleteSet, restoreSet, deleteExercise, restoreExercise, updateExercise, currentWorkout, fetchPreviousSets } = useWorkoutStore();
  const { user } = useAuthStore();
  const { showRir } = usePreferencesStore();
  const { initExerciseDraft, getExerciseDraft, updateExerciseDraft } = useDraftContext();
  const [expanded, setExpanded] = useState(true);
  const [showNotes, setShowNotes] = useState(!!exercise.notes);
  const [localNotes, setLocalNotes] = useState('');
  const [localName, setLocalName] = useState(exercise.name);
  const [prevSets, setPrevSets] = useState<PreviousSet[]>([]);

  useEffect(() => {
    initExerciseDraft(exercise.id, exercise.notes || '');
    const draft = getExerciseDraft(exercise.id);
    setLocalNotes(draft.notes ?? exercise.notes ?? '');
    setLocalName(exercise.name);
  }, [exercise.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || !currentWorkout) return;
    fetchPreviousSets(user.id, exercise.name, currentWorkout.id).then(setPrevSets);
  }, [user?.id, exercise.name, currentWorkout?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddSet = () => {
    const idx = exercise.sets?.length ?? 0;
    addSet(exercise.id, idx);
  };

  const suggestion = getOverloadSuggestion(prevSets);

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

      {/* Previous session info */}
      {prevSets.length > 0 && (
        <div className="px-4 pb-1 animate-fade-in">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1 text-neutral-600">
              <History size={11} />
              <span className="text-[10px] font-medium uppercase tracking-wider">Last time</span>
            </div>
            {prevSets.map((s, i) => (
              <span key={i} className="text-[11px] text-neutral-500 bg-neutral-900/60 rounded px-1.5 py-0.5">
                {s.weight_kg > 0 ? `${s.weight_kg}kg` : '—'} × {s.reps > 0 ? s.reps : '—'}
                {showRir && s.rir > 0 ? <span className="text-neutral-600"> @{s.rir}</span> : null}
              </span>
            ))}
            {/* Progressive overload suggestion */}
            {suggestion && (
              <span className="flex items-center gap-0.5 text-[11px] text-blue-400 bg-blue-500/10 rounded px-1.5 py-0.5 font-medium">
                <TrendingUp size={9} />
                {suggestion}
              </span>
            )}
          </div>
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
