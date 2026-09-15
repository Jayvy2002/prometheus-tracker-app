import { create } from 'zustand';
import {
  initialCoachingState,
  type CoachingState,
} from '../features/coaching/model/coachingShared';
import { createRoleSlice } from '../features/coaching/model/roleSlice';
import { createClientsSlice } from '../features/coaching/model/clientsSlice';
import { createTrackingSlice } from '../features/coaching/model/trackingSlice';
import { createMessagesSlice } from '../features/coaching/model/messagesSlice';
import { createInterventionsSlice } from '../features/coaching/model/interventionsSlice';
import { createQuestionnairesSlice } from '../features/coaching/model/questionnairesSlice';
import { createRealtimeSlice } from '../features/coaching/model/realtimeSlice';
import { createInvitesSlice } from '../features/coaching/model/invitesSlice';
import { createLifecycleSlice } from '../features/coaching/model/lifecycleSlice';

export {
  setPendingInviteToken,
  getPendingInviteToken,
  clearPendingInviteToken,
  setIntendedCoachingRole,
  getIntendedCoachingRole,
  clearIntendedCoachingRole,
  setOnboardingDeferred,
  clearOnboardingDeferred,
  isOnboardingDeferred,
  type IntendedCoachingRole,
} from '../features/coaching/model/sessionTokens';

export const useCoachingStore = create<CoachingState>((set, get) => ({
  ...initialCoachingState(),
  ...createRoleSlice(set, get),
  ...createClientsSlice(set, get),
  ...createTrackingSlice(set, get),
  ...createMessagesSlice(set, get),
  ...createInterventionsSlice(set, get),
  ...createQuestionnairesSlice(),
  ...createRealtimeSlice(set, get),
  ...createInvitesSlice(set, get),
  ...createLifecycleSlice(set, get),
}));
