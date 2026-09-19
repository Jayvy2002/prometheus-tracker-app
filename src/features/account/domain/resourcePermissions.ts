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
  /** Required when the client is not the actor. Missing/false fails closed. */
  hasActiveRelationship?: boolean;
}

export interface ClientDossierResource {
  clientId?: string | null;
  hasActiveRelationship: boolean;
}

/** P2.4 explainability surface: same truth for Solo home and Coach dossier. */
export interface AthleteWatchResource {
  athleteId?: string | null;
  hasActiveRelationship?: boolean;
}

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

export function canReadAssignedProgram(
  actor: PermissionActor,
  resource: AssignedProgramResource = {},
): boolean {
  if (!isAuthenticated(actor)) return false;
  const clientId = resource.clientId ?? actor.userId;
  if (!clientId) return false;

  if (clientId === actor.userId) {
    return canUsePersonalTools(actor);
  }

  if (!canActAsCoach(actor)) return false;
  return resource.hasActiveRelationship === true;
}

export function canReadOwnAssignedProgram(actor: PermissionActor): boolean {
  return canReadAssignedProgram(actor, { ownerId: actor.userId, clientId: actor.userId });
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
  if (resource.hasActiveRelationship !== true) return false;
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

/**
 * Read “what Prometheus is watching”: the athlete (Solo or coached) or an
 * active Coach of that athlete. Workspace never grants this.
 */
export function canReadAthleteWatch(
  actor: PermissionActor,
  resource: AthleteWatchResource = {},
): boolean {
  if (!isAuthenticated(actor)) return false;
  const athleteId = resource.athleteId ?? actor.userId;
  if (!athleteId) return false;
  if (athleteId === actor.userId) return canUsePersonalTools(actor);
  if (!canActAsCoach(actor)) return false;
  return resource.hasActiveRelationship === true;
}

/**
 * Correcting an interpretation is not rewriting source logs.
 * Solo (including a Coach on their own personal side) may correct own context.
 * A coached athlete — including a Coach who is themselves coached — cannot take
 * coaching-interpretation rights on their own dossier. The active Coach of the
 * athlete can. Workspace never grants this.
 */
export function canCorrectAthleteWatchContext(
  actor: PermissionActor,
  resource: AthleteWatchResource = {},
): boolean {
  if (!canReadAthleteWatch(actor, resource)) return false;
  const athleteId = resource.athleteId ?? actor.userId;
  if (!athleteId) return false;
  if (athleteId === actor.userId) return actor.personalCoaching === 'solo';
  return canActAsCoach(actor) && resource.hasActiveRelationship === true;
}

export function canReadOwnCalendar(actor: PermissionActor): boolean {
  return canUsePersonalTools(actor);
}

/** Calendar is a personal read surface. Writes stay on the assigned-plan contract. */
export function canOpenPersonalCalendarRoute(actor: PermissionActor): boolean {
  return canReadOwnCalendar(actor);
}
