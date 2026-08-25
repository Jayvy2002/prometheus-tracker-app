import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Sparkles, X } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { useProgramStore } from '../../stores/programStore';
import { issnTargetsFromProfile, todayStr } from '../../lib/utils';
import {
  DIET_TYPES, FOOD_ALLERGIES, GOALS, TRAINING_EXPERIENCES, TRAINING_FOCUSES,
} from '../../lib/constants';
import type { AiPlanDraft, AiProgramDayDraft, UserProfile } from '../../lib/types';
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
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    coachingRole, clients, fetchClients, fetchClientProfile, fetchTrackingConfig,
    saveTrackingConfig, setClientNutritionTargets, suggestClientPlan,
  } = useCoachingStore();
  const { programs, fetchPrograms, createProgram, setProgramDayExercises, assignProgram, fetchProgram } = useProgramStore();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tracking, setTracking] = useState(EMPTY_TRACKING);
  const [calories, setCalories] = useState(0);
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);
  const [applyTargets, setApplyTargets] = useState(true);
  const [assignId, setAssignId] = useState('');
  const [draftDays, setDraftDays] = useState<AiProgramDayDraft[]>([]);
  const [draftProgramName, setDraftProgramName] = useState('');
  const [draftProgramWeeks, setDraftProgramWeeks] = useState(8);
  const [draftProgramDesc, setDraftProgramDesc] = useState('');
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [aiDraft, setAiDraft] = useState<AiPlanDraft | null>(null);
  const [aiRationale, setAiRationale] = useState('');
  const [aiRecipes, setAiRecipes] = useState<string[]>([]);

  const client = clients.find(c => c.id === id);
  const issn = useMemo(() => (profile ? issnTargetsFromProfile(profile) : null), [profile]);

  useEffect(() => {
    if (!id || !user) return;
    if (!clients.length) fetchClients();
    fetchPrograms(user.id);
    setLoading(true);
    Promise.all([
      fetchClientProfile(id),
      fetchTrackingConfig(id),
    ]).then(([p, cfg]) => {
      setProfile(p);
      if (cfg) {
        setTracking({
          track_weight: cfg.track_weight,
          track_checkins: cfg.track_checkins,
          track_nutrition: cfg.track_nutrition,
          track_workouts: cfg.track_workouts,
          workout_focus: cfg.workout_focus || '',
        });
      }
      if (p) {
        const targets = issnTargetsFromProfile(p);
        setCalories(p.daily_calorie_target || targets.calories);
        setProtein(p.protein_target || targets.protein);
        setCarbs(p.carbs_target || targets.carbs);
        setFat(p.fat_target || targets.fat);
      }
    }).finally(() => setLoading(false));
  }, [id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyIssn = () => {
    if (!issn) return;
    setCalories(issn.calories);
    setProtein(issn.protein);
    setCarbs(issn.carbs);
    setFat(issn.fat);
  };

  const loadAi = async () => {
    if (!id) return;
    setAiStatus('loading');
    const result = await suggestClientPlan(id);
    if (!result.available) {
      setAiStatus('unavailable');
      setAiDraft(null);
      return;
    }
    setAiDraft(result.draft);
    setAiStatus('ready');
    setAiRationale(result.draft.nutrition?.rationale || '');
    setAiRecipes(result.draft.recipes ?? []);
  };

  const applyAiToForm = () => {
    if (!aiDraft) return;
    const tr = aiDraft.tracking;
    if (tr) {
      setTracking({
        track_weight: !!tr.track_weight,
        track_checkins: !!tr.track_checkins,
        track_nutrition: !!tr.track_nutrition,
        track_workouts: !!tr.track_workouts,
        workout_focus: tr.workout_focus || '',
      });
    }
    if (aiDraft.nutrition) {
      setCalories(aiDraft.nutrition.calories || calories);
      setProtein(aiDraft.nutrition.protein || protein);
      setCarbs(aiDraft.nutrition.carbs || carbs);
      setFat(aiDraft.nutrition.fat || fat);
    }
    if (aiDraft.program) {
      setDraftProgramName(aiDraft.program.name || '');
      setDraftProgramDesc(aiDraft.program.description || '');
      setDraftProgramWeeks(aiDraft.program.duration_weeks || 8);
      setDraftDays((aiDraft.program.days ?? []).map(d => ({
        weekday: Number(d.weekday),
        name: d.name,
        exercises: (d.exercises ?? []).map(ex => ({
          name: ex.name,
          default_sets: Number(ex.default_sets) || 3,
          default_reps: Number(ex.default_reps) || 10,
        })),
      })));
      setAssignId('');
    }
    toast(t('coaching.setup.aiApplied'));
  };

  const discardAi = () => {
    setAiDraft(null);
    setAiStatus('idle');
    setAiRationale('');
    setAiRecipes([]);
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
      const targetResult = await setClientNutritionTargets(id, { calories, protein, carbs, fat });
      if (targetResult.error) {
        toast(targetResult.error, 'error');
      }
    }

    if (draftProgramName.trim() && draftDays.length > 0 && !assignId) {
      const programId = await createProgram({
        owner_id: user.id,
        name: draftProgramName.trim(),
        description: draftProgramDesc,
        duration_weeks: draftProgramWeeks,
      }, draftDays.map((d, i) => ({
        weekday: d.weekday,
        name: d.name,
        routine_id: null,
        order_index: i,
      })));
      if (programId) {
        const created = await fetchProgram(programId);
        for (const draftDay of draftDays) {
          const row = created?.days?.find(d => d.weekday === draftDay.weekday);
          if (!row) continue;
          await setProgramDayExercises(
            row.id,
            (draftDay.exercises ?? []).map((ex, i) => ({
              name: ex.name,
              default_sets: ex.default_sets || 3,
              default_reps: ex.default_reps || 10,
              order_index: i,
            })),
          );
        }
        const assigned = await assignProgram(programId, id, todayStr());
        if (assigned.error) toast(assigned.error, 'error');
      } else {
        toast(t('programs.createFailed'), 'error');
      }
    } else if (assignId) {
      const assigned = await assignProgram(assignId, id, todayStr());
      if (assigned.error) toast(assigned.error, 'error');
    }

    setSaving(false);
    toast(t('coaching.setup.saved'));
    navigate(`/clients/${id}`);
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
          <>
            <Card className="mb-4">
              <p className="text-sm font-medium text-white mb-2">{t('coaching.setup.review')}</p>
              <ReviewRow label={t('coaching.setup.fields.goal')} value={labelOf(GOALS, profile.goal)} />
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

            <Card className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-white flex items-center gap-2">
                  <Sparkles size={14} className="text-blue-400" />
                  {t('coaching.setup.aiTitle')}
                </p>
                {aiStatus === 'ready' && (
                  <button onClick={discardAi} className="text-neutral-500 hover:text-white">
                    <X size={14} />
                  </button>
                )}
              </div>
              <p className="text-xs text-neutral-500 mb-3">{t('coaching.setup.aiHint')}</p>
              {aiStatus === 'unavailable' && (
                <p className="text-xs text-amber-300 mb-3">{t('coaching.setup.aiUnavailable')}</p>
              )}
              {aiStatus === 'ready' && aiDraft && (
                <div className="space-y-2 mb-3">
                  <p className="text-xs text-neutral-300">
                    {aiDraft.program?.name} · {aiDraft.program?.duration_weeks} {t('programs.durationWeeks').toLowerCase()}
                  </p>
                  {aiRationale && <p className="text-[11px] text-neutral-500">{aiRationale}</p>}
                  {aiRecipes.length > 0 && (
                    <ul className="text-[11px] text-neutral-400 list-disc pl-4">
                      {aiRecipes.map(r => <li key={r}>{r}</li>)}
                    </ul>
                  )}
                  <Button size="sm" variant="secondary" onClick={applyAiToForm} className="w-full">
                    {t('coaching.setup.aiApply')}
                  </Button>
                </div>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={loadAi}
                loading={aiStatus === 'loading'}
                className="w-full"
              >
                {t('coaching.setup.aiGenerate')}
              </Button>
            </Card>

            <Card className="mb-4 space-y-2">
              <p className="text-sm font-medium text-white">{t('coaching.setup.tracking')}</p>
              <p className="text-xs text-neutral-500">{t('coaching.setup.trackingHint')}</p>
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
                placeholder={t('coaching.setup.workoutFocusPh')}
              />
            </Card>

            <Card className="mb-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">{t('coaching.setup.targets')}</p>
                <button onClick={applyIssn} className="text-xs text-blue-400">{t('coaching.setup.useIssn')}</button>
              </div>
              <p className="text-xs text-neutral-500">{t('coaching.setup.targetsHint')}</p>
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
                onChange={e => {
                  setAssignId(e.target.value);
                  if (e.target.value) {
                    setDraftDays([]);
                    setDraftProgramName('');
                  }
                }}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
              >
                <option value="">{t('coaching.setup.newOrPick')}</option>
                {programs.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {!assignId && (
                <div className="space-y-2">
                  <Input label={t('programs.name')} value={draftProgramName} onChange={e => setDraftProgramName(e.target.value)} />
                  <Input label={t('programs.durationWeeks')} type="number" value={draftProgramWeeks} onChange={e => setDraftProgramWeeks(Math.max(1, Math.min(52, +e.target.value || 8)))} />
                  {draftDays.map((d, i) => (
                    <p key={`${d.weekday}-${i}`} className="text-xs text-neutral-400">
                      {t(`programs.weekdays.${d.weekday}`)} — {d.name}
                      {(d.exercises ?? []).length > 0 ? ` · ${d.exercises.map(e => e.name).join(', ')}` : ''}
                    </p>
                  ))}
                  <button onClick={() => navigate('/programs')} className="text-xs text-blue-400">
                    {t('coaching.setup.openPrograms')}
                  </button>
                </div>
              )}
            </Card>

            <Button onClick={handleConfirm} loading={saving} className="w-full">
              {t('coaching.setup.confirm')}
            </Button>
            <p className="text-[11px] text-neutral-600 text-center mt-2">{t('coaching.setup.confirmHint')}</p>
          </>
        )}
      </div>
    </PageTransition>
  );
}
