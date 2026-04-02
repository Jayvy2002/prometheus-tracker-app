import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, StickyNote, History } from 'lucide-react';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useAuthStore } from '../../stores/authStore';
import type { WorkoutExercise } from '../../lib/types';
import { SET_TYPES } from '../../lib/constants';
import Card from '../ui/Card';
import { useDraftContext } from './WorkoutDraftContext';
import { toastWithUndo } from '../ui/Toast';

function SetRow({ set, index, onDelete }: {
  set: { id: string; set_type: string; weight_kg: number; reps: number; rir: number };
  index: number;
  onDelete: () => void;
}) {
  const { initSetDraft, getSetDraft, updateSetDraft, updateSetType } = useDraftContext();
  const [localWeight, setLocalWeight] = useState('');
  const [localReps, setLocalReps] = useState('');
  const [localRir, setLocalRir] = useState('');
  const [localType, setLocalType] = useState(set.set_type);

  useEffect(() => {
    initSetDraft(set.id, set.weight_kg, set.reps, set.rir, set.set_type as any);
    const draft = getSetDraft(set.id);
    setLocalWeight(draft.weight_kg ?? (set.weight_kg ? String(set.weight_kg) : ''));
    setLocalReps(draft.reps ?? (set.reps ? String(set.reps) : ''));
    setLocalRir(draft.rir ?? (set.rir ? String(set.rir) : ''));
    setLocalType(draft.set_type ?? set.set_type);
  }, [set.id]);

  return (
    <div className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-neutral-900/60">
      <div className="col-span-1 text-xs text-neutral-500 font-medium">{index + 1}</div>
      <div className="col-span-3">
        <select
          value={localType}
          onChange={e => {
            setLocalType(e.target.value);
            updateSetType(set.id, e.target.value as any);
          }}
          className="w-full bg-transparent text-xs border-0 p-0 focus:ring-0 text-neutral-300"
        >
          {SET_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="col-span-3">
        <input
          type="number"
          inputMode="decimal"
          value={localWeight}
          onChange={e => {
            setLocalWeight(e.target.value);
            updateSetDraft(set.id, 'weight_kg', e.target.value);
          }}
          className="w-full bg-neutral-800/60 rounded px-2 py-1 text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="0"
        />
      </div>
      <div className="col-span-2">
        <input
          type="number"
          inputMode="numeric"
          value={localReps}
          onChange={e => {
            setLocalReps(e.target.value);
            updateSetDraft(set.id, 'reps', e.target.value);
          }}
          className="w-full bg-neutral-800/60 rounded px-2 py-1 text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="0"
        />
      </div>
      <div className="col-span-2">
        <input
          type="number"
          inputMode="numeric"
          value={localRir}
          onChange={e => {
            setLocalRir(e.target.value);
            updateSetDraft(set.id, 'rir', e.target.value);
          }}
          className="w-full bg-neutral-800/60 rounded px-2 py-1 text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="0"
        />
      </div>
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

export default function ExerciseCard({ exercise }: { exercise: WorkoutExercise }) {
  const { addSet, deleteSet, restoreSet, deleteExercise, restoreExercise, currentWorkout, fetchPreviousSets } = useWorkoutStore();
  const { user } = useAuthStore();
  const { initExerciseDraft, getExerciseDraft, updateExerciseDraft } = useDraftContext();
  const [expanded, setExpanded] = useState(true);
  const [showNotes, setShowNotes] = useState(!!exercise.notes);
  const [localNotes, setLocalNotes] = useState('');
  const [localName, setLocalName] = useState(exercise.name);
  const [prevSets, setPrevSets] = useState<{ weight_kg: number; reps: number; rir: number; set_type: string }[]>([]);

  useEffect(() => {
    initExerciseDraft(exercise.id, exercise.notes || '');
    const draft = getExerciseDraft(exercise.id);
    setLocalNotes(draft.notes ?? exercise.notes ?? '');
    setLocalName(exercise.name);
  }, [exercise.id]);

  useEffect(() => {
    if (!user || !currentWorkout) return;
    fetchPreviousSets(user.id, exercise.name, currentWorkout.id).then(setPrevSets);
  }, [user?.id, exercise.name, currentWorkout?.id]);

  const handleAddSet = () => {
    const idx = exercise.sets?.length ?? 0;
    addSet(exercise.id, idx);
  };

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
                {s.rir > 0 ? <span className="text-neutral-600"> @{s.rir}</span> : null}
              </span>
            ))}
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
            placeholder="Notes : tempo, indications, variante..."
            rows={2}
            className="w-full bg-neutral-900/60 border border-neutral-800/50 rounded-lg px-3 py-2 text-sm text-neutral-300 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
          />
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-4 animate-fade-in">
          {(exercise.sets?.length ?? 0) > 0 && (
            <div className="grid grid-cols-12 gap-2 text-[10px] text-neutral-500 font-medium uppercase tracking-wider mb-2 px-1">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Type</div>
              <div className="col-span-3">Kg</div>
              <div className="col-span-2">Reps</div>
              <div className="col-span-2">RIR</div>
              <div className="col-span-1"></div>
            </div>
          )}

          <div className="space-y-1.5">
            {exercise.sets?.map((set, i) => (
              <SetRow
                key={set.id}
                set={set}
                index={i}
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
