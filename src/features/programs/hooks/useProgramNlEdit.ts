import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiProgramDayDraft, ProgramExerciseDraft } from '../../../lib/types';
import { applyProgramProposal, type ProgramNlProposal } from '../../../lib/programNl';
import { useCoachingStore } from '../../../stores/coachingStore';
import { isInterventionReady } from '../../../lib/coachSecond';
import { parseProgramPatch } from '../../../lib/coachInterventions';
import { track } from '../../../lib/telemetryClient';

export function useProgramNlEdit({
  name,
  description,
  durationWeeks,
  days,
  onDaysChange,
  clientId,
  programId,
  onApplied,
}: {
  name: string;
  description: string;
  durationWeeks: number;
  days: AiProgramDayDraft[];
  onDaysChange: (days: AiProgramDayDraft[]) => void;
  clientId?: string | null;
  programId?: string | null;
  onApplied: (dayIndex: number, exerciseIndex: number) => void;
}) {
  const { t } = useTranslation();
  const askCoachAgent = useCoachingStore(s => s.askCoachAgent);
  const resolveIntervention = useCoachingStore(s => s.resolveIntervention);
  const pendingInterventions = useCoachingStore(s => s.pendingInterventions);
  const [nl, setNl] = useState('');
  const [nlError, setNlError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProgramNlProposal | null>(null);
  const [nlJobId, setNlJobId] = useState<string | null>(null);
  const [nlSending, setNlSending] = useState(false);
  const [proposalResolving, setProposalResolving] = useState(false);

  const nlRow = pendingInterventions.find(r => r.id === nlJobId) ?? null;

  useEffect(() => {
    if (!nlRow || !isInterventionReady(nlRow)) return;
    const patch = parseProgramPatch(nlRow.payload);
    const afterRec = nlRow.payload.after && typeof nlRow.payload.after === 'object'
      ? nlRow.payload.after as ProgramExerciseDraft
      : null;
    const beforeRec = nlRow.payload.before && typeof nlRow.payload.before === 'object'
      ? nlRow.payload.before as ProgramExerciseDraft
      : null;
    const dayIndex = typeof nlRow.payload.dayIndex === 'number' ? nlRow.payload.dayIndex : days.findIndex(d => d.weekday === (patch?.weekday ?? -1));
    const exerciseIndex = typeof nlRow.payload.exerciseIndex === 'number'
      ? nlRow.payload.exerciseIndex
      : dayIndex >= 0 && patch
        ? days[dayIndex]?.exercises.findIndex(ex => ex.name === patch.exercise) ?? -1
        : -1;
    const before = beforeRec ?? (dayIndex >= 0 && exerciseIndex >= 0 ? days[dayIndex].exercises[exerciseIndex] : null);
    const after = afterRec ?? (before && patch ? {
      ...before,
      default_sets: patch.default_sets ?? before.default_sets,
      default_reps: patch.default_reps ?? before.default_reps,
      default_reps_min: patch.default_reps_min === undefined ? before.default_reps_min : patch.default_reps_min,
      default_rir: patch.default_rir === undefined ? before.default_rir : patch.default_rir,
      default_rest_seconds: patch.default_rest_seconds ?? before.default_rest_seconds,
      name: patch.replace_with || before.name,
    } : null);
    if (!after || dayIndex < 0 || exerciseIndex < 0) return;
    setProposal({
      raw: nl,
      patch: patch ?? {
        exercise: before?.name || after.name,
        weekday: days[dayIndex]?.weekday,
        default_sets: after.default_sets,
        default_reps: after.default_reps,
        default_reps_min: after.default_reps_min,
        default_rir: after.default_rir ?? null,
        default_rest_seconds: after.default_rest_seconds,
      },
      before,
      after,
      dayIndex,
      exerciseIndex,
      weekday: days[dayIndex]?.weekday ?? 1,
      summaryKey: 'coaching.programNl.summary',
      summaryParams: {
        lift: after.name,
        sets: after.default_sets,
        reps: after.default_reps_min && after.default_reps_min !== after.default_reps
          ? `${after.default_reps_min}-${after.default_reps}`
          : String(after.default_reps),
        rir: after.default_rir ?? '—',
      },
    });
  }, [nlRow?.id, nlRow?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestNl = async () => {
    const q = nl.trim();
    if (!q) return;
    setNlError(null);
    setProposal(null);
    setNlSending(true);
    const result = await askCoachAgent({
      kind: 'program_nl_edit',
      clientId: clientId ?? null,
      programId: programId ?? null,
      prompt: q,
      screen: programId ? 'program_editor' : 'client_setup',
      context: { name, description, duration_weeks: durationWeeks, days },
    });
    setNlSending(false);
    if ('error' in result) {
      setNlError(t('coaching.second.failed'));
      return;
    }
    setNlJobId(result.id);
    track('solo_program_nl_asked', { has_program: !!programId });
  };

  const dismissProposal = async () => {
    if (!nlRow) return;
    setProposalResolving(true);
    const result = await resolveIntervention(nlRow.id, 'dismissed', {
      ...nlRow.payload,
      editor_resolution: 'cancelled',
    });
    setProposalResolving(false);
    if (result.error) {
      setNlError(result.error);
      return;
    }
    setProposal(null);
    setNlJobId(null);
  };

  const applyProposal = async () => {
    if (!proposal || !nlRow) return;
    setProposalResolving(true);
    const result = await resolveIntervention(nlRow.id, 'kept', {
      ...nlRow.payload,
      editor_resolution: 'applied_to_editor',
    });
    setProposalResolving(false);
    if (result.error) {
      setNlError(result.error);
      return;
    }
    onDaysChange(applyProgramProposal(days, proposal));
    onApplied(proposal.dayIndex, proposal.exerciseIndex);
    setProposal(null);
    setNl('');
    setNlJobId(null);
  };

  return {
    nl,
    setNl,
    nlError,
    setNlError,
    proposal,
    nlRow,
    nlSending,
    proposalResolving,
    requestNl,
    dismissProposal,
    applyProposal,
  };
}
