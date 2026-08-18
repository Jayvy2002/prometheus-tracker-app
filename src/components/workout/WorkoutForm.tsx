import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FullPageLayout from '../layout/FullPageLayout';
import { ArrowLeft, Plus, Check, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { supabase } from '../../lib/supabase';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ExerciseCard from './ExerciseCard';
import SupersetGroup from './SupersetGroup';
import RestTimer from './RestTimer';
import ExercisePicker from './ExercisePicker';
import DateInput from '../ui/DateInput';
import { WorkoutDraftProvider, useDraftContext } from './WorkoutDraftContext';
import WorkoutSummaryScreen from './WorkoutSummaryScreen';
import type { Workout } from '../../lib/types';

function WorkoutFormInner() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = window.location.pathname;
  const { user } = useAuthStore();
  const {
    currentWorkout, fetchWorkout, createWorkout, updateWorkout,
    addExercise, setCurrentWorkout,
  } = useWorkoutStore();
  const { getAllSetDrafts, getAllExerciseDrafts } = useDraftContext();

  const [showTimer, setShowTimer] = useState(false);
  const [, setAutoStartTimer] = useState(false);

  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [workoutName, setWorkoutName] = useState('');
  const [workoutDate, setWorkoutDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [summaryWorkout, setSummaryWorkout] = useState<Workout | null>(null);
  const [summaryDuration, setSummaryDuration] = useState(0);
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
        })
        .catch(() => setInitError(true));
    } else if (id) {
      fetchWorkout(id);
    }

  }, [user, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentWorkout) {
      setWorkoutName(currentWorkout.name || '');
      setWorkoutDate(currentWorkout.date || '');
    }
  }, [currentWorkout?.id]);

  const handleAddExercise = async (name: string) => {
    if (!currentWorkout) return;
    const idx = currentWorkout.exercises?.length ?? 0;
    await addExercise(currentWorkout.id, name, idx);
    setShowExercisePicker(false);
  };

  const handleStartRestTimer = () => {
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
        if (draft.duration_seconds !== undefined) updates.duration_seconds = draft.duration_seconds === '' ? null : safeInt(draft.duration_seconds);
        if (draft.tempo !== undefined) updates.tempo = draft.tempo === '' ? null : draft.tempo;
        if (draft.cluster_rest_seconds !== undefined) updates.cluster_rest_seconds = draft.cluster_rest_seconds === '' ? null : safeInt(draft.cluster_rest_seconds);
        if (draft.cluster_reps_per_burst !== undefined) updates.cluster_reps_per_burst = draft.cluster_reps_per_burst === '' ? null : safeInt(draft.cluster_reps_per_burst);
        if (draft.myo_is_activation !== undefined) updates.myo_is_activation = draft.myo_is_activation;
        if (draft.drop_percentage !== undefined) updates.drop_percentage = draft.drop_percentage === '' ? null : safeInt(draft.drop_percentage);
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

      const finalDuration = currentWorkout.duration_seconds || 0;
      await updateWorkout(currentWorkout.id, {
        completed: true,
        duration_seconds: finalDuration,
      });

      // Build snapshot with draft values merged in so the summary reflects actual saved data
      const mergedExercises = (currentWorkout.exercises ?? []).map(ex => ({
        ...ex,
        sets: (ex.sets ?? []).map(s => {
          const draft = setDrafts.get(s.id);
          if (!draft) return s;
          return {
            ...s,
            weight_kg: draft.weight_kg !== undefined ? (draft.weight_kg === '' ? 0 : safeFloat(draft.weight_kg)) : s.weight_kg,
            reps: draft.reps !== undefined ? (draft.reps === '' ? 0 : safeInt(draft.reps)) : s.reps,
            rir: draft.rir !== undefined ? (draft.rir === '' ? 0 : safeInt(draft.rir)) : s.rir,
            set_type: draft.set_type !== undefined ? draft.set_type : s.set_type,
            duration_seconds: draft.duration_seconds !== undefined ? (draft.duration_seconds === '' ? null : safeInt(draft.duration_seconds)) : s.duration_seconds,
            tempo: draft.tempo !== undefined ? (draft.tempo === '' ? null : draft.tempo) : s.tempo,
          };
        }),
      }));

      const snapshot = { ...currentWorkout, name: workoutName || currentWorkout.name, exercises: mergedExercises };
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
          <p className="text-red-400">{t('workout.createFailed')}</p>
        </div>
        <Button onClick={() => navigate('/workout')} variant="secondary" className="w-full">
          {t('workout.goBack')}
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
        <button onClick={() => navigate('/workout')} className="p-2 -ml-2 text-neutral-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <Input
          value={workoutName}
          onChange={e => setWorkoutName(e.target.value)}
          placeholder={t('workout.workoutName')}
          className="text-lg font-semibold bg-transparent border-0 px-0 focus:ring-0"
        />
        <button
          onClick={() => { setAutoStartTimer(false); setShowTimer(true); }}
          className="p-2 rounded-lg bg-neutral-900 text-neutral-400 hover:text-white transition-colors"
          title={t('workout.restTimer.title')}
        >
          <Timer size={18} />
        </button>
      </div>

      <div className="mb-4">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5 px-1">{t('workout.sessionDate')}</p>
        <DateInput
          value={workoutDate}
          onChange={dateStr => setWorkoutDate(dateStr)}
        />
      </div>

      <div className="space-y-4">
        {(() => {
          const exercises = currentWorkout.exercises ?? [];
          const rendered = new Set<string>();
          const items: React.ReactNode[] = [];

          for (const ex of exercises) {
            if (rendered.has(ex.id)) continue;

            if (ex.superset_group_id) {
              const group = exercises.filter(e => e.superset_group_id === ex.superset_group_id);
              group.forEach(g => rendered.add(g.id));
              items.push(
                <SupersetGroup
                  key={`ss-${ex.superset_group_id}`}
                  exercises={group}
                  onStartRestTimer={handleStartRestTimer}
                />
              );
            } else {
              rendered.add(ex.id);
              items.push(
                <ExerciseCard
                  key={ex.id}
                  exercise={ex}
                  onStartRestTimer={handleStartRestTimer}
                />
              );
            }
          }
          return items;
        })()}
      </div>

      <div className="mt-4 space-y-3">
        <Button variant="secondary" onClick={() => setShowExercisePicker(true)} className="w-full">
          <Plus size={16} /> {t('workout.addExercise')}
        </Button>
        <Button onClick={handleFinish} disabled={saving} className="w-full">
          <Check size={16} /> {saving ? t('common.saving') : t('workout.finishWorkout')}
        </Button>
      </div>

      <RestTimer
        open={showTimer}
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
