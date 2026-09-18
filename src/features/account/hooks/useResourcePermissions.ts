import { useAuthStore } from '../../../stores/authStore';
import { useAccountContext } from './useAccountContext';
import {
  actorFromAccount,
  canActAsCoach,
  canEditClientDossier,
  canLogOwnSession,
  canOpenPersonalCalendarRoute,
  canProposeAssignedProgramChange,
  canReadAssignedProgram,
  canReadClientDossier,
  canReadOwnAssignedProgram,
  canReadOwnCalendar,
  canReadOwnHistory,
  canUpdateAssignedProgram,
  canUpdateCoachOwnedTargets,
  canUpdateOwnAssignedProgram,
  canUpdateOwnPersonalData,
  canUsePersonalTools,
  type AssignedProgramResource,
  type ClientDossierResource,
} from '../domain/resourcePermissions';

export function useResourcePermissions() {
  const userId = useAuthStore(s => s.user?.id ?? null);
  const context = useAccountContext();
  const actor = actorFromAccount(userId, context);
  return {
    actor,
    canUsePersonalTools: canUsePersonalTools(actor),
    canActAsCoach: canActAsCoach(actor),
    canReadOwnHistory: canReadOwnHistory(actor),
    canLogOwnSession: canLogOwnSession(actor),
    canUpdateOwnPersonalData: canUpdateOwnPersonalData(actor),
    canUpdateCoachOwnedTargets: canUpdateCoachOwnedTargets(actor),
    canReadOwnAssignedProgram: canReadOwnAssignedProgram(actor),
    canReadAssignedProgram: (resource?: AssignedProgramResource) =>
      canReadAssignedProgram(actor, resource),
    canUpdateOwnAssignedProgram: canUpdateOwnAssignedProgram(actor),
    canProposeAssignedProgramChange: canProposeAssignedProgramChange(actor),
    canReadOwnCalendar: canReadOwnCalendar(actor),
    canOpenPersonalCalendarRoute: canOpenPersonalCalendarRoute(actor),
    canUpdateAssignedProgram: (resource?: AssignedProgramResource) =>
      canUpdateAssignedProgram(actor, resource),
    canReadClientDossier: (resource: ClientDossierResource) =>
      canReadClientDossier(actor, resource),
    canEditClientDossier: (resource: ClientDossierResource) =>
      canEditClientDossier(actor, resource),
  };
}
