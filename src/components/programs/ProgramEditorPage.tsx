import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { useProgramStore } from '../../stores/programStore';
import type { AiProgramDayDraft } from '../../lib/types';
import ProgramSessionEditor from '../coaching/ProgramSessionEditor';
import Button from '../ui/Button';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';

export default function ProgramEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const { fetchProgram, updateProgram, setProgramDayExercises, createProgram, fetchProgramRevisionInfo } = useProgramStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weeks, setWeeks] = useState(8);
  const [days, setDays] = useState<AiProgramDayDraft[]>([]);
  const [revision, setRevision] = useState<{ revision_no: number; created_at: string } | null>(null);
  const isNew = !id || id === 'new';

  useEffect(() => {
    if (!id || isNew) {
      setDays([{ weekday: 1, name: '', exercises: [] }]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchProgram(id).then(p => {
      const emptyDay = { weekday: 1, name: '', exercises: [] as AiProgramDayDraft['exercises'] };
      if (!p) {
        setDays([emptyDay]);
        return;
      }
      setName(p.name);
      setDescription(p.description);
      setWeeks(p.duration_weeks);
      const sorted = [...(p.days ?? [])].sort((a, b) => a.order_index - b.order_index);
      setDays(sorted.length > 0 ? sorted.map(d => ({
        weekday: d.weekday,
        name: d.name,
        exercises: (d.exercises ?? []).map(ex => ({
          name: ex.name,
          default_sets: ex.default_sets,
          default_reps: ex.default_reps,
          default_reps_min: ex.default_reps_min,
          default_rir: ex.default_rir,
          default_rest_seconds: ex.default_rest_seconds,
          default_weight_kg: ex.default_weight_kg,
        })),
      })) : [emptyDay]);
      if (id && !isNew) {
        void fetchProgramRevisionInfo(id).then(setRevision);
      }
    }).finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirtyLabel = useMemo(() => t('coaching.programEditor.saveHint'), [t]);

  const handleSave = async () => {
    if (!user || !name.trim() || saving) return;
    setSaving(true);
    if (isNew) {
      const created = await createProgram({
        owner_id: user.id,
        name: name.trim(),
        description,
        duration_weeks: weeks,
      }, days.map((d, i) => ({
        weekday: d.weekday,
        name: d.name,
        routine_id: null,
        order_index: i,
      })));
      if (!created) {
        setSaving(false);
        toast(t('programs.createFailed'), 'error');
        return;
      }
      const full = await fetchProgram(created);
      const createdDays = [...(full?.days ?? [])].sort((a, b) => a.order_index - b.order_index);
      for (let i = 0; i < days.length; i++) {
        const row = createdDays[i];
        if (!row) continue;
        const saved = await setProgramDayExercises(row.id, days[i].exercises.map((ex, idx) => ({
          ...ex,
          order_index: idx,
        })));
        if (saved.error) {
          setSaving(false);
          toast(saved.error, 'error');
          return;
        }
      }
      setSaving(false);
      toast(t('programs.created'));
      navigate(`/programs/${created}`, { replace: true });
      return;
    }
    const updated = await updateProgram(id!, { name: name.trim(), description, duration_weeks: weeks });
    if (updated.error) {
      setSaving(false);
      toast(updated.error, 'error');
      return;
    }
    const synced = await useProgramStore.getState().syncProgramDays(id!, days);
    if (synced.error) {
      setSaving(false);
      toast(synced.error, 'error');
      return;
    }
    setSaving(false);
    toast(t('common.saveChanges'));
  };

  if (coachingRole !== 'coach') return <Navigate to="/programs" replace />;

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28 md:px-6">
        <button onClick={() => navigate('/programs')} className="flex items-center gap-2 text-neutral-400 hover:text-white mb-4">
          <ArrowLeft size={18} /> {t('programs.title')}
        </button>
        <h1 className="text-xl font-bold text-white mb-1">
          {isNew ? t('programs.newTitle') : name || t('programs.title')}
        </h1>
        {!isNew && revision && (
          <p className="text-[11px] text-neutral-600 mb-4">
            {t('programs.revisionBadge', {
              n: revision.revision_no,
              date: new Date(revision.created_at).toLocaleDateString(),
            })}
          </p>
        )}
        {!isNew && !revision && <div className="mb-4" />}
        <ProgramSessionEditor
          name={name}
          description={description}
          durationWeeks={weeks}
          days={days}
          programId={isNew ? null : id}
          onNameChange={setName}
          onDescriptionChange={setDescription}
          onWeeksChange={setWeeks}
          onDaysChange={setDays}
          onAsk={q => navigate(`/prometheus?q=${encodeURIComponent(q)}`)}
        />
        <p className="text-[11px] text-neutral-600 mt-3">{dirtyLabel}</p>
        <Button className="w-full mt-4" onClick={handleSave} loading={saving} disabled={!name.trim()}>
          {t('common.save')}
        </Button>
      </div>
    </PageTransition>
  );
}
