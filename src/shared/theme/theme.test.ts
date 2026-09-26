import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyResolvedTheme,
  currentTheme,
  DEFAULT_THEME_PREFERENCE,
  parseThemePreference,
  resolveTheme,
  THEME_COLOR,
  THEME_PREFERENCES,
  type ThemePreference,
} from './theme';
import { THEME_COLOR as PALETTE_THEME_COLOR } from './palette';

const root = process.cwd();
const src = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

// Minimal <html> + metas, enough for applyResolvedTheme and the boot script.
function fakeDocument() {
  const attrs: Record<string, string> = {};
  const metas: Record<string, string> = {
    'theme-color': '#000000',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  };
  const style = { colorScheme: '' };
  const documentElement = {
    style,
    setAttribute: (name: string, value: string) => { attrs[name] = value; },
    getAttribute: (name: string) => attrs[name] ?? null,
  };
  const doc = {
    documentElement,
    querySelector: (selector: string) => {
      const name = /meta\[name="([^"]+)"\]/.exec(selector)?.[1];
      if (!name || !(name in metas)) return null;
      return { setAttribute: (_: string, value: string) => { metas[name] = value; } };
    },
  };
  return { doc: doc as unknown as Document, attrs, metas, style };
}

test('theme: the saved preference is read defensively, dark by default', () => {
  assert.equal(DEFAULT_THEME_PREFERENCE, 'dark');
  assert.deepEqual([...THEME_PREFERENCES], ['dark', 'light', 'system']);
  assert.equal(parseThemePreference('light'), 'light');
  assert.equal(parseThemePreference('system'), 'system');
  assert.equal(parseThemePreference('dark'), 'dark');
  for (const junk of [undefined, null, '', 'LIGHT', 'auto', 1, {}]) assert.equal(parseThemePreference(junk), 'dark');
});

