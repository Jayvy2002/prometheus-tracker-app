import { useState } from 'react';
import { Footprints, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import Card from '../ui/Card';
import { Link } from 'react-router-dom';
import { formatNumber } from '../../lib/utils';
import { nutritionTargetsFromProfile, targetRatio } from '../../features/nutrition/domain/nutritionTargets';
import { toast } from '../ui/Toast';

const QUICK_ADD = [1000, 2500, 5000];
const MAX_STEPS = 100000;

function clampSteps(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_STEPS, Math.round(value)));
}

export default function StepsTracker() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const { stepsLog, logSteps, selectedDate } = useNutritionStore();
  // No target chosen = no target shown (never an invented 10 000 steps).
  const target = nutritionTargetsFromProfile(profile).steps;
  const consumed = stepsLog?.logged_at === selectedDate ? stepsLog.steps : 0;
  const pct = targetRatio(consumed, target);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const persist = async (next: number) => {
    if (!user) return;
    const steps = clampSteps(next);
    setSaving(true);
    const { error } = await logSteps(user.id, steps, selectedDate);
    setSaving(false);
    if (error) {
      toast(error, 'error');
      return;
    }
    setDraft('');
    toast(t('nutrition.steps.saved'));
  };

  const handleSave = async () => {
    const raw = draft.trim() === '' ? consumed : Number(draft.replace(/\s/g, ''));
    if (!Number.isFinite(raw) || raw < 0 || raw > MAX_STEPS) {
      toast(t('nutrition.steps.invalid'), 'error');
      return;
    }
    await persist(raw);
  };

  const handleAdd = async (n: number) => {
    await persist(consumed + n);
  };

  const handleClear = async () => {
    if (consumed <= 0) return;
    await persist(0);
  };

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Footprints className="text-emerald-400" size={18} />
        <span className="text-sm font-medium text-white">{t('nutrition.steps.title')}</span>
        <span className="text-xs text-neutral-500 ml-auto">
          {target != null
            ? `${formatNumber(consumed, { maxDigits: 0 })} / ${formatNumber(target, { maxDigits: 0 })}`
            : formatNumber(consumed, { maxDigits: 0 })}
        </span>
      </div>
      {target != null ? (
        <div className="h-2 bg-neutral-800 rounded-full overflow-hidden mb-3">
          <div className="h-full bg-emerald-400 rounded-full transition-all duration-500 animate-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <Link to="/profile?section=goals" className="block mb-3 text-xs text-emerald-400">{t('nutrition.steps.setTarget')}</Link>
      )}
      <div className="flex items-center gap-2 mb-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_STEPS}
          step={100}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={consumed > 0 ? String(consumed) : undefined}
          aria-label={t('nutrition.steps.title')}
          className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-300 text-xs font-medium hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {t('nutrition.steps.save')}
        </button>
      </div>
      <div className="flex items-center gap-2">
        {QUICK_ADD.map(n => (
          <button
            key={n}
            type="button"
            onClick={() => void handleAdd(n)}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-transform active:scale-90 disabled:opacity-50"
          >
            +{n.toLocaleString()}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void handleClear()}
          className="p-2 rounded-lg bg-neutral-800 text-neutral-400 hover:text-rose-400 transition-colors"
          disabled={saving || consumed <= 0}
        >
          <Minus size={14} />
        </button>
      </div>
    </Card>
  );
}
