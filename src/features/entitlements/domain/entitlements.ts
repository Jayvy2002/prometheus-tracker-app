/**
 * P6.1 — commercial entitlements, per product, apart from identity (coach
 * capability), relations (coach_client_links) and the displayed workspace.
 * Mirrors `public.entitlement_access` / `effective_entitlements`. Reading an
 * entitlement never grants or removes a feature: P6.2 decides the beta policy.
 * No price and no client quota are decided (see commercialTerms.ts).
 */

export type EntitlementProduct = 'solo' | 'coach';
export type EntitlementStatus = 'beta' | 'trial' | 'active' | 'past_due' | 'canceled';
export type EntitlementSource = 'beta' | 'trial' | 'billing' | 'operator';
export type EntitlementAccess = 'beta' | 'paid' | 'trial' | 'grace' | 'expired' | 'none';

export interface ProductEntitlement {
  access: EntitlementAccess;
  source: EntitlementSource | null;
  endsAt: string | null;
  billingStatus: string | null;
}

export interface CoachEntitlement extends ProductEntitlement {
  /** Null: no limit decided. Reported only, never enforced here. */
  clientLimit: number | null;
  activeClients: number;
  overLimit: boolean;
}

export interface MyEntitlements {
  solo: ProductEntitlement;
  coach: CoachEntitlement;
}

const ACCESS: readonly EntitlementAccess[] = ['beta', 'paid', 'trial', 'grace', 'expired', 'none'];
const SOURCES: readonly EntitlementSource[] = ['beta', 'trial', 'billing', 'operator'];

function after(iso: string | null | undefined, at: Date): boolean {
  if (!iso) return false;
  const time = Date.parse(iso);
  return Number.isFinite(time) && time > at.getTime();
}

/** Same rules as `public.entitlement_access`. Only the Coach has a grace. */
export function entitlementAccess(
  status: EntitlementStatus | null | undefined,
  periodEndsAt: string | null | undefined,
  graceEndsAt: string | null | undefined,
  at: Date,
): EntitlementAccess {
  switch (status) {
    case 'beta':
      return !periodEndsAt || after(periodEndsAt, at) ? 'beta' : 'expired';
    case 'active':
      return !periodEndsAt || after(periodEndsAt, at) ? 'paid' : 'expired';
    case 'canceled':
      return after(periodEndsAt, at) ? 'paid' : 'expired';
    case 'trial':
      return after(periodEndsAt, at) ? 'trial' : 'expired';
    case 'past_due':
      return after(graceEndsAt, at) ? 'grace' : 'expired';
    default:
      return 'none';
  }
}

function asAccess(value: unknown): EntitlementAccess {
  return ACCESS.includes(value as EntitlementAccess) ? (value as EntitlementAccess) : 'none';
}

function asSource(value: unknown): EntitlementSource | null {
  return SOURCES.includes(value as EntitlementSource) ? (value as EntitlementSource) : null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function product(raw: unknown): ProductEntitlement {
  const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    access: asAccess(row.access),
    source: asSource(row.source),
    endsAt: asText(row.ends_at),
    billingStatus: asText(row.billing_status),
  };
}

/** Parses `get_my_entitlements()`. Anything unreadable becomes « none », never « paid ». */
export function parseMyEntitlements(raw: unknown): MyEntitlements {
  const root = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const coachRaw = root.coach && typeof root.coach === 'object' ? root.coach as Record<string, unknown> : {};
  const limit = coachRaw.client_limit == null ? null : asCount(coachRaw.client_limit) || null;
  return {
    solo: product(root.solo),
    coach: {
      ...product(root.coach),
      clientLimit: limit,
      activeClients: asCount(coachRaw.active_clients),
      overLimit: coachRaw.over_limit === true,
    },
  };
}

/** i18n key for one product line on the access card. */
export function accessLabelKey(access: EntitlementAccess): string {
  return `entitlements.access.${access}`;
}

/** Whether the date shown next to the access is its end (trial, grace, paid until). */
export function showsEndDate(entitlement: ProductEntitlement): boolean {
  return entitlement.endsAt != null && entitlement.access !== 'none';
}
