import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { scopedKey } from '../../lib/sessionScope';
import {
  getNotificationSettings,
  requestNotificationPermission,
  saveNotificationSettings,
  subscribeToPush,
  syncNotificationSettingsToDB,
} from '../../lib/notifications';
import { shouldShowReminderPermissionPrompt } from '../../lib/reminderDue';
import { useAuthStore } from '../../stores/authStore';
import Button from '../ui/Button';
import Card from '../ui/Card';

const DISMISS_PREFIX = 'prometheus_reminder_prompt';

function dismissedKey(): string {
  return scopedKey(DISMISS_PREFIX, 'dismissed');
}

export default function ReminderPermissionPrompt() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'Notification' in window;
    const permission: NotificationPermission | 'unsupported' = supported
      ? Notification.permission
      : 'unsupported';
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(dismissedKey()) === '1';
    } catch {
      dismissed = false;
    }
    setVisible(shouldShowReminderPermissionPrompt({
      reminderAlreadyEnabled: getNotificationSettings().workout_enabled,
      permission,
      dismissed,
    }));
  }, [user?.id]);

  const hide = () => setVisible(false);

  const dismiss = () => {
    try {
      localStorage.setItem(dismissedKey(), '1');
    } catch {
      // localStorage may be unavailable; hiding still prevents a second ask this visit.
    }
    hide();
  };

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const granted = await requestNotificationPermission();
    if (!granted) {
      setError(t('profile.notifications.blocked'));
      setBusy(false);
      return;
    }
    if (user) await subscribeToPush(user.id);
    const updated = { ...getNotificationSettings(), workout_enabled: true };
    saveNotificationSettings(updated);
    if (user) {
      const result = await syncNotificationSettingsToDB(user.id, updated);
      if (result.error) {
        setError(t('profile.notifications.saveFailed'));
        setBusy(false);
        return;
      }
    }
    try {
      localStorage.setItem(dismissedKey(), '1');
    } catch {
      // ignore
    }
    setBusy(false);
    hide();
  };

  if (!visible) return null;

  return (
    <Card className="mb-4">
      <div data-testid="reminder-permission-prompt" className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-surface-hover flex items-center justify-center text-ink-secondary shrink-0">
            <Bell size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{t('profile.notifications.askAfterWorkout')}</p>
            <p className="text-xs text-ink-muted mt-1">{t('profile.notifications.askAfterWorkoutBody')}</p>
          </div>
        </div>
        {error && <p className="text-xs text-danger" role="alert">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => void enable()} loading={busy} className="flex-1" data-testid="reminder-permission-enable">
            {t('profile.notifications.enableTomorrow')}
          </Button>
          <Button variant="secondary" onClick={dismiss} disabled={busy} className="flex-1" data-testid="reminder-permission-later">
            {t('profile.notifications.notNow')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
