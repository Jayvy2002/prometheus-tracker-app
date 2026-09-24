import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import Button from '../ui/Button';
import UnitToggle from '../ui/UnitToggle';
import { toast } from '../ui/Toast';
import { userFacingError } from '../../lib/userFacingError';

export default function UnitsForm({ onBack, inline }: { onBack: () => void; inline?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { profile, updateProfile } = useProfileStore();
  const { showRir, setShowRir, autoStartRest, setAutoStartRest, keepScreenAwake: keepAwake, setKeepScreenAwake: setKeepAwake } = usePreferencesStore();
  const [unitWeight, setUnitWeight] = useState(profile?.unit_weight ?? 'kg');
  const [unitDistance, setUnitDistance] = useState(profile?.unit_distance ?? 'km');
  const [unitHeight, setUnitHeight] = useState(profile?.unit_height ?? 'cm');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const result = await updateProfile(user.id, {
      unit_weight: unitWeight as 'kg' | 'lbs',
      unit_distance: unitDistance as 'km' | 'mi',
      unit_height: unitHeight as 'cm' | 'in',
    });
    setSaving(false);
    if (result.error) {
      toast(userFacingError(result.error, t('errors.generic')), 'error');
      return;
    }
    onBack();
  };

  return (
    <div>
      {!inline && (
        <>
          <button onClick={onBack} className="flex items-center gap-2 text-neutral-400 hover:text-white mb-6 transition-colors">
            <ArrowLeft size={18} /> <span className="text-sm">{t('common.back')}</span>
          </button>
          <h2 className="text-xl font-bold text-white mb-6">{t('profile.units.title')}</h2>
        </>
      )}
      <div className="space-y-1 mb-6">
        <UnitToggle label={t('profile.units.weight')} value={unitWeight} options={['kg', 'lbs']} onChange={(v) => setUnitWeight(v as 'kg' | 'lbs')} />
        <UnitToggle label={t('profile.units.distance')} value={unitDistance} options={['km', 'mi']} onChange={(v) => setUnitDistance(v as 'km' | 'mi')} />
        <UnitToggle label={t('profile.units.height')} value={unitHeight} options={['cm', 'in']} onChange={(v) => setUnitHeight(v as 'cm' | 'in')} />
        <p className="text-[11px] text-neutral-500 mt-2" data-testid="ux67-inline-hint">
          {t('profile.units.displayOnlyHint')}
        </p>

        <div className="pt-3 mt-1 border-t border-neutral-800/60">
          <p className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wider mb-3">{t('profile.units.workoutDisplay')}</p>
          <div className="flex items-center justify-between py-1">
            <div>
              <span className="text-sm text-neutral-300">{t('profile.units.showRir')}</span>
              <p className="text-[11px] text-neutral-600 mt-0.5">{t('profile.units.rirDescription')}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showRir}
              aria-label={t('profile.units.showRir')}
              onClick={() => setShowRir(!showRir)}
              className={`relative w-11 h-6 rounded-full transition-colors ${showRir ? 'bg-blue-600' : 'bg-neutral-700'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showRir ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between py-1 mt-3">
            <div>
              <span className="text-sm text-neutral-300">{t('profile.units.autoStartRest')}</span>
              <p className="text-[11px] text-neutral-600 mt-0.5" data-testid="ux67-inline-hint">{t('profile.units.autoStartRestHint')}</p>
            </div>
            <button
              type="button"
              role="switch"
              data-testid="auto-start-rest"
              aria-checked={autoStartRest}
              aria-label={t('profile.units.autoStartRest')}
              onClick={() => setAutoStartRest(!autoStartRest)}
              className={`relative w-11 h-6 rounded-full transition-colors ${autoStartRest ? 'bg-blue-600' : 'bg-neutral-700'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoStartRest ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between py-1 mt-3">
            <div>
              <span className="text-sm text-neutral-300">{t('profile.units.keepScreenAwake')}</span>
            </div>
            <button
              type="button"
              role="switch"
              data-testid="keep-screen-awake"
              aria-checked={keepAwake}
              aria-label={t('profile.units.keepScreenAwake')}
              onClick={() => setKeepAwake(!keepAwake)}
              className={`relative w-11 h-6 rounded-full transition-colors ${keepAwake ? 'bg-blue-600' : 'bg-neutral-700'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${keepAwake ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        </div>
      </div>
      <Button onClick={handleSave} loading={saving} className="w-full">{t('profile.units.savePreferences')}</Button>
    </div>
  );
}
