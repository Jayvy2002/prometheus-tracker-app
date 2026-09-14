import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, X } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { useProgramStore } from '../../stores/programStore';
import { issnTargetsFromProfile, todayStr } from '../../lib/utils';
import { clientFileHref } from '../../lib/coachSituation';
import {
  initialSetupTargetChoice,
  nutritionDraftsEqual,
  profileNutritionDraft,
  setupTargetsFromChoice,
  type SetupTargetChoice,
} from '../../lib/coachOwnedTargets';
import { track } from '../../lib/telemetryClient';
import {
  DIET_TYPES, FOOD_ALLERGIES, GOALS, TRAINING_EXPERIENCES, TRAINING_FOCUSES,
} from '../../lib/constants';
import { parseOnboardingPlanDraft, type CalorieDraft } from '../../lib/coachInterventions';
import { editedProgramPayload } from '../../lib/coachDraftSend';
import {
  ALL_ON_TRACKING,
  mergeTrackingOverlay,
  parseCoachTrackingDefaults,
  parseResolvedTracking,
  seedTrackingFromDefaults,
  type ResolvedTrackingConfig,
} from '../../lib/clientTracking';
import {
  interventionDraftError,
  isInterventionDrafting,
  isInterventionReady,
  pendingForClient,
} from '../../lib/coachSecond';
import type { AiProgramDayDraft, CoachIntervention, UserProfile } from '../../lib/types';
import ProgramDraftEditor from './ProgramDraftEditor';
import AgentDraftingCard from './AgentDraftingCard';
import TrackingVarsEditor from './TrackingVarsEditor';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';
import PageHeader from '../ui/PageHeader';
import PageTransition from '../ui/PageTransition';
import { SETUP_WIZARD_STEPS, setupProgramLabel, trackingModulesOn } from '../../lib/setupWizard';
import { toast } from '../ui/Toast';
import KinesiologyIntakeReview from '../onboarding/KinesiologyIntakeReview';
import { intakeAvailableWeekdays, isIntakeAlreadyFilled, medicalYesFlags, parseIntake } from '../../lib/kinesiologyIntake';
import { optionLabel } from '../../lib/optionLabels';

const EMPTY_TRACKING: ResolvedTrackingConfig = {
  ...ALL_ON_TRACKING,
  training: { ...ALL_ON_TRACKING.training },
  nutrition: { ...ALL_ON_TRACKING.nutrition },
  checkin: { ...ALL_ON_TRACKING.checkin },
};

function labelOf(options: readonly { value: string; label: string }[], value: string) {
  return options.find(o => o.value === value)?.label || value || '—';
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-neutral-800/60 last:border-0">
      <span className="text-xs text-neutral-500 shrink-0">{label}</span>
      <span className="text-xs text-neutral-200 text-right">{value || '—'}</span>
    </div>
  );
}

