import { MARKET_BETA_CURRENCIES, MARKET_DISCIPLINES, MARKET_FORMATS, MARKET_LANGUAGES, type CoachPublicProfile } from './marketplace';

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
  indicative_price_currency: string;
  area_city: string;
  area_region: string;
  area_country: string;
}

export interface MarketplaceSearchIntent {
  discipline: string;
  language: string;
  format: string;
  area: string;
  area_city: string;
  area_region: string;
  area_country: string;
  budget_max_cents: number | null;
  budget_period: string;
  budget_currency: string;
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
  discipline: '', language: '', format: '', area: '', area_city: '', area_region: '', area_country: '',
  budget_max_cents: null, budget_period: '', budget_currency: '',
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
    indicative_price_currency: normalizeIsoCurrency((base as CoachMatchProfile).indicative_price_currency),
    area_city: typeof (base as CoachMatchProfile).area_city === 'string' ? (base as CoachMatchProfile).area_city : '',
    area_region: typeof (base as CoachMatchProfile).area_region === 'string' ? (base as CoachMatchProfile).area_region : '',
    area_country: typeof (base as CoachMatchProfile).area_country === 'string' ? (base as CoachMatchProfile).area_country : '',
  };
}

export function normalizeIsoCurrency(value: string | undefined | null): string {
  const next = (value ?? '').trim().toUpperCase();
  return (MARKET_BETA_CURRENCIES as readonly string[]).includes(next) ? next : '';
}

export function listedRateDecision(
  budgetCents: number | null,
  budgetPeriod: string,
  budgetCurrency: string,
  priceCents: number | null,
  pricePeriod: string,
  priceCurrency: string,
): 'skip' | 'missing' | 'over' | 'match' {
  if (budgetCents == null) return 'skip';
  if (!budgetPeriod || !normalizeIsoCurrency(budgetCurrency)
    || priceCents == null || !pricePeriod || pricePeriod === 'on_request' || !normalizeIsoCurrency(priceCurrency)
    || pricePeriod !== budgetPeriod || normalizeIsoCurrency(priceCurrency) !== normalizeIsoCurrency(budgetCurrency)) {
    return 'missing';
  }
  return priceCents > budgetCents ? 'over' : 'match';
}

export function normalizeSearchIntent(raw: Partial<MarketplaceSearchIntent>): MarketplaceSearchIntent {
  const pick = (value: string | undefined, allowed: readonly string[]) => allowed.includes(value ?? '') ? value! : '';
  const cents = raw.budget_max_cents;
  const budget = typeof cents === 'number' && Number.isFinite(cents) && cents > 0 ? Math.floor(cents) : null;
  return {
    discipline: pick(raw.discipline, MARKET_DISCIPLINES),
    language: pick(raw.language, MARKET_LANGUAGES),
    format: pick(raw.format, MARKET_FORMATS),
    area: (raw.area ?? '').trim().slice(0, 150),
    area_city: (raw.area_city ?? '').trim().slice(0, 80),
    area_region: (raw.area_region ?? '').trim().slice(0, 80),
    area_country: (raw.area_country ?? '').trim().slice(0, 80),
    budget_max_cents: budget,
    budget_period: budget ? pick(raw.budget_period, MATCH_PRICE_PERIODS.filter(value => value !== 'on_request')) : '',
    budget_currency: budget ? normalizeIsoCurrency(raw.budget_currency) : '',
    contact_frequency: pick(raw.contact_frequency, MATCH_FREQUENCIES),
    coaching_style: pick(raw.coaching_style, MATCH_STYLES),
    autonomy: pick(raw.autonomy, MATCH_AUTONOMY),
    experience_level: pick(raw.experience_level, MATCH_EXPERIENCE),
    secondary_notes: (raw.secondary_notes ?? '').trim().slice(0, 500),
  };
}

function locationMatches(
  coach: Pick<CoachMatchProfile, 'area_city' | 'area_region' | 'area_country'>,
  wanted: Pick<MarketplaceSearchIntent, 'area_city' | 'area_region' | 'area_country'>,
): boolean {
  const city = wanted.area_city.trim().toLowerCase();
  const country = wanted.area_country.trim().toLowerCase();
  const coachCity = coach.area_city.trim().toLowerCase();
  const coachCountry = coach.area_country.trim().toLowerCase();
  if (!city || !country || !coachCity || !coachCountry) return false;
  if (city !== coachCity || country !== coachCountry) return false;
  const region = wanted.area_region.trim().toLowerCase();
  const coachRegion = coach.area_region.trim().toLowerCase();
  if (region && coachRegion && region !== coachRegion) return false;
  return true;
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
        if (!locationMatches(profile, intent)) eligible = false;
        else {
          matched_requirements.push('area');
          reasons.push('area');
        }
      }
    }
  }
  if (intent.budget_max_cents != null) {
    const decision = listedRateDecision(
      intent.budget_max_cents,
      intent.budget_period,
      intent.budget_currency,
      profile.indicative_price_cents,
      profile.indicative_price_period,
      profile.indicative_price_currency,
    );
    if (decision === 'missing') missing_information.push('price');
    else if (decision === 'over') eligible = false;
    else if (decision === 'match') {
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
  if (!intent.discipline || !intent.language || !intent.format) return false;
  if (intent.format !== 'online' && (!intent.area_city || !intent.area_country)) return false;
  return true;
}

export function listedRateCopy(
  profile: Pick<CoachMatchProfile, 'indicative_price_cents' | 'indicative_price_period' | 'indicative_price_currency'>,
): { amount: string; period: string; currency: string } | null {
  if (profile.indicative_price_cents == null || !profile.indicative_price_period || profile.indicative_price_period === 'on_request') {
    return null;
  }
  return {
    amount: (profile.indicative_price_cents / 100).toFixed(2),
    period: profile.indicative_price_period,
    currency: normalizeIsoCurrency(profile.indicative_price_currency),
  };
}

export { emptyIntent };
