import { useState } from 'react';
import { Bell, Check, Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getNotificationSettings,
  saveNotificationSettings,
  requestNotificationPermission,
  subscribeToPush,
  syncNotificationSettingsToDB,
} from '../../lib/notifications';
import type { NotificationSettings as NS } from '../../lib/notifications';
import { usePremium } from '../../hooks/usePremium';
import { usePaywallStore } from '../../stores/paywallStore';
import { useAuthStore } from '../../stores/authStore';

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${checked ? 'bg-blue-600' : 'bg-neutral-700'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

export default function NotificationSettings() {
  const { t } = useTranslation();
  const supported = 'Notification' in window;
  const { canUseNotifications } = usePremium();
  const { openPaywall } = usePaywallStore();
  const { user } = useAuthStore();
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'denied',
  );
  const [settings, setSettings] = useState<NS>(getNotificationSettings());
  const [requesting, setRequesting] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!canUseNotifications) {
    return (
      <button
        onClick={() => openPaywall(t('profile.notifications.title'), t('profile.notifications.premiumDesc'))}
        className="w-full flex items-center gap-3 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 hover:bg-amber-500/12 transition-colors"
      >
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
          <Bell size={16} className="text-amber-400" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-medium text-white">{t('profile.notifications.title')}</p>
          <p className="text-xs text-neutral-500 mt-0.5">{t('profile.notifications.premiumOnly')}</p>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/15 border border-amber-500/30">
          <Crown size={10} className="text-amber-400" />
          <span className="text-[10px] text-amber-400 font-semibold">Premium</span>
        </div>
      </button>
    );
  }

  const handleRequest = async () => {
    setRequesting(true);
    const granted = await requestNotificationPermission();
    if (granted && user) {
      await subscribeToPush(user.id);
    }
    setPermission(granted ? 'granted' : 'denied');
    setRequesting(false);
  };

  const update = (patch: Partial<NS>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    saveNotificationSettings(updated);
    if (user) syncNotificationSettingsToDB(user.id, updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!supported) {
    return (
      <p className="text-xs text-neutral-500">{t('profile.notifications.notSupported')}</p>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-neutral-400 leading-relaxed">
          {t('profile.notifications.blocked')}
        </p>
      </div>
    );
  }

  if (permission !== 'granted') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-neutral-400 leading-relaxed">
          {t('profile.notifications.enablePrompt')}
        </p>
        <button
          onClick={handleRequest}
          disabled={requesting}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-blue-600/15 border border-blue-500/30 text-sm font-medium text-blue-400 hover:bg-blue-600/25 transition-colors disabled:opacity-60"
        >
          <Bell size={15} />
          {requesting ? t('profile.notifications.requesting') : t('profile.notifications.enable')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
        <Check size={13} />
        {t('profile.notifications.enabled')}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white font-medium">{t('profile.notifications.workoutReminder')}</p>
            <p className="text-xs text-neutral-500 mt-0.5">{t('profile.notifications.workoutReminderDesc')}</p>
          </div>
          <Toggle
            checked={settings.workout_enabled}
            onChange={() => update({ workout_enabled: !settings.workout_enabled })}
          />
        </div>
        {settings.workout_enabled && (
          <div className="animate-fade-in">
            <label className="text-xs text-neutral-500 block mb-1">{t('profile.notifications.reminderTime')}</label>
            <input
              type="time"
              value={settings.workout_time}
              onChange={e => update({ workout_time: e.target.value })}
              className="w-full bg-neutral-900/80 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white font-medium">{t('profile.notifications.nutritionReminder')}</p>
            <p className="text-xs text-neutral-500 mt-0.5">{t('profile.notifications.nutritionReminderDesc')}</p>
          </div>
          <Toggle
            checked={settings.nutrition_enabled}
            onChange={() => update({ nutrition_enabled: !settings.nutrition_enabled })}
          />
        </div>
        {settings.nutrition_enabled && (
          <div className="animate-fade-in">
            <label className="text-xs text-neutral-500 block mb-1">{t('profile.notifications.reminderTime')}</label>
            <input
              type="time"
              value={settings.nutrition_time}
              onChange={e => update({ nutrition_time: e.target.value })}
              className="w-full bg-neutral-900/80 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
            />
          </div>
        )}
      </div>

      {saved && (
        <p className="text-xs text-emerald-400 animate-fade-in flex items-center gap-1.5">
          <Check size={11} /> {t('profile.notifications.saved')}
        </p>
      )}

      <p className="text-[11px] text-neutral-600 leading-relaxed">
        {t('profile.notifications.backgroundNote')}
      </p>
    </div>
  );
}
