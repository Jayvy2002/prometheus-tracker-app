import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { useProgramStore } from '../../stores/programStore';
import { isSoloAthlete } from '../../lib/coachRole';
import {
  pendingSoloProgramDraft,
  soloDraftCompare,
  soloDraftEdited,
  soloDraftWhy,
} from '../../lib/soloProgram';
import { isInterventionDrafting } from '../../lib/coachSecond';
import { track } from '../../lib/telemetryClient';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';

/**
 * Solo copilot — program proposal: same coach-agent draft as a coach sees,
 * with accept / refuse. Never auto-applied. Hidden for coached athletes and coaches.
 */
export default function SoloProgramProposal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const pendingInterventions = useCoachingStore(s => s.pendingInterventions);
  const fetchPendingInterventions = useCoachingStore(s => s.fetchPendingInterventions);
  const applyProgramOutline = useCoachingStore(s => s.applyProgramOutline);
  const resolveIntervention = useCoachingStore(s => s.resolveIntervention);
  const assignment = useProgramStore(s => s.assignment);
  const applyExercisePatch = useProgramStore(s => s.applyExercisePatch);
  const [busy, setBusy] = useState<'accept' | 'refuse' | null>(null);

  const solo = isSoloAthlete(coachingRole, myCoach);

  useEffect(() => {
    if (!user || !solo) return;
    void fetchPendingInterventions();
  }, [user?.id, solo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user || !solo) return null;
  const row = pendingSoloProgramDraft(pendingInterventions, user.id);
  if (!row) return null;
  if (isInterventionDrafting(row)) {
    return (
      <div className="mb-4 rounded-2xl border border-blue-500/25 bg-blue-500/5 px-4 py-3">
        <p className="text-sm font-semibold text-white">{t('soloProgram.draftingTitle')}</p>
        <p className="text-xs text-neutral-400 mt-1">{t('soloProgram.draftingBody')}</p>
      </div>
    );
  }

  const edited = soloDraftEdited(row);
  const why = soloDraftWhy(row);
  const compare = soloDraftCompare(row, assignment?.program);
  const deciding = busy !== null;

  const onAccept = async () => {
    if (deciding) return;
    setBusy('accept');
    if (edited.patch) {
      const programId = assignment?.program_id;
      if (!programId) {
        setBusy(null);
        toast(t('soloProgram.patchNoProgram'), 'info');
        return;
      }
      const patched = await applyExercisePatch(programId, edited.patch);
      if (patched.error) {
        setBusy(null);
        toast(patched.error, 'error');
        return;
      }
    } else if (edited.programName.trim() && edited.days.length > 0) {
      const created = await applyProgramOutline(user.id, {
        name: edited.programName,
        description: edited.programDesc,
        duration_weeks: edited.programWeeks,
        days: edited.days,
      });
      if (created.error) {
        setBusy(null);
        toast(created.error, 'error');
        return;
      }
    }
    const resolved = await resolveIntervention(row.id, 'sent', row.payload);
    setBusy(null);
    if (resolved.error) {
      toast(resolved.error === 'already_resolved' ? t('errors.alreadyResolved') : resolved.error, 'error');
      return;
    }
    track('solo_program_accepted', { kind: row.kind, edited: false });
    toast(t('soloProgram.accepted'));
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
    navigate('/routines');
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
      {edited.programName && edited.days.length > 0 && !edited.patch ? (
        <p className="text-xs text-neutral-400">
          {edited.programName}
          {' · '}
          {t('programs.weeksCount', { n: edited.programWeeks })}
          {' · '}
          {edited.days.map(d => d.name || t(`programs.weekdays.${d.weekday}`)).join(' · ')}
        </p>
      ) : null}
      <div className="flex gap-2">
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
