import { useAccountContext } from '@/features/account/hooks/useAccountContext';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProgramStore } from '../../stores/programStore';
import type { AiProgramDayDraft, SessionOrganization } from '../../lib/types';
import ProgramSessionEditor from '../coaching/ProgramSessionEditor';
import ProgramRevisionHistory from './ProgramRevisionHistory';
import Button from '../ui/Button';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';
import { mapProgramWriteError } from '../../lib/programWrite';
import { normalizeSessionOrganization } from '../../features/programs/domain/sessionOrganization';

export default function ProgramEditorPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const canCoach = useAccountContext().capabilities.coach;
  const { fetchProgram, createProgram, saveProgram, fetchProgramRevisionInfo } = useProgramStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weeks, setWeeks] = useState(8);
  const [days, setDays] = useState<AiProgramDayDraft[]>([]);
  const [organization, setOrganization] = useState<SessionOrganization>('fixed_days');
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [revision, setRevision] = useState<{ revision_no: number; created_at: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
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
      setOrganization(normalizeSessionOrganization(p.session_organization));
      setExpectedUpdatedAt(p.updated_at);
      const sorted = [...(p.days ?? [])].sort((a, b) => a.order_index - b.order_index);
      setDays(sorted.length > 0 ? sorted.map(d => ({
        id: d.id,
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
        session_organization: organization,
      }, days.map((d, i) => ({
        weekday: d.weekday,
        name: d.name,
        routine_id: null,
        order_index: i,
        exercises: days[i].exercises.map((ex, idx) => ({
          ...ex,
          order_index: idx,
        })),
      })));
      if (!created) {
        setSaving(false);
        toast(t('programs.createFailed'), 'error');
        return;
      }
      setSaving(false);
      toast(t('programs.created'));
      navigate(`/programs/${created}`, { replace: true });
      return;
    }
    const saved = await saveProgram(
      id!,
      { name: name.trim(), description, duration_weeks: weeks, session_organization: organization },
      days,
      expectedUpdatedAt,
    );
    if (saved.error) {
      setSaving(false);
      toast(mapProgramWriteError(saved.error, {
        stale: t('programs.stale'),
        fallback: t('programs.saveFailed'),
      }), 'error');
      return;
    }
    const latest = useProgramStore.getState().programs.find(p => p.id === id);
    if (latest?.updated_at) setExpectedUpdatedAt(latest.updated_at);
    void fetchProgramRevisionInfo(id!).then(setRevision);
    setSaving(false);
    toast(t('common.saveChanges'));
  };

  if (!canCoach) return <Navigate to="/programs" replace />;

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
          <button
            type="button"
            data-testid="program-revision-badge"
            onClick={() => setHistoryOpen(true)}
            className="text-[11px] text-neutral-500 mb-4 text-left underline-offset-2 hover:text-neutral-300 hover:underline"
          >
            {t('programs.revisionBadge', {
              n: revision.revision_no,
              date: new Date(revision.created_at).toLocaleDateString(i18n.language),
            })}
          </button>
        )}
        {!isNew && !revision && <div className="mb-4" />}
        <ProgramSessionEditor
          name={name}
          description={description}
          durationWeeks={weeks}
          days={days}
          programId={isNew ? null : id}
          sessionOrganization={organization}
          onSessionOrganizationChange={setOrganization}
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
        {!isNew && id && (
          <ProgramRevisionHistory
            open={historyOpen}
            programId={id}
            programMeta={{ name: name.trim(), description, duration_weeks: weeks }}
            expectedUpdatedAt={expectedUpdatedAt}
            onClose={() => setHistoryOpen(false)}
            onRestored={async () => {
              const p = await fetchProgram(id);
              if (p) {
                setName(p.name);
                setDescription(p.description);
                setWeeks(p.duration_weeks);
                setExpectedUpdatedAt(p.updated_at);
                const sorted = [...(p.days ?? [])].sort((a, b) => a.order_index - b.order_index);
                setDays(sorted.map(d => ({
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
                })));
              }
              void fetchProgramRevisionInfo(id).then(setRevision);
              toast(t('programs.revisionRestored'));
            }}
          />
        )}
      </div>
    </PageTransition>
  );
}
