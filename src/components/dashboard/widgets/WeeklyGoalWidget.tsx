import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorkoutStore } from '../../../stores/workoutStore';

type WidgetSize = 'small' | 'medium' | 'large';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const TARGET = 3;

function getWeekDates(): string[] {
  const today = new Date();
  const dow = today.getDay(); // 0 = Sunday
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

export default function WeeklyGoalWidget({ size = 'large' }: { size?: WidgetSize }) {
  const { t } = useTranslation();
  const { workouts } = useWorkoutStore();
  const navigate = useNavigate();

  const weekDates = getWeekDates();
  const todayStr = new Date().toISOString().split('T')[0];
  const todayIndex = weekDates.indexOf(todayStr);

  const doneDays = weekDates.map(date =>
    workouts.some(w => w.completed && w.date?.startsWith(date))
  );

  const done = doneDays.filter(Boolean).length;
  const pct = Math.min(100, (done / TARGET) * 100);
  const isGoalMet = done >= TARGET;
  const remaining = TARGET - done;

  if (size === 'small') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1">
        <div className={`text-xl font-bold ${isGoalMet ? 'text-emerald-400' : 'text-white'}`}>
          {done}/{TARGET}
        </div>
        <div className="text-[9px] text-neutral-500">{t('widgets.weeklyGoal.sessions')}</div>
        {isGoalMet && <span className="text-[10px] text-emerald-400 animate-celebration">✓</span>}
      </div>
    );
  }

  if (size === 'medium') {
    return (
      <div className="flex items-center gap-3">
        <div className={`text-3xl font-bold tabular-nums ${isGoalMet ? 'text-emerald-400' : 'text-white'}`}>
          {done}
          <span className="text-base text-neutral-500 font-normal">/{TARGET}</span>
        </div>
        <div className="flex-1 space-y-1.5">
          <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 animate-progress-fill"
              style={{
                width: `${pct}%`,
                background: isGoalMet
                  ? 'linear-gradient(90deg, #10b981, #34d399)'
                  : 'linear-gradient(90deg, #2563eb, #3b82f6)',
              }}
            />
          </div>
          <p className="text-[11px] text-neutral-500">
            {isGoalMet
              ? t('widgets.weeklyGoal.goalAchieved')
              : t('widgets.weeklyGoal.sessionsToGo', { n: remaining })}
          </p>
        </div>
      </div>
    );
  }

  // Large
  return (
    <div>
      <div className="flex items-end gap-2 mb-3">
        <span className={`text-2xl font-bold ${isGoalMet ? 'text-emerald-400' : 'text-white'}`}>{done}</span>
        <span className="text-sm text-neutral-400 mb-0.5">/ {TARGET} {t('widgets.weeklyGoal.sessions')}</span>
        {isGoalMet && <span className="text-lg mb-0.5">🎯</span>}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden mb-4">
        <div
          className="h-full rounded-full transition-all duration-700 animate-progress-fill"
          style={{
            width: `${pct}%`,
            background: isGoalMet
              ? 'linear-gradient(90deg, #10b981, #34d399)'
              : 'linear-gradient(90deg, #2563eb, #3b82f6)',
          }}
        />
      </div>

      {/* Day dots Mon–Sun */}
      <div className="flex justify-between">
        {DAY_LABELS.map((label, i) => {
          const isPast = todayIndex === -1 || i <= todayIndex;
          const isDone = doneDays[i];
          const isToday = i === todayIndex;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className={`
                w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all
                ${isDone
                  ? isGoalMet
                    ? 'bg-emerald-500/25 text-emerald-400 ring-1 ring-emerald-500/40'
                    : 'bg-blue-600/25 text-blue-400 ring-1 ring-blue-500/40'
                  : isPast
                  ? 'bg-neutral-800/60 text-neutral-600'
                  : 'bg-neutral-900/40 text-neutral-700'
                }
                ${isToday && !isDone ? 'ring-1 ring-neutral-500' : ''}
              `}>
                {isDone ? '✓' : label}
              </div>
            </div>
          );
        })}
      </div>

      {/* CTA or celebration */}
      {isGoalMet ? (
        <div className="mt-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5 text-center animate-fade-in-scale">
          <span className="text-xs font-semibold text-emerald-400">{t('widgets.weeklyGoal.goalAchieved')}</span>
        </div>
      ) : remaining > 0 && todayIndex < 6 ? (
        <button
          onClick={() => navigate('/workout/new')}
          className="mt-3 w-full text-xs text-blue-400 hover:text-blue-300 font-medium text-center transition-colors"
        >
          {t('widgets.weeklyGoal.sessionsLeft', { n: remaining })}
        </button>
      ) : null}
    </div>
  );
}
