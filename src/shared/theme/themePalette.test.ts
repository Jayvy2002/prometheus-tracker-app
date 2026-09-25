import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import twColors from 'tailwindcss/colors';
import {
  ACCENT_HUES,
  DARK_ISLAND_CLASSES,
  DARK_NEUTRAL,
  DARK_TOKENS,
  LIGHT_NEUTRAL,
  LIGHT_TOKENS,
  OVERLAY,
  SHADES,
  darkAccent,
  lightAccent,
  themeHexColors,
} from './palette';
import { CHART_COLORS } from './chartColors';
import { blend, contrastRatio } from './contrast';

const root = process.cwd();
const src = (rel: string) => readFileSync(resolve(root, rel), 'utf8');
const AA = 4.5;
const GRAPHIC = 3;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && !name.includes('.test.') ? [path] : [];
  });
}

// Light backgrounds text sits on: page, cards (neutral-900 / surface-raised),
// deep panels (neutral-950 / surface), chips and inputs (neutral-800).
const LIGHT_PAGE = LIGHT_TOKENS.page;
const LIGHT_CARDS = [LIGHT_TOKENS.page, LIGHT_TOKENS['surface-raised'], LIGHT_TOKENS.surface, LIGHT_NEUTRAL[900], LIGHT_NEUTRAL[950]];

test('dark theme is today\'s palette, value for value', () => {
  const neutral = twColors.neutral as Record<string, string>;
  for (const shade of SHADES) {
    const expected = shade === 500 ? '#949494' : shade === 600 ? '#858585' : neutral[shade];
    assert.equal(DARK_NEUTRAL[shade], expected, `neutral-${shade}`);
    for (const hue of ACCENT_HUES) {
      assert.equal(darkAccent(hue)[shade], (twColors[hue] as Record<string, string>)[shade], `${hue}-${shade}`);
    }
  }
  // Design-system tokens as they were in tailwind.config.js before the light theme.
  assert.deepEqual(
    {
      page: DARK_TOKENS.page,
      surface: DARK_TOKENS.surface,
      raised: DARK_TOKENS['surface-raised'],
      hover: DARK_TOKENS['surface-hover'],
      active: DARK_TOKENS['surface-active'],
      elevated: DARK_TOKENS.elevated,
      ink: DARK_TOKENS.ink,
      secondary: DARK_TOKENS['ink-secondary'],
      muted: DARK_TOKENS['ink-muted'],
      disabled: DARK_TOKENS['ink-disabled'],
      line: DARK_TOKENS.line,
      lineSubtle: DARK_TOKENS['line-subtle'],
      lineFocus: DARK_TOKENS['line-focus'],
      primary: DARK_TOKENS.primary,
      primaryHover: DARK_TOKENS['primary-hover'],
      success: DARK_TOKENS.success,
      successHover: DARK_TOKENS['success-hover'],
      warning: DARK_TOKENS.warning,
      warningHover: DARK_TOKENS['warning-hover'],
      danger: DARK_TOKENS.danger,
      dangerHover: DARK_TOKENS['danger-hover'],
      dangerMuted: DARK_TOKENS['danger-muted'],
      white: DARK_TOKENS.white,
      black: DARK_TOKENS.black,
      overlay: OVERLAY.dark,
    },
    {
      page: '#000000', surface: '#0a0a0a', raised: '#171717', hover: '#262626', active: '#404040', elevated: '#171717',
      ink: '#f8fafc', secondary: '#a3a3a3', muted: '#949494', disabled: '#525252',
      line: '#262626', lineSubtle: '#1f1f1f', lineFocus: '#60a5fa',
      primary: '#2563eb', primaryHover: '#3b82f6', success: '#16a34a', successHover: '#22c55e',
      warning: '#d97706', warningHover: '#f59e0b', danger: '#e11d48', dangerHover: '#f43f5e', dangerMuted: '#fb7185',
      white: '#ffffff', black: '#000000', overlay: 'rgba(0,0,0,0.72)',
    },
  );
  // The two hard-coded border greys became tokens with the same dark values.
  assert.equal(DARK_TOKENS['line-strong'], '#525252');
  assert.equal(DARK_TOKENS['line-stronger'], '#737373');
});

