/** supabase.functions.invoke leaves 4xx/5xx JSON on error.context (a Response), not in data. */
export async function functionsErrorBody(error: unknown): Promise<Record<string, unknown>> {
  if (!error || typeof error !== 'object' || !('context' in error)) return {};
  const ctx = (error as { context: unknown }).context;
  if (typeof Response !== 'undefined' && ctx instanceof Response) {
    try {
      const parsed: unknown = await ctx.clone().json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  if (ctx && typeof ctx === 'object' && !Array.isArray(ctx)) {
    return ctx as Record<string, unknown>;
  }
  return {};
}

export function functionsHttpStatus(error: unknown): number {
  if (!error || typeof error !== 'object' || !('context' in error)) return 0;
  const ctx = (error as { context: unknown }).context;
  if (typeof Response !== 'undefined' && ctx instanceof Response) return ctx.status;
  return 0;
}
