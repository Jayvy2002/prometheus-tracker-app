import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import {
  draftBackTarget,
  isCoachOnlyKind,
  isCompleteCalorieDraft,
  parseCalorieDraft,
  parseOnboardingPlanDraft,
  parseProgramOutline,
  parseProgramPatch,
  parseTalkingPoints,
  parseWorkflowSuggestion,
} from '../../lib/coachInterventions';
import { displayName } from '../../lib/coachText';
import { preparedTemplateKey, parseFleetCause, parseFleetObservation, parsePreparedMessage, isRelanceKind } from '../../lib/coachFleet';
import { interventionDraftError, isInterventionDrafting, isInterventionReady } from '../../lib/coachSecond';
import {
  canSendProgramToClient,
  clientWillSeeSummary,
  editedProgramPayload,
  isProgramSendKind,
  outlineBeforeAfter,
  patchBeforeAfter,
  type EditedProgramDraft,
} from '../../lib/coachDraftSend';
import type { AiProgramDayDraft, CoachIntervention, CoachNudgeTemplateKey, ProgramExercisePatch } from '../../lib/types';
import { useProgramStore } from '../../stores/programStore';
import { formatPrescription } from '../../lib/programNl';
import { todayStr } from '../../lib/utils';
import { clientFileHref } from '../../lib/coachSituation';
import ProgramDraftEditor from './ProgramDraftEditor';
import SecondDraftingCard from './SecondDraftingCard';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';

const EMPTY_TRACKING = {
  track_weight: true,
  track_checkins: true,
  track_nutrition: true,
  track_workouts: true,
  workout_focus: '',
};

