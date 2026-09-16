import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatBilanDate, parseAthleteCheckinQuery } from '../../lib/messageBilan';
import { useAuthStore } from '../../stores/authStore';
import { useCheckinStore } from '../../stores/checkinStore';
import { useProfileStore } from '../../stores/profileStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { todayStr } from '../../lib/utils';
import { clampCheckinScore } from '../../lib/checkinScale';
import { isSoloAthlete } from '../../lib/coachRole';
import { displayName } from '../../lib/coachText';
import { useClientTracking } from '../../lib/useClientTracking';
import SoloAskBar from '../solo/SoloAskBar';
import { soloAskFromProfile } from '../../lib/soloAskDefaults';
import {
  CHECKIN_CORE_VAR_KEYS,
  CHECKIN_SCALE_BY_VAR,
  checkinHasAnyField,
  showCheckinField,
  visibleCheckinFields,
  type CheckinScaleKey,
  type CheckinVarKey,
} from '../../lib/clientTracking';
import Button from '../ui/Button';
import Input from '../ui/Input';
import PageHeader from '../ui/PageHeader';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import { PageSkeleton } from '../ui/PageSkeleton';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';
import type { DailyCheckin, DailyCheckinInput } from '../../lib/types';
import ScoreSlider from './ScoreSlider';
import CheckinFilledScores from './CheckinFilledScores';
import CheckinHistoryList from './CheckinHistoryList';
import { adherencePercentFromScore, adherenceScoreFromPercent } from '../../lib/checkinScale';

const SCALE_COPY: Record<CheckinScaleKey, { field: string; low: string; high: string }> = {
  sleep_quality: { field: 'sleep_quality', low: 'poor', high: 'excellent' },
  energy_level: { field: 'energy_level', low: 'drained', high: 'high' },
  mood: { field: 'mood', low: 'low', high: 'great' },
  motivation: { field: 'motivation', low: 'none', high: 'fired' },
  hunger: { field: 'hunger', low: 'none', high: 'ravenous' },
  fatigue: { field: 'fatigue', low: 'fresh', high: 'exhausted' },
  stress: { field: 'stress', low: 'calm', high: 'overwhelmed' },
  muscle_soreness: { field: 'muscle_soreness', low: 'none', high: 'severe' },
  joint_pain: { field: 'joint_pain', low: 'none', high: 'severe' },
  adherence_training: { field: 'adherence_training', low: 'none', high: 'perfect' },
  adherence_nutrition: { field: 'adherence_nutrition', low: 'none', high: 'perfect' },
};

