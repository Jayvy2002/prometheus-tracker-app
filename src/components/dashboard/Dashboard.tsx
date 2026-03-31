import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LayoutGrid, Check, Flame, Droplets, Dumbbell, TrendingUp, Footprints, Activity, LineChart } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import { useWeightStore } from '../../stores/weightStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { todayStr } from '../../lib/utils';
import type { DashboardWidget, WidgetType } from '../../lib/types';
import DashboardGrid from './DashboardGrid';
import PageTransition from '../ui/PageTransition';

const WIDGET_CATALOG: {
  type: WidgetType;
  label: string;
  description: string;
  defaultSize: DashboardWidget['size'];
  icon: typeof Flame;
  color: string;
}[] = [
  { type: 'calories', label: 'Calories', description: 'Daily calorie intake and goal', defaultSize: 'medium', icon: Flame, color: 'text-orange-400' },
  { type: 'weight', label: 'Weight', description: 'Weight trend over time', defaultSize: 'large', icon: TrendingUp, color: 'text-blue-400' },
  { type: 'water', label: 'Water', description: 'Daily hydration tracking', defaultSize: 'medium', icon: Droplets, color: 'text-cyan-400' },
  { type: 'macros', label: 'Macros', description: 'Protein, carbs and fat', defaultSize: 'medium', icon: Activity, color: 'text-emerald-400' },
  { type: 'workout_volume', label: 'Workout Volume', description: 'Weekly training activity', defaultSize: 'large', icon: Dumbbell, color: 'text-violet-400' },
  { type: 'steps', label: 'Steps', description: 'Daily step count', defaultSize: 'medium', icon: Footprints, color: 'text-amber-400' },
  { type: 'exercise_progress', label: 'Routine Tonnage', description: 'Track strength over time', defaultSize: 'large', icon: LineChart, color: 'text-rose-400' },
  { type: 'streak', label: 'Streak', description: 'Activity consistency streak', defaultSize: 'medium', icon: Flame, color: 'text-orange-500' },
];

function getGreeting(firstName: string, hour: number): string {
  const timeGreet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${timeGreet}, ${firstName}!`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { profile, updateProfile } = useProfileStore();
  const { fetchLogs, fetchWaterLogs } = useNutritionStore();
  const { fetchMeasurements } = useWeightStore();
  const { fetchWorkouts } = useWorkoutStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const today = todayStr();
    fetchLogs(user.id, today);
    fetchWaterLogs(user.id, today);
    fetchMeasurements(user.id);
    fetchWorkouts(user.id);
  }, [user]);

  const widgets = profile?.dashboard_layout ?? [];

  const saveWidgets = useCallback(async (updated: DashboardWidget[]) => {
    if (!user || !profile) return;
    await updateProfile(user.id, { dashboard_layout: updated });
  }, [user, profile, updateProfile]);

  const addWidget = async (type: WidgetType) => {
    const catalog = WIDGET_CATALOG.find(w => w.type === type);
    const newWidget: DashboardWidget = {
      id: crypto.randomUUID(),
      type,
      title: catalog?.label ?? type,
      config: {},
      size: catalog?.defaultSize ?? 'large',
      order: widgets.length,
    };
    await saveWidgets([...widgets, newWidget]);
    setShowAdd(false);
  };

  const enterEditMode = useCallback(() => {
    setEditMode(true);
  }, []);

  const exitEditMode = useCallback(() => {
    setEditMode(false);
  }, []);

  useEffect(() => {
    if (!showAdd) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowAdd(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAdd]);

  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = getGreeting(firstName, hour);

  const alreadyAddedTypes = new Set(widgets.map(w => w.type));

  return (
    <>
    <PageTransition>
      <div className="px-4 pt-6 pb-8 relative">
        <div className="flex items-center justify-between mb-4 animate-fade-in-down">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { if (!editMode) navigate('/profile'); }}
              className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-neutral-800 hover:ring-blue-500 transition-all active:scale-95"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-blue-600/20 flex items-center justify-center text-blue-400 text-sm font-bold">
                  {firstName[0]?.toUpperCase() || 'U'}
                </div>
              )}
            </button>
            <div>
              <p className="text-neutral-400 text-xs">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <p className="text-sm font-medium text-white leading-snug">
                {greeting}
              </p>
            </div>
          </div>

          {editMode ? (
            <button
              onClick={exitEditMode}
              className="animate-done-btn-in flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-black text-sm font-semibold hover:bg-neutral-100 active:scale-95 transition-all shadow-lg"
            >
              <Check size={15} strokeWidth={2.5} />
              Done
            </button>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all flex items-center justify-center"
            >
              <Plus size={18} className="text-white" />
            </button>
          )}
        </div>

        {widgets.length > 0 ? (
          <div className="animate-fade-in-up stagger-2">
            <DashboardGrid
              widgets={widgets}
              editMode={editMode}
              onSave={saveWidgets}
              onEnterEditMode={enterEditMode}
            />
          </div>
        ) : (
          <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4 text-center py-12 animate-fade-in-up stagger-2">
            <LayoutGrid className="mx-auto mb-3 text-neutral-600" size={32} />
            <p className="text-neutral-400 mb-1">Your dashboard is empty</p>
            <p className="text-neutral-600 text-sm mb-4">Tap + to add your first widget</p>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black rounded-full text-sm font-semibold hover:bg-neutral-100 active:scale-95 transition-all"
            >
              <Plus size={15} />
              Add Widget
            </button>
          </div>
        )}

        {editMode && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-all text-sm text-white font-medium"
            >
              <Plus size={16} />
              Add Widget
            </button>
          </div>
        )}
      </div>

      </PageTransition>

      {showAdd && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-modal-overlay"
            onClick={() => setShowAdd(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center px-4 pointer-events-none">
            <div
              ref={sheetRef}
              className="pointer-events-auto w-full max-w-sm max-h-[75vh] bg-neutral-950 rounded-3xl border border-neutral-800/60 animate-modal-pop flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
                <h2 className="text-white font-semibold text-base">Add Widget</h2>
                <button
                  onClick={() => setShowAdd(false)}
                  className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center hover:bg-neutral-700 active:scale-95 transition-all"
                >
                  <span className="text-neutral-400 text-lg leading-none">&times;</span>
                </button>
              </div>

              <div className="overflow-y-auto flex-1 px-4 pb-5">
                <div className="grid grid-cols-2 gap-3">
                  {WIDGET_CATALOG.map(wt => {
                    const alreadyAdded = alreadyAddedTypes.has(wt.type);
                    const Icon = wt.icon;
                    return (
                      <button
                        key={wt.type}
                        onClick={() => !alreadyAdded && addWidget(wt.type)}
                        disabled={alreadyAdded}
                        className={`relative text-left p-4 rounded-2xl border transition-all active:scale-95
                          ${alreadyAdded
                            ? 'bg-neutral-900/40 border-neutral-800/40 opacity-50 cursor-not-allowed'
                            : 'bg-neutral-900 border-neutral-800/60 hover:border-neutral-700 hover:bg-neutral-800/80'
                          }`}
                      >
                        <div className={`mb-2.5 ${wt.color}`}>
                          <Icon size={22} />
                        </div>
                        <p className="text-white font-medium text-sm leading-tight">{wt.label}</p>
                        <p className="text-neutral-500 text-xs mt-0.5 leading-tight">{wt.description}</p>
                        {alreadyAdded && (
                          <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-neutral-700 flex items-center justify-center">
                            <Check size={11} className="text-neutral-400" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
