import { MARKET_DISCIPLINES, MARKET_FORMATS, MARKET_LANGUAGES, type CoachPublicProfile } from './marketplace';

export const MATCH_FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'flexible'] as const;
export const MATCH_STYLES = ['directive', 'collaborative', 'autonomous'] as const;
export const MATCH_AUTONOMY = ['low', 'medium', 'high'] as const;
export const MATCH_EXPERIENCE = ['beginner', 'intermediate', 'advanced'] as const;
export const MATCH_PRICE_PERIODS = ['on_request', 'session', 'month', 'program'] as const;

export interface CoachMatchProfile extends CoachPublicProfile {
  contact_frequency: string;
  coaching_style: string;
  autonomy: string;
  experience_levels: string[];
  indicative_price_cents: number | null;
  indicative_price_period: string;
}

export interface MarketplaceSearchIntent {
  discipline: string;
  language: string;
  format: string;
  area: string;
  budget_max_cents: number | null;
  contact_frequency: string;
  coaching_style: string;
  autonomy: string;
  experience_level: string;
  secondary_notes: string;
}

export interface CoachMatchExplanation {
  coach_id: string;
  eligible: boolean;
  matched_requirements: string[];
  matched_preferences: string[];
  missing_information: string[];
  reasons: string[];
}

const emptyIntent: MarketplaceSearchIntent = {
  discipline: '', language: '', format: '', area: '', budget_max_cents: null,
  contact_frequency: '', coaching_style: '', autonomy: '', experience_level: '', secondary_notes: '',
};

export function blankMatchProfile(base: CoachPublicProfile): CoachMatchProfile {
  return {
    ...base,
    contact_frequency: 'contact_frequency' in base ? String((base as CoachMatchProfile).contact_frequency ?? '') : '',
    coaching_style: 'coaching_style' in base ? String((base as CoachMatchProfile).coaching_style ?? '') : '',
    autonomy: 'autonomy' in base ? String((base as CoachMatchProfile).autonomy ?? '') : '',
    experience_levels: Array.isArray((base as CoachMatchProfile).experience_levels) ? (base as CoachMatchProfile).experience_levels : [],
    indicative_price_cents: typeof (base as CoachMatchProfile).indicative_price_cents === 'number' ? (base as CoachMatchProfile).indicative_price_cents : null,
    indicative_price_period: (base as CoachMatchProfile).indicative_price_period || 'on_request',
  };
}

export function normalizeSearchIntent(raw: Partial<MarketplaceSearchIntent>): MarketplaceSearchIntent {
  const pick = (value: string | undefined, allowed: readonly string[]) => allowed.includes(value ?? '') ? value! : '';
  const cents = raw.budget_max_cents;
  return {
    discipline: pick(raw.discipline, MARKET_DISCIPLINES),
    language: pick(raw.language, MARKET_LANGUAGES),
    format: pick(raw.format, MARKET_FORMATS),
    area: (raw.area ?? '').trim().slice(0, 150),
    budget_max_cents: typeof cents === 'number' && Number.isFinite(cents) && cents > 0 ? Math.floor(cents) : null,
    contact_frequency: pick(raw.contact_frequency, MATCH_FREQUENCIES),
    coaching_style: pick(raw.coaching_style, MATCH_STYLES),
    autonomy: pick(raw.autonomy, MATCH_AUTONOMY),
    experience_level: pick(raw.experience_level, MATCH_EXPERIENCE),
    secondary_notes: (raw.secondary_notes ?? '').trim().slice(0, 500),
  };
}

function areaOverlap(coachArea: string, wanted: string): boolean {
  const a = coachArea.trim().toLowerCase();
  const b = wanted.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function formatOk(coach: string[], wanted: string): boolean {
  if (wanted === 'online') return coach.includes('online') || coach.includes('hybrid');
  if (wanted === 'in_person') return coach.includes('in_person') || coach.includes('hybrid');
  if (wanted === 'hybrid') return coach.includes('hybrid') || (coach.includes('online') && coach.includes('in_person'));
  return false;
}

export function evaluateCoachMatch(profile: CoachMatchProfile, intent: MarketplaceSearchIntent): CoachMatchExplanation {
  const matched_requirements: string[] = [];
  const matched_preferences: string[] = [];
  const missing_information: string[] = [];
  const reasons: string[] = [];
  let eligible = true;

  if (intent.discipline) {
    if (profile.disciplines.includes(intent.discipline)) {
      matched_requirements.push('discipline');
      reasons.push('discipline');
    } else eligible = false;
  }
  if (intent.language) {
    if (profile.languages.includes(intent.language)) {
      matched_requirements.push('language');
      reasons.push('language');
    } else eligible = false;
  }
  if (intent.format) {
    if (!formatOk(profile.formats, intent.format)) eligible = false;
    else {
      matched_requirements.push('format');
      reasons.push('format');
      if (intent.format !== 'online') {
        if (!intent.area) missing_information.push('area');
        else if (!areaOverlap(profile.area, intent.area)) eligible = false;
        else {
          matched_requirements.push('area');
          reasons.push('area');
        }
      }
    }
  }
  if (intent.budget_max_cents != null) {
    if (profile.indicative_price_cents == null || profile.indicative_price_period === 'on_request') {
      missing_information.push('price');
    } else if (profile.indicative_price_cents > intent.budget_max_cents) {
      eligible = false;
    } else {
      matched_requirements.push('budget');
      reasons.push('budget');
    }
  }

  const prefs: Array<keyof Pick<MarketplaceSearchIntent, 'contact_frequency' | 'coaching_style' | 'autonomy'>> = [
    'contact_frequency', 'coaching_style', 'autonomy',
  ];
  for (const key of prefs) {
    if (!intent[key]) continue;
    const value = profile[key];
    if (!value) missing_information.push(key);
    else if (value === intent[key]) {
      matched_preferences.push(key);
      reasons.push(key);
    }
  }
  if (intent.experience_level) {
    if (!profile.experience_levels.length) missing_information.push('experience_level');
    else if (profile.experience_levels.includes(intent.experience_level)) {
      matched_preferences.push('experience_level');
      reasons.push('experience_level');
    }
  }

  return {
    coach_id: profile.coach_id,
    eligible,
    matched_requirements,
    matched_preferences,
    missing_information,
    reasons,
  };
}

export function shortlistMatches(
  profiles: readonly CoachMatchProfile[],
  intent: MarketplaceSearchIntent,
  limit = 5,
): CoachMatchExplanation[] {
  return profiles
    .map(profile => evaluateCoachMatch(profile, intent))
    .filter(row => row.eligible)
    .sort((a, b) => b.matched_preferences.length - a.matched_preferences.length || a.coach_id.localeCompare(b.coach_id))
    .slice(0, limit);
}

export function intentIsReady(intent: MarketplaceSearchIntent): boolean {
  return Boolean(intent.discipline && intent.language && intent.format);
}

export function listedRateCopy(
  profile: Pick<CoachMatchProfile, 'indicative_price_cents' | 'indicative_price_period'>,
): { amount: string; period: string } | null {
  if (profile.indicative_price_cents == null || !profile.indicative_price_period || profile.indicative_price_period === 'on_request') {
    return null;
  }
  return { amount: String(Math.round(profile.indicative_price_cents / 100)), period: profile.indicative_price_period };
}

export { emptyIntent };
