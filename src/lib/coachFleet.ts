import type { CoachInterventionKind, CoachNudgeTemplateKey } from './types';

/**
 * Parseurs d'affichage des cartes de tournée, côté front.
 *
 * Le moteur de décision vit dans `supabase/functions/_shared/fleetEngine.ts` :
 * une seule copie, celle qui tourne réellement, importée par l'edge function
 * et par les tests. Ce fichier ne garde que ce que l'inbox coach lit dans un
 * payload déjà écrit.
 */

const RELANCE_KINDS = new Set<CoachInterventionKind>([
  'adherence_nutrition',
  'adherence_training',
  'keep_in_touch',
]);

export function isRelanceKind(kind: CoachInterventionKind): boolean {
  return RELANCE_KINDS.has(kind);
}

export function parseFleetObservation(payload: unknown, fallback = ''): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fallback;
  const row = payload as Record<string, unknown>;
  return typeof row.observation === 'string' && row.observation.trim() ? row.observation : fallback;
}

/** One-line coach cause — never a JSON blob, stack, or prompt/log dump. */
export function isHumanCoachCause(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (!s || s.length > 180) return false;
  if (s.split(/\n/).length > 2) return false;
  if (/[{[]/.test(s) && /[}\]]/.test(s)) return false;
  if (/\d{4}-\d{2}-\d{2}T\d{2}:/.test(s)) return false;
  if (/^\s*(error|traceback|console\.|at \w+)/i.test(s)) return false;
  if (/"kind"\s*:|"payload"\s*:|"drafting"\s*:/.test(s)) return false;
  return true;
}

export function parseFleetCause(payload: unknown, fallback = ''): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return isHumanCoachCause(fallback) ? fallback.trim() : '';
  }
  const row = payload as Record<string, unknown>;
  if (isHumanCoachCause(row.cause)) return String(row.cause).trim();
  if (isHumanCoachCause(fallback)) return fallback.trim();
  return '';
}

export function parsePreparedMessage(payload: unknown, fallback = ''): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fallback;
  const row = payload as Record<string, unknown>;
  if (typeof row.body === 'string' && row.body.trim()) return row.body;
  if (typeof row.notes === 'string' && row.notes.trim()) return row.notes;
  return fallback;
}

export function preparedTemplateKey(payload: unknown, kind: CoachInterventionKind): CoachNudgeTemplateKey {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const key = (payload as Record<string, unknown>).template_key;
    if (key === 'missed_training' || key === 'missed_checkins' || key === 'general_followup') return key;
  }
  if (kind === 'adherence_training') return 'missed_training';
  if (kind === 'adherence_nutrition') return 'missed_checkins';
  if (kind === 'keep_in_touch') return 'general_followup';
  return 'general_followup';
}

/** La tournée pose `ai_off: true` quand OpenAI n'a pas répondu et que la carte est un repli déterministe. */
export function isAiOffPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  return (payload as Record<string, unknown>).ai_off === true;
}
