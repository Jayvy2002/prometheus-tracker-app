import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCheckinStore } from '../../stores/checkinStore';
import { todayStr } from '../../lib/utils';
import Button from '../ui/Button';
import PageTransition from '../ui/PageTransition';
import { toast } from '../ui/Toast';
import type { DailyCheckinInput } from '../../lib/types';

type ScaleKey = keyof Pick<DailyCheckinInput,
  'hunger' | 'fatigue' | 'sleep_quality' | 'stress' | 'motivation' |
  'muscle_soreness' | 'joint_pain' | 'energy_level' | 'mood'
>;

function ScaleRow({
  label, low, high, value, onChange,
}: {
  label: string;
  low: string;
  high: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white">{label}</p>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-[10px] text-neutral-500 hover:text-neutral-300"
        >
          {value == null ? '—' : '×'}
        </button>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all
              ${value === n
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 border border-neutral-800'}`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-neutral-600">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

export default function CheckInPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { todayCheckin, loading, fetchToday, upsertToday } = useCheckinStore();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sleepHours, setSleepHours] = useState('');
  const [notes, setNotes] = useState('');
  const [scales, setScales] = useState<Record<ScaleKey, number | null>>({
    sleep_quality: null,
    energy_level: null,
    mood: null,
    motivation: null,
    hunger: null,
    fatigue: null,
    stress: null,
    muscle_soreness: null,
    joint_pain: null,
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
    });
  }, [todayCheckin]);

  const setScale = (key: ScaleKey, value: number | null) => {
    setScales(s => ({ ...s, [key]: value }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const hours = sleepHours.trim() === '' ? null : Number(sleepHours);
    const { error } = await upsertToday(user.id, {
      checked_at: todayStr(),
      sleep_hours: hours != null && !Number.isNaN(hours) ? hours : null,
      notes,
      ...scales,
    });
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

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-8">
        <h1 className="text-2xl font-bold text-white mb-1">{t('checkin.title')}</h1>
        <p className="text-sm text-neutral-500 mb-6">{t('checkin.subtitle')}</p>

        {step === 0 ? (
          <div className="space-y-5">
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
            <ScaleRow label={t('checkin.fields.sleep_quality')} low={t('checkin.low.poor')} high={t('checkin.high.excellent')} value={scales.sleep_quality} onChange={v => setScale('sleep_quality', v)} />
            <ScaleRow label={t('checkin.fields.energy_level')} low={t('checkin.low.drained')} high={t('checkin.high.high')} value={scales.energy_level} onChange={v => setScale('energy_level', v)} />
            <ScaleRow label={t('checkin.fields.mood')} low={t('checkin.low.low')} high={t('checkin.high.great')} value={scales.mood} onChange={v => setScale('mood', v)} />
            <ScaleRow label={t('checkin.fields.motivation')} low={t('checkin.low.none')} high={t('checkin.high.fired')} value={scales.motivation} onChange={v => setScale('motivation', v)} />
            <Button onClick={() => setStep(1)} className="w-full">
              {t('common.continue')} <ChevronRight size={16} />
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <ScaleRow label={t('checkin.fields.hunger')} low={t('checkin.low.none')} high={t('checkin.high.ravenous')} value={scales.hunger} onChange={v => setScale('hunger', v)} />
            <ScaleRow label={t('checkin.fields.fatigue')} low={t('checkin.low.fresh')} high={t('checkin.high.exhausted')} value={scales.fatigue} onChange={v => setScale('fatigue', v)} />
            <ScaleRow label={t('checkin.fields.stress')} low={t('checkin.low.calm')} high={t('checkin.high.overwhelmed')} value={scales.stress} onChange={v => setScale('stress', v)} />
            <ScaleRow label={t('checkin.fields.muscle_soreness')} low={t('checkin.low.none')} high={t('checkin.high.severe')} value={scales.muscle_soreness} onChange={v => setScale('muscle_soreness', v)} />
            <ScaleRow label={t('checkin.fields.joint_pain')} low={t('checkin.low.none')} high={t('checkin.high.severe')} value={scales.joint_pain} onChange={v => setScale('joint_pain', v)} />
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
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(0)}>
                <ChevronLeft size={16} />
              </Button>
              <Button onClick={handleSave} loading={saving} className="flex-1">
                <Check size={16} /> {t('checkin.save')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
