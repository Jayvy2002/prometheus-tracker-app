import type { Program } from '../types';

/** Who follows a program right now: active and paused assignments. */
export interface ProgramUsage {
  active: number;
  paused: number;
}

export type ProgramListStatus =
  | { kind: 'draft' }
  | { kind: 'version'; revision: number }
  | { kind: 'scheduled'; revision: number; nextRevision: number; on: string | null };

/**
 * What the Coach's program list says about a program (Vision §7.4 : brouillon ≠
 * publié ≠ actif). No saved revision yet = draft; a scheduled revision is
 * shown with its date so the coach sees the upcoming change.
 */
export function programListStatus(
  program: Pick<Program, 'active_revision_no' | 'scheduled_revision_no' | 'scheduled_activates_on'>,
): ProgramListStatus {
  const revision = program.active_revision_no ?? null;
  if (revision == null || revision < 1) return { kind: 'draft' };
  const next = program.scheduled_revision_no ?? null;
  if (next != null && next > revision) {
    return { kind: 'scheduled', revision, nextRevision: next, on: program.scheduled_activates_on ?? null };
  }
  return { kind: 'version', revision };
}

/** Counts assignments per program; ended or completed ones are history, not usage. */
export function programUsageById(
  rows: ReadonlyArray<{ program_id: string; status: string }>,
): Record<string, ProgramUsage> {
  const usage: Record<string, ProgramUsage> = {};
  for (const row of rows) {
    if (row.status !== 'active' && row.status !== 'paused') continue;
    const entry = (usage[row.program_id] ??= { active: 0, paused: 0 });
    if (row.status === 'active') entry.active += 1;
    else entry.paused += 1;
  }
  return usage;
}

/**
 * What a program is right now, in the Coach's words (brouillon ≠ enregistré ≠
 * actif). A program followed by at least one client is active — whether or not
 * it already carries a version number; « draft » is only a program nobody
 * follows or followed and that was never saved as a version. Paused assignments (ended
 * relationships) are history the program still carries, not activity.
 */
export type ProgramLifecycle = 'draft' | 'saved' | 'active';

export interface ProgramListSummary {
  lifecycle: ProgramLifecycle;
  status: ProgramListStatus;
  activeClients: number;
  pausedClients: number;
}

export function programListSummary(
  program: Pick<Program, 'active_revision_no' | 'scheduled_revision_no' | 'scheduled_activates_on'>,
  usage: ProgramUsage | null | undefined,
): ProgramListSummary {
  const status = programListStatus(program);
  const activeClients = usage?.active ?? 0;
  const pausedClients = usage?.paused ?? 0;
  const lifecycle: ProgramLifecycle = activeClients > 0
    ? 'active'
    : status.kind === 'draft' && pausedClients === 0 ? 'draft' : 'saved';
  return { lifecycle, status, activeClients, pausedClients };
}