export default function ClientSetupPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    coachingRole, clients, fetchClients, fetchClientProfile, fetchTrackingConfig,
    fetchOnboardingPlanDraft, fetchIntervention, resolveIntervention,
    applyIntervention,
    pendingInterventions, askCoachAgent, fetchCoachSettings, fetchCoachOps,
  } = useCoachingStore();
  const { programs, fetchPrograms } = useProgramStore();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tracking, setTracking] = useState(EMPTY_TRACKING);
  const [calories, setCalories] = useState(0);
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);
  const [applyTargets, setApplyTargets] = useState(false);
  const [targetChoice, setTargetChoice] = useState<SetupTargetChoice>('issn');
  const [medicalAck, setMedicalAck] = useState(false);
  const [assignId, setAssignId] = useState('');
  const [draftDays, setDraftDays] = useState<AiProgramDayDraft[]>([]);
  const [draftProgramName, setDraftProgramName] = useState('');
  const [draftProgramWeeks, setDraftProgramWeeks] = useState(8);
  const [draftProgramDesc, setDraftProgramDesc] = useState('');
  const [draftRow, setDraftRow] = useState<CoachIntervention | null>(null);
  const [asking, setAsking] = useState(false);
  const [step, setStep] = useState(0);

  const client = clients.find(c => c.id === id);
  const issn = useMemo(() => (profile ? issnTargetsFromProfile(profile) : null), [profile]);
  const existingTargets = useMemo(() => profileNutritionDraft(profile), [profile]);
  const preferredWeekdays = useMemo(
    () => (profile ? intakeAvailableWeekdays(profile.kinesiology_intake) : []),
    [profile],
  );
  const needsMedicalAck = !!(profile && medicalYesFlags(parseIntake(profile.kinesiology_intake)));

  const fillProgramAndTracking = (payload: Record<string, unknown>) => {
    const parsed = parseOnboardingPlanDraft(payload);
    if (!parsed) return;
    if (parsed.tracking) {
      setTracking(prev => mergeTrackingOverlay(prev, parsed.tracking));
    }
    if (parsed.program) {
      setDraftProgramName(parsed.program.name || '');
      setDraftProgramDesc(parsed.program.description || '');
      setDraftProgramWeeks(parsed.program.duration_weeks || 8);
      setDraftDays(parsed.program.days ?? []);
      setAssignId('');
    }
  };

  useEffect(() => {
    if (!id || !user) return;
    if (!clients.length) fetchClients();
    fetchPrograms(user.id);
    void fetchCoachSettings();
    setLoading(true);
    const draftParam = searchParams.get('draft');
    Promise.all([
      fetchClientProfile(id),
      fetchTrackingConfig(id),
      draftParam ? fetchIntervention(draftParam) : fetchOnboardingPlanDraft(id),
    ]).then(([p, cfg, stored]) => {
      setProfile(p);
      if (cfg) {
        setTracking(parseResolvedTracking(cfg));
      } else if (useCoachingStore.getState().coachSettings?.default_tracking) {
        setTracking(seedTrackingFromDefaults(
          parseCoachTrackingDefaults(useCoachingStore.getState().coachSettings?.default_tracking),
        ));
      }
      if (p) {
        const issnNow = issnTargetsFromProfile(p);
        const choice = initialSetupTargetChoice(p);
        const picked = setupTargetsFromChoice(choice, p, issnNow);
        setTargetChoice(choice);
        setCalories(picked.calories);
        setProtein(picked.protein);
        setCarbs(picked.carbs);
        setFat(picked.fat);
        setApplyTargets(false);
      }
      const usable = stored && stored.status === 'pending' && stored.kind === 'onboarding_plan'
        ? stored
        : null;
      if (usable) {
        setDraftRow(usable);
        if (isInterventionReady(usable)) fillProgramAndTracking(usable.payload);
      }
    }).finally(() => setLoading(false));
  }, [id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveDraft = (id
    ? pendingForClient(pendingInterventions, id, 'onboarding_plan')
    : null) ?? draftRow;

  useEffect(() => {
    if (!liveDraft) return;
    setDraftRow(liveDraft);
    if (isInterventionReady(liveDraft)) fillProgramAndTracking(liveDraft.payload);
  }, [liveDraft?.id, liveDraft?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestAiProgram = async () => {
    if (!id || asking) return;
    setAsking(true);
    const result = await askCoachAgent({
      kind: 'onboarding_plan',
      clientId: id,
      prompt: t('coaching.second.createProgramPrompt'),
      screen: 'client_setup',
    });
    setAsking(false);
    if ('error' in result) {
      toast(t('coaching.second.failed'), 'error');
      return;
    }
    setDraftRow(pendingInterventions.find(r => r.id === result.id) ?? {
      id: result.id,
      coach_id: user?.id ?? '',
      client_id: id,
      kind: 'onboarding_plan',
      title: null,
      rationale: t('coaching.second.createProgramPrompt'),
      payload: { drafting: true },
      status: 'pending',
      source: 'agent',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resolved_at: null,
    });
  };

  const applyIssn = () => {
    if (!issn) return;
    setTargetChoice('issn');
    setCalories(issn.calories);
    setProtein(issn.protein);
    setCarbs(issn.carbs);
    setFat(issn.fat);
    if (existingTargets) setApplyTargets(true);
  };

  const writeMacroFields = (next: CalorieDraft) => {
    setCalories(next.calories);
    setProtein(next.protein);
    setCarbs(next.carbs);
    setFat(next.fat);
    if (existingTargets && !nutritionDraftsEqual(next, existingTargets)) {
      setApplyTargets(true);
    }
  };

  const chooseTargets = (choice: SetupTargetChoice) => {
    if (!issn) return;
    const picked = setupTargetsFromChoice(choice, profile, issn);
    setTargetChoice(choice);
    setCalories(picked.calories);
    setProtein(picked.protein);
    setCarbs(picked.carbs);
    setFat(picked.fat);
    setApplyTargets(choice === 'issn' && !!existingTargets);
  };

  const discardDraft = () => {
    if (liveDraft) void resolveIntervention(liveDraft.id, 'dismissed');
    setDraftRow(null);
  };

  const handleConfirm = async () => {
    if (!id || !user || saving) return;
    if (needsMedicalAck && !medicalAck) {
      toast(t('coaching.setup.medicalAckRequired'), 'error');
      return;
    }
    if (applyTargets && calories <= 0) {
      toast(t('coaching.interventions.caloriesRequired'), 'error');
      return;
    }
    setSaving(true);
    const effects: import('../../lib/interventionEffects').InterventionEffects = {
      assign_client_id: id,
    };
    if (applyTargets) {
      effects.calories = { calories, protein, carbs, fat };
    }
    if (draftProgramName.trim() && draftDays.length > 0 && !assignId) {
      effects.program = {
        name: draftProgramName,
        description: draftProgramDesc,
        duration_weeks: draftProgramWeeks,
        days: draftDays,
        assign_client_id: id,
        start_date: todayStr(),
      };
    } else if (assignId) {
      effects.assign_program_id = assignId;
      effects.start_date = todayStr();
    }
    effects.tracking = {
      ...tracking,
      setup_completed_at: new Date().toISOString(),
    };
    const resolved = await applyIntervention(
      liveDraft?.id ?? null,
      'sent',
      liveDraft
        ? editedProgramPayload(liveDraft.payload, {
          programName: draftProgramName,
          programDesc: draftProgramDesc,
          programWeeks: draftProgramWeeks,
          days: draftDays,
          patch: null,
        })
        : undefined,
      effects,
    );
    if (resolved.error) {
      setSaving(false);
      toast(resolved.error === 'already_claimed' || resolved.error === 'already_resolved'
        ? t(resolved.error === 'already_claimed' ? 'errors.alreadyClaimed' : 'errors.alreadyResolved')
        : resolved.error, 'error');
      return;
    }

    setSaving(false);
    // Q07 : pas de signal médical dans l'analytics (l'accusé reste un fait de dossier).
    track('setup_targets_choice', {
      choice: targetChoice,
      wrote: applyTargets,
      had_existing: !!existingTargets,
    });
    toast(t('coaching.setup.saved'));
    // Ops rows drive the « À configurer » badge — refresh so the 360 reflects setup at once.
    void fetchCoachOps();
    navigate(clientFileHref(id));
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (coachingRole !== 'coach') {
    return <Navigate to="/dashboard" replace />;
  }

  const onboarded = !!profile?.onboarding_completed;
  const clientName = client?.full_name || profile?.full_name || t('coaching.unnamed');
  const assignedProgram = programs.find(p => p.id === assignId);
  const programLabel = setupProgramLabel({
    assignedName: assignedProgram?.name,
    draftName: draftProgramName,
    draftDayCount: draftDays.length,
  });
  const trackingItems = trackingModulesOn(tracking)
    .map(key => t(`coaching.setup.track.${key}`))
    .join(', ');
  const stepKey = SETUP_WIZARD_STEPS[step];

  const understand = (
    <>
      {!onboarded ? (
        <Card className="mb-4 border-amber-500/20">
          <p className="text-sm font-medium text-amber-200">{t('coaching.setup.waitingTitle')}</p>
          <p className="text-sm text-neutral-400 mt-1">{t('coaching.setup.waitingBody')}</p>
        </Card>
      ) : (
        <Card className="mb-4 border-blue-500/20">
          <p className="text-sm font-medium text-blue-200">{t('coaching.setup.readyTitle')}</p>
          <p className="text-sm text-neutral-400 mt-1">{t('coaching.setup.readyBody')}</p>
        </Card>
      )}

      {needsMedicalAck && (
        <Card className="mb-4 border-rose-500/30 bg-rose-500/5">
          <p className="text-sm font-medium text-rose-200">{t('coaching.medicalFlags.title')}</p>
          <p className="text-sm text-neutral-400 mt-0.5">{t('coaching.medicalFlags.hint')}</p>
        </Card>
      )}

      {onboarded && profile && isIntakeAlreadyFilled(profile) && (
        <div className="mb-4">
          <KinesiologyIntakeReview raw={profile.kinesiology_intake} />
        </div>
      )}

      {onboarded && profile && !isIntakeAlreadyFilled(profile) && (
        <Card className="mb-4">
          <p className="text-sm font-medium text-white mb-2">{t('coaching.setup.review')}</p>
          <ReviewRow
            label={t('coaching.setup.fields.goal')}
            value={t(`coaching.goalLabels.${profile.goal === 'gain' ? 'bulk' : profile.goal || 'maintain'}`, { defaultValue: labelOf(GOALS, profile.goal) })}
          />
          <ReviewRow label={t('coaching.setup.fields.experience')} value={labelOf(TRAINING_EXPERIENCES, profile.training_experience)} />
          <ReviewRow label={t('coaching.setup.fields.focus')} value={labelOf(TRAINING_FOCUSES, profile.training_focus)} />
          <ReviewRow label={t('coaching.setup.fields.frequency')} value={`${profile.training_frequency}x`} />
          <ReviewRow label={t('coaching.setup.fields.injuries')} value={profile.injuries_limitations || t('coaching.setup.none')} />
          <ReviewRow label={t('coaching.setup.fields.diet')} value={optionLabel(t, 'diet', profile.diet_type, labelOf(DIET_TYPES, profile.diet_type))} />
          <ReviewRow
            label={t('coaching.setup.fields.allergies')}
            value={(profile.food_allergies ?? []).map(a => optionLabel(t, 'allergies', a, labelOf(FOOD_ALLERGIES, a))).join(', ') || t('coaching.setup.none')}
          />
          <ReviewRow label={t('coaching.setup.fields.weight')} value={`${profile.weight_kg} → ${profile.target_weight_kg} kg`} />
          <ReviewRow label={t('coaching.setup.fields.sleep')} value={`${profile.sleep_hours_average} h`} />
        </Card>
      )}
    </>
  );

  const trackingStep = (
    <Card className="mb-4 space-y-2">
      <p className="text-sm font-medium text-white">{t('coaching.setup.tracking')}</p>
      <p className="text-sm text-neutral-500">{t('coaching.setup.trackingHint')}</p>
      <TrackingVarsEditor value={tracking} onChange={setTracking} />
      <Input
        label={t('coaching.setup.workoutFocus')}
        value={tracking.workout_focus}
        onChange={e => setTracking(s => ({ ...s, workout_focus: e.target.value }))}
        placeholder={t('coaching.setup.workoutFocusPh')}
      />
    </Card>
  );

  const careStep = (
    <>
      {onboarded && (
        <div className="mb-4">
          <Button
            size="sm"
            variant="secondary"
            loading={asking}
            onClick={() => void requestAiProgram()}
            className="w-full"
          >
            {t('coaching.second.createProgram')}
          </Button>
          <p className="text-sm text-neutral-500 mt-1">{t('coaching.second.createProgramHint')}</p>
        </div>
      )}

      {liveDraft && (isInterventionDrafting(liveDraft) || interventionDraftError(liveDraft)) && (
        <AgentDraftingCard
          row={liveDraft}
          retrying={asking}
          onRetry={interventionDraftError(liveDraft) ? () => void requestAiProgram() : undefined}
        />
      )}

      {liveDraft && isInterventionReady(liveDraft) && (
        <Card className="mb-4 border-blue-500/20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-white flex items-center gap-2">
              <Sparkles size={14} className="text-blue-400" />
              {t('coaching.setup.aiTitle')}
            </p>
            <button onClick={discardDraft} className="min-h-11 min-w-11 text-neutral-500 hover:text-white" aria-label={t('coaching.interventions.dismiss')}>
              <X size={14} />
            </button>
          </div>
          <p className="text-sm text-neutral-500 mb-2">{t('coaching.setup.aiHint')}</p>
          {liveDraft.rationale && (
            <p className="text-sm text-neutral-400 mb-2">{liveDraft.rationale}</p>
          )}
          <p className="text-sm text-emerald-300">{t('coaching.second.landed')}</p>
        </Card>
      )}

      <Card className="mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-white">{t('coaching.setup.targets')}</p>
          <button type="button" onClick={applyIssn} className="min-h-11 text-sm text-blue-400">{t('coaching.setup.useIssn')}</button>
        </div>
        {existingTargets ? (
          <>
            <p className="text-sm text-neutral-400">
              {t('coaching.setup.currentTargets', {
                calories: existingTargets.calories,
                protein: existingTargets.protein,
                carbs: existingTargets.carbs,
                fat: existingTargets.fat,
              })}
            </p>
            <fieldset className="space-y-2">
              <label className="flex items-start gap-2 text-sm text-neutral-200">
                <input
                  type="radio"
                  name="setup-target-choice"
                  checked={targetChoice === 'keep'}
                  onChange={() => chooseTargets('keep')}
                  className="mt-0.5 accent-blue-500"
                />
                <span>
                  <span className="font-medium">{t('coaching.setup.keepTargets')}</span>
                  <span className="block text-neutral-500 mt-0.5">{t('coaching.setup.keepHint')}</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-neutral-200">
                <input
                  type="radio"
                  name="setup-target-choice"
                  checked={targetChoice === 'issn'}
                  onChange={() => chooseTargets('issn')}
                  className="mt-0.5 accent-blue-500"
                />
                <span>
                  <span className="font-medium">{t('coaching.setup.overwriteIssn')}</span>
                  <span className="block text-neutral-500 mt-0.5">{t('coaching.setup.issnHint')}</span>
                </span>
              </label>
            </fieldset>
          </>
        ) : (
          <>
            <p className="text-sm text-emerald-300/90">{t('coaching.setup.issnLabel')}</p>
            <p className="text-sm text-neutral-500">{t('coaching.setup.targetsHint')}</p>
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-neutral-300 min-h-11">
          <input type="checkbox" checked={applyTargets} onChange={e => setApplyTargets(e.target.checked)} className="accent-blue-500" />
          {t('coaching.setup.applyTargets')}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Input label={t('common.calories')} type="number" inputMode="numeric" value={calories} onChange={e => writeMacroFields({ calories: +e.target.value || 0, protein, carbs, fat })} />
          <Input label={t('common.protein')} type="number" inputMode="numeric" value={protein} onChange={e => writeMacroFields({ calories, protein: +e.target.value || 0, carbs, fat })} />
          <Input label={t('common.carbs')} type="number" inputMode="numeric" value={carbs} onChange={e => writeMacroFields({ calories, protein, carbs: +e.target.value || 0, fat })} />
          <Input label={t('common.fat')} type="number" inputMode="numeric" value={fat} onChange={e => writeMacroFields({ calories, protein, carbs, fat: +e.target.value || 0 })} />
        </div>
      </Card>

      <Card className="mb-4 space-y-3">
        <p className="text-sm font-medium text-white">{t('coaching.setup.program')}</p>
        <p className="text-sm text-neutral-500">{t('coaching.setup.programHint')}</p>
        <select
          value={assignId}
          onChange={e => setAssignId(e.target.value)}
          className="w-full min-h-11 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
        >
          <option value="">{t('coaching.setup.newOrPick')}</option>
          {programs.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {!assignId && (
          <>
            <ProgramDraftEditor
              name={draftProgramName}
              description={draftProgramDesc}
              durationWeeks={draftProgramWeeks}
              days={draftDays}
              clientId={id}
              preferredWeekdays={preferredWeekdays}
              onNameChange={setDraftProgramName}
              onDescriptionChange={setDraftProgramDesc}
              onWeeksChange={setDraftProgramWeeks}
              onDaysChange={setDraftDays}
            />
            <button onClick={() => navigate('/programs')} className="min-h-11 text-sm text-blue-400">
              {t('coaching.setup.openPrograms')}
            </button>
          </>
        )}
      </Card>
    </>
  );

  const reviewStep = (
    <Card className="mb-4 space-y-3">
      <p className="text-sm font-medium text-white">{t('coaching.setup.wizard.receives', { name: clientName })}</p>
      <ul className="space-y-2 text-sm text-neutral-200">
        <li>{programLabel ? t('coaching.setup.wizard.receivesProgram', { name: programLabel }) : t('coaching.setup.wizard.noProgram')}</li>
        {tracking.track_checkins && <li>{t('coaching.setup.wizard.receivesFreq')}</li>}
        {trackingItems && <li>{t('coaching.setup.wizard.receivesTracking', { items: trackingItems })}</li>}
        {applyTargets && <li>{t('coaching.setup.wizard.receivesTargets')}</li>}
      </ul>
      {needsMedicalAck && (
        <label className="flex items-start gap-2 text-sm text-rose-200">
          <input
            type="checkbox"
            checked={medicalAck}
            onChange={e => setMedicalAck(e.target.checked)}
            className="mt-0.5 accent-rose-500"
          />
          {t('coaching.setup.medicalAck')}
        </label>
      )}
    </Card>
  );

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28">
        <PageHeader
          title={t(`coaching.setup.wizard.${stepKey}`)}
          subtitle={`${clientName}${client?.email ? ` · ${client.email}` : ''}`}
          backTo="/dashboard"
        />
        <p className="text-sm text-neutral-500 mb-4">{t('coaching.setup.wizard.stepOf', { current: step + 1, total: SETUP_WIZARD_STEPS.length })}</p>
        <ol className="flex gap-1 mb-5" aria-hidden="true">
          {SETUP_WIZARD_STEPS.map((key, i) => (
            <li key={key} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-blue-500' : 'bg-neutral-800'}`} />
          ))}
        </ol>

        {step === 0 && understand}
        {step === 1 && trackingStep}
        {step === 2 && careStep}
        {step === 3 && reviewStep}

        <div className="flex gap-2 mt-4">
          {step > 0 && (
            <Button variant="secondary" className="flex-1" onClick={() => setStep(s => s - 1)}>
              {t('common.back')}
            </Button>
          )}
          {step < SETUP_WIZARD_STEPS.length - 1 ? (
            <Button className="flex-1" onClick={() => setStep(s => s + 1)}>
              {t('coaching.setup.wizard.next')}
            </Button>
          ) : (
            <Button className="flex-1" onClick={handleConfirm} loading={saving}>
              {t('coaching.setup.wizard.start')}
            </Button>
          )}
        </div>
        {step === SETUP_WIZARD_STEPS.length - 1 && (
          <p className="text-sm text-neutral-500 text-center mt-2">{t('coaching.setup.confirmHint')}</p>
        )}
      </div>
    </PageTransition>
  );
}
