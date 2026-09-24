import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Dumbbell, Loader2, Sparkles, Info, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useExerciseStore } from '../../stores/exerciseStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { supabase } from '../../lib/supabase';
import type { Exercise } from '../../lib/types';
import { muscleLabel } from '../../lib/muscleLabels';
import { displayExerciseName, exerciseSearchFields, isExactExerciseMatch, scoreAgainstQuery } from '../../lib/pickerSearch';
import {
  composeExercisePicker,
  isRecentExercise,
  loadRecentExerciseNames,
  mergeRecentNames,
  namesFromWorkouts,
  pickerRowTestId,
  rememberExerciseName,
} from '../../lib/exercisePicker';
import ExerciseMedia from './ExerciseMedia';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (name: string, catalogId?: string | null) => void;
  multiple?: boolean;
}

export default function ExercisePicker({ open, onClose, onSelect, multiple = false }: Props) {
  const { t, i18n } = useTranslation();
  const { exercises, loading, loadError, fetchExercises, searchExercises } = useExerciseStore();
  const workouts = useWorkoutStore(s => s.workouts);
  const [search, setSearch] = useState('');
  const [equipment, setEquipment] = useState<string | 'all'>('all');
  const [muscle, setMuscle] = useState<string | 'all'>('all');
  const [picked, setPicked] = useState<Exercise[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [detail, setDetail] = useState<Exercise | null>(null);

  useEffect(() => {
    if (open) fetchExercises();
  }, [open, fetchExercises]);

  const recentNames = mergeRecentNames(loadRecentExerciseNames(), namesFromWorkouts(workouts));
  const muscleOptions = Array.from(new Set(exercises.flatMap(ex => ex.primary_muscles))).sort();
  const catalog = muscle === 'all'
    ? exercises
    : exercises.filter(ex => ex.primary_muscles.includes(muscle) || ex.secondary_muscles.includes(muscle));
  const model = composeExercisePicker({
    catalog,
    query: search,
    recentNames,
    equipment,
    lang: i18n.language,
  });
  const ranked = search.trim() ? searchExercises(search, i18n.language) : exercises;
  const hasExactMatch = exercises.some(e => isExactExerciseMatch(search, e));
  const topHit = ranked[0];
  const hasStrongMatch = !!search.trim() && !!topHit
    && scoreAgainstQuery(search, exerciseSearchFields(topHit, i18n.language)) >= 72;
  const visibleCount = model.sections.reduce((n, section) => n + section.exercises.length, 0);

  const emit = (exercise: Exercise) => {
    rememberExerciseName(exercise.name);
    onSelect(exercise.name, exercise.id);
  };

  const handleSelect = (exercise: Exercise) => {
    if (multiple) {
      setPicked(current => current.some(item => item.id === exercise.id)
        ? current.filter(item => item.id !== exercise.id)
        : [...current, exercise]);
      return;
    }
    emit(exercise);
    setSearch('');
    setEquipment('all');
    setMuscle('all');
    onClose();
  };

  const confirmPicked = async () => {
    for (const exercise of picked) {
      rememberExerciseName(exercise.name);
      await Promise.resolve(onSelect(exercise.name, exercise.id));
    }
    setPicked([]);
    setSearch('');
    setEquipment('all');
    setMuscle('all');
    onClose();
  };

  const handleClose = () => {
    setSearch('');
    setEquipment('all');
    setMuscle('all');
    setPicked([]);
    setShowNewForm(false);
    onClose();
  };

  const renderRow = (ex: Exercise, keyPrefix: string) => {
    const title = displayExerciseName(ex, i18n.language);
    const recent = isRecentExercise(ex, recentNames);
    return (
      <div
        key={`${keyPrefix}-${ex.id}`}
        data-testid={pickerRowTestId(ex)}
        data-equipment={ex.equipment}
        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-neutral-800 transition-colors group flex items-center gap-2"
      >
        <button
          type="button"
          onClick={() => handleSelect(ex)}
          aria-pressed={multiple ? picked.some(item => item.id === ex.id) : undefined}
          className={`flex items-center gap-2.5 flex-1 min-w-0 text-left ${picked.some(item => item.id === ex.id) ? 'text-blue-200' : ''}`}
        >
          <div className="w-8 h-8 rounded-lg bg-neutral-900 group-hover:bg-neutral-800 flex items-center justify-center shrink-0">
            {recent ? <Clock size={14} className="text-blue-400" /> : <Dumbbell size={14} className="text-blue-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-neutral-200 truncate">{title}</p>
              <span className="text-[10px] font-medium text-neutral-100 bg-neutral-800 px-1.5 py-0.5 rounded shrink-0">
                {t(`workout.exercisePicker.equipment.${ex.equipment}`, { defaultValue: ex.equipment })}
              </span>
            </div>
            {title !== ex.name && (
              <p className="text-[10px] text-neutral-500 truncate">{ex.name}</p>
            )}
            <div className="flex items-center gap-1.5 mt-0.5">
              {recent && (
                <span className="text-[10px] text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded">
                  {t('workout.exercisePicker.recent')}
                </span>
              )}
              {ex.primary_muscles.slice(0, 2).map(m => (
                <span key={m} className="text-[10px] text-blue-400/80 bg-blue-500/10 px-1.5 py-0.5 rounded">
                  {muscleLabel(m, i18n.language)}
                </span>
              ))}
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setDetail(ex)}
          className="p-1.5 text-neutral-600 hover:text-blue-400 shrink-0"
          aria-label={t('workout.exercisePicker.details')}
        >
          <Info size={14} />
        </button>
      </div>
    );
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
            data-testid="exercise-picker-search"
          />
        </div>
        <p className="text-[11px] text-neutral-500 -mt-2">{t('workout.exercisePicker.variantHint')}</p>

        {muscleOptions.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-0.5" data-testid="exercise-picker-muscle">
            <button
              type="button"
              aria-pressed={muscle === 'all'}
              onClick={() => setMuscle('all')}
              className={`shrink-0 min-h-11 px-3 rounded-full text-xs font-medium border ${
                muscle === 'all'
                  ? 'bg-blue-600/20 border-blue-500/40 text-blue-200'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400'
              }`}
            >
              {t('workout.exercisePicker.muscleAll')}
            </button>
            {muscleOptions.map(item => (
              <button
                key={item}
                type="button"
                aria-pressed={muscle === item}
                onClick={() => setMuscle(item)}
                className={`shrink-0 min-h-11 px-3 rounded-full text-xs font-medium border ${
                  muscle === item
                    ? 'bg-blue-600/20 border-blue-500/40 text-blue-200'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                }`}
              >
                {muscleLabel(item, i18n.language)}
              </button>
            ))}
          </div>
        )}

        {model.equipmentOptions.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-0.5" data-testid="exercise-picker-equipment">
            <button
              type="button"
              data-testid="exercise-picker-equipment-all"
              aria-pressed={equipment === 'all'}
              onClick={() => setEquipment('all')}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                equipment === 'all'
                  ? 'bg-blue-600/20 border-blue-500/40 text-blue-200'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400'
              }`}
            >
              {t('workout.exercisePicker.equipmentAll')}
            </button>
            {model.equipmentOptions.map(item => (
              <button
                key={item}
                type="button"
                data-testid={`exercise-picker-equipment-${item}`}
                aria-pressed={equipment === item}
                onClick={() => setEquipment(item)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                  equipment === item
                    ? 'bg-blue-600/20 border-blue-500/40 text-blue-200'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                }`}
              >
                {t(`workout.exercisePicker.equipment.${item}`, { defaultValue: item })}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8" role="status">
            <Loader2 size={20} className="animate-spin text-blue-400" />
            <span className="sr-only">{t('common.loading')}</span>
          </div>
        ) : loadError ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-rose-300">{t('workout.exercisePicker.loadError')}</p>
            <button
              type="button"
              onClick={() => { useExerciseStore.setState({ fetched: false }); void fetchExercises(); }}
              className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500"
            >
              {t('common.tryAgain')}
            </button>
          </div>
        ) : (
          <>
            <div className="max-h-72 overflow-y-auto space-y-3 scrollbar-thin">
              {visibleCount === 0 && (search.trim() || equipment !== 'all') && (
                <p className="text-sm text-neutral-500 text-center py-4">
                  {t('workout.exercisePicker.noResults', { query: search.trim() || equipment })}
                </p>
              )}
              {model.sections.map(section => {
                if (section.kind === 'recents') {
                  return (
                    <div key="recents" data-testid="exercise-picker-recents" className="space-y-1">
                      <p className="px-1 text-[11px] uppercase tracking-wider text-neutral-500">
                        {t('workout.exercisePicker.recents')}
                      </p>
                      {section.exercises.map(ex => renderRow(ex, 'recents'))}
                    </div>
                  );
                }
                if (section.kind === 'family') {
                  return (
                    <div
                      key={section.family}
                      data-testid={`exercise-picker-family-${section.family}`}
                      className="space-y-1"
                    >
                      <p className="px-1 text-[11px] uppercase tracking-wider text-neutral-500">
                        {t('workout.exercisePicker.variants', {
                          family: t(`workout.exercisePicker.family.${section.family}`),
                        })}
                      </p>
                      {section.exercises.map(ex => renderRow(ex, section.family))}
                    </div>
                  );
                }
                return (
                  <div key="rest" className="space-y-1">
                    {section.exercises.map(ex => renderRow(ex, 'rest'))}
                  </div>
                );
              })}
            </div>

            {search.trim() && !hasExactMatch && !hasStrongMatch && (
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

      {multiple && picked.length > 0 && (
        <Button className="w-full" onClick={() => void confirmPicked()}>
          {t('workout.exercisePicker.addSelected', { count: picked.length })}
        </Button>
      )}

      {detail && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70" onClick={() => setDetail(null)} />
          <div className="relative bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-md p-5 z-10 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-2">{displayExerciseName(detail, i18n.language)}</h3>
            <ExerciseMedia exercise={detail} compact />
            {detail.instructions && (
              <div className="mb-3">
                <p className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">{t('workout.exercisePicker.instructions')}</p>
                <p className="text-sm text-neutral-300 whitespace-pre-wrap">{detail.instructions}</p>
              </div>
            )}
            {detail.tips && (
              <div className="mb-4">
                <p className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">{t('workout.exercisePicker.tips')}</p>
                <p className="text-sm text-neutral-300 whitespace-pre-wrap">{detail.tips}</p>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setDetail(null)} className="flex-1">{t('common.close')}</Button>
              <Button onClick={() => { handleSelect(detail); setDetail(null); }} className="flex-1">{t('workout.exercisePicker.useNow')}</Button>
            </div>
          </div>
        </div>
      )}

      {showNewForm && (
        <NewExerciseModal
          initialName={search.trim()}
          onClose={() => {
            setShowNewForm(false);
            onClose();
          }}
          onSelect={(name) => {
            rememberExerciseName(name);
            setShowNewForm(false);
            onSelect(name);
            handleClose();
          }}
        />
      )}
    </Modal>
  );
}

type CatalogMatch = { id: string; name: string; name_fr: string };

function NewExerciseModal({ initialName, onClose, onSelect }: {
  initialName: string;
  onClose: () => void;
  onSelect: (name: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState(initialName);
  const [muscles, setMuscles] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'pending'>('idle');
  const [error, setError] = useState('');
  const [exact, setExact] = useState<CatalogMatch[]>([]);
  const [nearby, setNearby] = useState<CatalogMatch[]>([]);
  const [matchState, setMatchState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [matchRetry, setMatchRetry] = useState(0);

  useEffect(() => {
    const query = name.trim();
    if (query.length < 2) {
      setExact([]);
      setNearby([]);
      setMatchState('idle');
      return;
    }
    let cancelled = false;
    setMatchState('loading');
    const timer = window.setTimeout(async () => {
      const { data, error: rpcError } = await supabase.rpc('suggest_exercise_matches', { p_name: query });
      if (cancelled) return;
      if (rpcError || !data || typeof data !== 'object') {
        setMatchState('error');
        return;
      }
      const body = data as { exact?: CatalogMatch[]; nearby?: CatalogMatch[] };
      setExact(Array.isArray(body.exact) ? body.exact : []);
      setNearby(Array.isArray(body.nearby) ? body.nearby : []);
      setMatchState('ready');
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [name, matchRetry]);

  const display = (match: CatalogMatch) => (
    i18n.language.toLowerCase().startsWith('en') ? match.name : (match.name_fr || match.name)
  );

  const handlePropose = async () => {
    if (!name.trim()) return;
    setStatus('submitting');
    setError('');
    const { data, error: rpcError } = await supabase.rpc('propose_exercise', {
      p_name: name.trim(),
      p_muscles: muscles.trim(),
      p_description: description.trim(),
    });
    if (rpcError || !data) {
      setError(t('common.tryAgain'));
      setStatus('idle');
      return;
    }
    const requestId = (data as { request_id?: string }).request_id;
    if (requestId) {
      void supabase.functions.invoke('verify-exercise', { body: { request_id: requestId } });
    }
    setStatus('pending');
  };

  if (status === 'pending') {
    return createPortal(
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/70" />
        <div className="relative bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-md p-6 z-10">
          <p className="text-white font-semibold text-lg mb-2">{t('workout.exercisePicker.pendingSaved')}</p>
          <p className="text-neutral-400 text-sm mb-5">{t('workout.exercisePicker.pendingHint')}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-medium">
              {t('common.close')}
            </button>
            <button type="button" onClick={() => onSelect(name.trim())} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium">
              {t('workout.exercisePicker.useTypedName')}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  const submitDisabled = !name.trim() || status === 'submitting';

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70" onClick={status === 'idle' ? onClose : undefined} />
      <div className="relative bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-md p-5 z-10 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-white mb-1">{t('workout.exercisePicker.suggestExercise')}</h3>
        <p className="text-neutral-500 text-xs mb-4">{t('workout.exercisePicker.proposalHint')}</p>

        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-medium text-neutral-400 mb-1 block" htmlFor="proposal-name">{t('workout.exercisePicker.exerciseName')}</label>
            <Input
              id="proposal-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('options.placeholders.exerciseName')}
              disabled={status === 'submitting'}
            />
          </div>
          {matchState === 'loading' && (
            <p className="text-xs text-neutral-400" role="status">{t('workout.exercisePicker.matchesLoading')}</p>
          )}
          {matchState === 'error' && (
            <div className="flex items-center justify-between gap-2 text-xs text-rose-300">
              <span>{t('workout.exercisePicker.matchesError')}</span>
              <button type="button" className="underline" onClick={() => setMatchRetry(current => current + 1)}>{t('common.tryAgain')}</button>
            </div>
          )}
          {matchState === 'ready' && exact.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
              <p className="text-sm text-amber-100">{t('workout.exercisePicker.exactMatch')}</p>
              {exact.map(match => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => onSelect(match.name)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800"
                >
                  {t('workout.exercisePicker.useExisting', { name: display(match) })}
                </button>
              ))}
            </div>
          )}
          {matchState === 'ready' && nearby.length > 0 && (
            <div className="rounded-xl border border-neutral-800 p-3 space-y-2">
              <p className="text-xs text-neutral-400">{t('workout.exercisePicker.nearby')}</p>
              {nearby.map(match => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => onSelect(match.name)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-neutral-900 text-neutral-200 text-sm hover:bg-neutral-800"
                >
                  {display(match)}
                </button>
              ))}
            </div>
          )}
          {matchState === 'ready' && exact.length === 0 && nearby.length === 0 && (
            <p className="text-xs text-neutral-500">{t('workout.exercisePicker.noNearby')}</p>
          )}
          <div>
            <label className="text-xs font-medium text-neutral-400 mb-1 block" htmlFor="proposal-muscles">{t('workout.exercisePicker.musclesWorked')}</label>
            <Input
              id="proposal-muscles"
              value={muscles}
              onChange={e => setMuscles(e.target.value)}
              placeholder={t('options.placeholders.exerciseMuscles')}
              disabled={status === 'submitting'}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-400 mb-1 block" htmlFor="proposal-description">{t('workout.exercisePicker.description')}</label>
            <textarea
              id="proposal-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('options.placeholders.exerciseDescription')}
              rows={3}
              disabled={status === 'submitting'}
              className="w-full bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 disabled:opacity-40 disabled:saturate-0 disabled:cursor-not-allowed resize-none"
            />
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-sm text-rose-400 mb-4" role="alert">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={status === 'submitting'}
            className="flex-1 py-2.5 bg-neutral-900 text-neutral-300 rounded-xl font-medium hover:bg-neutral-800 transition-colors disabled:opacity-40 disabled:saturate-0 disabled:cursor-not-allowed"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handlePropose}
            disabled={submitDisabled}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:saturate-0 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {status === 'submitting' ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                {t('workout.exercisePicker.sending')}
              </>
            ) : (
              t(exact.length > 0 ? 'workout.exercisePicker.proposeAnyway' : 'workout.exercisePicker.propose')
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
