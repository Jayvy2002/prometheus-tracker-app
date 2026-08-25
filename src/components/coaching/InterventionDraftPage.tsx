import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCoachingStore } from '../../stores/coachingStore';
import {
  isCoachOnlyKind,
  parseCalorieDraft,
  parseOnboardingPlanDraft,
  parseProgramOutline,
  parseTalkingPoints,
  parseWorkflowSuggestion,
} from '../../lib/coachInterventions';
import type { AiProgramDayDraft, CoachIntervention } from '../../lib/types';
import ProgramDraftEditor from './ProgramDraftEditor';
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
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    coachingRole, clients, fetchClients, fetchIntervention, resolveIntervention,
    saveTrackingConfig, setClientNutritionTargets, applyProgramOutline, addNote,
  } = useCoachingStore();

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

  const clientId = id || row?.client_id || null;
  const client = clients.find(c => c.id === (id || row?.client_id || ''));

  useEffect(() => {
    if (!interventionId) return;
    if (!clients.length) fetchClients();
    setLoading(true);
    fetchIntervention(interventionId).then(found => {
      setRow(found);
      if (!found) return;
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
      const tr = parseOnboardingPlanDraft(found.payload)?.tracking;
      if (tr) setTracking(tr);
      setNotes(
        isCoachOnlyKind(found.kind)
          ? parseWorkflowSuggestion(found.payload, found.rationale)
          : parseTalkingPoints(found.payload, found.rationale),
      );
    }).finally(() => setLoading(false));
  }, [interventionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const goBack = () => {
    if (id) navigate(`/clients/${id}`);
    else navigate('/dashboard');
  };

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
      navigate(targetClientId ? `/clients/${targetClientId}` : '/dashboard');
      return;
    }

    if (!targetClientId) return;

    if (row.kind === 'calorie_adjustment') {
      const result = await setClientNutritionTargets(targetClientId, { calories, protein, carbs, fat });
      if (result.error) {
        setSaving(false);
        toast(result.error, 'error');
        return;
      }
    }

    if (row.kind === 'program_adjustment' || row.kind === 'onboarding_plan') {
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
      if (programName.trim() && days.length > 0) {
        const created = await applyProgramOutline(targetClientId, {
          name: programName,
          description: programDesc,
          duration_weeks: programWeeks,
          days,
        });
        if (created.error) {
          setSaving(false);
          toast(created.error, 'error');
          return;
        }
      }
    }

    if (row.kind === 'adherence_nutrition' || row.kind === 'adherence_training' || row.kind === 'other') {
      if (notes.trim()) {
        const noteResult = await addNote(targetClientId, notes.trim());
        if (noteResult.error) {
          setSaving(false);
          toast(noteResult.error, 'error');
          return;
        }
      }
    }

    const resolved = await resolveIntervention(row.id, 'sent');
    setSaving(false);
    if (resolved.error) {
      toast(resolved.error, 'error');
      return;
    }
    toast(t('coaching.interventions.sent'));
    navigate(`/clients/${targetClientId}`);
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
            <ArrowLeft size={18} /> {t('coaching.ops.title')}
          </button>
          <p className="text-sm text-neutral-400">{t('coaching.interventions.missing')}</p>
        </div>
      </PageTransition>
    );
  }

  const showProgram = row.kind === 'program_adjustment' || row.kind === 'onboarding_plan';
  const showCalories = row.kind === 'calorie_adjustment';
  const showTracking = row.kind === 'onboarding_plan';
  const showNotes = row.kind === 'adherence_nutrition' || row.kind === 'adherence_training'
    || row.kind === 'other' || isCoachOnlyKind(row.kind);
  const primaryLabel = isCoachOnlyKind(row.kind)
    ? t('coaching.interventions.keep')
    : t('coaching.interventions.send');

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28">
        <button onClick={goBack} className="flex items-center gap-2 text-neutral-400 hover:text-white mb-4">
          <ArrowLeft size={18} /> {t('coaching.ops.title')}
        </button>
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
        {row.rationale && (
          <Card className="mb-4">
            <p className="text-xs text-neutral-500 mb-1">{t('coaching.interventions.rationale')}</p>
            <p className="text-sm text-neutral-200">{row.rationale}</p>
          </Card>
        )}
        <p className="text-xs text-neutral-500 mb-4">
          {isCoachOnlyKind(row.kind) ? t('coaching.interventions.coachOnlyHint') : t('coaching.interventions.editHint')}
        </p>

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

        {showProgram && (
          <Card className="mb-4">
            <p className="text-sm font-medium text-white mb-3">{t('coaching.setup.program')}</p>
            <ProgramDraftEditor
              name={programName}
              description={programDesc}
              durationWeeks={programWeeks}
              days={days}
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
              {isCoachOnlyKind(row.kind) ? t('coaching.interventions.suggestion') : t('coaching.interventions.notes')}
            </p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={6}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
            />
          </Card>
        )}

        <Button onClick={handleSend} loading={saving} className="w-full">
          {primaryLabel}
        </Button>
        <button onClick={handleDismiss} className="w-full mt-3 text-sm text-neutral-500 hover:text-rose-300">
          {t('coaching.interventions.dismiss')}
        </button>
      </div>
    </PageTransition>
  );
}
