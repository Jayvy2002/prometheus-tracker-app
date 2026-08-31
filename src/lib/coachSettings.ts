import type {
  CoachClientTab,
  CoachNudgeTemplateKey,
  CoachNudgeTemplateSet,
  CoachSettings,
} from './types';
import { DEFAULT_COACH_VISIBLE_TABS } from './types';
import { ALL_ON_TRACKING, parseCoachTrackingDefaults, serializeTrackingVars } from './clientTracking';

export const EMPTY_COACH_SETTINGS: Omit<CoachSettings, 'coach_id'> = {
  visible_tabs: [...DEFAULT_COACH_VISIBLE_TABS],
  queue_mode_default: true,
  nudge_templates: {},
  default_tracking: serializeTrackingVars(ALL_ON_TRACKING),
  updated_at: '',
};

const TAB_SET = new Set<CoachClientTab>([...DEFAULT_COACH_VISIBLE_TABS, 'profile']);

export function parseVisibleTabs(raw: unknown): CoachClientTab[] {
  if (!Array.isArray(raw)) return [...DEFAULT_COACH_VISIBLE_TABS];
  const tabs = raw.filter((x): x is CoachClientTab => typeof x === 'string' && TAB_SET.has(x as CoachClientTab));
  if (tabs.length === 0) return [...DEFAULT_COACH_VISIBLE_TABS];
  const withoutOverview = tabs.filter(tab => tab !== 'overview' && tab !== 'profile');
  return ['overview', ...withoutOverview];
}

export function parseNudgeTemplates(raw: unknown): CoachNudgeTemplateSet {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const keys: CoachNudgeTemplateKey[] = ['missed_training', 'missed_checkins', 'general_followup'];
  const out: CoachNudgeTemplateSet = {};
  for (const key of keys) {
    const row = obj[key];
    if (!row || typeof row !== 'object') continue;
    const loc = row as Record<string, unknown>;
    const fr = typeof loc.fr === 'string' ? loc.fr : undefined;
    const en = typeof loc.en === 'string' ? loc.en : undefined;
    if (fr || en) out[key] = { fr, en };
  }
  return out;
}

export function mapCoachSettings(raw: Record<string, unknown>, fallbackId: string): CoachSettings {
  return {
    coach_id: String(raw.coach_id ?? fallbackId),
    visible_tabs: parseVisibleTabs(raw.visible_tabs),
    queue_mode_default: raw.queue_mode_default !== false,
    nudge_templates: parseNudgeTemplates(raw.nudge_templates),
    default_tracking: serializeTrackingVars(parseCoachTrackingDefaults(raw.default_tracking)),
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : '',
  };
}

export function resolveNudgeBody(
  key: CoachNudgeTemplateKey,
  name: string,
  lang: string,
  custom: CoachNudgeTemplateSet | undefined,
  fallback: string,
): string {
  const loc = lang.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const raw = custom?.[key]?.[loc]?.trim();
  const text = raw && raw.length > 0 ? raw : fallback;
  return text.replace(/\{\{\s*name\s*\}\}/g, name);
}
