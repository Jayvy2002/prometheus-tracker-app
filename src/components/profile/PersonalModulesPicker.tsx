import { useTranslation } from 'react-i18next';
import { ClipboardCheck, Dumbbell, Salad, Scale, Check } from 'lucide-react';
import { PERSONAL_MODULE_KEYS, type PersonalModuleKey, type PersonalModules } from '../../lib/clientTracking';

const ICONS: Record<PersonalModuleKey, typeof Dumbbell> = {
  workouts: Dumbbell,
  nutrition: Salad,
  weight: Scale,
  checkins: ClipboardCheck,
};

/** Toggle list shared by onboarding and Profile: what the Solo follows (Vision §5.3). */
export default function PersonalModulesPicker({
  value,
  onChange,
}: {
  value: PersonalModules;
  onChange: (next: PersonalModules) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2" role="group" aria-label={t('modules.title')}>
      {PERSONAL_MODULE_KEYS.map(key => {
        const Icon = ICONS[key];
        const on = value[key] !== false;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange({ ...value, [key]: !on })}
            className={`w-full min-h-14 flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
              on ? 'border-blue-500/60 bg-blue-500/10' : 'border-neutral-800 bg-neutral-900'
            }`}
          >
            <Icon size={18} className={on ? 'text-blue-400' : 'text-neutral-500'} aria-hidden="true" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-white">{t(`modules.${key}`)}</span>
              <span className="block text-xs text-neutral-400">{t(`modules.${key}Hint`)}</span>
            </span>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center ${on ? 'bg-blue-600' : 'border border-neutral-700'}`} aria-hidden="true">
              {on && <Check size={14} className="text-white" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
