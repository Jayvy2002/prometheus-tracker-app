import type { ResolvedTheme } from './theme';
import { useResolvedTheme } from './useResolvedTheme';

// Recharts / SVG take colours as attributes, not classes: they read the theme here.
// Dark values are the historic ones, unchanged. Light values come from the light
// palette (palette.ts) and are checked by themePalette.test.ts.
export type ChartColors = {
  /** Axis tick labels (text: ≥ 4.5:1 on the card). */
  tick: string;
  /** Tooltip on a page/`surface` card, on a raised card, its border and label. */
  tooltipBg: string;
  tooltipBgRaised: string;
  tooltipBorder: string;
  tooltipLabel: string;
  /** Series (graphics: ≥ 3:1 on the card). */
  primary: string;
  primaryBar: string;
  primaryLine: string;
  primaryArea: string;
  success: string;
  successSoft: string;
  successSoftArea: string;
  goal: string;
  /** Goal line label (text). */
  goalLabel: string;
  neutralDot: string;
  /** Unfilled part of rings and timers. */
  ringTrack: string;
  timerTrack: string;
};

export const CHART_COLORS: Record<ResolvedTheme, ChartColors> = {
  dark: {
    tick: '#949494',
    tooltipBg: '#0a0a0a',
    tooltipBgRaised: '#171717',
    tooltipBorder: '#262626',
    tooltipLabel: '#94a3b8',
    primary: '#2563eb',
    primaryBar: '#3b82f6',
    primaryLine: '#60a5fa',
    primaryArea: '#2563eb33',
    success: '#10b981',
    successSoft: '#34d399',
    successSoftArea: '#34d39922',
    goal: '#f59e0b',
    goalLabel: '#f59e0b',
    neutralDot: '#64748b',
    ringTrack: '#262626',
    timerTrack: '#0a0a0a',
  },
  light: {
    tick: '#5c5c5c',
    tooltipBg: '#ffffff',
    tooltipBgRaised: '#ffffff',
    tooltipBorder: '#e5e5e5',
    tooltipLabel: '#525252',
    primary: '#2563eb',
    primaryBar: '#2563eb',
    primaryLine: '#2563eb',
    primaryArea: '#2563eb33',
    success: '#059669',
    successSoft: '#059669',
    successSoftArea: '#05966922',
    goal: '#b45309',
    goalLabel: '#92400e',
    neutralDot: '#64748b',
    ringTrack: '#e5e5e5',
    timerTrack: '#e5e5e5',
  },
};

export function useChartColors(): ChartColors {
  return CHART_COLORS[useResolvedTheme()];
}
