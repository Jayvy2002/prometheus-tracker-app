import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Flame } from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { useStreakStore } from '../../../stores/streakStore';

interface StreakWidgetProps {
  size: 'small' | 'medium' | 'large';
}

export default function StreakWidget({ size }: StreakWidgetProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { streak, fetchStreak } = useStreakStore();

  useEffect(() => {
    if (user) fetchStreak(user.id);
  }, [user]);

  const current = streak?.current_streak ?? 0;
  const longest = streak?.longest_streak ?? 0;
  const isActive = current > 0;
  const isOnFire = current >= 7;

  if (size === 'small') {
    return (
      <div className="flex flex-col items-center justify-center gap-1">
        <Flame
          size={20}
          className={`${isActive ? 'text-orange-400' : 'text-neutral-600'} ${isOnFire ? 'animate-float' : ''}`}
        />
        <span className={`text-lg font-bold ${isActive ? 'text-orange-400' : 'text-neutral-500'}`}>{current}</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300
          ${isActive ? 'bg-orange-500/20' : 'bg-neutral-800'}
          ${isOnFire ? 'animate-glow-pulse-orange' : ''}`}
        >
          <Flame
            size={20}
            className={`${isActive ? 'text-orange-400' : 'text-neutral-500'} ${isOnFire ? 'animate-float' : ''}`}
          />
        </div>
        <div>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold transition-colors duration-500
              ${current >= 30 ? 'text-yellow-300' :
                current >= 14 ? 'text-orange-300' :
                current >= 7  ? 'text-orange-400' :
                isActive      ? 'text-orange-400' : 'text-neutral-400'}`}>
              {current}
            </span>
            <span className="text-xs text-neutral-500">{current !== 1 ? t('widgets.streak.days') : t('widgets.streak.day')}</span>
          </div>
          <p className="text-xs text-neutral-500">{t('widgets.streak.currentStreak')}</p>
        </div>

        {/* Fire badge for long streaks */}
        {current >= 7 && (
          <div className="ml-auto flex items-center gap-1 bg-orange-500/15 border border-orange-500/25 rounded-lg px-2 py-1 animate-badge-pop">
            <Flame size={10} className="text-orange-400" />
            <span className="text-[10px] font-bold text-orange-400">
              {current >= 30 ? t('widgets.streak.legend') : current >= 14 ? t('widgets.streak.onFire') : t('widgets.streak.hot')}
            </span>
          </div>
        )}
      </div>

      {/* Progress bar toward next milestone */}
      {isActive && (
        <div className="mb-2">
          <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full animate-progress-fill"
              style={{ width: `${Math.min(100, (current % 7) / 7 * 100 || 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-neutral-600 mt-1 text-right">
            {current % 7 === 0 ? t('widgets.streak.weekComplete') : t('widgets.streak.daysToNextWeek', { n: 7 - (current % 7) })}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between bg-neutral-800/50 rounded-xl px-3 py-2">
        <span className="text-xs text-neutral-400">{t('widgets.streak.bestStreak')}</span>
        <div className="flex items-center gap-1">
          {longest >= current && current > 0 && <span className="text-[10px] text-amber-400">🏆</span>}
          <span className="text-xs font-semibold text-white">{longest} {longest !== 1 ? t('widgets.streak.days') : t('widgets.streak.day')}</span>
        </div>
      </div>

      {!isActive && (
        <p className="text-xs text-neutral-600 mt-2 text-center">{t('widgets.streak.startStreak')}</p>
      )}
    </div>
  );
}
