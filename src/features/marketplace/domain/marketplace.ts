export const MARKET_DISCIPLINES = ['strength', 'powerlifting', 'general_fitness'] as const;
export const MARKETPLACE_CONSENT_VERSION = 2;
export const MARKET_LANGUAGES = ['fr', 'en'] as const;
export const MARKET_FORMATS = ['online', 'in_person', 'hybrid'] as const;
export const QUALIFICATION_TYPES = ['certification', 'degree', 'license', 'continuing_education', 'other'] as const;
export const QUALIFICATION_STATUSES = ['declared', 'pending', 'verified', 'rejected', 'expired'] as const;
export type QualificationType = typeof QUALIFICATION_TYPES[number];
export type QualificationStatus = typeof QUALIFICATION_STATUSES[number];
export interface CoachQualification {
  id: string;
  coach_id: string;
  title: string;
  qualification_type: QualificationType;
  issuer: string;
  declared_at: string;
  proof_path: string | null;
  verification_status: QualificationStatus;
  verified_at: string | null;
  reviewer_id: string | null;
  expires_on: string | null;
  review_note: string | null;
  updated_at: string;
}
export interface CoachPublicProfile {
  coach_id: string; public_name: string; introduction: string; method: string; offer: string;
  disciplines: string[]; languages: string[]; formats: string[]; area: string;
  published: boolean; accepting_clients: boolean; updated_at: string;
}
export type RelationshipState = 'active' | 'ended' | 'unknown';
export interface CoachingLinkRecord {
  coach_id: string;
  client_id: string;
  status: string;
  updated_at?: string | null;
  created_at?: string | null;
}
export interface CoachingRequest {
  coach_name?: string | null;
  relationship_state?: RelationshipState;
  id: string; coach_id: string; client_id: string; public_name: string; summary: string;
  sharing_version: number; status: 'pending' | 'accepted' | 'coach_accepted' | 'athlete_confirmed' | 'declined' | 'withdrawn';
  created_at: string; updated_at: string;
}
export function marketFilters(params: URLSearchParams) {
  const valid = (key: string, values: readonly string[]) => values.includes(params.get(key) ?? '') ? params.get(key)! : '';
  return { discipline: valid('discipline', MARKET_DISCIPLINES), language: valid('language', MARKET_LANGUAGES), format: valid('format', MARKET_FORMATS) };
}
export function normalizeJoinRequestStatus(status: string): CoachingRequest['status'] {
  if (status === 'pending' || status === 'accepted' || status === 'coach_accepted' || status === 'athlete_confirmed' || status === 'declined' || status === 'withdrawn') {
    return status;
  }
  throw new Error('invalid_request_status');
}

export function requestActivatesFollow(status: CoachingRequest['status']): boolean {
  return status === 'athlete_confirmed' || status === 'accepted';
}

function linkRecency(link: CoachingLinkRecord): number {
  return Date.parse(link.updated_at ?? '') || Date.parse(link.created_at ?? '') || 0;
}

/** Current follow state comes from coach_client_links for this pair only. */
export function resolveRelationshipState(
  coachId: string,
  clientId: string,
  links: readonly CoachingLinkRecord[],
): RelationshipState {
  const pair = links.filter(link => link.coach_id === coachId && link.client_id === clientId);
  if (pair.some(link => link.status === 'active')) return 'active';
  const ended = pair.filter(link => link.status === 'ended').sort((a, b) => linkRecency(b) - linkRecency(a));
  return ended.length ? 'ended' : 'unknown';
}

export type MarketplaceRelationshipCopyKey =
  | 'marketplace.coachingActive'
  | 'marketplace.coachingActiveCoach'
  | 'marketplace.coachingActiveCoachHistorical'
  | 'marketplace.relationshipEnded'
  | 'marketplace.relationshipUnknown'
  | 'marketplace.relationshipUnknownHistorical';

export function requestRelationshipCopyKey(
  request: Pick<CoachingRequest, 'status' | 'relationship_state' | 'coach_id'>,
  viewerId: string,
): MarketplaceRelationshipCopyKey | null {
  if (!requestActivatesFollow(request.status)) return null;
  if (request.relationship_state === 'active') {
    if (request.coach_id === viewerId) {
      return request.status === 'accepted'
        ? 'marketplace.coachingActiveCoachHistorical'
        : 'marketplace.coachingActiveCoach';
    }
    return 'marketplace.coachingActive';
  }
  if (request.relationship_state === 'ended') return 'marketplace.relationshipEnded';
  return request.status === 'accepted'
    ? 'marketplace.relationshipUnknownHistorical'
    : 'marketplace.relationshipUnknown';
}

export function requestActions(request: CoachingRequest, userId: string): Array<'accepted' | 'declined' | 'withdrawn' | 'confirmed'> {
  if (request.client_id === userId && request.status === 'pending') return ['withdrawn'];
  if (request.client_id === userId && request.status === 'coach_accepted') return ['confirmed', 'withdrawn'];
  if (request.coach_id === userId && request.status === 'pending') return ['accepted', 'declined'];
  return [];
}
export function civilDate(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

export function qualificationEffectiveStatus(
  row: Pick<CoachQualification, 'verification_status' | 'expires_on'>,
  today = civilDate(new Date()),
): QualificationStatus {
  if (row.verification_status === 'verified' && row.expires_on && row.expires_on < today) return 'expired';
  return row.verification_status;
}

export function publicQualifications(rows: readonly CoachQualification[], today = civilDate(new Date())): CoachQualification[] {
  return rows.filter(row => qualificationEffectiveStatus(row, today) !== 'rejected');
}

export function coachHasVerifiedBadge(rows: readonly CoachQualification[], today = civilDate(new Date())): boolean {
  return rows.some(row => qualificationEffectiveStatus(row, today) === 'verified');
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
