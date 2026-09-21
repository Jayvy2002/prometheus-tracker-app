export const MARKET_DISCIPLINES = ['strength', 'bodybuilding', 'hypertrophy', 'powerlifting', 'general_fitness'] as const;
export const PROSPECT_SNAPSHOT_KEYS = ['objective', 'level', 'discipline', 'language', 'expectations', 'availability', 'constraints', 'budget', 'summary'] as const;
export const PROSPECT_SNAPSHOT_LIMITS: Record<typeof PROSPECT_SNAPSHOT_KEYS[number], number> = {
  objective: 200, level: 80, discipline: 80, language: 40, expectations: 500,
  availability: 300, constraints: 500, budget: 120, summary: 1500,
};
export const MARKETPLACE_CONSENT_VERSION = 3;
export const MARKETPLACE_MESSAGE_MAX_LENGTH = 2000;
export const MARKET_BETA_CURRENCIES = ['EUR', 'USD', 'CAD'] as const;
export const MARKET_LANGUAGES = ['fr', 'en'] as const;
export const MARKET_FORMATS = ['online', 'in_person', 'hybrid'] as const;
export const QUALIFICATION_TYPES = ['certification', 'degree', 'license', 'continuing_education', 'other'] as const;
export const QUALIFICATION_STATUSES = ['declared', 'pending', 'verified', 'rejected', 'expired'] as const;
export type QualificationType = typeof QUALIFICATION_TYPES[number];
export type QualificationStatus = typeof QUALIFICATION_STATUSES[number];
export interface CoachPublicQualification {
  id: string;
  coach_id: string;
  title: string;
  qualification_type: QualificationType;
  issuer: string;
  declared_at: string;
  verification_status: QualificationStatus;
  verified_at: string | null;
  expires_on: string | null;
}
export interface CoachQualification extends CoachPublicQualification {
  proof_path: string | null;
  reviewer_id: string | null;
  reviewer_ref?: string;
  review_note: string | null;
  updated_at: string;
}
export type ProspectSnapshot = Partial<Record<typeof PROSPECT_SNAPSHOT_KEYS[number], string>>;
export interface CoachPublicProfile {
  coach_id: string; public_name: string; introduction: string; method: string; offer: string;
  disciplines: string[]; languages: string[]; formats: string[]; area: string;
  area_city?: string;
  area_region?: string;
  area_country?: string;
  published: boolean; accepting_clients: boolean; updated_at: string;
  contact_frequency?: string;
  coaching_style?: string;
  autonomy?: string;
  experience_levels?: string[];
  indicative_price_cents?: number | null;
  indicative_price_period?: string;
  indicative_price_currency?: string;
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
  prospect_snapshot?: ProspectSnapshot;
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

export function isProspectConversationStatus(status: CoachingRequest['status']): boolean {
  return status === 'pending' || status === 'coach_accepted';
}

export function normalizeProspectSnapshot(raw: Record<string, unknown> | null | undefined): ProspectSnapshot {
  const out: ProspectSnapshot = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of PROSPECT_SNAPSHOT_KEYS) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim().slice(0, PROSPECT_SNAPSHOT_LIMITS[key]);
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

export const QUALIFICATION_PROOF_FILENAME =
  /^proof-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png|webp)$/i;

export function buildQualificationProofPath(
  owner: string,
  qualificationId: string,
  ext: 'pdf' | 'jpg',
  objectId = crypto.randomUUID(),
): string {
  return `${owner}/${qualificationId}/proof-${objectId}.${ext}`;
}

export function ownedQualificationProofPath(coachId: string, qualificationId: string, path: string): boolean {
  const prefix = `${coachId}/${qualificationId}/`;
  return path.startsWith(prefix) && QUALIFICATION_PROOF_FILENAME.test(path.slice(prefix.length));
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
export function coachingReportKey(storage: Pick<Storage, 'getItem' | 'setItem'>, owner: string, target: string, relatedRequestId: string | null): string {
  const name = `prometheus:marketplace-report:${owner}:${target}:${relatedRequestId ?? 'none'}`;
  let existing = requestKeys.get(name);
  try { existing = storage.getItem(name) ?? existing; } catch { /* Storage can be disabled. */ }
  if (existing && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(existing)) { requestKeys.set(name, existing); return existing; }
  const key = crypto.randomUUID();
  requestKeys.set(name, key);
  try { storage.setItem(name, key); } catch { /* Keep this session's retry key in memory. */ }
  return key;
}
export function clearCoachingReportKey(storage: Pick<Storage, 'removeItem'>, owner: string, target: string, relatedRequestId: string | null) {
  const name = `prometheus:marketplace-report:${owner}:${target}:${relatedRequestId ?? 'none'}`;
  requestKeys.delete(name);
  try { storage.removeItem(name); } catch { /* Cleanup cannot turn a confirmed write into failure. */ }
}

export const REPORT_SUBJECT_TYPES = ['profile', 'behavior'] as const;
export const REPORT_CATEGORIES = ['harassment', 'impersonation', 'inappropriate', 'spam', 'other'] as const;
export const REPORT_STATUSES = ['open', 'in_review', 'resolved', 'dismissed'] as const;
export type ReportSubjectType = typeof REPORT_SUBJECT_TYPES[number];
export type ReportCategory = typeof REPORT_CATEGORIES[number];
export type ReportStatus = typeof REPORT_STATUSES[number];
export interface MarketplaceReport {
  id: string;
  reporter_id: string;
  target_user_id: string;
  subject_type: ReportSubjectType;
  category: ReportCategory;
  context: string;
  related_request_id: string | null;
  client_report_id?: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
}

export function reportIsOpen(status: ReportStatus): boolean {
  return status === 'open' || status === 'in_review';
}

export function comparisonIds(params: URLSearchParams): string[] {
  return [...new Set((params.get('compare') ?? '').split(',').filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))].slice(0, 3);
}