export default function InterventionDraftPage() {
  const { t } = useTranslation();
  const { id, interventionId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    coachingRole, clients, fetchClients, fetchIntervention, resolveIntervention,
    saveTrackingConfig, setClientNutritionTargets, applyProgramOutline, addNote,
    sendCoachMessage, pendingInterventions, askSecond,
  } = useCoachingStore();
  const { fetchMyAssignment, assignment, applyExercisePatch } = useProgramStore();

  const [row, setRow] = useState<CoachIntervention | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calories, setCalories] = useState(0);
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);
  const [programName, setProgramName] = useState('');
  const [programDesc, setProgramDesc] = useState('');
  const [programWeeks, setProgramWeeks] = useState(8);
  const [days, setDays] = useState<AiProgramDayDraft[]>([]);
  const [tracking, setTracking] = useState(EMPTY_TRACKING);
  const [notes, setNotes] = useState('');
  const [patch, setPatch] = useState<ProgramExercisePatch | null>(null);
  const [retrying, setRetrying] = useState(false);

  const clientId = id || row?.client_id || null;
  const client = clients.find(c => c.id === (id || row?.client_id || ''));

  useEffect(() => {
    if (clientId) fetchMyAssignment(clientId);
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const hydrate = (found: CoachIntervention) => {
    const cals = parseCalorieDraft(found.payload);
    if (cals) {
      setCalories(cals.calories);
      setProtein(cals.protein);
      setCarbs(cals.carbs);
      setFat(cals.fat);
    }
    const outline = parseProgramOutline(found.payload) ?? parseOnboardingPlanDraft(found.payload)?.program;
    if (outline) {
      setProgramName(outline.name);
      setProgramDesc(outline.description);
      setProgramWeeks(outline.duration_weeks);
      setDays(outline.days);
    }
    const foundPatch = parseProgramPatch(found.payload);
    if (foundPatch) setPatch(foundPatch);
    const tr = parseOnboardingPlanDraft(found.payload)?.tracking;
    if (tr) setTracking(tr);
    setNotes(
      isCoachOnlyKind(found.kind)
        ? parseWorkflowSuggestion(found.payload, found.rationale)
        : parsePreparedMessage(found.payload, parseTalkingPoints(found.payload, found.rationale)),
    );
  };

  useEffect(() => {
    if (!interventionId) return;
    if (!clients.length) fetchClients();
    if (id) fetchMyAssignment(id);
    setLoading(true);
    fetchIntervention(interventionId).then(found => {
      setRow(found);
      if (found && isInterventionReady(found)) hydrate(found);
    }).finally(() => setLoading(false));
  }, [interventionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = pendingInterventions.find(r => r.id === interventionId) ?? row;

  useEffect(() => {
    if (!live) return;
    setRow(live);
    if (isInterventionReady(live)) hydrate(live);
  }, [live?.id, live?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = draftBackTarget({ from: searchParams.get('from'), clientId });
  const backLabel = back.kind === 'today'
    ? t('coaching.ops.title')
    : back.kind === 'messages'
      ? t('nav.messages')
      : back.kind === 'ask'
        ? t('coaching.ask.title')
        : (client ? displayName(client) : t('coaching.command.openClient'));

  const goBack = () => navigate(back.href);

  const handleDismiss = async () => {
    if (!row) return;
    const result = await resolveIntervention(row.id, 'dismissed');
    if (result.error) {
      toast(result.error, 'error');
      return;
    }
    toast(t('coaching.interventions.dismissed'));
    navigate('/dashboard');
  };

  const handleSend = async () => {
    if (!row || !user || saving) return;
    const targetClientId = id || row.client_id;
    if (!isCoachOnlyKind(row.kind) && !targetClientId) return;
    if (row.kind === 'calorie_adjustment') {
      if (!isCompleteCalorieDraft({ calories, protein, carbs, fat })) {
        toast(t('coaching.interventions.macrosRequired'), 'error');
        return;
      }
    }
    setSaving(true);

    if (isCoachOnlyKind(row.kind)) {
      const suggestion = notes.trim();
      const resolved = await resolveIntervention(row.id, 'kept', {
        ...row.payload,
        suggestion,
      });
      if (resolved.error) {
        setSaving(false);
        toast(resolved.error, 'error');
        return;
      }
      if (targetClientId && suggestion) {
        await addNote(targetClientId, suggestion);
      }
      setSaving(false);
      toast(t('coaching.interventions.kept'));
      navigate(targetClientId ? clientFileHref(targetClientId) : '/dashboard');
      return;
    }

    if (!targetClientId) {
      setSaving(false);
      return;
    }

    const noteOnly = row.kind === 'other';
    const edited: EditedProgramDraft = {
      programName,
      programDesc,
      programWeeks,
      days,
      patch,
    };
    if (isProgramSendKind(row.kind) && (patch || programName.trim()) && !canSendProgramToClient(edited) && !noteOnly) {
      setSaving(false);
      toast(t('coaching.draftSend.empty'), 'error');
      return;
    }
    const sentPayload = editedProgramPayload(row.payload, edited);

    if (row.kind === 'calorie_adjustment') {
      const result = await setClientNutritionTargets(targetClientId, { calories, protein, carbs, fat });
      if (result.error) {
        setSaving(false);
        toast(result.error, 'error');
        return;
      }
    }

    if (row.kind === 'program_adjustment' || row.kind === 'onboarding_plan' || row.kind === 'program_nl_edit' || row.kind === 'ask_prometheus') {
      if (row.kind === 'onboarding_plan') {
        const trackResult = await saveTrackingConfig(targetClientId, {
          ...tracking,
          setup_completed_at: new Date().toISOString(),
        });
        if (trackResult.error) {
          setSaving(false);
          toast(trackResult.error, 'error');
          return;
        }
      }
      if (patch) {
        if (!assignment?.program_id) {
          if (notes.trim()) {
            const noteResult = await addNote(targetClientId, notes.trim());
            if (noteResult.error) {
              setSaving(false);
              toast(noteResult.error, 'error');
              return;
            }
          }
          const resolved = await resolveIntervention(row.id, 'kept', {
            ...sentPayload,
            patch,
            suggestion: notes.trim(),
          });
          setSaving(false);
          if (resolved.error) {
            toast(resolved.error, 'error');
            return;
          }
          toast(t('coaching.workspace.patchNoProgram'), 'info');
          navigate(clientFileHref(targetClientId));
          return;
        }
        const patched = await applyExercisePatch(assignment.program_id, patch);
        if (patched.error) {
          setSaving(false);
          toast(patched.error, 'error');
          return;
        }
      } else if (programName.trim() && days.length > 0) {
        const created = await applyProgramOutline(targetClientId, {
          name: programName,
          description: programDesc,
          duration_weeks: programWeeks,
          days,
        });
        if (created.error) {
          setSaving(false);
          toast(t('coaching.second.failed'), 'error');
          return;
        }
      }
    }

    if (noteOnly) {
      if (notes.trim()) {
        const noteResult = await addNote(targetClientId, notes.trim());
        if (noteResult.error) {
          setSaving(false);
          toast(noteResult.error, 'error');
          return;
        }
      }
      const resolved = await resolveIntervention(row.id, 'kept', {
        ...row.payload,
        suggestion: notes.trim(),
      });
      setSaving(false);
      if (resolved.error) {
        toast(resolved.error, 'error');
        return;
      }
      toast(t('coaching.interventions.savedNote'));
      navigate(clientFileHref(targetClientId));
      return;
    }

    const resolved = await resolveIntervention(row.id, 'sent', sentPayload);
    setSaving(false);
    if (resolved.error) {
      toast(resolved.error, 'error');
      return;
    }
    toast(t('coaching.interventions.sent'));
    navigate(clientFileHref(targetClientId));
  };

  const handleRelance = async (body: string, opts?: { saveNote?: boolean; templateKey: CoachNudgeTemplateKey }) => {
    if (!row || !user || saving) return;
    const targetClientId = id || row.client_id;
    if (!targetClientId) return;
    setSaving(true);
    const sent = await sendCoachMessage(targetClientId, body, opts?.templateKey ?? preparedTemplateKey(row.payload, row.kind));
    if (sent.error) {
      setSaving(false);
      toast(sent.error === 'empty' ? t('coaching.queue.emptyBody') : sent.error, 'error');
      return;
    }
    if (opts?.saveNote) {
      const noteResult = await addNote(targetClientId, notes.trim() || body, { noteDate: todayStr() });
      if (noteResult.error) {
        setSaving(false);
        toast(noteResult.error, 'error');
        return;
      }
    }
    const resolved = await resolveIntervention(row.id, 'sent', {
      ...row.payload,
      suggestion: notes.trim(),
    });
    setSaving(false);
    if (resolved.error) {
      toast(resolved.error, 'error');
      return;
    }
    toast(t('coaching.queue.sent'));
    navigate(clientFileHref(targetClientId));
  };

  if (coachingRole !== 'coach') {
    return <Navigate to="/dashboard" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!row || row.status !== 'pending') {
    return (
      <PageTransition>
        <div className="px-4 pt-6">
          <button onClick={goBack} className="flex items-center gap-2 text-neutral-400 hover:text-white mb-4">
            <ArrowLeft size={18} /> {backLabel}
          </button>
          <p className="text-sm text-neutral-400">{t('coaching.interventions.missing')}</p>
        </div>
      </PageTransition>
    );
  }

  if (isInterventionDrafting(row) || interventionDraftError(row)) {
    return (
      <PageTransition>
        <div className="px-4 pt-6 pb-28">
          <div className="flex items-center justify-between gap-2 mb-4">
            <button onClick={goBack} className="flex items-center gap-2 text-neutral-400 hover:text-white">
              <ArrowLeft size={18} /> {backLabel}
            </button>
            {clientId && back.kind !== 'client' ? (
              <button
                type="button"
                onClick={() => navigate(clientFileHref(clientId))}
                className="text-xs text-blue-400 shrink-0"
              >
                {t('coaching.command.openClient')}
              </button>
            ) : null}
          </div>
          <SecondDraftingCard
            row={row}
            retrying={retrying}
            onRetry={interventionDraftError(row) ? async () => {
              if (!row.rationale && typeof row.payload.prompt !== 'string') return;
              setRetrying(true);
              const kind = row.kind === 'onboarding_plan' || row.kind === 'program_nl_edit' || row.kind === 'ask_prometheus'
                ? row.kind
                : 'ask_prometheus';
              await askSecond({
                kind,
                clientId: row.client_id,
                programId: typeof row.payload.program_id === 'string' ? row.payload.program_id : null,
                prompt: typeof row.payload.prompt === 'string' ? row.payload.prompt : row.rationale,
                screen: typeof row.payload.screen === 'string' ? row.payload.screen : 'inbox',
              });
              setRetrying(false);
            } : undefined}
          />
        </div>
      </PageTransition>
    );
  }

  const showProgram = (row.kind === 'program_adjustment' || row.kind === 'onboarding_plan' || row.kind === 'program_nl_edit' || row.kind === 'ask_prometheus') && !patch;
  const showPatch = (row.kind === 'program_adjustment' || row.kind === 'program_nl_edit' || row.kind === 'ask_prometheus') && !!patch;
  const showCalories = row.kind === 'calorie_adjustment' && isCompleteCalorieDraft({ calories, protein, carbs, fat });
  const incompleteCals = row.kind === 'calorie_adjustment' && !isCompleteCalorieDraft({ calories, protein, carbs, fat });
  const showTracking = row.kind === 'onboarding_plan';
  const isAdherenceKind = isRelanceKind(row.kind);
  const showNotes = isAdherenceKind
    || row.kind === 'other' || row.kind === 'ask_prometheus' || isCoachOnlyKind(row.kind);
  const observation = parseFleetObservation(row.payload);
  const cause = parseFleetCause(row.payload, row.rationale);
  const noteOnly = row.kind === 'other';
  const patchWithoutProgram = showPatch && !assignment?.program_id;
  const edited: EditedProgramDraft = {
    programName,
    programDesc,
    programWeeks,
    days,
    patch,
  };
  const patchPreview = patch ? patchBeforeAfter(assignment?.program, patch) : null;
  const outlinePreview = showProgram ? outlineBeforeAfter(assignment?.program, edited) : null;
  const willSee = isProgramSendKind(row.kind) ? clientWillSeeSummary(edited, assignment?.program) : '';
  const primaryLabel = isAdherenceKind
    ? t('coaching.queue.relance')
    : isCoachOnlyKind(row.kind) || patchWithoutProgram
      ? t('coaching.interventions.keep')
      : noteOnly
        ? t('coaching.interventions.saveNote')
        : t('coaching.interventions.send');

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28">
        <div className="flex items-center justify-between gap-2 mb-4">
          <button onClick={goBack} className="flex items-center gap-2 text-neutral-400 hover:text-white">
            <ArrowLeft size={18} /> {backLabel}
          </button>
          {clientId && back.kind !== 'client' ? (
            <button
              type="button"
              onClick={() => navigate(clientFileHref(clientId))}
              className="text-xs text-blue-400 shrink-0"
            >
              {t('coaching.command.openClient')}
            </button>
          ) : null}
        </div>
        <p className="text-[11px] uppercase tracking-wider text-blue-300 mb-1">
          {t(`coaching.interventions.kinds.${row.kind}`)}
        </p>
        <h1 className="text-xl font-bold text-white mb-1">
          {row.title || t(`coaching.interventions.kinds.${row.kind}`)}
        </h1>
        <p className="text-sm text-neutral-400 mb-4">
          {client?.full_name || client?.email || (isCoachOnlyKind(row.kind) && !clientId
            ? t('coaching.interventions.appWide')
            : t('coaching.unnamed'))}
        </p>
        {(observation || cause) && (
          <Card className="mb-4 space-y-2">
            {observation ? (
              <div>
                <p className="text-xs text-neutral-500 mb-1">{t('coaching.fleet.observation')}</p>
                <p className="text-sm text-neutral-200">{observation}</p>
              </div>
            ) : null}
            {cause ? (
              <div>
                <p className="text-xs text-neutral-500 mb-1">{t('coaching.fleet.cause')}</p>
                <p className="text-sm text-neutral-200">{cause}</p>
              </div>
            ) : null}
          </Card>
        )}
        {incompleteCals && (
          <Card className="mb-4 border-amber-500/30">
            <p className="text-sm text-amber-200">{t('coaching.interventions.macrosRequired')}</p>
            <p className="text-xs text-neutral-500 mt-1">{t('coaching.fleet.noCalorieEditor')}</p>
          </Card>
        )}
        <p className="text-xs text-neutral-500 mb-4">
          {isCoachOnlyKind(row.kind) ? t('coaching.interventions.coachOnlyHint') : t('coaching.interventions.editHint')}
        </p>
        {(patchPreview || outlinePreview) && (
          <Card className="mb-4 border-blue-500/20">
            <p className="text-[11px] uppercase tracking-wider text-blue-300 mb-2">{t('coaching.draftSend.compare')}</p>
            {patchPreview && (
              <p className="text-sm text-neutral-200">
                {patchPreview.exercise}
                {' · '}
                <span className="text-neutral-500">{t('coaching.draftSend.before')}</span>
                {' '}
                {patchPreview.before}
                {' → '}
                <span className="text-neutral-500">{t('coaching.draftSend.after')}</span>
                {' '}
                {patchPreview.after}
              </p>
            )}
            {outlinePreview && (
              <p className="text-sm text-neutral-200">
                <span className="text-neutral-500">{t('coaching.draftSend.before')}</span>
                {' '}
                {outlinePreview.before}
                {' → '}
                <span className="text-neutral-500">{t('coaching.draftSend.after')}</span>
                {' '}
                {outlinePreview.after}
              </p>
            )}
            {willSee ? (
              <p className="text-[11px] text-neutral-500 mt-2">{t('coaching.draftSend.clientWillSee', { summary: willSee })}</p>
            ) : null}
          </Card>
        )}

        {showTracking && (
          <Card className="mb-4 space-y-2">
            <p className="text-sm font-medium text-white">{t('coaching.setup.tracking')}</p>
            {([
              ['track_workouts', t('coaching.setup.track.workouts')],
              ['track_checkins', t('coaching.setup.track.checkins')],
              ['track_nutrition', t('coaching.setup.track.nutrition')],
              ['track_weight', t('coaching.setup.track.weight')],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 text-sm text-neutral-200">
                <input
                  type="checkbox"
                  checked={tracking[key]}
                  onChange={e => setTracking(s => ({ ...s, [key]: e.target.checked }))}
                  className="accent-blue-500"
                />
                {label}
              </label>
            ))}
            <Input
              label={t('coaching.setup.workoutFocus')}
              value={tracking.workout_focus}
              onChange={e => setTracking(s => ({ ...s, workout_focus: e.target.value }))}
            />
          </Card>
        )}

        {showPatch && patch && (
          <Card className="mb-4 space-y-3">
            <p className="text-sm font-medium text-white">{t('coaching.workspace.patchTitle')}</p>
            <p className="text-xs text-neutral-400">{patch.exercise}</p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label={t('coaching.interventions.sets')}
                type="number"
                value={patch.default_sets ?? ''}
                onChange={e => setPatch(p => p ? { ...p, default_sets: Math.max(1, +e.target.value || 1) } : p)}
              />
              <Input
                label={t('coaching.interventions.reps')}
                type="number"
                value={patch.default_reps ?? ''}
                onChange={e => setPatch(p => p ? { ...p, default_reps: Math.max(1, +e.target.value || 1) } : p)}
              />
              <Input
                label={t('coaching.programEditor.repMin')}
                type="number"
                value={patch.default_reps_min ?? ''}
                onChange={e => setPatch(p => p ? { ...p, default_reps_min: e.target.value === '' ? null : +e.target.value } : p)}
              />
              <Input
                label="RIR"
                type="number"
                value={patch.default_rir ?? ''}
                onChange={e => setPatch(p => p ? { ...p, default_rir: e.target.value === '' ? null : +e.target.value } : p)}
              />
            </div>
            <Input
              label={t('coaching.workspace.replaceWith')}
              value={patch.replace_with ?? ''}
              onChange={e => setPatch(p => p ? { ...p, replace_with: e.target.value } : p)}
            />
            <p className="text-[11px] text-neutral-500">
              {formatPrescription({
                name: patch.exercise,
                default_sets: patch.default_sets ?? 3,
                default_reps: patch.default_reps ?? 10,
                default_reps_min: patch.default_reps_min,
                default_rir: patch.default_rir,
              })}
            </p>
            <p className="text-[11px] text-neutral-600">{t('coaching.workspace.proposalHint')}</p>
            {!assignment?.program_id && (
              <p className="text-[11px] text-amber-300">{t('coaching.workspace.patchNoProgram')}</p>
            )}
          </Card>
        )}

        {showProgram && (
          <Card className="mb-4">
            <p className="text-sm font-medium text-white mb-3">{t('coaching.setup.program')}</p>
            <ProgramDraftEditor
              name={programName}
              description={programDesc}
              durationWeeks={programWeeks}
              days={days}
              clientId={clientId}
              onNameChange={setProgramName}
              onDescriptionChange={setProgramDesc}
              onWeeksChange={setProgramWeeks}
              onDaysChange={setDays}
            />
          </Card>
        )}

        {showCalories && (
          <Card className="mb-4 space-y-3">
            <p className="text-sm font-medium text-white">{t('coaching.setup.targets')}</p>
            <div className="grid grid-cols-2 gap-2">
              <Input label={t('common.calories')} type="number" value={calories} onChange={e => setCalories(+e.target.value || 0)} />
              <Input label={t('common.protein')} type="number" value={protein} onChange={e => setProtein(+e.target.value || 0)} />
              <Input label={t('common.carbs')} type="number" value={carbs} onChange={e => setCarbs(+e.target.value || 0)} />
              <Input label={t('common.fat')} type="number" value={fat} onChange={e => setFat(+e.target.value || 0)} />
            </div>
          </Card>
        )}

        {showNotes && (
          <Card className="mb-4">
            <p className="text-sm font-medium text-white mb-2">
              {isCoachOnlyKind(row.kind) ? t('coaching.interventions.suggestion') : isAdherenceKind
                ? t('coaching.fleet.preparedMessage')
                : t('coaching.interventions.notes')}
            </p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={6}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
            />
          </Card>
        )}

        <Button
          onClick={() => {
            if (isAdherenceKind) void handleRelance(notes, { templateKey: preparedTemplateKey(row.payload, row.kind) });
            else void handleSend();
          }}
          loading={saving}
          className="w-full"
        >
          {primaryLabel}
        </Button>
        <button onClick={handleDismiss} className="w-full mt-3 text-sm text-neutral-500 hover:text-rose-300">
          {t('coaching.interventions.dismiss')}
        </button>
      </div>
    </PageTransition>
  );
}
