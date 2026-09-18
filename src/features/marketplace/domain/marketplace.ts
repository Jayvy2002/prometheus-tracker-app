export const MARKET_DISCIPLINES = ['strength', 'powerlifting', 'general_fitness'] as const;
export const MARKETPLACE_CONSENT_VERSION = 2;
export const MARKET_LANGUAGES = ['fr', 'en'] as const;
export const MARKET_FORMATS = ['online', 'in_person', 'hybrid'] as const;
export interface CoachPublicProfile {
  coach_id: string; public_name: string; introduction: string; method: string; offer: string;
  disciplines: string[]; languages: string[]; formats: string[]; area: string;
  published: boolean; accepting_clients: boolean; updated_at: string;
}
export interface CoachingRequest {
  coach_name?: string | null;
  relationship_state?: 'active' | 'ended' | 'unknown';
  id: string; coach_id: string; client_id: string; public_name: string; summary: string;
  sharing_version: number; status: 'pending' | 'coach_accepted' | 'athlete_confirmed' | 'declined' | 'withdrawn';
  created_at: string; updated_at: string;
}
export function marketFilters(params: URLSearchParams) {
  const valid = (key: string, values: readonly string[]) => values.includes(params.get(key) ?? '') ? params.get(key)! : '';
  return { discipline: valid('discipline', MARKET_DISCIPLINES), language: valid('language', MARKET_LANGUAGES), format: valid('format', MARKET_FORMATS) };
}
export function normalizeJoinRequestStatus(status: string): CoachingRequest['status'] {
  if (status === 'accepted') return 'athlete_confirmed';
  if (status === 'pending' || status === 'coach_accepted' || status === 'athlete_confirmed' || status === 'declined' || status === 'withdrawn') {
    return status;
  }
  throw new Error('invalid_request_status');
}

export function requestActivatesFollow(status: CoachingRequest['status']): boolean {
  return status === 'athlete_confirmed';
}

export function requestActions(request: CoachingRequest, userId: string): Array<'accepted' | 'declined' | 'withdrawn' | 'confirmed'> {
  if (request.client_id === userId && request.status === 'pending') return ['withdrawn'];
  if (request.client_id === userId && request.status === 'coach_accepted') return ['confirmed', 'withdrawn'];
  if (request.coach_id === userId && request.status === 'pending') return ['accepted', 'declined'];
  return [];
}
export function matchingReasons(profile: CoachPublicProfile, filters: ReturnType<typeof marketFilters>): string[] {
  return [filters.discipline && profile.disciplines.includes(filters.discipline) ? filters.discipline : '',
    filters.language && profile.languages.includes(filters.language) ? filters.language : '',
    filters.format && profile.formats.includes(filters.format) ? filters.format : ''].filter(Boolean);
}

/** Only an opaque identifier is stored, never the prospect's message. */
const requestKeys = new Map<string, string>();
export function coachingRequestKey(storage: Pick<Storage, 'getItem' | 'setItem'>, owner: string, coach: string): string {
  const name = `prometheus:coaching-request:${owner}:${coach}`;
  let existing = requestKeys.get(name);
  try { existing = storage.getItem(name) ?? existing; } catch { /* Storage can be disabled. */ }
  if (existing && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(existing)) { requestKeys.set(name, existing); return existing; }
  const key = crypto.randomUUID();
  requestKeys.set(name, key);
  try { storage.setItem(name, key); } catch { /* Keep this session's retry key in memory. */ }
  return key;
}
export function clearCoachingRequestKey(storage: Pick<Storage, 'removeItem'>, owner: string, coach: string) {
  const name = `prometheus:coaching-request:${owner}:${coach}`;
  requestKeys.delete(name);
  try { storage.removeItem(name); } catch { /* Cleanup cannot turn a confirmed write into failure. */ }
}

export function comparisonIds(params: URLSearchParams): string[] {
  return [...new Set((params.get('compare') ?? '').split(',').filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))].slice(0, 3);
}
