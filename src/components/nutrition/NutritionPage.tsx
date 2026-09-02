import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ScanLine, ChefHat, Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import { useWeightStore } from '../../stores/weightStore';
import { todayStr, addDaysToDateStr } from '../../lib/utils';
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
import AnimatedList from '../ui/AnimatedList';
import GymLoader from '../ui/GymLoader';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { useClientTracking } from '../../lib/useClientTracking';
import { anyMacroField, showNutritionField } from '../../lib/clientTracking';
import { isCoachedAthlete } from '../../lib/coachRole';
import { hasSentNutritionTarget } from '../../lib/coachOwnedTargets';
import { useCoachingStore } from '../../stores/coachingStore';

export default function NutritionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const { logs, selectedDate, setSelectedDate, fetchLogs, fetchWaterLogs, addLog, loading: nutritionLoading } = useNutritionStore();
  const { measurements } = useWeightStore();
  const tracking = useClientTracking();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const coached = isCoachedAthlete(coachingRole, myCoach);
  const [showAdd, setShowAdd] = useState(false);
  const [addCategory, setAddCategory] = useState<string>('breakfast');
  const [showAdjustment, setShowAdjustment] = useState(() => {
    const dismissed = localStorage.getItem('weeklyAdjustmentDismissed');
    if (!dismissed) return true;
    const dismissedAt = parseInt(dismissed, 10);
    return Date.now() - dismissedAt > 7 * 24 * 60 * 60 * 1000;
  });
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
  const target = profile?.daily_calorie_target ?? 0;
  const pct = target > 0 ? Math.min(100, (totalCals / target) * 100) : 0;
  const showTargets = hasSentNutritionTarget(profile);

  const shiftDate = (days: number) => {
    setSelectedDate(addDaysToDateStr(selectedDate, days));
  };

  const isToday = selectedDate === todayStr();
  const dateLabel = isToday ? t('common.today') : new Date(selectedDate + 'T12:00:00').toLocaleDateString(undefined, {
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

  const handleReuseCategory = async (category: string) => {
    if (!user) return;
    const prevStr = addDaysToDateStr(selectedDate, -1);

    const { data } = await supabase
      .from('nutrition_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('logged_at', prevStr)
      .eq('category', category);

    if (!data || data.length === 0) {
      toast(t('nutrition.nothingLoggedYesterday'));
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
    toast(t('nutrition.itemsCopied', { count: data.length }));
  };

  return (
    <PageTransition>
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">{t('nutrition.title')}</h1>
        <div className="flex gap-2">
          {!coached && (
          <button onClick={() => navigate('/recipes')} className="p-2 rounded-xl bg-neutral-900 text-neutral-400 hover:text-white transition-colors">
            <ChefHat size={18} />
          </button>
          )}
          <button onClick={() => navigate('/scanner')} className="p-2 rounded-xl bg-neutral-900 text-neutral-400 hover:text-white transition-colors">
            <ScanLine size={18} />
          </button>
          <Button onClick={handleQuickAdd} size="sm">
            <Plus size={16} />
            {t('nutrition.add')}
          </Button>
        </div>
      </div>

      {isToday && showAdjustment && hasEnoughData && (
        <WeeklyAdjustment onDismiss={() => {
          localStorage.setItem('weeklyAdjustmentDismissed', String(Date.now()));
          setShowAdjustment(false);
        }} />
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

      {anyMacroField(tracking) && showTargets && (
      <Card className="mb-4">
        <div className="flex items-center gap-5">
          {showNutritionField(tracking, 'calories') ? (
            <ProgressRing progress={pct} size={80} strokeWidth={6} color={pct > 100 ? '#f43f5e' : '#2563eb'}>
              <div className="text-center">
                <div className="text-sm font-bold text-white leading-tight">{Math.round(totalCals)}</div>
                <div className="text-[10px] text-neutral-500 leading-tight">/ {target}</div>
                <div className="text-[9px] text-neutral-400">cal</div>
              </div>
            </ProgressRing>
          ) : null}
          <MacroSummary />
        </div>
      </Card>
      )}

      {showNutritionField(tracking, 'water') && (
      <div className="animate-fade-in-up stagger-2">
      <WaterTracker />
      </div>
      )}

      <div className="mt-4">
        {nutritionLoading ? (
          <div className="flex justify-center py-10">
            <GymLoader size="sm" />
          </div>
        ) : (
          <AnimatedList className="space-y-4">
            {MEAL_CATEGORIES.map(cat => (
              <MealSection
                key={cat.value}
                category={cat.value}
                label={cat.label}
                logs={logs.filter(l => l.category === cat.value)}
                onAdd={() => { setAddCategory(cat.value); setShowAdd(true); }}
                onEdit={(log) => setEditingLog(log)}
                onReuse={() => handleReuseCategory(cat.value)}
              />
            ))}
          </AnimatedList>
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
