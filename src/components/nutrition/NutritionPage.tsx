import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ScanLine, ChefHat, Plus, RotateCcw } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import { useWeightStore } from '../../stores/weightStore';
import { todayStr } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { toast } from '../ui/Toast';
import { MEAL_CATEGORIES } from '../../lib/constants';
import type { NutritionLog } from '../../lib/types';
import ProgressRing from '../ui/ProgressRing';
import MacroSummary from './MacroSummary';
import MealSection from './MealSection';
import FoodForm from './FoodForm';
import EditFoodModal from './EditFoodModal';
import WaterTracker from './WaterTracker';
import WeeklyAdjustment from './WeeklyAdjustment';
import PageTransition from '../ui/PageTransition';

export default function NutritionPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const { logs, selectedDate, setSelectedDate, fetchLogs, fetchWaterLogs, addLog, loading: nutritionLoading } = useNutritionStore();
  const { measurements } = useWeightStore();
  const [showAdd, setShowAdd] = useState(false);
  const [addCategory, setAddCategory] = useState<string>('breakfast');
  const [showAdjustment, setShowAdjustment] = useState(true);
  const [editingLog, setEditingLog] = useState<NutritionLog | null>(null);

  useEffect(() => {
    if (user) {
      fetchLogs(user.id, selectedDate);
      fetchWaterLogs(user.id, selectedDate);
    }
  }, [user, selectedDate]);

  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setAddCategory('breakfast');
      setShowAdd(true);
      setSearchParams({});
    }
  }, [searchParams]);

  const totalCals = logs.reduce((s, l) => s + l.calories, 0);
  const target = profile?.daily_calorie_target ?? 2000;
  const pct = Math.min(100, (totalCals / target) * 100);

  const shiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const isToday = selectedDate === todayStr();
  const dateLabel = isToday ? 'Today' : new Date(selectedDate).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  const hasEnoughData = measurements.length >= 7;

  const getTimeBasedCategory = () => {
    const hour = new Date().getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 14) return 'lunch';
    if (hour < 18) return 'snack';
    return 'dinner';
  };

  const handleQuickAdd = () => {
    setAddCategory(getTimeBasedCategory());
    setShowAdd(true);
  };

  const handleReuseYesterday = async () => {
    if (!user) return;
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    const prevStr = prev.toISOString().split('T')[0];

    const { data } = await supabase
      .from('nutrition_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('logged_at', prevStr);

    if (!data || data.length === 0) {
      toast('No meals logged the previous day');
      return;
    }

    for (const l of data) {
      await addLog({
        user_id: user.id,
        food_product_id: l.food_product_id ?? null,
        name: l.name,
        calories: l.calories,
        protein: l.protein,
        carbs: l.carbs,
        fat: l.fat,
        category: l.category,
        quantity: l.quantity,
        unit: l.unit,
        logged_at: selectedDate,
      });
    }
    toast(`${data.length} meal${data.length > 1 ? 's' : ''} copied from previous day`);
  };

  return (
    <PageTransition>
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Nutrition</h1>
        <div className="flex gap-2">
          <button
            onClick={handleReuseYesterday}
            title="Reuse previous day's meals"
            className="p-2 rounded-xl bg-neutral-900 text-neutral-400 hover:text-white transition-colors"
          >
            <RotateCcw size={18} />
          </button>
          <button onClick={() => navigate('/recipes')} className="p-2 rounded-xl bg-neutral-900 text-neutral-400 hover:text-white transition-colors">
            <ChefHat size={18} />
          </button>
          <button onClick={() => navigate('/scanner')} className="p-2 rounded-xl bg-neutral-900 text-neutral-400 hover:text-white transition-colors">
            <ScanLine size={18} />
          </button>
          <button
            onClick={handleQuickAdd}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            Add
          </button>
        </div>
      </div>

      {isToday && showAdjustment && hasEnoughData && (
        <WeeklyAdjustment onDismiss={() => setShowAdjustment(false)} />
      )}

      <div className="flex items-center justify-between mb-6">
        <button onClick={() => shiftDate(-1)} className="p-2 text-neutral-400 hover:text-white">
          <ChevronLeft size={20} />
        </button>
        <span className="text-sm font-medium text-white">{dateLabel}</span>
        <button onClick={() => shiftDate(1)} className="p-2 text-neutral-400 hover:text-white" disabled={isToday}>
          <ChevronRight size={20} className={isToday ? 'opacity-30' : ''} />
        </button>
      </div>

      <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4 mb-4 animate-fade-in-scale">
        <div className="flex items-center gap-5">
          <ProgressRing progress={pct} size={80} strokeWidth={6} color={pct > 100 ? '#f43f5e' : '#2563eb'}>
            <div className="text-center">
              <div className="text-sm font-bold text-white leading-tight">{Math.round(totalCals)}</div>
              <div className="text-[10px] text-neutral-500 leading-tight">/ {target}</div>
              <div className="text-[9px] text-neutral-400">cal</div>
            </div>
          </ProgressRing>
          <MacroSummary />
        </div>
        <div className="mt-3 pt-3 border-t border-neutral-800/50 flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                backgroundColor: pct > 100 ? '#f43f5e' : pct >= 95 ? '#10b981' : '#2563eb',
              }}
            />
          </div>
          <span className="text-xs shrink-0">
            {pct > 100
              ? <span className="text-rose-400">+{Math.round(totalCals - target)} over</span>
              : pct >= 95
              ? <span className="text-emerald-400">Goal reached!</span>
              : <span className="text-neutral-400">{Math.round(target - totalCals)} remaining</span>
            }
          </span>
        </div>
      </div>

      <div className="animate-fade-in-up stagger-2">
      <WaterTracker />
      </div>

      <div className="mt-4 space-y-4">
        {nutritionLoading ? (
          <>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4 animate-pulse">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-4 bg-neutral-800 rounded-md w-24" />
                  <div className="h-3 bg-neutral-800/70 rounded-md w-16" />
                </div>
                <div className="space-y-2">
                  <div className="h-10 bg-neutral-800/50 rounded-xl w-full" />
                  <div className="h-10 bg-neutral-800/50 rounded-xl w-full" />
                </div>
              </div>
            ))}
          </>
        ) : (
          MEAL_CATEGORIES.map((cat, i) => (
            <div key={cat.value} className="animate-fade-in-up" style={{ animationDelay: `${(i + 3) * 60}ms` }}>
              <MealSection
                category={cat.value}
                label={cat.label}
                logs={logs.filter(l => l.category === cat.value)}
                onAdd={() => { setAddCategory(cat.value); setShowAdd(true); }}
                onEdit={(log) => setEditingLog(log)}
              />
            </div>
          ))
        )}
      </div>

      {showAdd && (
        <FoodForm
          category={addCategory}
          date={selectedDate}
          onClose={() => setShowAdd(false)}
        />
      )}

      {editingLog && (
        <EditFoodModal log={editingLog} onClose={() => setEditingLog(null)} />
      )}
    </div>
    </PageTransition>
  );
}
