import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ScanLine, ChefHat, Plus, Sparkles } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import { todayStr, addDaysToDateStr, formatWeekdayShort } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { toast, toastWithUndo } from '../ui/Toast';
import { MEAL_CATEGORIES } from '../../lib/constants';
import type { NutritionLog } from '../../lib/types';
import NutritionRings from './NutritionRings';
import MealSection from './MealSection';
import FoodForm from './FoodForm';
import EditFoodModal from './EditFoodModal';
import WaterTracker from './WaterTracker';
import PageTransition from '../ui/PageTransition';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { useClientTracking } from '../../lib/useClientTracking';
import { showNutritionField } from '../../lib/clientTracking';
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
  const { logs, selectedDate, setSelectedDate, fetchLogs, fetchWaterLogs, fetchOrCreateSteps, addLog, deleteLog, loading: nutritionLoading } = useNutritionStore();
  const tracking = useClientTracking();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const solo = isSoloAthlete(coachingRole, myCoach);
  const createRecipe = useRecipeStore(s => s.createRecipe);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [addCategory, setAddCategory] = useState<string>('breakfast');
  const [editingLog, setEditingLog] = useState<NutritionLog | null>(null);
  const [reuseOpen, setReuseOpen] = useState(false);
  const [reuseCategory, setReuseCategory] = useState('breakfast');
  const [reuseDate, setReuseDate] = useState(() => addDaysToDateStr(todayStr(), -1));

  useEffect(() => {
    if (user) {
      fetchLogs(user.id, selectedDate);
      fetchWaterLogs(user.id, selectedDate);
      void fetchOrCreateSteps(user.id, selectedDate);
    }
  }, [user, selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchParams.get('add') === '1') {
      const hour = new Date().getHours();
      setAddCategory(hour < 11 ? 'breakfast' : hour < 14 ? 'lunch' : hour < 18 ? 'snack' : 'dinner');
      setShowAdd(true);
      setSearchParams({});
    }
  }, [searchParams]);

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

  const handleReuseCategory = async (category: string, fromDate?: string) => {
    if (!user) return;
    const prevStr = fromDate || addDaysToDateStr(selectedDate, -1);
    if (prevStr === selectedDate) {
      toast(t('nutrition.nothingLoggedYesterday'));
      return;
    }

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

    const ids: string[] = [];
    for (const l of data) {
      const saved = await addLog({
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
      if (saved.id) ids.push(saved.id);
    }
    toastWithUndo(t('nutrition.itemsCopied', { count: ids.length }), () => {
      for (const id of ids) void deleteLog(id);
    });
  };

  const handleCopyDay = async (fromDate: string) => {
    if (!user || fromDate === selectedDate) {
      toast(t('nutrition.nothingLoggedYesterday'));
      return;
    }
    const { data } = await supabase
      .from('nutrition_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('logged_at', fromDate);
    if (!data || data.length === 0) {
      toast(t('nutrition.nothingLoggedYesterday'));
      return;
    }
    const ids: string[] = [];
    for (const l of data) {
      const saved = await addLog({
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
      if (saved.id) ids.push(saved.id);
    }
    toastWithUndo(t('nutrition.itemsCopied', { count: ids.length }), () => {
      for (const id of ids) void deleteLog(id);
    });
  };

  const openReuse = (category: string) => {
    setReuseCategory(category);
    setReuseDate(addDaysToDateStr(selectedDate, -1));
    setReuseOpen(true);
  };

  const scannerHref = (category: string) =>
    `/scanner?date=${encodeURIComponent(selectedDate)}&category=${encodeURIComponent(category)}`;

  return (
    <PageTransition>
    <div className="px-4 pt-6">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t('nutrition.title')}</h1>
        </div>
        <div className="relative flex items-center gap-2">
          {solo && user && (
            <button
              type="button"
              onClick={() => setAskOpen(o => !o)}
              aria-label={t('soloAsk.label')}
              aria-expanded={askOpen}
              title={t('soloAsk.label')}
              className={`min-h-11 min-w-11 flex items-center justify-center rounded-xl ${askOpen ? 'bg-blue-600/20 text-blue-300' : 'bg-neutral-900 text-neutral-400'}`}
            >
              <Sparkles size={16} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAddMenu(o => !o)}
            className="min-h-11 flex items-center gap-1.5 px-3 rounded-xl bg-blue-600 text-white text-sm font-medium"
          >
            <Plus size={16} />
            {t('nutrition.add')}
          </button>
          {showAddMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-neutral-800 bg-neutral-950 p-1 z-20">
              <button type="button" className="w-full text-left min-h-11 px-3 rounded-lg text-sm text-white hover:bg-neutral-800" onClick={() => { setShowAddMenu(false); handleQuickAdd(); }}>
                {t('nutrition.addFood')}
              </button>
              <button type="button" className="w-full text-left min-h-11 px-3 rounded-lg text-sm text-white hover:bg-neutral-800" onClick={() => { setShowAddMenu(false); navigate(scannerHref(getTimeBasedCategory())); }}>
                <ScanLine size={16} className="inline mr-2" />{t('nutrition.foodForm.openScanner')}
              </button>
              <button type="button" className="w-full text-left min-h-11 px-3 rounded-lg text-sm text-white hover:bg-neutral-800" onClick={() => { setShowAddMenu(false); openReuse(getTimeBasedCategory()); }}>
                {t('nutrition.reuseMeal')}
              </button>
              <button type="button" className="w-full text-left min-h-11 px-3 rounded-lg text-sm text-white hover:bg-neutral-800" onClick={() => { setShowAddMenu(false); navigate('/recipes'); }}>
                <ChefHat size={16} className="inline mr-2" />{t('nav.recipes')}
              </button>
            </div>
          )}
        </div>
      </div>

      {askOpen && solo && user && (
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
        <button type="button" aria-label={t('common.previous')} onClick={() => shiftDate(-1)} className="min-h-11 min-w-11 text-neutral-300">
          <ChevronLeft size={22} className="mx-auto" />
        </button>
        <span className="text-sm font-medium text-white">{dateLabel}</span>
        <button type="button" aria-label={t('common.next')} onClick={() => shiftDate(1)} className="min-h-11 min-w-11 text-neutral-300" disabled={isToday}>
          <ChevronRight size={22} className={`mx-auto ${isToday ? 'opacity-30' : ''}`} />
        </button>
      </div>

      <NutritionRings className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4 mb-4 animate-fade-in-scale" />

      {showNutritionField(tracking, 'water') && (
      <div className="animate-fade-in-up stagger-2">
      <WaterTracker />
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
                onReuse={() => openReuse(cat.value)}
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

      <Modal open={reuseOpen} onClose={() => setReuseOpen(false)} title={t('nutrition.reuseMeal')}>
        <p className="text-sm text-neutral-400 mb-3">{t('nutrition.reuseFromDate')}</p>
        <input
          type="date"
          data-reuse-date="true"
          max={selectedDate}
          value={reuseDate}
          onChange={e => setReuseDate(e.target.value)}
          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white mb-3"
        />
        <Button
          type="button"
          className="w-full mb-2"
          onClick={() => {
            void handleReuseCategory(reuseCategory, reuseDate);
            setReuseOpen(false);
          }}
        >
          {t('nutrition.reuseFromDate')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => {
            const yesterday = addDaysToDateStr(selectedDate, -1);
            setReuseDate(yesterday);
            void handleReuseCategory(reuseCategory, yesterday);
            setReuseOpen(false);
          }}
        >
          {t('nutrition.copyFromYesterday')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full mt-2"
          onClick={() => {
            void handleCopyDay(addDaysToDateStr(selectedDate, -1));
            setReuseOpen(false);
          }}
        >
          {t('nutrition.copyWholeDay')}
        </Button>
      </Modal>
    </div>
    </PageTransition>
  );
}
