import type { AccountContext, AccountWorkspace, PersonalCoachingState } from '../../../lib/accountContext';

/**
 * P1.2 — permission decisions answer owner + actor + relationship + action.
 * The displayed workspace never grants or revokes a right.
 */
export interface PermissionActor {
  userId: string | null;
  ready: boolean;
  coachCapability: boolean;
  personalCoaching: PersonalCoachingState;
  personalToolsAvailable: boolean;
  /** UI preference only. Must not appear in grant conditions. */
  activeWorkspace: AccountWorkspace;
}

export interface AssignedProgramResource {
  ownerId?: string | null;
  clientId?: string | null;
}

export interface ClientDossierResource {
  clientId?: string | null;
  hasActiveRelationship: boolean;
}

/** P1.3 owns calendar routing. Owner read is already allowed here. */
export const PERSONAL_CALENDAR_ROUTE_OPEN = false;

export function actorFromAccount(
  userId: string | null | undefined,
  context: AccountContext,
): PermissionActor {
  return {
    userId: userId ?? null,
    ready: context.ready,
    coachCapability: context.capabilities.coach,
    personalCoaching: context.personalCoaching,
    personalToolsAvailable: context.personalToolsAvailable,
    activeWorkspace: context.activeWorkspace,
  };
}

function isAuthenticated(actor: PermissionActor): boolean {
  return actor.ready && !!actor.userId;
}

export function canUsePersonalTools(actor: PermissionActor): boolean {
  return isAuthenticated(actor) && actor.personalToolsAvailable;
}

export function canActAsCoach(actor: PermissionActor): boolean {
  return isAuthenticated(actor) && actor.coachCapability;
}

export function canReadOwnHistory(actor: PermissionActor): boolean {
  return canUsePersonalTools(actor);
}

export function canLogOwnSession(actor: PermissionActor): boolean {
  return canUsePersonalTools(actor);
}

export function canUpdateOwnPersonalData(actor: PermissionActor): boolean {
  return canUsePersonalTools(actor);
}

/** kcal / macros / water / steps stay Coach-owned while the athlete is coached. */
export function canUpdateCoachOwnedTargets(actor: PermissionActor): boolean {
  return canUpdateOwnPersonalData(actor) && actor.personalCoaching === 'solo';
}

export function canReadAssignedProgram(actor: PermissionActor): boolean {
  return canUsePersonalTools(actor) || canActAsCoach(actor);
}

export function canUpdateAssignedProgram(
  actor: PermissionActor,
  resource: AssignedProgramResource = {},
): boolean {
  if (!isAuthenticated(actor)) return false;
  const clientId = resource.clientId ?? actor.userId;
  const ownerId = resource.ownerId ?? actor.userId;
  if (!clientId || !ownerId) return false;

  if (clientId === actor.userId) {
    if (!canUsePersonalTools(actor)) return false;
    if (actor.personalCoaching !== 'solo') return false;
    return ownerId === actor.userId;
  }

  if (!canActAsCoach(actor)) return false;
  return ownerId === actor.userId;
}

export function canUpdateOwnAssignedProgram(actor: PermissionActor): boolean {
  return canUpdateAssignedProgram(actor, { ownerId: actor.userId, clientId: actor.userId });
}

export function canProposeAssignedProgramChange(actor: PermissionActor): boolean {
  return canUsePersonalTools(actor) && actor.personalCoaching === 'coached';
}

export function canReadClientDossier(
  actor: PermissionActor,
  resource: ClientDossierResource,
): boolean {
  if (!canActAsCoach(actor)) return false;
  if (!resource.clientId || resource.clientId === actor.userId) return false;
  return resource.hasActiveRelationship;
}

export function canEditClientDossier(
  actor: PermissionActor,
  resource: ClientDossierResource,
): boolean {
  return canReadClientDossier(actor, resource);
}

export function canReadOwnCalendar(actor: PermissionActor): boolean {
  return canUsePersonalTools(actor);
}

/** Solo keeps today's calendar route; coached waits for P1.3. */
export function canOpenPersonalCalendarRoute(actor: PermissionActor): boolean {
  if (!canReadOwnCalendar(actor)) return false;
  if (PERSONAL_CALENDAR_ROUTE_OPEN) return true;
  return actor.personalCoaching !== 'coached';
}
