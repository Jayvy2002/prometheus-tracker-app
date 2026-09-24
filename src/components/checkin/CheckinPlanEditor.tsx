import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';
import { setPlan } from '../../features/checkins/api/checkinPlanApi';
import {
  CHECKIN_FREQUENCIES,
  type CheckinFrequency,
  type CheckinPlan,
  type CheckinTemplate,
} from '../../features/checkins/domain/checkinTemplate';
import type { CheckinVarKey } from '../../lib/clientTracking';
import { userFacingError } from '../../lib/userFacingError';

const chip = (on: boolean) =>
  `min-h-11 rounded-xl border px-3 text-sm ${on ? 'border-blue-500 bg-blue-500/15 text-blue-100' : 'border-neutral-800 bg-neutral-900 text-neutral-300'}`;

/** Monday first, as people plan their week. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

/**
 * Vision §10–11.2 — who decides the check-in: the active coach for a coached
 * athlete, the athlete when Solo. Template + rhythm + why each habit is asked.
 */
export default function CheckinPlanEditor({
  userId,
  plan,
  templates,
  habits,
  onSaved,
}: {
  userId: string;
  plan: CheckinPlan | null;
  templates: CheckinTemplate[];
  /** The essential fields followed (sleep, stress…), each can carry a reason. */
  habits: CheckinVarKey[];
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [templateId, setTemplateId] = useState<string>(plan?.template_id ?? '');
  const [frequency, setFrequency] = useState<CheckinFrequency>(plan?.frequency ?? 'daily');
  const [weekday, setWeekday] = useState<number>(plan?.weekday ?? 1);
  const [reasons, setReasons] = useState<Record<string, string>>(plan?.habit_reasons ?? {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTemplateId(plan?.template_id ?? '');
    setFrequency(plan?.frequency ?? 'daily');
    setWeekday(plan?.weekday ?? 1);
    setReasons(plan?.habit_reasons ?? {});
  }, [plan]);

  const save = async () => {
    setSaving(true);
    const result = await setPlan({ userId, templateId: templateId || null, frequency, weekday, habitReasons: reasons });
    setSaving(false);
    if (result.error) {
      toast(t(`checkinPlan.errors.${result.error}`, { defaultValue: userFacingError(result.error, t('errors.generic')) }), 'error');
      return;
    }
    toast(t('checkinPlan.saved'));
    onSaved();
  };

  const weekly = frequency === 'weekly' || frequency === 'biweekly';

  return (
    <div className="space-y-4" data-testid="checkin-plan-editor">
      <div>
        <p className="text-xs text-neutral-400 mb-2">{t('checkinPlan.frequency')}</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('checkinPlan.frequency')}>
          {CHECKIN_FREQUENCIES.map(f => (
            <button key={f} type="button" aria-pressed={frequency === f} className={chip(frequency === f)} onClick={() => setFrequency(f)}>
              {t(`checkinPlan.frequencies.${f}`)}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-neutral-500">{t('checkinPlan.reviewStaysWeekly')}</p>
      </div>
      {weekly && (
        <div>
          <p className="text-xs text-neutral-400 mb-2">{t('checkinPlan.weekday')}</p>
          <div className="grid grid-cols-7 gap-1" role="group" aria-label={t('checkinPlan.weekday')}>
            {WEEKDAYS.map(d => (
              <button key={d} type="button" aria-pressed={weekday === d} className={chip(weekday === d)} onClick={() => setWeekday(d)}>
                {t(`programs.weekdays.${d}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <label htmlFor="plan-template" className="text-xs text-neutral-400 block mb-1">{t('checkinPlan.template')}</label>
        <select
          id="plan-template"
          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
          value={templateId}
          onChange={e => setTemplateId(e.target.value)}
        >
          <option value="">{t('checkinPlan.noTemplate')}</option>
          {templates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
        </select>
      </div>
      {habits.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-neutral-400">{t('checkinPlan.habitReasons')}</p>
          {habits.map(key => (
            <div key={key}>
              <label htmlFor={`reason-${key}`} className="text-xs text-neutral-300 block mb-1">{t(`checkinPlan.habits.${key}`)}</label>
              <input
                id={`reason-${key}`}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white"
                maxLength={200}
                placeholder={t('checkinPlan.whyPlaceholder')}
                value={reasons[key] ?? ''}
                onChange={e => setReasons(r => ({ ...r, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}
      <Button onClick={() => void save()} loading={saving}>{t('checkinPlan.savePlan')}</Button>
    </div>
  );
}
