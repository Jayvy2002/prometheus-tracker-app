import { usePreferencesStore } from '../../stores/preferencesStore';
import { applyThemePreference, watchSystemTheme } from '../../shared/theme/theme';

/**
 * index.html already put the saved theme on <html> before the first paint.
 * This re-applies it once the app runs and follows the phone while the
 * preference is "Automatique".
 */
export function startThemeSync(): () => void {
  applyThemePreference(usePreferencesStore.getState().theme);
  return watchSystemTheme(() => {
    const { theme } = usePreferencesStore.getState();
    if (theme === 'system') applyThemePreference(theme);
  });
}
