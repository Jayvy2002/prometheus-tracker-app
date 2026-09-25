// Theme palette — single source for the Tailwind colours (tailwind.config.js)
// and the CSS variables behind them. Every colour class the app uses resolves
// to `rgb(var(--c-…) / <alpha-value>)`, so `/20`, `/50`… opacities keep working.
//
// Dark = today's look, value for value (Tailwind defaults + audit 3 F greys).
// Light = the same classes re-pointed under html[data-theme="light"]:
//   - greys invert: text greys become dark inks, surface greys become light;
//   - white/black swap roles: text-white → dark ink, bg-black → light page;
//   - light accents (…-300/400) become darker shades that keep ≥ 4.5:1 on white,
//     on the page grey and on their own 20 % tint.
// Solid saturated fills (bg-blue-600, bg-primary…) keep the dark variables
// inside them ("dark islands"): their white text stays white.
import twColors from 'tailwindcss/colors';

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Shade = (typeof SHADES)[number];
export type Scale = Record<Shade, string>;
export type ThemeName = 'dark' | 'light';

export const ACCENT_HUES = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan',
  'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
] as const;
export type AccentHue = (typeof ACCENT_HUES)[number];

function tailwindScale(hue: AccentHue | 'neutral'): Scale {
  const source = twColors[hue] as Record<string, string>;
  return Object.fromEntries(SHADES.map(shade => [shade, source[shade]])) as Scale;
}

/** Dark greys: Tailwind neutral, 500/600 lightened for AA small text on black (audit 3 F). */
export const DARK_NEUTRAL: Scale = {
  ...tailwindScale('neutral'),
  500: '#949494',
  600: '#858585',
};

/**
 * Light greys. 100–600 are text in this app, 700–950 surfaces and borders:
 * the scale is inverted so that each class keeps its role.
 */
export const LIGHT_NEUTRAL: Scale = {
  50: '#0a0a0a',
  100: '#171717',
  200: '#262626',
  300: '#404040',
  400: '#525252',
  500: '#5c5c5c',
  600: '#666666',
  700: '#d4d4d4',
  800: '#e5e5e5',
  900: '#ffffff',
  950: '#fafafa',
};

/**
 * Light theme: the Tailwind shade used for the accent "text" shades (300–600).
 * Lightest shade reaching 4.5:1 on white, #f5f5f5, #fafafa, #e5e5e5 and on its
 * own 20 % tint (badges `bg-x-500/20 text-x-300`). Checked by themePalette.test.ts.
 */
export const LIGHT_TEXT_SHADE: Record<AccentHue, 700 | 800> = {
  red: 800,
  orange: 800,
  amber: 800,
  yellow: 800,
  lime: 800,
  green: 800,
  emerald: 800,
  teal: 800,
  cyan: 800,
  sky: 800,
  blue: 700,
  indigo: 700,
  violet: 700,
  purple: 700,
  fuchsia: 800,
  pink: 800,
  rose: 800,
};

/** Which Tailwind shade of the same hue a dark-theme shade shows in light. */
export function lightAccentShade(hue: AccentHue, shade: Shade): Shade {
  const text = LIGHT_TEXT_SHADE[hue];
  switch (shade) {
    case 50:
    case 100:
    case 200:
      return 900;
    case 300:
      return 800;
    case 400:
    case 500:
    case 600:
      return text;
    case 700:
      return text === 700 ? 800 : 900;
    case 800:
      return 300;
    case 900:
      return 200;
    case 950:
      return 100;
  }
}

export function darkAccent(hue: AccentHue): Scale {
  return tailwindScale(hue);
}

export function lightAccent(hue: AccentHue): Scale {
  const source = tailwindScale(hue);
  return Object.fromEntries(SHADES.map(shade => [shade, source[lightAccentShade(hue, shade)]])) as Scale;
}

/** Semantic tokens (design system) + a few CSS-only colours of index.css. */
export const TOKEN_NAMES = [
  'white', 'black',
  'page', 'surface', 'surface-raised', 'surface-hover', 'surface-active', 'elevated',
  'ink', 'ink-secondary', 'ink-muted', 'ink-disabled',
  'line', 'line-subtle', 'line-focus', 'line-strong', 'line-stronger',
  'primary', 'primary-hover', 'success', 'success-hover', 'warning', 'warning-hover',
  'danger', 'danger-hover', 'danger-muted',
  'focus-ring', 'track', 'glass-light',
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];

export const DARK_TOKENS: Record<TokenName, string> = {
  white: '#ffffff',
  black: '#000000',
  page: '#000000',
  surface: '#0a0a0a',
  'surface-raised': '#171717',
  'surface-hover': '#262626',
  'surface-active': '#404040',
  elevated: '#171717',
  ink: '#f8fafc',
  'ink-secondary': '#a3a3a3',
  'ink-muted': '#949494',
  'ink-disabled': '#525252',
  line: '#262626',
  'line-subtle': '#1f1f1f',
  'line-focus': '#60a5fa',
  // The borders that kept the pre-audit greys (old neutral-600 / neutral-500).
  'line-strong': '#525252',
  'line-stronger': '#737373',
  primary: '#2563eb',
  'primary-hover': '#3b82f6',
  success: '#16a34a',
  'success-hover': '#22c55e',
  warning: '#d97706',
  'warning-hover': '#f59e0b',
  danger: '#e11d48',
  'danger-hover': '#f43f5e',
  'danger-muted': '#fb7185',
  'focus-ring': '#93c5fd',
  track: '#1e293b',
  'glass-light': '#1e1e1e',
};

