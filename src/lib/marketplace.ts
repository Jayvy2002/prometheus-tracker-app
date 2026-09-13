export const MARKET_DISCIPLINES = ['strength', 'powerlifting', 'general_fitness'] as const;
export const MARKET_LANGUAGES = ['fr', 'en'] as const;
export const MARKET_FORMATS = ['online', 'in_person', 'hybrid'] as const;
export interface CoachPublicProfile {
  coach_id: string; public_name: string; introduction: string; method: string; offer: string;
  disciplines: string[]; languages: string[]; formats: string[]; area: string;
  published: boolean; accepting_clients: boolean; updated_at: string;
}
export interface CoachingRequest {
  id: string; coach_id: string; client_id: string; public_name: string; summary: string;
  sharing_version: number; status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  created_at: string; updated_at: string;
}
export function marketFilters(params: URLSearchParams) {
  const valid = (key: string, values: readonly string[]) => values.includes(params.get(key) ?? '') ? params.get(key)! : '';
  return { discipline: valid('discipline', MARKET_DISCIPLINES), language: valid('language', MARKET_LANGUAGES), format: valid('format', MARKET_FORMATS) };
}
export function requestActions(request: CoachingRequest, userId: string): CoachingRequest['status'][] {
  if (request.client_id === userId && ['pending', 'accepted'].includes(request.status)) return ['withdrawn'];
  if (request.coach_id === userId && request.status === 'pending') return ['accepted', 'declined'];
  return [];
}
export function matchingReasons(profile: CoachPublicProfile, filters: ReturnType<typeof marketFilters>): string[] {
  return [filters.discipline && profile.disciplines.includes(filters.discipline) ? filters.discipline : '',
    filters.language && profile.languages.includes(filters.language) ? filters.language : '',
    filters.format && profile.formats.includes(filters.format) ? filters.format : ''].filter(Boolean);
}
