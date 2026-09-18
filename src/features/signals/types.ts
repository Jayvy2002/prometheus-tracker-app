/** P2.1 persistent athlete signals — longitudinal hypotheses, not a proposal inbox. */

export const ATHLETE_SIGNAL_DOMAINS = [
  'training',
  'nutrition',
  'recovery',
  'weight',
  'goal',
  'adherence',
] as const;

export type AthleteSignalDomain = (typeof ATHLETE_SIGNAL_DOMAINS)[number];

export const ATHLETE_SIGNAL_STATUSES = [
  'open',
  'waiting',
  'resolved',
  'not_relevant',
] as const;

export type AthleteSignalStatus = (typeof ATHLETE_SIGNAL_STATUSES)[number];

export const ATHLETE_SIGNAL_CONFIDENCE = ['low', 'medium', 'high'] as const;

export type AthleteSignalConfidence = (typeof ATHLETE_SIGNAL_CONFIDENCE)[number];

export const ATHLETE_SIGNAL_OPEN_STATUSES = ['open', 'waiting'] as const;

export type AthleteSignalOpenStatus = (typeof ATHLETE_SIGNAL_OPEN_STATUSES)[number];

export const ATHLETE_SIGNAL_CLOSED_STATUSES = ['resolved', 'not_relevant'] as const;

export type AthleteSignalClosedStatus = (typeof ATHLETE_SIGNAL_CLOSED_STATUSES)[number];

export interface AthleteSignalEvidenceItem {
  kind: string;
  summary: string;
  at?: string;
}

export interface AthleteSignal {
  id: string;
  athlete_id: string;
  domain: AthleteSignalDomain;
  type: string;
  hypothesis: string;
  evidence_for: AthleteSignalEvidenceItem[];
  evidence_against: AthleteSignalEvidenceItem[];
  confidence: AthleteSignalConfidence;
  status: AthleteSignalStatus;
  first_seen_at: string;
  last_seen_at: string;
  next_review_at: string | null;
  resolved_at: string | null;
  resolution_reason: string | null;
  created_at: string;
  updated_at: string;
}
