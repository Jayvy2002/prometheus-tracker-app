import { useState } from 'react';
import { Bell, Check } from 'lucide-react';
import {
  getNotificationSettings,
  saveNotificationSettings,
  requestNotificationPermission,
} from '../../lib/notifications';
import type { NotificationSettings as NS } from '../../lib/notifications';

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
  const supported = 'Notification' in window;
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'denied',
  );
  const [settings, setSettings] = useState<NS>(getNotificationSettings());
  const [requesting, setRequesting] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleRequest = async () => {
    setRequesting(true);
    const granted = await requestNotificationPermission();
    setPermission(granted ? 'granted' : 'denied');
    setRequesting(false);
  };

  const update = (patch: Partial<NS>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    saveNotificationSettings(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!supported) {
    return (
      <p className="text-xs text-neutral-500">Notifications are not supported in this browser.</p>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-neutral-400 leading-relaxed">
          Notifications are blocked. You can re-enable them in your browser settings (site permissions).
        </p>
      </div>
    );
  }

  if (permission !== 'granted') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-neutral-400 leading-relaxed">
          Enable notifications to get reminders for your workouts and nutrition logging.
        </p>
        <button
          onClick={handleRequest}
          disabled={requesting}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-blue-600/15 border border-blue-500/30 text-sm font-medium text-blue-400 hover:bg-blue-600/25 transition-colors disabled:opacity-60"
        >
          <Bell size={15} />
          {requesting ? 'Requesting permission...' : 'Enable notifications'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
        <Check size={13} />
        Notifications are enabled
      </div>

      {/* Workout reminder */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white font-medium">Workout reminder</p>
            <p className="text-xs text-neutral-500 mt-0.5">Alert if no workout logged today</p>
          </div>
          <Toggle
            checked={settings.workout_enabled}
            onChange={() => update({ workout_enabled: !settings.workout_enabled })}
          />
        </div>
        {settings.workout_enabled && (
          <div className="animate-fade-in">
            <label className="text-xs text-neutral-500 block mb-1">Reminder time</label>
            <input
              type="time"
              value={settings.workout_time}
              onChange={e => update({ workout_time: e.target.value })}
              className="w-full bg-neutral-900/80 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
            />
          </div>
        )}
      </div>

      {/* Nutrition reminder */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white font-medium">Nutrition reminder</p>
            <p className="text-xs text-neutral-500 mt-0.5">Alert if no meal logged today</p>
          </div>
          <Toggle
            checked={settings.nutrition_enabled}
            onChange={() => update({ nutrition_enabled: !settings.nutrition_enabled })}
          />
        </div>
        {settings.nutrition_enabled && (
          <div className="animate-fade-in">
            <label className="text-xs text-neutral-500 block mb-1">Reminder time</label>
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
          <Check size={11} /> Settings saved
        </p>
      )}

      <p className="text-[11px] text-neutral-600 leading-relaxed">
        Reminders are scheduled when you open the app. They will trigger at the selected time if the condition is met.
      </p>
    </div>
  );
}
