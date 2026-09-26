// Theme preference (per device) → theme actually shown.
// The inline script in index.html applies the same rules before the first paint;
// themeBoot.test.ts runs it against these functions.

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['dark', 'light', 'system'];
/** Dark stays the default look. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'dark';

/** Page background = browser chrome colour (meta theme-color). Mirrors palette.ts THEME_COLOR. */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  dark: '#000000',
  light: '#f5f5f5',
};

export const SYSTEM_LIGHT_QUERY = '(prefers-color-scheme: light)';

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'system' || value === 'dark' ? value : DEFAULT_THEME_PREFERENCE;
}

/** "Automatique" follows the phone; a phone without a light preference stays dark. */
export function resolveTheme(preference: ThemePreference, systemPrefersLight: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersLight ? 'light' : 'dark';
  return preference;
}

export function systemPrefersLight(win: Pick<Window, 'matchMedia'> | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  try {
    return !!win?.matchMedia && win.matchMedia(SYSTEM_LIGHT_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * Puts the theme on <html>: data-theme (drives the CSS variables), color-scheme
 * (native controls — date picker, selects, checkboxes, scrollbars — follow the
 * theme), and the browser chrome colours.
 */
export function applyResolvedTheme(theme: ResolvedTheme, doc: Document | undefined = typeof document === 'undefined' ? undefined : document): void {
  if (!doc) return;
  const root = doc.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  doc
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', theme === 'light' ? 'default' : 'black-translucent');
}

export function applyThemePreference(preference: ThemePreference): ResolvedTheme {
  const theme = resolveTheme(preference, systemPrefersLight());
  applyResolvedTheme(theme);
  return theme;
}

/** Calls back when the phone switches between light and dark. Returns the unsubscribe. */
export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  try {
    const query = window.matchMedia(SYSTEM_LIGHT_QUERY);
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    // Safari < 14
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  } catch {
    return () => {};
  }
}

/** Theme currently on <html> (what the screen shows). */
export function currentTheme(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): ResolvedTheme {
  return doc?.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}
