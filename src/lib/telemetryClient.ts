import { supabase } from './supabase';
import { useAuthStore } from '../stores/authStore';
import { useCoachingStore } from '../stores/coachingStore';
import { buildProductEvent, normalizeScreenPath, shouldTrackScreen } from './telemetry';
import type { ProductEventName } from './types';

/**
 * Fire-and-forget product telemetry. Never awaited by callers, never throws, never blocks UI.
 * Event names live in types.ts (ProductEventName); the table is public.product_events.
 */
export function track(event: ProductEventName, props?: Record<string, unknown>): void {
  const row = buildProductEvent({
    userId: useAuthStore.getState().user?.id ?? null,
    coachingRole: useCoachingStore.getState().coachingRole,
    myCoach: useCoachingStore.getState().myCoach,
    event,
    props,
  });
  if (!row) return;
  void supabase
    .from('product_events')
    .insert(row)
    .then(({ error }) => {
      if (error && import.meta.env.DEV) console.warn('[telemetry]', event, error.message);
    });
}

let lastScreen: string | null = null;

export function trackScreen(pathname: string): void {
  const screen = normalizeScreenPath(pathname);
  if (!shouldTrackScreen(lastScreen, screen)) return;
  lastScreen = screen;
  track('screen_view', { screen });
}

export function resetScreenTracking(): void {
  lastScreen = null;
}
