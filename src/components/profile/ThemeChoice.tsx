import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { THEME_PREFERENCES, type ThemePreference } from '../../shared/theme/theme';

const LABEL_KEYS: Record<ThemePreference, string> = {
  dark: 'profile.units.themeDark',
  light: 'profile.units.themeLight',
  system: 'profile.units.themeSystem',
};

/** Thème de l'appareil : appliqué tout de suite, gardé sur cet appareil. */
export default function ThemeChoice() {
  const { t } = useTranslation();
  const theme = usePreferencesStore(s => s.theme);
  const setTheme = usePreferencesStore(s => s.setTheme);
  const labelId = useId();
  const hintId = useId();

  return (
    <div className="py-1" data-testid="theme-choice">
      <p id={labelId} className="text-sm text-neutral-300 mb-2">{t('profile.units.theme')}</p>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={hintId}
        className="grid grid-cols-3 rounded-xl overflow-hidden border border-neutral-800"
      >
        {THEME_PREFERENCES.map(option => {
          const selected = theme === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              data-theme-option={option}
              onClick={() => setTheme(option)}
              className={`min-h-11 px-2 text-sm font-medium transition-colors ${
                selected ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-400 hover:text-white'
              }`}
            >
              {t(LABEL_KEYS[option])}
            </button>
          );
        })}
      </div>
      <p id={hintId} className="text-[11px] text-neutral-500 mt-2">{t('profile.units.themeHint')}</p>
    </div>
  );
}
