import { useNavigate } from 'react-router-dom';
import { Minus, ChevronRight } from 'lucide-react';
import type { DashboardWidget, WidgetType } from '../../lib/types';
import CaloriesWidget from './widgets/CaloriesWidget';
import WeightWidget from './widgets/WeightWidget';
import WaterWidget from './widgets/WaterWidget';
import MacrosWidget from './widgets/MacrosWidget';
import WorkoutVolumeWidget from './widgets/WorkoutVolumeWidget';
import StepsWidget from './widgets/StepsWidget';
import RoutineTonnageWidget from './widgets/RoutineTonnageWidget';
import StreakWidget from './widgets/StreakWidget';

const RESIZABLE_TYPES: WidgetType[] = ['calories', 'water', 'macros', 'steps', 'streak'];

const WIDGET_ROUTES: Partial<Record<WidgetType, string>> = {
  calories: '/nutrition',
  water: '/nutrition',
  macros: '/nutrition',
  weight: '/weight',
  workout_volume: '/workout',
  exercise_progress: '/exercise-progress',
};

const SIZE_LABELS: Record<DashboardWidget['size'], string> = {
  small: 'S',
  medium: 'M',
  large: 'L',
};

interface WidgetCardProps {
  widget: DashboardWidget;
  editMode: boolean;
  isDragging?: boolean;
  droppedId?: string | null;
  onRemove: () => void;
  onCycleSize: () => void;
  onPointerDown?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: () => void;
}

export default function WidgetCard({
  widget,
  editMode,
  isDragging,
  onRemove,
  onCycleSize,
  onPointerDown,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: WidgetCardProps) {
  const navigate = useNavigate();
  const resizable = RESIZABLE_TYPES.includes(widget.type);
  const isSmall = widget.size === 'small';
  const route = WIDGET_ROUTES[widget.type];

  const handleClick = (_e: React.MouseEvent) => {
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
      default: return null;
    }
  };

  return (
    <div
      className={`relative select-none
        ${isSmall ? 'aspect-square' : ''}
      `}
      onMouseDown={onPointerDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        onClick={handleClick}
        className={`relative bg-neutral-900/60 backdrop-blur-sm border rounded-2xl overflow-hidden w-full h-full
          ${isSmall ? 'p-3 flex flex-col' : 'p-4'}
          ${isDragging ? 'opacity-0' : 'opacity-100'}
          ${editMode ? 'border-neutral-700/60 cursor-grab active:cursor-grabbing' : 'border-neutral-800/50'}
          ${!editMode && route ? 'cursor-pointer hover:border-neutral-700/70 hover:bg-neutral-900/80 active:scale-[0.98]' : ''}
          transition-colors duration-150`}
      >
        {!isSmall && (
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-neutral-400 leading-tight">{widget.title}</h3>
            {editMode && resizable && (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onCycleSize(); }}
                className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors text-[11px] font-semibold"
              >
                {['S', 'M', 'L'].map((s) => (
                  <span
                    key={s}
                    className={`w-5 h-5 flex items-center justify-center rounded-full transition-colors
                      ${SIZE_LABELS[widget.size] === s ? 'bg-white text-black' : 'text-neutral-500'}`}
                  >
                    {s}
                  </span>
                ))}
              </button>
            )}
            {!editMode && route && (
              <ChevronRight size={14} className="text-neutral-600 flex-shrink-0" />
            )}
          </div>
        )}

        {isSmall && !editMode && (
          <div className="text-[10px] text-neutral-500 text-center mb-0.5 truncate">{widget.title}</div>
        )}

        {isSmall && editMode && resizable && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onCycleSize(); }}
            className="absolute bottom-1.5 right-1.5 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-neutral-800/90 cursor-pointer"
          >
            {['S', 'M', 'L'].map((s) => (
              <span
                key={s}
                className={`w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-bold transition-colors
                  ${SIZE_LABELS[widget.size] === s ? 'bg-white text-black' : 'text-neutral-500'}`}
              >
                {s}
              </span>
            ))}
          </div>
        )}

        <div className={isSmall ? 'flex-1 flex flex-col justify-center' : ''}>
          {renderWidget()}
        </div>
      </div>

      {editMode && (
        <button
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
          onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); }}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="animate-badge-pop absolute -top-2 -left-2 z-20 w-6 h-6 rounded-full bg-red-500 hover:bg-red-400 active:scale-90 transition-all flex items-center justify-center shadow-lg shadow-red-900/40"
          style={{ border: '2px solid #000' }}
        >
          <Minus size={12} strokeWidth={3} className="text-white" />
        </button>
      )}
    </div>
  );
}
