export const COACH_HAS_ACTIVE_CLIENTS = 'coach_has_active_clients';

export function isCoachHasActiveClientsError(message: string | null | undefined): boolean {
  if (!message) return false;
  return message.includes(COACH_HAS_ACTIVE_CLIENTS);
}

export function mapCoachingRoleError(message: string): string {
  return isCoachHasActiveClientsError(message) ? COACH_HAS_ACTIVE_CLIENTS : message;
}
