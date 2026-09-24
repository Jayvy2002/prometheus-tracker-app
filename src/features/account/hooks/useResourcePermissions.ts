import { useAuthStore } from '../../../stores/authStore';
import { useAccountContext } from './useAccountContext';
import {
  actorFromAccount,
  canActAsCoach,
  canCorrectAthleteWatchContext,
  canDecideAthleteWatchProposal,
  canEditClientDossier,
  canLogOwnSession,
  canOpenPersonalCalendarRoute,
  canProposeAssignedProgramChange,
  canReadAssignedProgram,
  canReadAthleteWatch,
  canReadClientDossier,
  canReadOwnAssignedProgram,
  canReadOwnCalendar,
  canReadOwnHistory,
  canUpdateAssignedProgram,
  canUpdateCoachOwnedTargets,
  canUpdateOwnAssignedProgram,
  canUpdateOwnPersonalData,
  canUsePersonalTools,
  canImportCoachSpreadsheet,
  canImportPersonalHistory,
  canPrepareProvisionalDossier,
  type AssignedProgramResource,
  type AthleteWatchResource,
  type ClientDossierResource,
  type CoachImportResource,
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
    canReadAthleteWatch: (resource?: AthleteWatchResource) =>
      canReadAthleteWatch(actor, resource),
    canCorrectAthleteWatchContext: (resource?: AthleteWatchResource) =>
      canCorrectAthleteWatchContext(actor, resource),
    canDecideAthleteWatchProposal: (resource?: AthleteWatchResource) =>
      canDecideAthleteWatchProposal(actor, resource),
    canImportPersonalHistory: canImportPersonalHistory(actor),
    canImportCoachSpreadsheet: (resource?: CoachImportResource) =>
      canImportCoachSpreadsheet(actor, resource),
    canPrepareProvisionalDossier: canPrepareProvisionalDossier(actor),
  };
}
