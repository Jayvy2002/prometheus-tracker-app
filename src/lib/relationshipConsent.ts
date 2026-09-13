export const DIRECT_INVITE_CONSENT_VERSION = 1;

export const DIRECT_INVITE_CONSENT_SCOPES = [
  'checkins',
  'messages',
  'nutrition',
  'profile',
  'program',
  'progress_photos',
  'questionnaire',
  'workouts',
] as const;

export function directInviteConsentArgs() {
  return {
    p_consent_version: DIRECT_INVITE_CONSENT_VERSION,
    p_scopes: [...DIRECT_INVITE_CONSENT_SCOPES],
  };
}
