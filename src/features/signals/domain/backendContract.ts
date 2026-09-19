/** Fail-open until P2 candidates are applied in production. */

export function isMissingBackendContract(error: {
  message?: string;
  code?: string;
} | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  const message = error.message ?? '';
  return (
    code === 'PGRST202'
    || code === 'PGRST205'
    || code === '42P01'
    || /could not find the function|schema cache|does not exist|relation .* does not exist/i.test(message)
  );
}
