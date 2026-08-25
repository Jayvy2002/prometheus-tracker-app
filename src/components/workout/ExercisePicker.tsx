import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Dumbbell, Loader2, Sparkles, CheckCircle, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import { useExerciseStore } from '../../stores/exerciseStore';
import { supabase } from '../../lib/supabase';
import type { Exercise } from '../../lib/types';

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Pectoraux', upper_chest: 'Haut pec', lower_chest: 'Bas pec',
  front_delts: 'Epaules avant', side_delts: 'Epaules lat.', rear_delts: 'Epaules arr.',
  traps: 'Trapezes', lats: 'Dorsaux', rhomboids: 'Rhomboides', lower_back: 'Lombaires',
  core: 'Abdos', quadriceps: 'Quadriceps', hamstrings: 'Ischio-jambiers', glutes: 'Fessiers',
  calves: 'Mollets', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Avant-bras',
  rotator_cuff: 'Coiffe rot.', hip_flexors: 'Flechisseurs', adductors: 'Adducteurs',
  abductors: 'Abducteurs', shoulders: 'Epaules', obliques: 'Obliques',
};

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barre', dumbbell: 'Halteres', machine: 'Machine', cable: 'Poulie',
  bodyweight: 'Poids du corps', kettlebell: 'Kettlebell', band: 'Elastique', other: 'Autre',
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (name: string) => void;
}

