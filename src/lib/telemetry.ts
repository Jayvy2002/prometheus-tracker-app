import type {
  CoachingRole,
  CoachPreview,
  ProductEventInsert,
  ProductEventName,
  ProductEventProps,
  ProductEventRole,
} from './types';
import { isCoachedAthlete } from './coachRole';

/**
 * Pure telemetry helpers (docs/VISION.md, chantier 5). No Supabase here so this stays
 * unit-testable; the side-effecting `track()` lives in telemetryClient.ts.
 */

export function telemetryRole(coachingRole: CoachingRole, myCoach: CoachPreview | null): ProductEventRole {
  if (coachingRole === 'coach') return 'coach';
  if (isCoachedAthlete(coachingRole, myCoach)) return 'client';
  return 'solo';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{24,}$/i;

/**
 * `/clients/3f2a…/draft/9b1c…?tab=training` → `/clients/:id/draft/:id`.
 * Ids and invite tokens never reach the telemetry table; the query string is dropped.
 */
export function normalizeScreenPath(pathname: string): string {
  const path = pathname.split('?')[0].split('#')[0];
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  const normalized = segments.map(segment => (
    UUID_RE.test(segment) || TOKEN_RE.test(segment) ? ':id' : segment
  ));
  return `/${normalized.join('/')}`;
}

/** One screen_view per distinct screen in a row — re-renders of the same route do not count. */
export function shouldTrackScreen(previous: string | null, next: string): boolean {
  return previous !== next;
}

const MAX_PROP_STRING = 80;

/** Keeps props structural and small so a bug can never push a paragraph of client text into telemetry. */
export function sanitizeEventProps(props: Record<string, unknown> | undefined): ProductEventProps {
  const out: ProductEventProps = {};
  if (!props) return out;
  for (const [key, value] of Object.entries(props)) {
    if (value === null) {
      out[key] = null;
    } else if (typeof value === 'boolean') {
      out[key] = value;
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) out[key] = value;
    } else if (typeof value === 'string') {
      out[key] = value.slice(0, MAX_PROP_STRING);
    }
  }
  return out;
}

export function buildProductEvent(input: {
  userId: string | null | undefined;
  coachingRole: CoachingRole;
  myCoach: CoachPreview | null;
  event: ProductEventName;
  props?: Record<string, unknown>;
}): ProductEventInsert | null {
  if (!input.userId) return null;
  return {
    user_id: input.userId,
    role: telemetryRole(input.coachingRole, input.myCoach),
    event: input.event,
    props: sanitizeEventProps(input.props),
  };
}
