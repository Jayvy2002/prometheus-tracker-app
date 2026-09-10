import { supabase } from './supabase';
import { scopedKey } from './sessionScope';

export interface NotificationSettings {
  workout_enabled: boolean;
  workout_time: string; // "HH:MM"
  nutrition_enabled: boolean;
  nutrition_time: string;
}

const STORAGE_PREFIX = 'prometheus_notification_settings';

function storageKey(): string {
  // Q01/S05 : préférences par compte, pas par navigateur.
  return scopedKey(STORAGE_PREFIX, 'prefs');
}

export function getNotificationSettings(): NotificationSettings {
  try {
    const stored = localStorage.getItem(storageKey());
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return {
    workout_enabled: false,
    workout_time: '18:00',
    nutrition_enabled: false,
    nutrition_time: '13:00',
  };
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  localStorage.setItem(storageKey(), JSON.stringify(settings));
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// ─── Web Push subscription ─────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export async function subscribeToPush(userId: string): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    console.warn('[Push] VITE_VAPID_PUBLIC_KEY not set — background push disabled');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      const stored = await storePushSubscription(userId, existing);
      return stored.error === null;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const stored = await storePushSubscription(userId, subscription);
    return stored.error === null;
  } catch (err) {
    console.error('[Push] subscribe failed:', err);
    return false;
  }
}

async function storePushSubscription(userId: string, sub: PushSubscription): Promise<{ error: string | null }> {
  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: 'user_id,endpoint' },
  );
  return { error: error?.message ?? null };
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  } catch (err) {
    console.error('[Push] unsubscribe failed:', err);
  }
}

export async function syncNotificationSettingsToDB(userId: string, settings: NotificationSettings): Promise<{ error: string | null }> {
  const { error } = await supabase.from('user_profiles').update({
    notification_workout_enabled: settings.workout_enabled,
    notification_workout_time: settings.workout_time,
    notification_nutrition_enabled: settings.nutrition_enabled,
    notification_nutrition_time: settings.nutrition_time,
  }).eq('id', userId);
  if (error) return { error: error.message };
  return { error: null };
}

/** Q01 : au logout, retire l'abonnement push du compte (pas de rappels de A chez B). */
export async function detachPushOnLogout(userId: string | null): Promise<void> {
  if (!userId) return;
  try {
    await unsubscribeFromPush(userId);
  } catch {
    // best effort — le navigateur peut être hors ligne
  }
}