export const LIGHT_TOKENS: Record<TokenName, string> = {
  white: '#171717',
  black: '#f5f5f5',
  page: '#f5f5f5',
  surface: '#fafafa',
  'surface-raised': '#ffffff',
  'surface-hover': '#e5e5e5',
  'surface-active': '#d4d4d4',
  elevated: '#ffffff',
  ink: '#171717',
  'ink-secondary': '#525252',
  'ink-muted': '#5c5c5c',
  'ink-disabled': '#8c8c8c',
  line: '#e5e5e5',
  'line-subtle': '#ededed',
  'line-focus': '#2563eb',
  'line-strong': '#a3a3a3',
  'line-stronger': '#8c8c8c',
  primary: '#2563eb',
  'primary-hover': '#1d4ed8',
  success: '#15803d',
  'success-hover': '#166534',
  warning: '#b45309',
  'warning-hover': '#92400e',
  danger: '#be123c',
  'danger-hover': '#9f1239',
  'danger-muted': '#be123c',
  'focus-ring': '#1d4ed8',
  track: '#d4d4d4',
  'glass-light': '#ffffff',
};

/** Modal veil: not an rgb triple, so it has its own variable. */
export const OVERLAY: Record<ThemeName, string> = {
  dark: 'rgba(0,0,0,0.72)',
  light: 'rgba(23,23,23,0.4)',
};

/** Browser chrome colour (meta theme-color) = page background. */
export const THEME_COLOR: Record<ThemeName, string> = {
  dark: DARK_TOKENS.page,
  light: LIGHT_TOKENS.page,
};

/** Classes whose element stays a dark island in light (white text on them stays white). */
export const DARK_ISLAND_CLASSES: string[] = [
  'theme-dark',
  ...['primary', 'success', 'warning', 'danger'].map(name => `bg-${name}`),
  ...ACCENT_HUES.flatMap(hue => [500, 600, 700].flatMap(shade => [
    `bg-${hue}-${shade}`,
    `!bg-${hue}-${shade}`,
  ])),
];

// Attribute selectors, not `.class`: Tailwind would treat a `.bg-blue-600` base
// rule as part of that utility and copy it into every variant (hover:, !…).
const islandSelector = DARK_ISLAND_CLASSES.map(name => `[class~="${name}"]`).join(', ');

function rgbTriple(hex: string): string {
  const raw = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(raw.slice(i, i + 2), 16)).join(' ');
}

/** All colours of a theme, as hex, keyed by variable suffix (`neutral-500`, `ink`…). */
export function themeHexColors(theme: ThemeName): Record<string, string> {
  const tokens = theme === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
  const neutral = theme === 'dark' ? DARK_NEUTRAL : LIGHT_NEUTRAL;
  const out: Record<string, string> = { ...tokens };
  for (const shade of SHADES) out[`neutral-${shade}`] = neutral[shade];
  for (const hue of ACCENT_HUES) {
    const scale = theme === 'dark' ? darkAccent(hue) : lightAccent(hue);
    for (const shade of SHADES) out[`${hue}-${shade}`] = scale[shade];
  }
  return out;
}

/** CSS custom properties of a theme: `--c-<name>: r g b`. */
export function themeVariables(theme: ThemeName): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, hex] of Object.entries(themeHexColors(theme))) vars[`--c-${name}`] = rgbTriple(hex);
  vars['--c-overlay'] = OVERLAY[theme];
  return vars;
}

/** Base CSS injected by the Tailwind plugin (see tailwind.config.js). */
export function themeBaseStyles(): Record<string, Record<string, string>> {
  const dark = themeVariables('dark');
  return {
    ':root': dark,
    'html[data-theme="light"]': themeVariables('light'),
    [`html[data-theme="light"] :is(${islandSelector})`]: dark,
    // Switch knobs stay white on the light off-track.
    'html[data-theme="light"] [role="switch"]': { '--c-white': rgbTriple(DARK_TOKENS.white) },
  };
}

const cssColor = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

function scaleClasses(prefix: string): Record<string, string> {
  return Object.fromEntries(SHADES.map(shade => [String(shade), cssColor(`${prefix}-${shade}`)]));
}

/** `theme.extend.colors` for tailwind.config.js. */
export function tailwindColors() {
  return {
    white: cssColor('white'),
    black: cssColor('black'),
    neutral: scaleClasses('neutral'),
    ...Object.fromEntries(ACCENT_HUES.map(hue => [hue, scaleClasses(hue)])),
    page: cssColor('page'),
    surface: {
      DEFAULT: cssColor('surface'),
      raised: cssColor('surface-raised'),
      hover: cssColor('surface-hover'),
      active: cssColor('surface-active'),
    },
    elevated: cssColor('elevated'),
    overlay: 'var(--c-overlay)',
    ink: {
      DEFAULT: cssColor('ink'),
      secondary: cssColor('ink-secondary'),
      muted: cssColor('ink-muted'),
      disabled: cssColor('ink-disabled'),
    },
    line: {
      DEFAULT: cssColor('line'),
      subtle: cssColor('line-subtle'),
      focus: cssColor('line-focus'),
      strong: cssColor('line-strong'),
      stronger: cssColor('line-stronger'),
    },
    primary: { DEFAULT: cssColor('primary'), hover: cssColor('primary-hover') },
    success: { DEFAULT: cssColor('success'), hover: cssColor('success-hover') },
    warning: { DEFAULT: cssColor('warning'), hover: cssColor('warning-hover') },
    danger: {
      DEFAULT: cssColor('danger'),
      hover: cssColor('danger-hover'),
      muted: cssColor('danger-muted'),
    },
  };
}