test('light: main text pairs reach AA on the page and on cards', () => {
  const texts: Array<[string, string]> = [
    ['white (primary text)', LIGHT_TOKENS.white],
    ['ink', LIGHT_TOKENS.ink],
    ['ink-secondary', LIGHT_TOKENS['ink-secondary']],
    ['ink-muted', LIGHT_TOKENS['ink-muted']],
    ...([100, 200, 300, 400, 500, 600] as const).map(shade => [`neutral-${shade}`, LIGHT_NEUTRAL[shade]] as [string, string]),
  ];
  for (const [name, color] of texts) {
    for (const bg of LIGHT_CARDS) {
      assert.ok(contrastRatio(color, bg) >= AA, `${name} ${color} on ${bg}: ${contrastRatio(color, bg).toFixed(2)}`);
    }
    // Secondary text also sits on chips / inputs (neutral-800).
    assert.ok(contrastRatio(color, LIGHT_NEUTRAL[800]) >= AA, `${name} on neutral-800`);
  }
  // Hierarchy kept: primary > secondary > muted greys.
  assert.ok(contrastRatio(LIGHT_TOKENS.white, LIGHT_PAGE) > contrastRatio(LIGHT_NEUTRAL[300], LIGHT_PAGE));
  assert.ok(contrastRatio(LIGHT_NEUTRAL[300], LIGHT_PAGE) > contrastRatio(LIGHT_NEUTRAL[500], LIGHT_PAGE));
  assert.ok(contrastRatio(LIGHT_NEUTRAL[500], LIGHT_PAGE) > contrastRatio(LIGHT_NEUTRAL[600], LIGHT_PAGE));
  // Disabled text is exempt from AA; it stays readable (≥ 3:1) like in dark.
  for (const bg of [LIGHT_PAGE, LIGHT_TOKENS['surface-raised']]) {
    assert.ok(contrastRatio(LIGHT_TOKENS['ink-disabled'], bg) >= GRAPHIC);
  }
  // Borders and fills stay light; the card is lighter than the page.
  for (const shade of [700, 800, 900, 950] as const) assert.ok(contrastRatio(LIGHT_NEUTRAL[shade], '#ffffff') < 1.6);
  assert.equal(LIGHT_TOKENS.black, LIGHT_PAGE);
  assert.equal(LIGHT_NEUTRAL[900], '#ffffff');
});

test('light: accent text shades reach AA on white, page, chips and their own tint', () => {
  for (const hue of ACCENT_HUES) {
    const light = lightAccent(hue);
    for (const shade of [50, 100, 200, 300, 400, 500, 600] as const) {
      const color = light[shade];
      for (const bg of [...LIGHT_CARDS, LIGHT_NEUTRAL[800]]) {
        assert.ok(contrastRatio(color, bg) >= AA, `${hue}-${shade} ${color} on ${bg}: ${contrastRatio(color, bg).toFixed(2)}`);
      }
      // Badges: `bg-x-500/20 text-x-300` → both resolve to this hue's light shades.
      for (const base of ['#ffffff', LIGHT_PAGE]) {
        const tint = blend(light[500], base, 0.2);
        assert.ok(contrastRatio(color, tint) >= AA, `${hue}-${shade} on its 20 % tint`);
      }
    }
    // Deep dark tints (…-800/900/950 surfaces in dark) become light tints.
    for (const shade of [800, 900, 950] as const) assert.ok(contrastRatio(light[shade], '#ffffff') < 2, `${hue}-${shade}`);
  }
  // The shades the brief names explicitly.
  for (const [hue, shade] of [['blue', 300], ['blue', 400], ['emerald', 400], ['amber', 400], ['rose', 400], ['sky', 400], ['teal', 400], ['cyan', 400], ['violet', 400]] as const) {
    assert.ok(contrastRatio(lightAccent(hue)[shade], '#ffffff') >= AA, `${hue}-${shade}`);
  }
  for (const token of ['success', 'warning', 'danger', 'danger-muted', 'primary', 'line-focus'] as const) {
    assert.ok(contrastRatio(LIGHT_TOKENS[token], '#ffffff') >= AA, token);
    assert.ok(contrastRatio(LIGHT_TOKENS[token], LIGHT_PAGE) >= AA, token);
  }
  assert.ok(contrastRatio(LIGHT_TOKENS['focus-ring'], '#ffffff') >= GRAPHIC);
});

