import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCheckinStore } from '../../stores/checkinStore';
import { todayStr } from '../../lib/utils';
import { clampCheckinScore } from '../../lib/checkinScale';
import { useClientTracking } from '../../lib/useClientTracking';
import {
  CHECKIN_SCALE_BY_VAR,
  checkinHasAnyField,
  showCheckinField,
  visibleCheckinFields,
  type CheckinScaleKey,
} from '../../lib/clientTracking';
import Button from '../ui/Button';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';
import type { DailyCheckinInput } from '../../lib/types';
import ScoreSlider from './ScoreSlider';
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { todayCheckin, loading, fetchToday, upsertToday } = useCheckinStore();
  const tracking = useClientTracking();
  const fields = useMemo(() => visibleCheckinFields(tracking), [tracking]);
  const [saving, setSaving] = useState(false);
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
    if (user) fetchToday(user.id);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

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
      notes: showCheckinField(tracking, 'notes') ? notes : (todayCheckin?.notes || ''),
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
    toast(t('checkin.saved'));
    navigate('/dashboard');
  };

  if (loading && !todayCheckin) {
    return (
      <div className="px-4 pt-8 flex justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!checkinHasAnyField(tracking)) {
    return (
      <PageTransition>
        <div className="px-4 pt-6">
          <h1 className="text-2xl font-bold text-white mb-2">{t('checkin.title')}</h1>
          <p className="text-sm text-neutral-500">{t('checkin.disabled')}</p>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-8">
        <h1 className="text-2xl font-bold text-white mb-1">{t('checkin.title')}</h1>
        <p className="text-sm text-neutral-500 mb-1">{t('checkin.subtitle')}</p>
        <p className="text-[11px] text-neutral-600 mb-6">{t('checkin.scaleHint')}</p>

        <div className="space-y-5">
          {showCheckinField(tracking, 'sleep_hours') && (
            <div>
              <label className="text-sm font-medium text-white block mb-1.5">{t('checkin.sleepHours')}</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={24}
                step={0.5}
                value={sleepHours}
                onChange={e => setSleepHours(e.target.value)}
                placeholder="7.5"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <p className="text-[10px] text-neutral-600 mt-1">{t('checkin.optional')}</p>
            </div>
          )}

          {fields.map(key => {
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
          })}

          {showCheckinField(tracking, 'notes') && (
            <div>
              <label className="text-sm font-medium text-white block mb-1.5">{t('checkin.notes')}</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder={t('checkin.notesPlaceholder')}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
              />
            </div>
          )}

          <Button onClick={handleSave} loading={saving} className="w-full">
            <Check size={16} /> {t('checkin.save')}
          </Button>
        </div>
      </div>
    </PageTransition>
  );
}
