import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dumbbell, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { useProgramStore } from '../../stores/programStore';
import { isSoloAthlete } from '../../lib/coachRole';
import { outlineFromEdited, type EditedProgramDraft } from '../../lib/coachDraftSend';
import {
  pendingSoloProgramDraft,
  soloDraftCompare,
  soloDraftEdited,
  soloDraftWhy,
} from '../../lib/soloProgram';
import { isInterventionDrafting } from '../../lib/coachSecond';
import { track } from '../../lib/telemetryClient';
import type { AiProgramDayDraft } from '../../lib/types';
import ProgramSessionEditor from '../coaching/ProgramSessionEditor';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';

/**
 * Solo copilot — program proposal: same coach-agent draft as a coach sees.
 * Preview + free edit before accept. Never auto-applied.
 */
export default function SoloProgramProposal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const pendingInterventions = useCoachingStore(s => s.pendingInterventions);
  const fetchPendingInterventions = useCoachingStore(s => s.fetchPendingInterventions);
  const resolveIntervention = useCoachingStore(s => s.resolveIntervention);
  const applyIntervention = useCoachingStore(s => s.applyIntervention);
  const assignment = useProgramStore(s => s.assignment);
  const fetchMyAssignment = useProgramStore(s => s.fetchMyAssignment);
  const [busy, setBusy] = useState<'accept' | 'refuse' | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weeks, setWeeks] = useState(8);
  const [days, setDays] = useState<AiProgramDayDraft[]>([]);

  const solo = isSoloAthlete(coachingRole, myCoach);

  useEffect(() => {
    if (!user || !solo) return;
    void fetchPendingInterventions();
  }, [user?.id, solo]); // eslint-disable-line react-hooks/exhaustive-deps

  const row = user && solo ? pendingSoloProgramDraft(pendingInterventions, user.id) : null;

  useEffect(() => {
    if (!row) {
      setEditing(false);
      return;
    }
    const edited = soloDraftEdited(row);
    setName(edited.programName);
    setDescription(edited.programDesc);
    setWeeks(edited.programWeeks);
    setDays(edited.days);
    setEditing(false);
  }, [row?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user || !solo) return null;
  if (!row) return null;
  if (isInterventionDrafting(row)) {
    return (
      <div className="mb-4 rounded-2xl border border-blue-500/25 bg-blue-500/5 px-4 py-3">
        <p className="text-sm font-semibold text-white">{t('soloProgram.draftingTitle')}</p>
        <p className="text-xs text-neutral-400 mt-1">{t('soloProgram.draftingBody')}</p>
      </div>
    );
  }

  const seed = soloDraftEdited(row);
  const why = soloDraftWhy(row);
  const compare = soloDraftCompare(row, assignment?.program);
  const deciding = busy !== null;
  const localEdited: EditedProgramDraft = {
    programName: name,
    programDesc: description,
    programWeeks: weeks,
    days,
    patch: seed.patch,
  };
  const outline = outlineFromEdited({ ...localEdited, patch: null });
  const hasOutline = !!outline;
  const isPatch = !!seed.patch;

  const onAccept = async () => {
    if (deciding || !user) return;
    setBusy('accept');
    const effects: import('../../lib/interventionEffects').InterventionEffects = {
      assign_client_id: user.id,
    };
    if (isPatch && seed.patch) {
      const programId = assignment?.program_id;
      if (!programId) {
        setBusy(null);
        toast(t('soloProgram.patchNoProgram'), 'info');
        return;
      }
      effects.patch = {
        ...seed.patch,
        program_id: programId,
        fork_if_shared: false,
      };
    } else if (outline) {
      effects.program = {
        name: outline.name,
        description: outline.description,
        duration_weeks: outline.duration_weeks,
        days: outline.days,
        assign_client_id: user.id,
        start_date: new Date().toISOString().slice(0, 10),
      };
    }
    const resolved = await applyIntervention(row.id, 'sent', {
      ...row.payload,
      program: outline ?? row.payload.program,
      name: outline?.name ?? row.payload.name,
      description: outline?.description ?? row.payload.description,
      duration_weeks: outline?.duration_weeks ?? row.payload.duration_weeks,
      days: outline?.days ?? row.payload.days,
    }, effects);
    setBusy(null);
    if (resolved.error) {
      toast(t(resolved.error === 'already_claimed' ? 'errors.alreadyClaimed' : resolved.error === 'already_resolved' ? 'errors.alreadyResolved' : 'errors.saveFailed'), 'error');
      return;
    }
    track('solo_program_accepted', { kind: row.kind, edited: editing });
    toast(t('soloProgram.accepted'));
    await fetchMyAssignment(user.id);
    navigate('/programs');
  };

  const onRefuse = async () => {
    if (deciding) return;
    setBusy('refuse');
    const resolved = await resolveIntervention(row.id, 'dismissed', row.payload);
    setBusy(null);
    if (resolved.error) {
      toast(resolved.error === 'already_resolved' ? t('errors.alreadyResolved') : resolved.error, 'error');
      return;
    }
    track('solo_program_dismissed', { kind: row.kind });
    toast(t('soloProgram.refused'));
    navigate('/programs');
  };

  return (
    <div className="mb-4 rounded-2xl border border-blue-500/30 bg-blue-500/5 px-4 py-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
          <Sparkles size={18} className="text-blue-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{t('soloProgram.title')}</p>
          <p className="text-[11px] text-blue-200/80 mt-0.5">{t('soloProgram.nothingAuto')}</p>
        </div>
      </div>
      {why ? (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">{t('soloProgram.why')}</p>
          <p className="text-sm text-neutral-200 whitespace-pre-wrap">{why}</p>
        </div>
      ) : null}
      {compare ? (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">{t('soloProgram.compare')}</p>
          <p className="text-sm text-neutral-200">
            {compare.exercise ? `${compare.exercise} · ` : ''}
            <span className="text-neutral-500">{t('soloProgram.before')}</span>
            {' '}
            {compare.before}
            {' → '}
            <span className="text-neutral-500">{t('soloProgram.after')}</span>
            {' '}
            {compare.after}
          </p>
        </div>
      ) : null}
      {hasOutline && !editing ? (
        <div className="space-y-2">
          <p className="text-xs text-neutral-400">
            {name || outline!.name}
            {' · '}
            {t('programs.weeksCount', { n: weeks })}
          </p>
          {days.map((d, i) => (
            <div key={`${d.weekday}-${i}`} className="rounded-xl bg-neutral-950/60 border border-neutral-800/80 px-3 py-2">
              <p className="text-sm font-medium text-white">
                {d.name || t(`programs.weekdays.${d.weekday}`)}
              </p>
              {d.exercises.length === 0 ? (
                <p className="text-[11px] text-neutral-500 mt-1">{t('programs.noExercises')}</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {d.exercises.map((ex, j) => (
                    <li key={`${ex.name}-${j}`} className="flex items-start gap-1.5 text-[11px] text-neutral-300">
                      <Dumbbell size={10} className="text-blue-400/70 mt-0.5 shrink-0" />
                      <span>
                        <span className="text-white">{ex.name}</span>
                        <span className="text-neutral-500"> · {ex.default_sets}×{ex.default_reps}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : null}
      {hasOutline && editing ? (
        <ProgramSessionEditor
          name={name}
          description={description}
          durationWeeks={weeks}
          days={days}
          clientId={user.id}
          programId={null}
          presentation="athlete"
          onNameChange={setName}
          onDescriptionChange={setDescription}
          onWeeksChange={setWeeks}
          onDaysChange={setDays}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {hasOutline && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={deciding}
            onClick={() => setEditing(e => !e)}
          >
            {editing ? t('soloProgram.hideEditor') : t('soloProgram.edit')}
          </Button>
        )}
        <Button type="button" size="sm" loading={busy === 'accept'} disabled={deciding} onClick={() => void onAccept()}>
          {t('soloProgram.accept')}
        </Button>
        <Button type="button" size="sm" variant="secondary" loading={busy === 'refuse'} disabled={deciding} onClick={() => void onRefuse()}>
          {t('soloProgram.refuse')}
        </Button>
      </div>
    </div>
  );
}