test('light: solid buttons keep white text (dark islands)', () => {
  // `bg-blue-600 text-white`, `bg-primary text-ink`: inside these, the dark variables apply.
  for (const cls of ['bg-primary', 'bg-danger', 'bg-blue-600', 'bg-blue-500', '!bg-rose-600', 'bg-emerald-600', 'theme-dark']) {
    assert.ok(DARK_ISLAND_CLASSES.includes(cls), cls);
  }
  for (const cls of ['bg-blue-400', 'bg-neutral-900', 'bg-white', 'bg-blue-600/20']) {
    assert.ok(!DARK_ISLAND_CLASSES.includes(cls), cls);
  }
  assert.ok(contrastRatio(DARK_TOKENS.white, darkAccent('blue')[600]) >= AA);
  assert.ok(contrastRatio(DARK_TOKENS.ink, DARK_TOKENS.primary) >= AA);
  // What text-white would be without the island: dark ink on blue — the case we avoid.
  assert.ok(contrastRatio(LIGHT_TOKENS.white, darkAccent('blue')[600]) < AA);
});

test('charts: dark colours unchanged, light colours readable', () => {
  assert.deepEqual(CHART_COLORS.dark, {
    tick: '#949494', tooltipBg: '#0a0a0a', tooltipBgRaised: '#171717', tooltipBorder: '#262626', tooltipLabel: '#94a3b8',
    primary: '#2563eb', primaryBar: '#3b82f6', primaryLine: '#60a5fa', primaryArea: '#2563eb33',
    success: '#10b981', successSoft: '#34d399', successSoftArea: '#34d39922', goal: '#f59e0b', goalLabel: '#f59e0b',
    neutralDot: '#64748b', ringTrack: '#262626', timerTrack: '#0a0a0a',
  });
  const light = CHART_COLORS.light;
  const lightHex = themeHexColors('light');
  assert.equal(light.tick, lightHex['neutral-500']);
  assert.equal(light.tooltipBorder, lightHex['neutral-800']);
  for (const bg of LIGHT_CARDS) {
    assert.ok(contrastRatio(light.tick, bg) >= AA, `tick on ${bg}`);
    assert.ok(contrastRatio(light.goalLabel, bg) >= AA, `goal label on ${bg}`);
    for (const series of [light.primary, light.primaryBar, light.primaryLine, light.success, light.successSoft, light.goal, light.neutralDot]) {
      assert.ok(contrastRatio(series, bg) >= GRAPHIC, `${series} on ${bg}`);
    }
  }
  assert.ok(contrastRatio(light.tooltipLabel, light.tooltipBg) >= AA);
  // No chart keeps a hard-coded dark tooltip or tick.
  for (const file of ['src/components/stats/StatsPage.tsx', 'src/components/coaching/ProgressCharts.tsx', 'src/components/weight/WeightPage.tsx', 'src/components/workout/ExerciseProgressPage.tsx', 'src/components/dashboard/DashboardWeightCard.tsx', 'src/components/workout/RestTimer.tsx', 'src/shared/ui/ProgressRing.tsx']) {
    const code = src(file);
    assert.match(code, /useChartColors\(\)/, file);
    assert.doesNotMatch(code, /'#(?:0a0a0a|171717|262626|949494|94a3b8)'|"#(?:0a0a0a|60a5fa|34d399|10b981|f59e0b)"/, file);
  }
});

