import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Footprints } from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { useProfileStore } from '../../../stores/profileStore';
import { useNutritionStore } from '../../../stores/nutritionStore';
import { todayStr } from '../../../lib/utils';

export default function StepsWidget({ size }: { size: string }) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const { fetchOrCreateSteps, logSteps } = useNutritionStore();
  const [steps, setSteps] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const target = profile?.daily_steps_target ?? 10000;
  const pct = Math.min(100, (steps / target) * 100);

  useEffect(() => {
    if (!user) return;
    fetchOrCreateSteps(user.id, todayStr()).then(data => {
      if (data) setSteps(data.steps);
    });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    const s = parseInt(draft);
    if (isNaN(s)) return;
    await logSteps(user.id, s, todayStr());
    setSteps(s);
    setEditing(false);
  };

  const isSmall = size === 'small';

  if (isSmall) {
    return (
      <div className="flex flex-col items-center justify-center gap-1">
        <Footprints size={18} className="text-emerald-400" />
        <p className="text-lg font-bold text-white">{steps.toLocaleString()}</p>
        <p className="text-[10px] text-neutral-500">{t('widgets.steps.steps')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end gap-2 mb-2">
        <Footprints size={16} className="text-emerald-400 mb-0.5" />
        {editing ? (
          <div className="flex items-center gap-1 flex-1">
            <input
              autoFocus
              type="number"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
              className="w-24 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <button onClick={handleSave} className="text-xs text-blue-400 hover:text-blue-300 px-1 transition-colors">{t('widgets.steps.save')}</button>
            <button onClick={() => setEditing(false)} className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">{t('widgets.steps.cancel')}</button>
          </div>
        ) : (
          <>
            <button onClick={() => { setDraft(steps.toString()); setEditing(true); }} className="flex items-end gap-2 group">
              <span className="text-2xl font-bold text-white group-hover:text-blue-300 transition-colors">{steps.toLocaleString()}</span>
              <span className="text-xs text-neutral-400 mb-0.5">{t('widgets.steps.ofTarget', { target: target.toLocaleString() })}</span>
            </button>
          </>
        )}
      </div>
      <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-neutral-500 mt-1">{Math.round(pct)}{t('widgets.steps.percentGoal')}</p>
    </div>
  );
}
