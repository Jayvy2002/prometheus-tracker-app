import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Sparkles, X } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { useProgramStore } from '../../stores/programStore';
import { issnTargetsFromProfile, todayStr } from '../../lib/utils';
import { clientFileHref } from '../../lib/coachSituation';
import {
  DIET_TYPES, FOOD_ALLERGIES, GOALS, TRAINING_EXPERIENCES, TRAINING_FOCUSES,
} from '../../lib/constants';
import { parseOnboardingPlanDraft } from '../../lib/coachInterventions';
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
import SecondDraftingCard from './SecondDraftingCard';
import TrackingVarsEditor from './TrackingVarsEditor';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';

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
    saveTrackingConfig, setClientNutritionTargets, applyProgramOutline,
    pendingInterventions, askCoachAgent, fetchCoachSettings,
  } = useCoachingStore();
  const { programs, fetchPrograms, assignProgram } = useProgramStore();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tracking, setTracking] = useState(EMPTY_TRACKING);
  const [calories, setCalories] = useState(0);
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);
  const [applyTargets, setApplyTargets] = useState(false);
  const [assignId, setAssignId] = useState('');
  const [draftDays, setDraftDays] = useState<AiProgramDayDraft[]>([]);
  const [draftProgramName, setDraftProgramName] = useState('');
  const [draftProgramWeeks, setDraftProgramWeeks] = useState(8);
  const [draftProgramDesc, setDraftProgramDesc] = useState('');
  const [draftRow, setDraftRow] = useState<CoachIntervention | null>(null);
  const [asking, setAsking] = useState(false);

  const client = clients.find(c => c.id === id);
  const issn = useMemo(() => (profile ? issnTargetsFromProfile(profile) : null), [profile]);

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
        const targets = issnTargetsFromProfile(p);
        setCalories(targets.calories);
        setProtein(targets.protein);
        setCarbs(targets.carbs);
        setFat(targets.fat);
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
    setCalories(issn.calories);
    setProtein(issn.protein);
    setCarbs(issn.carbs);
    setFat(issn.fat);
  };

  const discardDraft = () => {
    if (liveDraft) void resolveIntervention(liveDraft.id, 'dismissed');
    setDraftRow(null);
  };

  const handleConfirm = async () => {
    if (!id || !user || saving) return;
    setSaving(true);
    const trackResult = await saveTrackingConfig(id, {
      ...tracking,
      setup_completed_at: new Date().toISOString(),
    });
    if (trackResult.error) {
      setSaving(false);
      toast(trackResult.error, 'error');
      return;
    }

    if (applyTargets) {
      if (calories <= 0) {
        setSaving(false);
        toast(t('coaching.interventions.caloriesRequired'), 'error');
        return;
      }
      const targetResult = await setClientNutritionTargets(id, { calories, protein, carbs, fat });
      if (targetResult.error) {
        setSaving(false);
        toast(targetResult.error, 'error');
        return;
      }
    }

    if (draftProgramName.trim() && draftDays.length > 0 && !assignId) {
      const created = await applyProgramOutline(id, {
        name: draftProgramName,
        description: draftProgramDesc,
        duration_weeks: draftProgramWeeks,
        days: draftDays,
      });
      if (created.error) {
        setSaving(false);
        toast(t('coaching.second.failed'), 'error');
        return;
      }
    } else if (assignId) {
      const assigned = await assignProgram(assignId, id, todayStr());
      if (assigned.error) {
        setSaving(false);
        toast(assigned.error, 'error');
        return;
      }
    }

    if (liveDraft) {
      await resolveIntervention(liveDraft.id, 'sent', editedProgramPayload(liveDraft.payload, {
        programName: draftProgramName,
        programDesc: draftProgramDesc,
        programWeeks: draftProgramWeeks,
        days: draftDays,
        patch: null,
      }));
    }

    setSaving(false);
    toast(t('coaching.setup.saved'));
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

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28">
        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-neutral-400 hover:text-white mb-4">
          <ArrowLeft size={18} /> {t('coaching.ops.title')}
        </button>

        <h1 className="text-xl font-bold text-white mb-1">{t('coaching.setup.title')}</h1>
        <p className="text-sm text-neutral-400 mb-5">
          {client?.full_name || profile?.full_name || t('coaching.unnamed')}
          {client?.email ? ` · ${client.email}` : ''}
        </p>

        {!onboarded ? (
          <Card className="mb-4 border-amber-500/20">
            <p className="text-sm font-medium text-amber-200">{t('coaching.setup.waitingTitle')}</p>
            <p className="text-xs text-neutral-400 mt-1">{t('coaching.setup.waitingBody')}</p>
          </Card>
        ) : (
          <Card className="mb-4 border-blue-500/20">
            <p className="text-sm font-medium text-blue-200">{t('coaching.setup.readyTitle')}</p>
            <p className="text-xs text-neutral-400 mt-1">{t('coaching.setup.readyBody')}</p>
          </Card>
        )}

        {onboarded && profile && (
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
            <ReviewRow label={t('coaching.setup.fields.diet')} value={labelOf(DIET_TYPES, profile.diet_type)} />
            <ReviewRow
              label={t('coaching.setup.fields.allergies')}
              value={(profile.food_allergies ?? []).map(a => labelOf(FOOD_ALLERGIES, a)).join(', ') || t('coaching.setup.none')}
            />
            <ReviewRow label={t('coaching.setup.fields.weight')} value={`${profile.weight_kg} → ${profile.target_weight_kg} kg`} />
            <ReviewRow label={t('coaching.setup.fields.sleep')} value={`${profile.sleep_hours_average} h`} />
          </Card>
        )}

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
            <p className="text-[11px] text-neutral-500 mt-1">{t('coaching.second.createProgramHint')}</p>
          </div>
        )}

        {liveDraft && (isInterventionDrafting(liveDraft) || interventionDraftError(liveDraft)) && (
          <SecondDraftingCard
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
              <button onClick={discardDraft} className="text-neutral-500 hover:text-white" aria-label={t('coaching.interventions.dismiss')}>
                <X size={14} />
              </button>
            </div>
            <p className="text-xs text-neutral-500 mb-2">{t('coaching.setup.aiHint')}</p>
            {liveDraft.rationale && (
              <p className="text-[11px] text-neutral-400 mb-2">{liveDraft.rationale}</p>
            )}
            <p className="text-[11px] text-emerald-300">{t('coaching.second.landed')}</p>
          </Card>
        )}

        <Card className="mb-4 space-y-2">
          <p className="text-sm font-medium text-white">{t('coaching.setup.tracking')}</p>
          <p className="text-xs text-neutral-500">{t('coaching.setup.trackingHint')}</p>
          <TrackingVarsEditor value={tracking} onChange={setTracking} />
          <Input
            label={t('coaching.setup.workoutFocus')}
            value={tracking.workout_focus}
            onChange={e => setTracking(s => ({ ...s, workout_focus: e.target.value }))}
            placeholder={t('coaching.setup.workoutFocusPh')}
          />
        </Card>

        <Card className="mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">{t('coaching.setup.targets')}</p>
            <button onClick={applyIssn} className="text-xs text-blue-400">{t('coaching.setup.useIssn')}</button>
          </div>
          <p className="text-[11px] text-emerald-300/90">{t('coaching.setup.issnLabel')}</p>
          <p className="text-xs text-neutral-500">{t('coaching.setup.targetsHint')}</p>
          {profile && issn && (
            (profile.daily_calorie_target ?? 0) > 0
            && (
              profile.daily_calorie_target !== issn.calories
              || profile.protein_target !== issn.protein
              || profile.carbs_target !== issn.carbs
              || profile.fat_target !== issn.fat
            )
          ) && (
            <p className="text-[11px] text-neutral-500">
              {t('coaching.setup.profileTargets', {
                calories: profile.daily_calorie_target,
                protein: profile.protein_target,
                carbs: profile.carbs_target,
                fat: profile.fat_target,
              })}
            </p>
          )}
          <label className="flex items-center gap-2 text-xs text-neutral-300">
            <input type="checkbox" checked={applyTargets} onChange={e => setApplyTargets(e.target.checked)} className="accent-blue-500" />
            {t('coaching.setup.applyTargets')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Input label={t('common.calories')} type="number" value={calories} onChange={e => setCalories(+e.target.value || 0)} />
            <Input label={t('common.protein')} type="number" value={protein} onChange={e => setProtein(+e.target.value || 0)} />
            <Input label={t('common.carbs')} type="number" value={carbs} onChange={e => setCarbs(+e.target.value || 0)} />
            <Input label={t('common.fat')} type="number" value={fat} onChange={e => setFat(+e.target.value || 0)} />
          </div>
        </Card>

        <Card className="mb-4 space-y-3">
          <p className="text-sm font-medium text-white">{t('coaching.setup.program')}</p>
          <p className="text-xs text-neutral-500">{t('coaching.setup.programHint')}</p>
          <select
            value={assignId}
            onChange={e => setAssignId(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
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
                onNameChange={setDraftProgramName}
                onDescriptionChange={setDraftProgramDesc}
                onWeeksChange={setDraftProgramWeeks}
                onDaysChange={setDraftDays}
              />
              <button onClick={() => navigate('/programs')} className="text-xs text-blue-400">
                {t('coaching.setup.openPrograms')}
              </button>
            </>
          )}
        </Card>

        <Button onClick={handleConfirm} loading={saving} className="w-full">
          {t('coaching.interventions.send')}
        </Button>
        <p className="text-[11px] text-neutral-600 text-center mt-2">{t('coaching.setup.confirmHint')}</p>
      </div>
    </PageTransition>
  );
}
