import { useEffect } from 'react';
import { Flame } from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { useStreakStore } from '../../../stores/streakStore';

interface StreakWidgetProps {
  size: 'small' | 'medium' | 'large';
}

export default function StreakWidget({ size }: StreakWidgetProps) {
  const { user } = useAuthStore();
  const { streak, fetchStreak } = useStreakStore();

  useEffect(() => {
    if (user) fetchStreak(user.id);
  }, [user]);

  const current = streak?.current_streak ?? 0;
  const longest = streak?.longest_streak ?? 0;

  if (size === 'small') {
    return (
      <div className="flex flex-col items-center justify-center gap-1">
        <Flame size={20} className={current > 0 ? 'text-orange-400' : 'text-neutral-600'} />
        <span className={`text-lg font-bold ${current > 0 ? 'text-orange-400' : 'text-neutral-500'}`}>{current}</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${current > 0 ? 'bg-orange-500/20' : 'bg-neutral-800'}`}>
          <Flame size={20} className={current > 0 ? 'text-orange-400' : 'text-neutral-500'} />
        </div>
        <div>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold ${current > 0 ? 'text-orange-400' : 'text-neutral-400'}`}>{current}</span>
            <span className="text-xs text-neutral-500">day{current !== 1 ? 's' : ''}</span>
          </div>
          <p className="text-xs text-neutral-500">Current streak</p>
        </div>
      </div>
      <div className="flex items-center justify-between bg-neutral-800/50 rounded-xl px-3 py-2">
        <span className="text-xs text-neutral-400">Best streak</span>
        <span className="text-xs font-semibold text-white">{longest} day{longest !== 1 ? 's' : ''}</span>
      </div>
      {current === 0 && (
        <p className="text-xs text-neutral-600 mt-2 text-center">Log any activity today to start a streak</p>
      )}
    </div>
  );
}
