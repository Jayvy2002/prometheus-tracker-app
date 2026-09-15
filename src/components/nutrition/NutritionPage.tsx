import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ScanLine, ChefHat, Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import { todayStr, addDaysToDateStr, formatWeekdayShort } from '../../lib/utils';
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
import StepsTracker from './StepsTracker';
import PageTransition from '../ui/PageTransition';
import CardLink from '../ui/CardLink';
import { useClientTracking } from '../../lib/useClientTracking';
import { anyMacroField, showNutritionField } from '../../lib/clientTracking';
import { hasSentNutritionTarget } from '../../lib/coachOwnedTargets';
import { optionLabel } from '../../lib/optionLabels';
import { useCoachingStore } from '../../stores/coachingStore';
import { useRecipeStore } from '../../stores/recipeStore';
import { isSoloAthlete } from '../../lib/coachRole';
import SoloAskBar from '../solo/SoloAskBar';
import type { SoloAskContext } from '../../lib/soloAsk';
import { saveGroceryList } from '../../lib/groceryList';

export default function NutritionPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const { logs, selectedDate, setSelectedDate, fetchLogs, fetchWaterLogs, fetchOrCreateSteps, addLog, loading: nutritionLoading } = useNutritionStore();
  const tracking = useClientTracking();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const solo = isSoloAthlete(coachingRole, myCoach);
  const createRecipe = useRecipeStore(s => s.createRecipe);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [addCategory, setAddCategory] = useState<string>('breakfast');
  const [editingLog, setEditingLog] = useState<NutritionLog | null>(null);

  useEffect(() => {
    if (user) {
      fetchLogs(user.id, selectedDate);
      fetchWaterLogs(user.id, selectedDate);
      void fetchOrCreateSteps(user.id, selectedDate);
    }
  }, [user, selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const dateLabel = isToday ? t('common.today') : formatWeekdayShort(selectedDate, i18n.language);

  const askContext: Omit<SoloAskContext, 'question'> = {
    surface: 'nutrition',
    injuries: profile?.injuries_limitations ?? '',
    experience: profile?.training_experience ?? '',
    frequency: profile?.training_frequency ?? 0,
    focus: profile?.training_focus ?? '',
    programName: null,
    programExercises: [],
    recentLiftNames: [],
    calorieTarget: profile?.daily_calorie_target ?? 0,
    proteinTarget: profile?.protein_target ?? 0,
    carbsTarget: profile?.carbs_target ?? 0,
    fatTarget: profile?.fat_target ?? 0,
    consumedCalories: logs.reduce((s, l) => s + l.calories, 0),
    consumedProtein: logs.reduce((s, l) => s + l.protein, 0),
    consumedCarbs: logs.reduce((s, l) => s + l.carbs, 0),
    consumedFat: logs.reduce((s, l) => s + l.fat, 0),
    allergies: profile?.food_allergies ?? [],
    dietType: profile?.diet_type ?? 'omnivore',
    currentExerciseName: null,
    catalog: [],
    lastWeightKg: null,
    lastReps: null,
    lastRestSeconds: null,
    missedWeekday: null,
    coachName: null,
  };

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
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t('nutrition.title')}</h1>
          <p className="text-sm text-neutral-400 mt-0.5">{dateLabel}</p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAddMenu(o => !o)}
            className="min-h-11 flex items-center gap-1.5 px-3 rounded-xl bg-blue-600 text-white text-sm font-medium"
          >
            <Plus size={16} />
            {t('nutrition.add')}
          </button>
          {showAddMenu && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-neutral-800 bg-neutral-950 p-1 z-20">
              <button type="button" className="w-full text-left min-h-11 px-3 rounded-lg text-sm text-white hover:bg-neutral-800" onClick={() => { setShowAddMenu(false); handleQuickAdd(); }}>
                {t('nutrition.addFood')}
              </button>
              <button type="button" className="w-full text-left min-h-11 px-3 rounded-lg text-sm text-white hover:bg-neutral-800" onClick={() => { setShowAddMenu(false); navigate('/scanner'); }}>
                <ScanLine size={16} className="inline mr-2" />{t('nutrition.foodForm.openScanner')}
              </button>
              <button type="button" className="w-full text-left min-h-11 px-3 rounded-lg text-sm text-white hover:bg-neutral-800" onClick={() => { setShowAddMenu(false); handleReuseCategory(getTimeBasedCategory()); }}>
                {t('nutrition.reuseMeal')}
              </button>
              <button type="button" className="w-full text-left min-h-11 px-3 rounded-lg text-sm text-white hover:bg-neutral-800" onClick={() => { setShowAddMenu(false); navigate('/recipes'); }}>
                <ChefHat size={16} className="inline mr-2" />{t('nav.recipes')}
              </button>
            </div>
          )}
        </div>
      </div>

      {solo && user && (
        <SoloAskBar
          context={askContext}
          onApplyOnce={async (proposal) => {
            const meals = proposal.recipes.length > 0
              ? proposal.recipes
              : (proposal.recipe ? [proposal.recipe] : []);
            if (meals.length === 0) return;
            for (const meal of meals) {
              const result = await addLog({
                user_id: user.id,
                name: meal.name,
                calories: meal.calories,
                protein: meal.protein,
                carbs: meal.carbs,
                fat: meal.fat,
                category: meal.category,
                quantity: 1,
                unit: 'serving',
                logged_at: selectedDate,
              });
              if (result.error) return;
            }
            toast(t('nutrition.itemsCopied', { count: meals.length }));
          }}
          onSave={async (proposal) => {
            const meals = proposal.recipes.length > 0
              ? proposal.recipes
              : (proposal.recipe ? [proposal.recipe] : []);
            if (meals.length === 0 && proposal.grocery.length === 0) return;
            for (const meal of meals) {
              const saved = await createRecipe({
                user_id: user.id,
                name: meal.name,
                description: meal.description,
                servings: 1,
                calories_per_serving: meal.calories,
                protein_per_serving: meal.protein,
                carbs_per_serving: meal.carbs,
                fat_per_serving: meal.fat,
              });
              if (!saved) {
                toast(t('errors.saveFailed'), 'error');
                return;
              }
            }
            if (proposal.grocery.length > 0) {
              saveGroceryList(user.id, proposal.grocery);
            }
            toast(t(proposal.kind === 'meal_week' ? 'soloAsk.saveWeek' : 'nutrition.recipes.saved'));
          }}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <button onClick={() => shiftDate(-1)} className="p-2 text-neutral-400 hover:text-white">
          <ChevronLeft size={20} />
        </button>
        <span className="text-sm font-medium text-white">{dateLabel}</span>
        <button onClick={() => shiftDate(1)} className="p-2 text-neutral-400 hover:text-white" disabled={isToday}>
          <ChevronRight size={20} className={isToday ? 'opacity-30' : ''} />
        </button>
      </div>

      <CardLink to="/recipes" className="mb-4">
        <p className="text-sm font-medium text-white flex items-center gap-2">
          <ChefHat size={16} className="text-blue-400" />
          {t('nutrition.recipes.title')}
        </p>
        <p className="text-xs text-neutral-500 mt-1">{t('nutrition.recipes.chromeHint')}</p>
      </CardLink>

      {anyMacroField(tracking) && showTargets && (
      <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4 mb-4 animate-fade-in-scale">
        <div className="flex items-center gap-5">
          {showNutritionField(tracking, 'calories') ? (
            <ProgressRing progress={pct} size={80} strokeWidth={6} color="#2563eb">
              <div className="text-center">
                <div className="text-sm font-bold text-white leading-tight">{Math.round(totalCals)}</div>
                <div className="text-xs text-neutral-500 leading-tight">/ {target}</div>
                <div className="text-xs text-neutral-400">{t('common.kcal')}</div>
              </div>
            </ProgressRing>
          ) : null}
          <MacroSummary />
        </div>
      </div>
      )}

      {showNutritionField(tracking, 'water') && (
      <div className="animate-fade-in-up stagger-2">
      <WaterTracker />
      </div>
      )}

      {showNutritionField(tracking, 'steps') && (
      <div className="mt-3 animate-fade-in-up stagger-2">
      <StepsTracker />
      </div>
      )}

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
                label={optionLabel(t, 'meals', cat.value, cat.label)}
                logs={logs.filter(l => l.category === cat.value)}
                onAdd={() => { setAddCategory(cat.value); setShowAdd(true); }}
                onEdit={(log) => setEditingLog(log)}
                onReuse={() => handleReuseCategory(cat.value)}
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
