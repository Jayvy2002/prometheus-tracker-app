const TECHNICAL = /postgres|supabase|permission denied|row-level|rls|violates|dead letter|pgrst|jwt|stack|sqlstate|column |relation |function |rpc |networkerror|failed to fetch|typeerror|referenceerror/i;

/** Never show a raw engine / Postgres / stack string to the user. */
export function userFacingError(raw: string | null | undefined, fallback: string): string {
  if (!raw || !raw.trim()) return fallback;
  const trimmed = raw.trim();
  if (TECHNICAL.test(trimmed)) return fallback;
  if (trimmed.length > 180) return fallback;
  if (/[{}[\]<>]/.test(trimmed) && /error|exception|trace/i.test(trimmed)) return fallback;
  return trimmed;
}