export default function CheckInPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusId = parseAthleteCheckinQuery(searchParams);
  const [focused, setFocused] = useState<DailyCheckin | null>(null);
  const [ficheGone, setFicheGone] = useState(false);
  const { user } = useAuthStore();
  const { todayCheckin, checkins, loading, fetchToday, fetchRecent, upsertToday } = useCheckinStore();
  const { profile } = useProfileStore();
  const tracking = useClientTracking();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const solo = isSoloAthlete(coachingRole, myCoach);
  const fields = useMemo(() => visibleCheckinFields(tracking), [tracking]);
  const coreVars = useMemo(
    () => CHECKIN_CORE_VAR_KEYS.filter(key => showCheckinField(tracking, key)),
    [tracking],
  );
  const extraVars = useMemo(
    () => fields.filter(key => !CHECKIN_CORE_VAR_KEYS.includes(key) && key !== 'notes'),
    [fields],
  );
  const [saving, setSaving] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sleepHours, setSleepHours] = useState('');
  const [notes, setNotes] = useState('');
  const [scales, setScales] = useState<Record<CheckinScaleKey, number | null>>({
    sleep_quality: null,
    energy_level: null,
    mood: null,
    motivation: null,
    hunger: null,
    fatigue: null,
    stress: null,
    muscle_soreness: null,
    joint_pain: null,
    adherence_training: null,
    adherence_nutrition: null,
  });

  useEffect(() => {
    if (!user) return;
    fetchToday(user.id);
    fetchRecent(user.id, 14);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    if (!focusId) {
      setFocused(null);
      setFicheGone(false);
      return;
    }
    const local = [todayCheckin, ...checkins].find(row => row?.id === focusId) ?? null;
    if (local) {
      setFocused(local);
      setFicheGone(false);
      return;
    }
    void (async () => {
      const { data } = await supabase.from('daily_checkins').select('*').eq('id', focusId).maybeSingle();
      if (cancelled) return;
      if (data) {
        setFocused(data as DailyCheckin);
        setFicheGone(false);
        return;
      }
      setFocused(null);
      setFicheGone(true);
    })();
    return () => { cancelled = true; };
  }, [focusId, todayCheckin, checkins]);

  useEffect(() => {
    if (!todayCheckin) return;
    setSleepHours(todayCheckin.sleep_hours != null ? String(todayCheckin.sleep_hours) : '');
    setNotes(todayCheckin.notes || '');
    setScales({
      sleep_quality: todayCheckin.sleep_quality,
      energy_level: todayCheckin.energy_level,
      mood: todayCheckin.mood,
      motivation: todayCheckin.motivation,
      hunger: todayCheckin.hunger,
      fatigue: todayCheckin.fatigue,
      stress: todayCheckin.stress,
      muscle_soreness: todayCheckin.muscle_soreness,
      joint_pain: todayCheckin.joint_pain,
      adherence_training: adherenceScoreFromPercent(todayCheckin.adherence_training),
      adherence_nutrition: adherenceScoreFromPercent(todayCheckin.adherence_nutrition),
    });
  }, [todayCheckin]);

  const setScale = (key: CheckinScaleKey, value: number | null) => {
    setScales(s => ({ ...s, [key]: value }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const hours = sleepHours.trim() === '' ? null : Number(sleepHours);
    const payload: DailyCheckinInput = {
      checked_at: todayStr(),
      notes: showCheckinField(tracking, 'notes') || notes.trim()
        ? notes
        : (todayCheckin?.notes || ''),
      sleep_hours: showCheckinField(tracking, 'sleep_hours')
        ? (hours != null && !Number.isNaN(hours) ? hours : null)
        : todayCheckin?.sleep_hours ?? null,
      hunger: clampCheckinScore(scales.hunger),
      fatigue: clampCheckinScore(scales.fatigue),
      sleep_quality: clampCheckinScore(scales.sleep_quality),
      stress: clampCheckinScore(scales.stress),
      motivation: clampCheckinScore(scales.motivation),
      muscle_soreness: clampCheckinScore(scales.muscle_soreness),
      joint_pain: clampCheckinScore(scales.joint_pain),
      energy_level: clampCheckinScore(scales.energy_level),
      mood: clampCheckinScore(scales.mood),
      adherence_training: adherencePercentFromScore(scales.adherence_training),
      adherence_nutrition: adherencePercentFromScore(scales.adherence_nutrition),
    };
    for (const [varKey, col] of Object.entries(CHECKIN_SCALE_BY_VAR)) {
      if (!col) continue;
      if (!showCheckinField(tracking, varKey as typeof fields[number])) {
        payload[col] = todayCheckin?.[col] ?? null;
      }
    }
    const { error } = await upsertToday(user.id, payload);
    setSaving(false);
    if (error) {
      toast(error, 'error');
      return;
    }
    toast(myCoach
      ? t('checkin.savedVisible', { coach: displayName(myCoach) })
      : t('checkin.saved'));
    navigate('/dashboard');
  };

  if (loading && !todayCheckin) {
    return <PageSkeleton />;
  }

  if (!checkinHasAnyField(tracking)) {
    return (
      <PageTransition>
        <div className="px-4 pt-6">
          <PageHeader title={t('checkin.title')} />
          <EmptyState title={t('checkin.disabled')} />
        </div>
      </PageTransition>
    );
  }

  const extraCount = extraVars.length + (showCheckinField(tracking, 'notes') ? 1 : 0);
  const showExtras = moreOpen;

  const renderSlider = (key: CheckinVarKey) => {
    const col = CHECKIN_SCALE_BY_VAR[key];
    if (!col) return null;
    const copy = SCALE_COPY[col];
    return (
      <ScoreSlider
        key={key}
        label={t(`checkin.fields.${copy.field}`)}
        low={t(`checkin.low.${copy.low}`)}
        high={t(`checkin.high.${copy.high}`)}
        value={scales[col]}
        unsetLabel={t('checkin.notSet')}
        onChange={v => setScale(col, v)}
      />
    );
  };

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-8">
        <PageHeader title={t('checkin.title')} subtitle={solo ? t('checkin.subtitleSolo') : t('checkin.subtitle')} />
        <p className="text-xs text-neutral-600 -mt-4 mb-6">{t('checkin.scaleHint')}</p>

        {ficheGone ? (
          <div className="mb-6" data-testid="ux32-checkin-gone">
            <EmptyState title={t('checkin.ficheGone')} body={t('checkin.ficheGoneHint')} />
          </div>
        ) : null}
        {focused ? (
          <div className="mb-6" data-testid="ux32-checkin-fiche">
            <Card>
              <p className="text-sm font-medium text-white mb-2">
                {t('coaching.messages.aboutCheckin', { date: formatBilanDate(focused.checked_at, i18n.language) })}
              </p>
              <CheckinFilledScores row={focused} />
              {focused.notes ? (
                <p className="text-xs text-neutral-500 mt-2">{focused.notes}</p>
              ) : null}
            </Card>
          </div>
        ) : null}

        <SoloAskBar
          context={soloAskFromProfile('checkin', profile)}
          onApplyOnce={() => undefined}
          onSave={(proposal) => {
            const note = proposal.sessionNote.trim();
            if (!note) return;
            setNotes(prev => prev.trim() ? `${prev.trim()}\n${note}` : note);
            setMoreOpen(true);
            toast(t('soloAsk.saveNote'));
          }}
        />

        <div className="space-y-5">
          <div className="space-y-5" data-testid="checkin-core">
            {coreVars.includes('sleep_hours') && (
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={24}
                step={0.5}
                value={sleepHours}
                onChange={e => setSleepHours(e.target.value)}
                placeholder="7.5"
                label={t('checkin.sleepHours')}
              />
            )}

            {coreVars.filter(key => key !== 'sleep_hours').map(renderSlider)}
          </div>

          {extraCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMoreOpen(o => !o)}
              data-testid="checkin-more-details"
              aria-expanded={showExtras}
            >
              <ChevronDown size={16} className={showExtras ? 'rotate-180 transition-transform' : 'transition-transform'} />
              {t('checkin.moreDetailsCount', { count: extraCount })}
            </Button>
          )}

          {showExtras && (
            <div className="space-y-5" data-testid="checkin-extra">
              <p className="text-xs text-neutral-500">{t('checkin.extraHint')}</p>
              {extraVars.map(renderSlider)}
              {showCheckinField(tracking, 'notes') && (
                <div>
                  <label className="text-sm font-medium text-white block mb-1.5">
                    {t('checkin.notes')}
                    <span className="text-neutral-500 font-normal"> · {t('checkin.optional')}</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder={t('checkin.notesPlaceholder')}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                  />
                </div>
              )}
            </div>
          )}

          <Button onClick={handleSave} loading={saving} className="w-full">
            <Check size={16} /> {t('checkin.save')}
          </Button>
        </div>

        <CheckinHistoryList checkins={checkins} today={todayStr()} focusId={focusId} />
      </div>
    </PageTransition>
  );
}
