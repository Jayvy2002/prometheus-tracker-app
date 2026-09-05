/**
 * PostgREST caps a single select at 1000 rows. Coach ops and similar
 * "every client × N days" queries silently truncated past that — paginate.
 */
const PAGE = 1000;

export async function fetchAllRows<T>(
  makeQuery: () => {
    range: (from: number, to: number) => PromiseLike<{
      data: T[] | null;
      error: { message: string } | null;
    }>;
  },
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) return { data: all, error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) return { data: all, error: null };
  }
}