test('Tailwind: colour classes resolve to theme variables, dark on :root', async () => {
  const { default: config } = await import('../../../tailwind.config.js');
  const html = '<div class="text-white bg-black bg-neutral-900 text-neutral-500 border-neutral-800 bg-blue-600 text-blue-400 bg-blue-500/10 bg-page text-ink bg-overlay border-line-strong hover:!bg-rose-700 !bg-rose-600"></div>';
  const result = await postcss([tailwindcss({ ...config, content: [{ raw: html, extension: 'html' }] })])
    .process('@tailwind base; @tailwind utilities;', { from: undefined });
  const css = result.css.replace(/\s+/g, ' ');

  assert.match(css, /\.text-white \{ --tw-text-opacity: 1; color: rgb\(var\(--c-white\) \/ var\(--tw-text-opacity, 1\)\); \}/);
  assert.match(css, /\.bg-blue-500\\\/10 \{ background-color: rgb\(var\(--c-blue-500\) \/ 0\.1\); \}/);
  assert.match(css, /\.bg-overlay \{ background-color: var\(--c-overlay\); \}/);
  assert.match(css, /\.border-line-strong \{/);

  const rootBlock = /:root ?\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(rootBlock, /--c-white: 255 255 255;/);
  assert.match(rootBlock, /--c-black: 0 0 0;/);
  assert.match(rootBlock, /--c-neutral-500: 148 148 148;/);
  assert.match(rootBlock, /--c-neutral-600: 133 133 133;/);
  assert.match(rootBlock, /--c-blue-400: 96 165 250;/);
  assert.match(rootBlock, /--c-ink-muted: 148 148 148;/);
  const lightBlock = /html\[data-theme="light"\] ?\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(lightBlock, /--c-white: 23 23 23;/);
  assert.match(lightBlock, /--c-black: 245 245 245;/);
  assert.match(lightBlock, /--c-neutral-900: 255 255 255;/);
  assert.match(lightBlock, /--c-blue-400: 29 78 216;/);
  // One island rule, attribute selectors, never copied into utility variants.
  assert.equal(css.match(/:is\(\[class~="theme-dark"\]/g)?.length, 1);
  assert.match(css, /\[class~="bg-blue-600"\]/);
  assert.match(css, /\[class~="!bg-rose-600"\]/);
  assert.doesNotMatch(css, /:is\([^)]*\.hover\\:/);
});

test('light theme covers every colour class the app uses', () => {
  const files = sourceFiles(resolve(root, 'src'));
  const all = files.map(f => readFileSync(f, 'utf8')).join('\n');
  // Unthemed Tailwind palettes would stay dark-only.
  assert.doesNotMatch(all, /\b(?:bg|text|border|ring|from|via|to|fill|stroke|divide|placeholder)-(?:gray|slate|zinc|stone)-\d/);
  // Arbitrary hex colours bypass the variables (DateInput: a focus border, left to the date-field work).
  const offenders = files.filter(f => /-\[#[0-9a-fA-F]{3,8}\]/.test(readFileSync(f, 'utf8')))
    .map(f => f.slice(root.length + 1));
  assert.deepEqual(offenders.filter(f => f !== 'src/shared/ui/DateInput.tsx'), []);
  // index.css reads the variables.
  const css = src('src/index.css');
  assert.match(css, /body \{\s*background-color: rgb\(var\(--c-page\)\);\s*color: rgb\(var\(--c-ink\)\);/);
  assert.match(css, /outline: 2px solid rgb\(var\(--c-focus-ring\)\) !important;/);
  assert.match(css, /html\[data-theme="light"\] \.fixed\.inset-0\[class\*="bg-black\/"\]/);
});