test('theme: "Automatique" follows the phone, explicit choices do not', () => {
  assert.equal(resolveTheme('system', true), 'light');
  assert.equal(resolveTheme('system', false), 'dark');
  assert.equal(resolveTheme('light', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', true), 'dark');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('theme: applying sets data-theme, color-scheme and the browser chrome', () => {
  const { doc, attrs, metas, style } = fakeDocument();
  applyResolvedTheme('light', doc);
  assert.equal(attrs['data-theme'], 'light');
  assert.equal(style.colorScheme, 'light');
  assert.equal(metas['theme-color'], '#f5f5f5');
  assert.equal(metas['apple-mobile-web-app-status-bar-style'], 'default');
  assert.equal(currentTheme(doc), 'light');

  applyResolvedTheme('dark', doc);
  assert.equal(attrs['data-theme'], 'dark');
  // Native controls (date picker, selects, scrollbars) are dark in the dark theme too.
  assert.equal(style.colorScheme, 'dark');
  assert.equal(metas['theme-color'], '#000000');
  assert.equal(metas['apple-mobile-web-app-status-bar-style'], 'black-translucent');
  assert.equal(currentTheme(doc), 'dark');
  assert.deepEqual(THEME_COLOR, PALETTE_THEME_COLOR);
});

test('theme: index.html applies the saved theme before the first paint, like resolveTheme', () => {
  const html = src('index.html');
  const script = /<script id="theme-boot">([\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(script, 'inline theme script present');
  // Before the bundle: the script comes before the module entry.
  assert.ok(html.indexOf('id="theme-boot"') < html.indexOf('src="/src/main.tsx"'));
  // No hard-coded black body/splash that would flash in light.
  assert.doesNotMatch(html, /<body[^>]*background/);
  assert.match(html, /html\[data-theme="light"\]\{background:#f5f5f5\}/);

  const stored: Array<string | null> = [null, '{}', 'not json', '{"theme":"light"}', '{"theme":"system"}', '{"theme":"dark"}', '{"theme":"blue"}', '{"showRir":false,"theme":"light"}'];
  for (const raw of stored) {
    for (const phoneLight of [true, false]) {
      const { doc, attrs, metas, style } = fakeDocument();
      const localStorage = { getItem: () => raw };
      const window = { matchMedia: (q: string) => ({ matches: q === '(prefers-color-scheme: light)' && phoneLight }) };
      new Function('localStorage', 'window', 'document', script)(localStorage, window, doc);

      let parsed: unknown;
      try { parsed = JSON.parse(raw ?? '{}')?.theme; } catch { parsed = undefined; }
      const expected = resolveTheme(parseThemePreference(parsed), phoneLight);
      assert.equal(attrs['data-theme'], expected, `${raw} / phone light ${phoneLight}`);
      assert.equal(style.colorScheme, expected);
      assert.equal(metas['theme-color'], THEME_COLOR[expected]);
    }
  }
});

test('theme: the boot script survives a blocked localStorage and a missing matchMedia', () => {
  const script = /<script id="theme-boot">([\s\S]*?)<\/script>/.exec(src('index.html'))![1];
  const { doc, attrs } = fakeDocument();
  const localStorage = { getItem: () => { throw new Error('blocked'); } };
  new Function('localStorage', 'window', 'document', script)(localStorage, {}, doc);
  assert.equal(attrs['data-theme'], 'dark');
});

test('theme: the offline page follows the same saved theme as the app', () => {
  const html = src('public/offline.html');
  const script = /<script>\s*\(function \(\) \{([\s\S]*?)\}\)\(\);\s*<\/script>/.exec(html)?.[1];
  assert.ok(script, 'offline theme script present');
  assert.match(html, /html\[data-theme="light"\] body \{ background: #f5f5f5; color: #171717; \}/);
  for (const raw of [null, '{"theme":"light"}', '{"theme":"system"}', '{"theme":"dark"}', 'not json']) {
    for (const phoneLight of [true, false]) {
      const { doc, attrs } = fakeDocument();
      const localStorage = { getItem: () => raw };
      const window = { matchMedia: (q: string) => ({ matches: q === '(prefers-color-scheme: light)' && phoneLight }) };
      new Function('localStorage', 'window', 'document', script)(localStorage, window, doc);
      let parsed: unknown;
      try { parsed = JSON.parse(raw ?? '{}')?.theme; } catch { parsed = undefined; }
      assert.equal(attrs['data-theme'], resolveTheme(parseThemePreference(parsed), phoneLight), `${raw} / ${phoneLight}`);
    }
  }
  // The new offline page reaches phones that cached the old one.
  assert.match(src('public/sw.js'), /const CACHE_NAME = 'prometheus-v5';/);
});

test('theme: the white logo turns ink-dark on a light page, everywhere it is shown', () => {
  assert.match(src('src/index.css'), /html\[data-theme="light"\] \.logo-mark \{\s*filter: invert\(0\.91\);/);
  assert.match(src('index.html'), /html\[data-theme="light"\] \.logo-mark\{filter:invert\(\.91\)\}/);
  assert.match(src('index.html'), /<img class="logo-mark" src="\/logo\.svg"/);
  for (const file of [
    'src/main.tsx', 'src/app/router/AppRoutes.tsx', 'src/app/layout/SideNav.tsx', 'src/components/ErrorBoundary.tsx',
    'src/components/auth/AuthPage.tsx', 'src/components/coaching/InvitePage.tsx',
    'src/components/coaching/ProvisionalClaimPage.tsx', 'src/components/onboarding/EntryIntentionPage.tsx',
  ]) {
    const code = src(file);
    const logos = code.match(/<img src="\/logo\.svg"[^>]*>/g) ?? [];
    assert.ok(logos.length > 0, file);
    for (const tag of logos) assert.match(tag, /className="logo-mark /, file);
  }
});

test('theme: the choice lives in Profil › Unités & préférences, saved with the device prefs', () => {
  const store = src('src/stores/preferencesStore.ts');
  assert.match(store, /theme: parseThemePreference\(parsed\.theme\)/);
  assert.match(store, /localStorage\.setItem\('prometheus-prefs'/);
  assert.match(store, /setTheme: \(v\) => \{[\s\S]*?applyThemePreference\(v\)/);
  // Same storage key as the boot script.
  assert.match(src('index.html'), /localStorage\.getItem\('prometheus-prefs'\)/);

  assert.match(src('src/components/profile/UnitsForm.tsx'), /<ThemeChoice \/>/);
  const choice = src('src/components/profile/ThemeChoice.tsx');
  assert.match(choice, /aria-pressed=\{selected\}/);
  assert.match(choice, /min-h-11/);
  for (const key of ['theme', 'themeDark', 'themeLight', 'themeSystem', 'themeHint']) {
    assert.match(choice, new RegExp(`profile\\.units\\.${key}\\b`));
  }
  // The app follows the phone while on "Automatique".
  assert.match(src('src/main.tsx'), /startThemeSync\(\)/);
  assert.match(src('src/app/bootstrap/themeSync.ts'), /theme === 'system'/);
});

test('theme: FR and EN name the choices', async () => {
  const fr = (await import('../../i18n/locales/fr/common')).default as { profile: { units: Record<string, string> } };
  const en = (await import('../../i18n/locales/en/common')).default as { profile: { units: Record<string, string> } };
  const keys: string[] = ['appearance', 'theme', 'themeDark', 'themeLight', 'themeSystem', 'themeHint'];
  for (const key of keys) {
    assert.ok(fr.profile.units[key], `fr ${key}`);
    assert.ok(en.profile.units[key], `en ${key}`);
  }
  assert.equal(fr.profile.units.themeDark, 'Sombre');
  assert.equal(fr.profile.units.themeLight, 'Clair');
  assert.equal(fr.profile.units.themeSystem, 'Automatique');
  assert.match(fr.profile.units.themeHint, /ton téléphone/);
  const labels: Record<ThemePreference, string> = { dark: 'Dark', light: 'Light', system: 'Automatic' };
  assert.equal(en.profile.units.themeDark, labels.dark);
  assert.equal(en.profile.units.themeLight, labels.light);
  assert.equal(en.profile.units.themeSystem, labels.system);
});
