import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, GripVertical, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useRoutineStore } from '../../stores/routineStore';
import type { Routine, RoutineExercise } from '../../lib/types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ExercisePicker from '../workout/ExercisePicker';

interface Props {
  routine: Routine | null;
  onClose: () => void;
}

export default function RoutineForm({ routine, onClose }: Props) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { createRoutine, updateRoutine, addRoutineExercise, deleteRoutineExercise, updateRoutineExercise, fetchRoutineWithExercises } = useRoutineStore();
  const [name, setName] = useState(routine?.name ?? '');
  const [description, setDescription] = useState(routine?.description ?? '');
  const [exercises, setExercises] = useState<RoutineExercise[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (routine) {
      fetchRoutineWithExercises(routine.id).then(r => {
        if (r) {
          const exs = (r as unknown as { routine_exercises?: RoutineExercise[] }).routine_exercises ?? r.exercises ?? [];
          setExercises(exs.sort((a, b) => a.order_index - b.order_index));
        }
      });
    }
  }, [routine]);

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);

    if (routine) {
      await updateRoutine(routine.id, { name, description });
      const updates = exercises.map(ex =>
        updateRoutineExercise(ex.id, {
          default_sets: ex.default_sets,
          default_reps: ex.default_reps,
          default_rest_seconds: ex.default_rest_seconds,
          order_index: ex.order_index,
        })
      );
      await Promise.all(updates);
    } else {
      const routineId = await createRoutine({ user_id: user.id, name, description });
      if (routineId) {
        for (const ex of exercises) {
          await addRoutineExercise(routineId, {
            name: ex.name,
            default_sets: ex.default_sets,
            default_reps: ex.default_reps,
            default_rest_seconds: ex.default_rest_seconds,
            order_index: ex.order_index,
          });
        }
      }
    }
    setSaving(false);
    onClose();
  };

  const addLocal = (name: string) => {
    setExercises(prev => [...prev, {
      id: crypto.randomUUID(),
      routine_id: routine?.id ?? '',
      name,
      default_sets: 3,
      default_reps: 10,
      default_rest_seconds: 90,
      order_index: prev.length,
      notes: '',
      created_at: new Date().toISOString(),
    }]);
    setShowPicker(false);
  };

  const removeEx = async (ex: RoutineExercise) => {
    if (routine && ex.routine_id) {
      await deleteRoutineExercise(ex.id);
    }
    setExercises(prev => prev.filter(e => e.id !== ex.id));
  };

  const updateLocal = (id: string, field: string, value: number) => {
    setExercises(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-neutral-950 border border-neutral-800/60 rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col shadow-2xl z-10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800/60 shrink-0">
          <h2 className="text-lg font-bold text-white">{routine ? t('routines.form.editTitle') : t('routines.form.newTitle')}</h2>
          <button onClick={onClose} className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {routine && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-neutral-900/60 border border-neutral-800/50">
              <Info size={13} className="text-neutral-500 mt-0.5 shrink-0" />
              <p className="text-xs text-neutral-500">{t('routines.form.editWarning')}</p>
            </div>
          )}

          <div className="space-y-4">
            <Input label={t('routines.form.name')} value={name} onChange={e => setName(e.target.value)} placeholder="Push Day" />
            <Input label={t('routines.form.description')} value={description} onChange={e => setDescription(e.target.value)} placeholder="Chest, shoulders, triceps" />
          </div>

          <div>
            <h3 className="text-sm font-medium text-neutral-400 mb-3">{t('routines.form.exercises')}</h3>
            <div className="space-y-2">
              {exercises.map((ex) => (
                <div key={ex.id} className="bg-neutral-900/60 border border-neutral-800/50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <GripVertical size={14} className="text-neutral-600" />
                    <span className="text-sm font-medium text-white flex-1">{ex.name}</span>
                    <button onClick={() => removeEx(ex)} className="text-neutral-600 hover:text-rose-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-neutral-500 uppercase">{t('routines.form.sets')}</label>
                      <input
                        type="number" inputMode="numeric" value={ex.default_sets || ''}
                        onChange={e => updateLocal(ex.id, 'default_sets', +e.target.value || 0)}
                        className="w-full bg-neutral-800/60 rounded px-2 py-1 text-xs text-white text-center mt-1 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-500 uppercase">{t('routines.form.reps')}</label>
                      <input
                        type="number" inputMode="numeric" value={ex.default_reps || ''}
                        onChange={e => updateLocal(ex.id, 'default_reps', +e.target.value || 0)}
                        className="w-full bg-neutral-800/60 rounded px-2 py-1 text-xs text-white text-center mt-1 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-500 uppercase">{t('routines.form.rest')}</label>
                      <input
                        type="number" inputMode="numeric" value={ex.default_rest_seconds || ''}
                        onChange={e => updateLocal(ex.id, 'default_rest_seconds', +e.target.value || 0)}
                        className="w-full bg-neutral-800/60 rounded px-2 py-1 text-xs text-white text-center mt-1 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button variant="secondary" onClick={() => setShowPicker(true)} className="w-full mt-3">
              <Plus size={16} /> {t('routines.form.addExercise')}
            </Button>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-neutral-800/60 shrink-0">
          <Button onClick={handleSave} loading={saving} className="w-full">
            {routine ? t('routines.form.update') : t('routines.form.create')}
          </Button>
        </div>
      </div>

      <ExercisePicker open={showPicker} onClose={() => setShowPicker(false)} onSelect={addLocal} />
    </div>,
    document.body
  );
}
