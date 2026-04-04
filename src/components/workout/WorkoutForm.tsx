import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FullPageLayout from '../layout/FullPageLayout';
import { ArrowLeft, Plus, Check, Clock, Play, Pause, RotateCcw } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { supabase } from '../../lib/supabase';
import { formatDuration } from '../../lib/utils';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ExerciseCard from './ExerciseCard';
import RestTimer from './RestTimer';
import ExercisePicker from './ExercisePicker';
import DateInput from '../ui/DateInput';
import { WorkoutDraftProvider, useDraftContext } from './WorkoutDraftContext';
import WorkoutSummaryScreen from './WorkoutSummaryScreen';
import type { Workout } from '../../lib/types';

function WorkoutFormInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = window.location.pathname;
  const { user } = useAuthStore();
  const {
    currentWorkout, fetchWorkout, createWorkout, updateWorkout,
    addExercise, setCurrentWorkout,
  } = useWorkoutStore();
  const { getAllSetDrafts, getAllExerciseDrafts } = useDraftContext();

  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [autoStartTimer, setAutoStartTimer] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [workoutName, setWorkoutName] = useState('');
  const [workoutDate, setWorkoutDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [summaryWorkout, setSummaryWorkout] = useState<Workout | null>(null);
  const [summaryDuration, setSummaryDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const [initError, setInitError] = useState(false);
  const createdRef = useRef(false);
  const isNew = !id || location.endsWith('/new');

  useEffect(() => {
    if (!user) return;

    if (isNew) {
      if (createdRef.current) return;
      createdRef.current = true;
      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T12:00:00`;
      createWorkout({ user_id: user.id, name: '', date: localDate })
        .then((workoutId) => {
          if (!workoutId) setInitError(true);
          else setRunning(true);
        })
        .catch(() => setInitError(true));
    } else if (id) {
      fetchWorkout(id);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentWorkout) {
      setWorkoutName(currentWorkout.name || '');
      setWorkoutDate(currentWorkout.date || '');
    }
  }, [currentWorkout?.id]);

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running]);

  const handleAddExercise = async (name: string) => {
    if (!currentWorkout) return;
    const idx = currentWorkout.exercises?.length ?? 0;
    await addExercise(currentWorkout.id, name, idx);
    setShowExercisePicker(false);
  };

  const handleStartRestTimer = () => {
    setAutoStartTimer(true);
    setShowTimer(true);
  };

  const handleFinish = async () => {
    if (!currentWorkout || saving) return;
    setSaving(true);

    try {
      const setDrafts = getAllSetDrafts();
      const exerciseDrafts = getAllExerciseDrafts();

      const safeFloat = (v: string) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
      const safeInt = (v: string) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };

      const setUpdates: PromiseLike<unknown>[] = [];
      setDrafts.forEach((draft, setId) => {
        const updates: Record<string, unknown> = {};
        if (draft.weight_kg !== undefined) updates.weight_kg = draft.weight_kg === '' ? 0 : safeFloat(draft.weight_kg);
        if (draft.reps !== undefined) updates.reps = draft.reps === '' ? 0 : safeInt(draft.reps);
        if (draft.rir !== undefined) updates.rir = draft.rir === '' ? 0 : safeInt(draft.rir);
        if (draft.set_type !== undefined) updates.set_type = draft.set_type;
        if (Object.keys(updates).length > 0) {
          setUpdates.push(
            supabase.from('workout_sets').update(updates).eq('id', setId)
          );
        }
      });

      const exerciseUpdates: PromiseLike<unknown>[] = [];
      exerciseDrafts.forEach((draft, exerciseId) => {
        const updates: Record<string, unknown> = {};
        if (draft.notes !== undefined) updates.notes = draft.notes;
        if (Object.keys(updates).length > 0) {
          exerciseUpdates.push(
            supabase.from('workout_exercises').update(updates).eq('id', exerciseId)
          );
        }
      });

      await Promise.all([...setUpdates, ...exerciseUpdates]);

      const workoutUpdates: Record<string, unknown> = {};
      if (workoutName !== currentWorkout.name) workoutUpdates.name = workoutName;
      if (workoutDate && workoutDate !== currentWorkout.date) workoutUpdates.date = workoutDate;
      if (Object.keys(workoutUpdates).length > 0) {
        await supabase.from('workouts').update(workoutUpdates).eq('id', currentWorkout.id);
      }

      const exerciseIds = (currentWorkout.exercises ?? []).map(e => e.id);
      if (exerciseIds.length > 0) {
        await supabase
          .from('workout_sets')
          .update({ completed: true })
          .in('exercise_id', exerciseIds)
          .neq('set_type', 'warmup');
      }

      const finalDuration = elapsed || currentWorkout.duration_seconds;
      await updateWorkout(currentWorkout.id, {
        completed: true,
        duration_seconds: finalDuration,
      });

      setRunning(false);

      // Show summary screen before navigating
      const snapshot = { ...currentWorkout, name: workoutName || currentWorkout.name };
      setSummaryDuration(finalDuration);
      setSummaryWorkout(snapshot);
      setCurrentWorkout(null);
    } finally {
      setSaving(false);
    }
  };

  if (summaryWorkout) {
    return (
      <WorkoutSummaryScreen
        workout={summaryWorkout}
        duration={summaryDuration}
        onClose={() => {
          setSummaryWorkout(null);
          navigate('/workout');
        }}
      />
    );
  }

  if (initError) {
    return (
      <div className="px-4 pt-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/workout')} className="p-2 -ml-2 text-neutral-400 hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <p className="text-red-400">Failed to create workout. Please try again.</p>
        </div>
        <Button onClick={() => navigate('/workout')} variant="secondary" className="w-full">
          Go Back
        </Button>
      </div>
    );
  }

  if (!currentWorkout) {
    return (
      <div className="px-4 pt-6 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-6">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => { setRunning(false); navigate('/workout'); }} className="p-2 -ml-2 text-neutral-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <Input
          value={workoutName}
          onChange={e => setWorkoutName(e.target.value)}
          placeholder="Workout name"
          className="text-lg font-semibold bg-transparent border-0 px-0 focus:ring-0"
        />
      </div>

      <div className="mb-4">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5 px-1">Session date</p>
        <DateInput
          value={workoutDate}
          onChange={dateStr => setWorkoutDate(dateStr)}
        />
      </div>

      <div className="flex items-center gap-3 mb-6 bg-neutral-900/60 rounded-xl p-3 border border-neutral-800/50">
        <Clock size={16} className="text-neutral-400" />
        <span className="text-white font-mono text-lg">{formatDuration(elapsed)}</span>
        <div className="flex-1" />
        <button onClick={() => setRunning(!running)} className="p-2 rounded-lg bg-neutral-800 text-neutral-300 hover:text-white transition-colors">
          {running ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          onClick={() => { setAutoStartTimer(false); setShowTimer(true); }}
          className="p-2 rounded-lg bg-neutral-800 text-neutral-300 hover:text-white transition-colors"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      <div className="space-y-4">
        {currentWorkout.exercises?.map(ex => (
          <ExerciseCard
            key={ex.id}
            exercise={ex}
            onStartRestTimer={handleStartRestTimer}
          />
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <Button variant="secondary" onClick={() => setShowExercisePicker(true)} className="w-full">
          <Plus size={16} /> Add Exercise
        </Button>
        <Button onClick={handleFinish} disabled={saving} className="w-full">
          <Check size={16} /> {saving ? 'Saving...' : 'Finish Workout'}
        </Button>
      </div>

      <RestTimer
        open={showTimer}
        autoStart={autoStartTimer}
        onClose={() => { setShowTimer(false); setAutoStartTimer(false); }}
      />
      <ExercisePicker open={showExercisePicker} onClose={() => setShowExercisePicker(false)} onSelect={handleAddExercise} />
    </div>
  );
}

export default function WorkoutForm() {
  return (
    <FullPageLayout>
      <WorkoutDraftProvider>
        <WorkoutFormInner />
      </WorkoutDraftProvider>
    </FullPageLayout>
  );
}
