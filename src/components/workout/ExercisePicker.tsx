import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Dumbbell, Loader2, Sparkles, CheckCircle } from 'lucide-react';
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
    <Modal open={open} onClose={handleClose} title="Ajouter un exercice">
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un exercice..."
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
                  Aucun exercice trouve pour "{search}"
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
                    <p className="text-sm font-medium text-blue-300">Proposer "{search.trim()}"</p>
                    <p className="text-[11px] text-neutral-500">Soumis pour validation — disponible sous peu</p>
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
            onClose(); // Ferme aussi l'ExercisePicker et renvoie l'user là où il était
          }}
        />
      )}
    </Modal>
  );
}

function NewExerciseModal({ initialName, onClose }: {
  initialName: string;
  onClose: () => void;
}) {
  const { submitExercise } = useExerciseStore();
  const [name, setName] = useState(initialName);
  const [muscles, setMuscles] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'submitted'>('idle');
  const [error, setError] = useState('');
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-close 3s après l'écran de remerciement
  useEffect(() => {
    if (status !== 'submitted') return;
    autoCloseRef.current = setTimeout(() => onClose(), 3000);
    return () => {
      if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    };
  }, [status, onClose]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setStatus('submitting');
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Vous devez être connecté.');
      setStatus('idle');
      return;
    }

    const request = await submitExercise(user.id, name.trim(), muscles.trim(), description.trim());
    if (!request) {
      setError('Erreur lors de la soumission. Réessayez.');
      setStatus('idle');
      return;
    }

    setStatus('submitted');
  };

  // Écran de remerciement
  if (status === 'submitted') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/70" />
        <div className="relative bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-md p-6 z-10 animate-modal-pop">
          <div className="text-center py-3">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={28} className="text-emerald-400 animate-spring-bounce" />
            </div>
            <p className="text-white font-semibold text-lg mb-2">Merci pour ta contribution !</p>
            <p className="text-neutral-400 text-sm leading-relaxed mb-1">
              Ta demande pour <span className="text-white font-medium">"{name.trim()}"</span> a bien été reçue.
            </p>
            <p className="text-neutral-500 text-sm leading-relaxed mb-6">
              L'IA analysera cet exercice et l'ajoutera à la base de données s'il est reconnu. Il sera disponible sous peu.
            </p>
            {/* Barre de progression auto-close */}
            <div className="w-full h-0.5 bg-neutral-800 rounded-full mb-5 overflow-hidden">
              <div
                className="h-full bg-emerald-500/60 rounded-full"
                style={{ animation: 'progress-drain 3s linear forwards' }}
              />
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-medium transition-colors active:scale-95"
            >
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70" onClick={status === 'idle' ? onClose : undefined} />
      <div className="relative bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-md p-5 z-10">
        <h3 className="text-lg font-semibold text-white mb-1">Proposer un exercice</h3>
        <p className="text-neutral-500 text-xs mb-4">L'IA vérifiera ta demande et l'ajoutera si elle est valide</p>

        <div className="space-y-3 mb-5">
          <div>
            <label className="text-xs font-medium text-neutral-400 mb-1 block">Nom de l'exercice</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Seated Cable Row"
              disabled={status === 'submitting'}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-400 mb-1 block">Muscles travaillés <span className="text-neutral-600">(optionnel)</span></label>
            <Input
              value={muscles}
              onChange={e => setMuscles(e.target.value)}
              placeholder="Ex: dos, biceps"
              disabled={status === 'submitting'}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-400 mb-1 block">Description <span className="text-neutral-600">(optionnel)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Décrivez le mouvement, la position, l'équipement..."
              rows={3}
              disabled={status === 'submitting'}
              className="w-full bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
            />
            <p className="text-[11px] text-neutral-600 mt-1">Aide l'IA à mieux identifier l'exercice</p>
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
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || status === 'submitting'}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {status === 'submitting' ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Envoi...
              </>
            ) : 'Soumettre'}
          </button>
        </div>
      </div>
    </div>
  );
}
