import { useEffect, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getNotificationSettings,
  saveNotificationSettings,
  requestNotificationPermission,
  subscribeToPush,
  syncNotificationSettingsToDB,
} from '../../lib/notifications';
import type { NotificationSettings as NS } from '../../lib/notifications';

import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useAccountContext } from '@/features/account/hooks/useAccountContext';

type ActionCategory = 'messages' | 'coaching' | 'program' | 'checkins' | 'decisions';

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
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
  const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;

  const { user } = useAuthStore();
  const { profile, updateProfile } = useProfileStore();
  const canCoach = useAccountContext().capabilities.coach;
  const categories = profile?.notification_categories ?? {};
  // Vision §21: notify what needs an action now; « decisions » only exist for a coach.
  const actionCategories: ActionCategory[] = canCoach
    ? ['messages', 'coaching', 'program', 'checkins', 'decisions']
    : ['messages', 'coaching', 'program', 'checkins'];
  const [permission, setPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'denied',
  );
  const [settings, setSettings] = useState<NS>(() => getNotificationSettings());
  const [requesting, setRequesting] = useState(false);
  const [saved, setSaved] = useState(false);
  /** Q01 : abonnement serveur réel — la permission seule ne prouve rien. */
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [opError, setOpError] = useState<string | null>(null);

  // Recharge les préférences du compte (elles sont namespacées par compte).
  useEffect(() => {
    setSettings(getNotificationSettings());
    setSubscribed(null);
    setOpError(null);
  }, [user?.id]);

  // État de l'abonnement push de CET appareil.
  useEffect(() => {
    if (!user || permission !== 'granted') return;
    let cancelled = false;
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        if (!cancelled) setSubscribed(!!sub);
      } catch {
        if (!cancelled) setSubscribed(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, permission]);

  const handleRequest = async () => {
    setRequesting(true);
    setOpError(null);
    const granted = await requestNotificationPermission();
    if (granted && user) {
      // Q01 : le booléen de subscribeToPush décide de l'affichage, pas la permission.
      const ok = await subscribeToPush(user.id);
      setSubscribed(ok);
      if (!ok) setOpError(t('profile.notifications.subscribeFailed'));
    }
    setPermission(granted ? 'granted' : 'denied');
    setRequesting(false);
  };

  const toggleCategory = async (category: ActionCategory) => {
    if (!user) return;
    setOpError(null);
    const next = { ...categories, [category]: categories[category] === false };
    const result = await updateProfile(user.id, { notification_categories: next });
    if (result.error) {
      setOpError(t('profile.notifications.saveFailed'));
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const update = (patch: Partial<NS>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    saveNotificationSettings(updated);
    setOpError(null);
    if (user) {
      void syncNotificationSettingsToDB(user.id, updated).then(result => {
        if (result.error) {
          setOpError(t('profile.notifications.saveFailed'));
          setSaved(false);
          return;
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      });
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
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
        {opError && <p className="text-xs text-red-400" role="alert">{opError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
        <Check size={13} />
        {subscribed === false
          ? t('profile.notifications.serverPending')
          : t('profile.notifications.enabled')}
      </div>
      {subscribed === false && (
        <button
          type="button"
          onClick={handleRequest}
          disabled={requesting}
          className="text-xs text-blue-400 hover:text-white disabled:opacity-60"
        >
          {requesting ? t('profile.notifications.requesting') : t('profile.notifications.enable')}
        </button>
      )}

      <section className="space-y-3" aria-labelledby="notif-action-title">
        <div>
          <h3 id="notif-action-title" className="text-sm text-white font-semibold">{t('profile.notifications.actionTitle')}</h3>
          <p className="text-xs text-neutral-500 mt-0.5">{t('profile.notifications.actionHint')}</p>
        </div>
        {actionCategories.map(category => (
          <div key={category} className="flex items-center justify-between gap-3">
            <p className="text-sm text-neutral-200">{t(`profile.notifications.categories.${category}`)}</p>
            <Toggle
              checked={categories[category] !== false}
              onChange={() => void toggleCategory(category)}
              label={t(`profile.notifications.categories.${category}`)}
            />
          </div>
        ))}
      </section>

      <div className="pt-1">
        <h3 className="text-sm text-white font-semibold">{t('profile.notifications.fixedTitle')}</h3>
        <p className="text-xs text-neutral-500 mt-0.5">{t('profile.notifications.fixedHint')}</p>
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
            label={t('profile.notifications.workoutReminder')}
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
            label={t('profile.notifications.nutritionReminder')}
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
      {opError && <p className="text-xs text-red-400" role="alert">{opError}</p>}

      <p className="text-[11px] text-neutral-600 leading-relaxed">
        {t('profile.notifications.backgroundNote')}
      </p>
    </div>
  );
}
