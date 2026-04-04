import { useNavigate } from 'react-router-dom';
import { Minus, GripVertical } from 'lucide-react';
import type { DashboardWidget, WidgetType } from '../../lib/types';
import CaloriesWidget from './widgets/CaloriesWidget';
import WeightWidget from './widgets/WeightWidget';
import WaterWidget from './widgets/WaterWidget';
import MacrosWidget from './widgets/MacrosWidget';
import WorkoutVolumeWidget from './widgets/WorkoutVolumeWidget';
import StepsWidget from './widgets/StepsWidget';
import RoutineTonnageWidget from './widgets/RoutineTonnageWidget';
import StreakWidget from './widgets/StreakWidget';
import WeeklyGoalWidget from './widgets/WeeklyGoalWidget';

const RESIZABLE_TYPES: WidgetType[] = ['calories', 'water', 'macros', 'steps', 'streak', 'weekly_goal'];

const WIDGET_ROUTES: Partial<Record<WidgetType, string>> = {
  calories: '/nutrition',
  water: '/nutrition',
  macros: '/nutrition',
  weight: '/weight',
  workout_volume: '/workout',
  exercise_progress: '/exercise-progress',
  weekly_goal: '/workout',
};

const SIZE_LABELS: Record<DashboardWidget['size'], string> = {
  small: 'S',
  medium: 'M',
  large: 'L',
};

// SVG ring constants
const RING_RADIUS = 24;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

interface WidgetCardProps {
  widget: DashboardWidget;
  editMode: boolean;
  isDragging?: boolean;
  droppedId?: string | null;
  longPressProgress?: number;
  onRemove: () => void;
  onCycleSize: () => void;
  onPointerDown?: (e: React.MouseEvent) => void;
  onPointerUp?: () => void;
  onPointerLeave?: () => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: () => void;
}

export default function WidgetCard({
  widget,
  editMode,
  isDragging,
  longPressProgress = 0,
  onRemove,
  onCycleSize,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: WidgetCardProps) {
  const navigate = useNavigate();
  const resizable = RESIZABLE_TYPES.includes(widget.type);
  const isSmall = widget.size === 'small';
  const route = WIDGET_ROUTES[widget.type];
  const isLongPressing = longPressProgress > 0;

  const handleClick = () => {
    if (editMode) return;
    if (route) navigate(route);
  };

  const renderWidget = () => {
    switch (widget.type) {
      case 'calories': return <CaloriesWidget size={widget.size} />;
      case 'weight': return <WeightWidget />;
      case 'water': return <WaterWidget size={widget.size} />;
      case 'macros': return <MacrosWidget size={widget.size} />;
      case 'workout_volume': return <WorkoutVolumeWidget />;
      case 'steps': return <StepsWidget size={widget.size} />;
      case 'exercise_progress': return <RoutineTonnageWidget />;
      case 'streak': return <StreakWidget size={widget.size} />;
      case 'weekly_goal': return <WeeklyGoalWidget size={widget.size} />;
      default: return null;
    }
  };

  return (
    <div
      className={`relative select-none ${isSmall ? 'aspect-square' : ''}`}
      onMouseDown={onPointerDown}
      onMouseUp={onPointerUp}
      onMouseLeave={onPointerLeave}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        onClick={handleClick}
        className={`
          relative bg-neutral-900/60 backdrop-blur-sm border rounded-2xl overflow-hidden w-full h-full
          ${isSmall ? 'p-3 flex flex-col' : 'p-4'}
          ${isDragging ? 'opacity-0' : 'opacity-100'}
          ${editMode
            ? 'border-blue-500/30 cursor-grab active:cursor-grabbing shadow-[0_0_0_1px_rgba(59,130,246,0.15)]'
            : 'border-neutral-800/50'}
          ${!editMode && route ? 'cursor-pointer hover:border-neutral-700/70 hover:bg-neutral-900/80 active:scale-[0.98]' : ''}
          transition-all duration-200
        `}
        style={editMode ? { boxShadow: '0 0 0 1px rgba(59,130,246,0.1), 0 4px 20px rgba(0,0,0,0.3)' } : undefined}
      >
        {/* Widget header — medium and large */}
        {!isSmall && (
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              {editMode && (
                <GripVertical size={14} className="text-neutral-600 shrink-0 -ml-1" />
              )}
              <h3 className="text-sm font-medium text-neutral-400 leading-tight">{widget.title}</h3>
            </div>

            {editMode && resizable && (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onCycleSize(); }}
                className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors text-[11px] font-semibold"
              >
                {(['S', 'M', 'L'] as const).map((s) => (
                  <span
                    key={s}
                    className={`w-5 h-5 flex items-center justify-center rounded-full transition-all duration-150
                      ${SIZE_LABELS[widget.size] === s ? 'bg-white text-black scale-110' : 'text-neutral-500'}`}
                  >
                    {s}
                  </span>
                ))}
              </button>
            )}

            {!editMode && route && (
              <svg width="14" height="14" viewBox="0 0 14 14" className="text-neutral-600 shrink-0">
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            )}
          </div>
        )}

        {/* Small widget title */}
        {isSmall && !editMode && (
          <div className="text-[10px] text-neutral-500 text-center mb-0.5 truncate">{widget.title}</div>
        )}

        {/* Small widget resize control */}
        {isSmall && editMode && resizable && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onCycleSize(); }}
            className="absolute bottom-1.5 right-1.5 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-neutral-800/90 cursor-pointer hover:bg-neutral-700 transition-colors"
          >
            {(['S', 'M', 'L'] as const).map((s) => (
              <span
                key={s}
                className={`w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-bold transition-all
                  ${SIZE_LABELS[widget.size] === s ? 'bg-white text-black' : 'text-neutral-500'}`}
              >
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Widget content */}
        <div className={isSmall ? 'flex-1 flex flex-col justify-center' : ''}>
          {renderWidget()}
        </div>

        {/* Long press progress ring overlay */}
        {isLongPressing && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 rounded-2xl"
            style={{ background: `rgba(0,0,0,${Math.min(0.45, longPressProgress * 0.55)})` }}
          >
            <svg width="64" height="64" viewBox="0 0 64 64">
              {/* Track */}
              <circle
                cx="32" cy="32" r={RING_RADIUS}
                fill="none"
                stroke="rgba(59,130,246,0.18)"
                strokeWidth="3.5"
              />
              {/* Progress arc */}
              <circle
                cx="32" cy="32" r={RING_RADIUS}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={RING_CIRC}
                strokeDashoffset={RING_CIRC * (1 - longPressProgress)}
                transform="rotate(-90 32 32)"
                style={{
                  filter: 'drop-shadow(0 0 5px rgba(59,130,246,0.8))',
                  transition: 'stroke-dashoffset 0.04s linear',
                }}
              />
            </svg>
          </div>
        )}
      </div>

      {/* Remove button — only in edit mode */}
      {editMode && (
        <button
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
          onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); }}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="animate-badge-pop absolute -top-2 -left-2 z-20 w-6 h-6 rounded-full bg-red-500 hover:bg-red-400 active:scale-90 transition-all flex items-center justify-center shadow-lg shadow-red-900/40"
          style={{ border: '2px solid rgba(0,0,0,0.8)' }}
        >
          <Minus size={12} strokeWidth={3} className="text-white" />
        </button>
      )}
    </div>
  );
}