export default function ExercisePicker({ open, onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const { exercises, loading, fetchExercises, searchExercises } = useExerciseStore();
  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);

  useEffect(() => {
    if (open) fetchExercises();
  }, [open, fetchExercises]);

  const filtered = search.trim() ? searchExercises(search) : exercises;
  const hasExactMatch = exercises.some(e => e.name.toLowerCase() === search.trim().toLowerCase());

  const handleSelect = (exercise: Exercise) => {
    onSelect(exercise.name);
    setSearch('');
  };

  const handleClose = () => {
    setSearch('');
    setShowNewForm(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={t('workout.exercisePicker.title')}>
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('workout.exercisePicker.searchPlaceholder')}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-blue-400" />
          </div>
        ) : (
          <>
            <div className="max-h-60 overflow-y-auto space-y-1 scrollbar-thin">
              {filtered.length === 0 && search.trim() && (
                <p className="text-sm text-neutral-500 text-center py-4">
                  {t('workout.exercisePicker.noResults', { query: search })}
                </p>
              )}
              {filtered.map(ex => (
                <button
                  key={ex.id}
                  onClick={() => handleSelect(ex)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-neutral-800 transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-neutral-900 group-hover:bg-neutral-800 flex items-center justify-center shrink-0">
                      <Dumbbell size={14} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-200 truncate">{ex.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {ex.primary_muscles.slice(0, 2).map(m => (
                          <span key={m} className="text-[10px] text-blue-400/80 bg-blue-500/10 px-1.5 py-0.5 rounded">
                            {MUSCLE_LABELS[m] || m}
                          </span>
                        ))}
                        <span className="text-[10px] text-neutral-500">
                          {EQUIPMENT_LABELS[ex.equipment] || ex.equipment}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {search.trim() && !hasExactMatch && (
              <div className="border-t border-neutral-800 pt-4">
                <button
                  onClick={() => setShowNewForm(true)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-blue-600/10 border border-blue-500/20 hover:bg-blue-600/20 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center">
                    <Sparkles size={14} className="text-blue-400" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-blue-300">{t('workout.exercisePicker.suggest', { name: search.trim() })}</p>
                    <p className="text-[11px] text-neutral-500">{t('workout.exercisePicker.aiInstantCheck')}</p>
                  </div>
                  <Plus size={16} className="text-blue-400" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showNewForm && (
        <NewExerciseModal
          initialName={search.trim()}
          onClose={() => {
            setShowNewForm(false);
            onClose();
          }}
          onSelect={(name) => {
            setShowNewForm(false);
            onSelect(name);
            handleClose();
          }}
        />
      )}
    </Modal>
  );
}

function NewExerciseModal({ initialName, onClose, onSelect }: {
  initialName: string;
  onClose: () => void;
  onSelect: (name: string) => void;
}) {
  const { t } = useTranslation();
  const { submitExercise, addExercise } = useExerciseStore();
  const [name, setName] = useState(initialName);
  const [muscles, setMuscles] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'verifying' | 'approved' | 'rejected'>('idle');
  const [error, setError] = useState('');
  const [approvedExercise, setApprovedExercise] = useState<Exercise | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setStatus('submitting');
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError(t('auth.signIn'));
      setStatus('idle');
      return;
    }

    const request = await submitExercise(user.id, name.trim(), muscles.trim(), description.trim());
    if (!request) {
      setError(t('common.tryAgain'));
      setStatus('idle');
      return;
    }

    setStatus('verifying');

    const { data, error: fnError } = await supabase.functions.invoke('verify-exercise', {
      body: { request_id: request.id },
    });

    if (fnError) {
      const msg = (fnError.message ?? '').toLowerCase();
      if (msg.includes('daily limit') || msg.includes('429')) {
        setError(t('workout.exercisePicker.verifying'));
      } else {
        setError(t('common.tryAgain'));
      }
      setStatus('idle');
      return;
    }

    if (data?.rejected) {
      setRejectionReason(data.reason || t('workout.exercisePicker.notRecognized'));
      setStatus('rejected');
      return;
    }

    if (data?.exercise) {
      addExercise(data.exercise as Exercise);
      setApprovedExercise(data.exercise as Exercise);
      setStatus('approved');
      return;
    }

    setError(t('common.tryAgain'));
    setStatus('idle');
  };

  // Verifying screen
  if (status === 'verifying') {
    return createPortal(
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/70" />
        <div className="relative bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-md p-6 z-10">
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/15 flex items-center justify-center mx-auto mb-4">
              <Loader2 size={28} className="text-blue-400 animate-spin" />
            </div>
            <p className="text-white font-semibold text-lg mb-2">{t('workout.exercisePicker.verifying')}</p>
            <p className="text-neutral-400 text-sm">
              {t('workout.exercisePicker.aiAnalyzing', { name: name.trim() })}
            </p>
            <p className="text-neutral-500 text-xs mt-1">{t('workout.exercisePicker.fewSeconds')}</p>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Approved screen
  if (status === 'approved' && approvedExercise) {
    return createPortal(
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/70" />
        <div className="relative bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-md p-6 z-10 animate-modal-pop">
          <div className="text-center py-2">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={28} className="text-emerald-400" />
            </div>
            <p className="text-white font-semibold text-lg mb-1">{t('workout.exercisePicker.exerciseAdded')}</p>
            <p className="text-neutral-400 text-sm mb-4">
              <span className="text-white font-medium">"{approvedExercise.name}"</span> {t('workout.exercisePicker.nowAvailable')}
            </p>
            {approvedExercise.primary_muscles.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 mb-5">
                {approvedExercise.primary_muscles.slice(0, 3).map(m => (
                  <span key={m} className="text-xs text-blue-400/80 bg-blue-500/10 px-2 py-1 rounded-lg">
                    {MUSCLE_LABELS[m] || m}
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-medium transition-colors"
              >
                {t('common.close')}
              </button>
              <button
                onClick={() => onSelect(approvedExercise.name)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-colors"
              >
                {t('workout.exercisePicker.useNow')}
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Rejected screen
  if (status === 'rejected') {
    return createPortal(
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/70" />
        <div className="relative bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-md p-6 z-10 animate-modal-pop">
          <div className="text-center py-2">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/15 flex items-center justify-center mx-auto mb-4">
              <XCircle size={28} className="text-rose-400" />
            </div>
            <p className="text-white font-semibold text-lg mb-2">{t('workout.exercisePicker.notRecognized')}</p>
            <p className="text-neutral-400 text-sm leading-relaxed mb-5">{rejectionReason}</p>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-medium transition-colors"
              >
                {t('common.close')}
              </button>
              <button
                onClick={() => { setStatus('idle'); setError(''); }}
                className="flex-1 py-2.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-xl font-medium transition-colors"
              >
                {t('common.tryAgain')}
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Main form
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70" onClick={status === 'idle' ? onClose : undefined} />
      <div className="relative bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-md p-5 z-10">
        <h3 className="text-lg font-semibold text-white mb-1">{t('workout.exercisePicker.suggestExercise')}</h3>
        <p className="text-neutral-500 text-xs mb-4">{t('workout.exercisePicker.aiInstantCheck')}</p>

        <div className="space-y-3 mb-5">
          <div>
            <label className="text-xs font-medium text-neutral-400 mb-1 block">{t('workout.exercisePicker.exerciseName')}</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Seated Cable Row"
              disabled={status === 'submitting'}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-400 mb-1 block">{t('workout.exercisePicker.musclesWorked')}</label>
            <Input
              value={muscles}
              onChange={e => setMuscles(e.target.value)}
              placeholder="Ex: back, biceps"
              disabled={status === 'submitting'}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-400 mb-1 block">{t('workout.exercisePicker.description')}</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the movement, position, equipment…"
              rows={3}
              disabled={status === 'submitting'}
              className="w-full bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
            />
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-sm text-rose-400 mb-4">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={status === 'submitting'}
            className="flex-1 py-2.5 bg-neutral-900 text-neutral-300 rounded-xl font-medium hover:bg-neutral-800 transition-colors disabled:opacity-40"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || status === 'submitting'}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {status === 'submitting' ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                {t('workout.exercisePicker.sending')}
              </>
            ) : (
              <>
                <Sparkles size={15} />
                {t('workout.exercisePicker.verify')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
