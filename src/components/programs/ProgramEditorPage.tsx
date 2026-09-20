import { useAccountContext } from '@/features/account/hooks/useAccountContext';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProgramStore } from '../../stores/programStore';
import type { AiProgramDayDraft, SessionOrganization } from '../../lib/types';
import type { ProgramPhaseDraft } from '../../features/programs/domain/programPhases';
import { multiPhaseSharedWeekdaysNeedDuration, phasesHaveMixedDurations } from '../../features/programs/domain/programPhases';
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
  const { fetchProgram, createProgram, saveProgram, fetchProgramRevisionInfo, saveProgramVersion, scheduleProgramVersion, activateProgramVersion } = useProgramStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weeks, setWeeks] = useState(8);
  const [days, setDays] = useState<AiProgramDayDraft[]>([]);
  const [organization, setOrganization] = useState<SessionOrganization>('fixed_days');
  const [phases, setPhases] = useState<ProgramPhaseDraft[]>([]);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [revision, setRevision] = useState<{ revision_no: number; created_at: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activateOn, setActivateOn] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [scheduledRevisionNo, setScheduledRevisionNo] = useState<number | null>(null);
  const [scheduledActivatesOn, setScheduledActivatesOn] = useState<string | null>(null);
  const [activeRevisionNo, setActiveRevisionNo] = useState<number | null>(null);
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
      setPhases((p.phases ?? []).map(phase => ({
        id: phase.id,
        name: phase.name,
        description: phase.description,
        duration_weeks: phase.duration_weeks ?? null,
      })));
      setExpectedUpdatedAt(p.updated_at);
      setActiveRevisionNo(p.active_revision_no ?? null);
      setScheduledRevisionNo(p.scheduled_revision_no ?? null);
      setScheduledActivatesOn(p.scheduled_activates_on ?? null);
      setActivateOn(p.scheduled_activates_on ?? '');
      const sorted = [...(p.days ?? [])].sort((a, b) => a.order_index - b.order_index);
      setDays(sorted.length > 0 ? sorted.map(d => ({
        id: d.id,
        weekday: d.weekday,
        name: d.name,
        phase_id: d.phase_id ?? null,
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

  const graphGuard = (): string | null => {
    const named = phases.filter(phase => phase.name.trim());
    if (phasesHaveMixedDurations(named)) return t('programs.mixedPhaseDurations');
    if (multiPhaseSharedWeekdaysNeedDuration(organization, named, days)) {
      return t('programs.phaseDurationRequired');
    }
    return null;
  };

  const writeCopy = () => ({
    stale: t('programs.stale'),
    fallback: t('programs.saveFailed'),
    scheduled: t('programs.versionAlreadyScheduled'),
    historical: t('programs.versionHistorical'),
    phaseDuration: t('programs.phaseDurationRequired'),
    mixedPhases: t('programs.mixedPhaseDurations'),
    invalidSets: t('programs.invalidSetsMax'),
  });

  const handleSave = async () => {
    if (!user || !name.trim() || saving) return;
    const graphError = graphGuard();
    if (graphError) {
      toast(graphError, 'error');
      return;
    }
    setSaving(true);
    if (isNew) {
      const created = await createProgram({
        owner_id: user.id,
        name: name.trim(),
        description,
        duration_weeks: weeks,
        session_organization: organization,
        phases: phases.filter(phase => phase.name.trim()),
      }, days.map((d, i) => ({
        weekday: d.weekday,
        name: d.name,
        phase_id: d.phase_id ?? null,
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
      phases.filter(phase => phase.name.trim()),
    );
    if (saved.error) {
      setSaving(false);
      toast(mapProgramWriteError(saved.error, writeCopy()), 'error');
      return;
    }
    const latest = useProgramStore.getState().programs.find(p => p.id === id);
    if (latest?.updated_at) setExpectedUpdatedAt(latest.updated_at);
    void fetchProgramRevisionInfo(id!).then(setRevision);
    setSaving(false);
    toast(t('common.saveChanges'));
  };

  const handleScheduleFuture = async () => {
    if (!user || !id || isNew || saving || scheduling || !name.trim() || !activateOn) return;
    const graphError = graphGuard();
    if (graphError) {
      toast(graphError, 'error');
      return;
    }
    setScheduling(true);
    const saved = await saveProgramVersion(
      id,
      { name: name.trim(), description, duration_weeks: weeks, session_organization: organization },
      days,
      expectedUpdatedAt,
      phases.filter(phase => phase.name.trim()),
    );
    if (saved.error || saved.revisionNo == null) {
      setScheduling(false);
      toast(mapProgramWriteError(saved.error, writeCopy()), 'error');
      return;
    }
    const scheduled = await scheduleProgramVersion(
      id,
      saved.revisionNo,
      activateOn,
      !!scheduledRevisionNo,
      useProgramStore.getState().programs.find(p => p.id === id)?.updated_at ?? expectedUpdatedAt,
    );
    setScheduling(false);
    if (scheduled.error) {
      toast(mapProgramWriteError(scheduled.error, writeCopy()), 'error');
      return;
    }
    const latest = useProgramStore.getState().programs.find(p => p.id === id);
    if (latest?.updated_at) setExpectedUpdatedAt(latest.updated_at);
    setActiveRevisionNo(latest?.active_revision_no ?? null);
    setScheduledRevisionNo(latest?.scheduled_revision_no ?? saved.revisionNo);
    setScheduledActivatesOn(latest?.scheduled_activates_on ?? activateOn);
    void fetchProgramRevisionInfo(id).then(setRevision);
    toast(t('programs.versionScheduled'));
  };

  const handleActivateNow = async () => {
    if (!id || !scheduledRevisionNo || scheduling) return;
    setScheduling(true);
    const activated = await activateProgramVersion(id, scheduledRevisionNo, expectedUpdatedAt);
    setScheduling(false);
    if (activated.error) {
      toast(mapProgramWriteError(activated.error, writeCopy()), 'error');
      return;
    }
    const latest = await fetchProgram(id);
    if (latest?.updated_at) setExpectedUpdatedAt(latest.updated_at);
    setActiveRevisionNo(latest?.active_revision_no ?? null);
    setScheduledRevisionNo(latest?.scheduled_revision_no ?? null);
    setScheduledActivatesOn(latest?.scheduled_activates_on ?? null);
    void fetchProgramRevisionInfo(id).then(setRevision);
    toast(t('programs.versionActivated'));
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
          phases={phases}
          onPhasesChange={setPhases}
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
        {!isNew && (
          <details className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 px-3 py-2" data-testid="program-versions-advanced">
            <summary className="flex items-center justify-between cursor-pointer list-none text-sm text-neutral-300">
              {t('programs.versionsAdvanced')}
            </summary>
            <p className="text-[11px] text-neutral-500 mt-2">{t('programs.versionsHint')}</p>
            {activeRevisionNo != null && (
              <p className="text-xs text-neutral-400 mt-2" data-testid="program-active-version">
                {t('programs.versionActive', { n: activeRevisionNo })}
              </p>
            )}
            {scheduledRevisionNo != null && scheduledActivatesOn && (
              <p className="text-xs text-blue-300 mt-1" data-testid="program-scheduled-version">
                {t('programs.versionScheduledOn', { n: scheduledRevisionNo, date: scheduledActivatesOn })}
              </p>
            )}
            <label className="block mt-3 text-[11px] text-neutral-500">
              {t('programs.versionActivateOn')}
              <input
                type="date"
                data-testid="program-version-activate-on"
                value={activateOn}
                onChange={e => setActivateOn(e.target.value)}
                className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              className="w-full mt-3"
              data-testid="program-save-future-version"
              onClick={() => void handleScheduleFuture()}
              loading={scheduling}
              disabled={!name.trim() || !activateOn}
            >
              {scheduledRevisionNo ? t('programs.versionReplaceFuture') : t('programs.versionSaveFuture')}
            </Button>
            {scheduledRevisionNo != null && (
              <Button
                type="button"
                variant="ghost"
                className="w-full mt-2"
                data-testid="program-activate-version-now"
                onClick={() => void handleActivateNow()}
                loading={scheduling}
              >
                {t('programs.versionActivateNow')}
              </Button>
            )}
          </details>
        )}
        {!isNew && id && (
          <ProgramRevisionHistory
            open={historyOpen}
            programId={id}
            programMeta={{ name: name.trim(), description, duration_weeks: weeks }}
            expectedUpdatedAt={expectedUpdatedAt}
            activeRevisionNo={activeRevisionNo}
            scheduledRevisionNo={scheduledRevisionNo}
            onClose={() => setHistoryOpen(false)}
            onRestored={async () => {
              const p = await fetchProgram(id);
              if (p) {
                setName(p.name);
                setDescription(p.description);
                setWeeks(p.duration_weeks);
                setExpectedUpdatedAt(p.updated_at);
                setOrganization(normalizeSessionOrganization(p.session_organization));
                setPhases((p.phases ?? []).map(phase => ({
                  id: phase.id,
                  name: phase.name,
                  description: phase.description,
                  duration_weeks: phase.duration_weeks ?? null,
                })));
                const sorted = [...(p.days ?? [])].sort((a, b) => a.order_index - b.order_index);
                setDays(sorted.map(d => ({
                  weekday: d.weekday,
                  name: d.name,
                  phase_id: d.phase_id ?? null,
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
