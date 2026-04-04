export interface NotificationSettings {
  workout_enabled: boolean;
  workout_time: string; // "HH:MM"
  nutrition_enabled: boolean;
  nutrition_time: string;
}

const STORAGE_KEY = 'prometheus_notification_settings';
const SCHEDULED_KEY = 'prometheus_notifications_scheduled_date';

export function getNotificationSettings(): NotificationSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function msUntilTime(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  return target.getTime() - now.getTime();
}

const scheduledTimeouts: ReturnType<typeof setTimeout>[] = [];

export function cancelScheduledNotifications(): void {
  scheduledTimeouts.forEach(clearTimeout);
  scheduledTimeouts.length = 0;
}

export function scheduleNotificationsForToday(
  settings: NotificationSettings,
  workoutsLoggedToday: boolean,
  mealsLoggedToday: boolean,
): void {
  cancelScheduledNotifications();

  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const today = new Date().toISOString().split('T')[0];
  const lastScheduled = localStorage.getItem(SCHEDULED_KEY);

  // Only schedule once per day
  if (lastScheduled === today) return;
  localStorage.setItem(SCHEDULED_KEY, today);

  if (settings.workout_enabled && !workoutsLoggedToday) {
    const ms = msUntilTime(settings.workout_time);
    if (ms > 0) {
      scheduledTimeouts.push(
        setTimeout(() => {
          new Notification('Prometheus — Time to train 💪', {
            body: "You haven't logged a workout today. Go crush it!",
            icon: '/logo.svg',
            tag: 'workout-reminder',
          });
        }, ms),
      );
    }
  }

  if (settings.nutrition_enabled && !mealsLoggedToday) {
    const ms = msUntilTime(settings.nutrition_time);
    if (ms > 0) {
      scheduledTimeouts.push(
        setTimeout(() => {
          new Notification('Prometheus — Log your meals 🥗', {
            body: "Don't forget to track your nutrition today.",
            icon: '/logo.svg',
            tag: 'nutrition-reminder',
          });
        }, ms),
      );
    }
  }
}
