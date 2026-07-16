import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Dumbbell, Apple, Scale, Brain, Target,
  ChevronRight, Flame, Droplets, TrendingUp, AlertCircle,
  Check, Zap, Moon
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useNutritionStore } from '../../stores/nutritionStore';
import { useWeightStore } from '../../stores/weightStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useCheckinStore } from '../../stores/checkinStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { todayStr, formatWeight } from '../../lib/utils';
import DailyCheckinForm from '../coaching/DailyCheckinForm';
import PageTransition from '../ui/PageTransition';

export default function Dashboard() {

  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const { logs, waterLogs, fetchLogs, fetchWaterLogs } = useNutritionStore();
  const { measurements, fetchMeasurements } = useWeightStore();
  const { workouts, fetchWorkouts } = useWorkoutStore();
  const { todayCheckin, fetchCheckins } = useCheckinStore();
  const { recommendations, fetchRecommendations, maybeAutoAnalyze } = useCoachingStore();
  const [showCheckin, setShowCheckin] = useState(false);

  useEffect(() => {
    if (!user) return;
    const today = todayStr();
    fetchLogs(user.id, today);
    fetchWaterLogs(user.id, today);
    fetchMeasurements(user.id);
    fetchWorkouts(user.id);
    fetchCheckins(user.id);
    fetchRecommendations(user.id);
  }, [user]);

  useEffect(() => {
    if (user && profile) maybeAutoAnalyze(user.id, profile);
  }, [user, profile]);

  const firstName = profile?.full_name?.split(' ')[0] || '';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon apres-midi' : 'Bonsoir';

  // Today's nutrition summary
  const today = todayStr();
  const todayLogs = logs.filter(l => l.logged_at === today);
  const todayCalories = todayLogs.reduce((s, l) => s + l.calories, 0);
  const todayProtein = todayLogs.reduce((s, l) => s + l.protein, 0);
  const todayCarbs = todayLogs.reduce((s, l) => s + l.carbs, 0);
  const todayFat = todayLogs.reduce((s, l) => s + l.fat, 0);
  const todayWater = waterLogs.reduce((s, l) => s + l.amount_ml, 0);

  const calorieTarget = profile?.daily_calorie_target || 2200;
  const proteinTarget = profile?.protein_target || 150;
  const waterTarget = profile?.daily_water_target_ml || 2500;
  const calorieProgress = Math.min(100, (todayCalories / calorieTarget) * 100);

  // Weight
  const latestWeight = measurements[0]?.weight_kg;
  const previousWeight = measurements[1]?.weight_kg;
  const weightDiff = latestWeight && previousWeight ? latestWeight - previousWeight : null;
  const unit = profile?.unit_weight || 'kg';

  // This week's workouts
  const now = new Date();
  const mondayOffset = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const mondayStr = monday.toISOString().split('T')[0];
  const weekWorkouts = workouts.filter(w => w.date >= mondayStr);

  // Pending coaching recommendations
  const pendingRecs = recommendations.filter(r => r.status === 'pending');
  const hasCritical = pendingRecs.some(r => r.priority === 'critical');

  return (
    <PageTransition>
      <div className="px-4 pt-6 pb-28 md:pb-8 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in-down">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/profile')}
              className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-neutral-800 hover:ring-blue-500 transition-all"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-blue-600/20 flex items-center justify-center text-blue-400 text-sm font-bold">
                  {firstName[0]?.toUpperCase() || 'U'}
                </div>
              )}
            </button>
            <div>
              <p className="text-neutral-400 text-xs">
                {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <p className="text-sm font-semibold text-white">{greeting}, {firstName} !</p>
            </div>
          </div>
        </div>

        {/* Daily Check-in CTA */}
        {!todayCheckin && !showCheckin && (
          <button
            onClick={() => setShowCheckin(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600/15 to-blue-500/5 border border-blue-500/25 hover:border-blue-500/40 transition-all animate-fade-in-up"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Brain size={18} className="text-blue-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-white">Comment te sens-tu ?</p>
              <p className="text-xs text-neutral-400">Ton check-in quotidien nourrit le coaching</p>
            </div>
            <ChevronRight size={16} className="text-blue-400" />
          </button>
        )}

        {/* Check-in Form (expanded) */}
        {showCheckin && (
          <div className="bg-neutral-900/60 border border-neutral-800/60 rounded-2xl p-5 animate-fade-in-scale">
            <DailyCheckinForm onComplete={() => setShowCheckin(false)} />
          </div>
        )}

        {/* Coaching Alerts */}
        {pendingRecs.length > 0 && !showCheckin && (
          <button
            onClick={() => navigate('/coaching')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all animate-fade-in-up stagger-1 ${
              hasCritical
                ? 'bg-red-500/8 border-red-500/25 hover:border-red-500/40'
                : 'bg-orange-500/8 border-orange-500/20 hover:border-orange-500/35'
            }`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              hasCritical ? 'bg-red-500/20' : 'bg-orange-500/20'
            }`}>
              <AlertCircle size={16} className={hasCritical ? 'text-red-400' : 'text-orange-400'} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-white">
                {pendingRecs.length} recommandation{pendingRecs.length > 1 ? 's' : ''} du coach
              </p>
              <p className="text-xs text-neutral-500 truncate">
                {pendingRecs[0]?.reasoning.slice(0, 60)}...
              </p>
            </div>
            <ChevronRight size={14} className="text-neutral-500" />
          </button>
        )}

        {/* Today's Targets */}
        <div className="space-y-3 animate-fade-in-up stagger-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Aujourd'hui</h2>
            {todayCheckin && (
              <div className="flex items-center gap-1 text-xs text-green-400">
                <Check size={12} /> Check-in fait
              </div>
            )}
          </div>

          {/* Calorie progress card */}
          <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Flame size={16} className="text-orange-400" />
                <span className="text-sm font-medium text-white">Calories</span>
              </div>
              <span className="text-sm text-neutral-400">
                <span className="text-white font-bold">{todayCalories}</span> / {calorieTarget} kcal
              </span>
            </div>
            <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${calorieProgress}%`,
                  backgroundColor: calorieProgress > 100 ? '#f43f5e' : calorieProgress > 80 ? '#10b981' : '#3b82f6',
                }}
              />
            </div>
            {/* Macros row */}
            <div className="flex gap-3 mt-3">
              <MacroChip label="P" value={todayProtein} target={proteinTarget} color="text-blue-400" />
              <MacroChip label="G" value={todayCarbs} target={profile?.carbs_target || 200} color="text-amber-400" />
              <MacroChip label="L" value={todayFat} target={profile?.fat_target || 70} color="text-rose-400" />
            </div>
          </div>

          {/* Quick stats row */}
          <div className="grid grid-cols-3 gap-2">
            <QuickStat
              icon={Droplets}
              label="Eau"
              value={`${(todayWater / 1000).toFixed(1)}L`}
              sub={`/ ${(waterTarget / 1000).toFixed(1)}L`}
              color="text-cyan-400"
              bgColor="bg-cyan-500/10"
              progress={Math.min(100, (todayWater / waterTarget) * 100)}
            />
            <QuickStat
              icon={Dumbbell}
              label="Seances"
              value={`${weekWorkouts.length}`}
              sub={`/ ${profile?.training_frequency || 4}`}
              color="text-blue-400"
              bgColor="bg-blue-500/10"
              progress={Math.min(100, (weekWorkouts.length / (profile?.training_frequency || 4)) * 100)}
            />
            <QuickStat
              icon={Scale}
              label="Poids"
              value={latestWeight ? formatWeight(latestWeight, unit).replace(` ${unit}`, '') : '--'}
              sub={weightDiff !== null ? `${weightDiff > 0 ? '+' : ''}${(unit === 'lbs' ? weightDiff * 2.205 : weightDiff).toFixed(1)}` : unit}
              color="text-emerald-400"
              bgColor="bg-emerald-500/10"
            />
          </div>
        </div>

        {/* Quick Wellness Summary (if check-in done) */}
        {todayCheckin && (
          <div className="grid grid-cols-4 gap-2 animate-fade-in-up stagger-3">
            <WellnessChip icon={Zap} value={todayCheckin.energy_level} label="Energie" goodThreshold={4} />
            <WellnessChip icon={Moon} value={todayCheckin.sleep_quality} label="Sommeil" goodThreshold={4} />
            <WellnessChip icon={Brain} value={todayCheckin.stress} label="Stress" inverted goodThreshold={2} />
            <WellnessChip icon={Target} value={todayCheckin.motivation} label="Motiv." goodThreshold={4} />
          </div>
        )}

        {/* Quick Actions */}
        <div className="space-y-2 animate-fade-in-up stagger-3">
          <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Actions rapides</h2>
          <div className="grid grid-cols-2 gap-2">
            <QuickAction
              icon={Dumbbell}
              label="Nouvelle seance"
              onClick={() => navigate('/workout/new')}
              color="bg-blue-500/10 text-blue-400 border-blue-500/20"
            />
            <QuickAction
              icon={Apple}
              label="Ajouter un repas"
              onClick={() => navigate('/nutrition')}
              color="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            />
            <QuickAction
              icon={Scale}
              label="Peser"
              onClick={() => navigate('/progress')}
              color="bg-amber-500/10 text-amber-400 border-amber-500/20"
            />
            <QuickAction
              icon={TrendingUp}
              label="Voir progression"
              onClick={() => navigate('/progress')}
              color="bg-rose-500/10 text-rose-400 border-rose-500/20"
            />
          </div>
        </div>

        {/* Weekly Progress Bar */}
        <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4 animate-fade-in-up stagger-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-white">Semaine en cours</p>
            <p className="text-xs text-neutral-500">{weekWorkouts.length}/{profile?.training_frequency || 4} seances</p>
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => {
              const d = new Date(monday);
              d.setDate(monday.getDate() + i);
              const dayStr = d.toISOString().split('T')[0];
              const hasWorkout = workouts.some(w => w.date.startsWith(dayStr));
              const isToday = dayStr === today;
              const dayLabel = d.toLocaleDateString('fr-FR', { weekday: 'narrow' });
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-neutral-600 uppercase">{dayLabel}</span>
                  <div className={`w-full h-8 rounded-lg flex items-center justify-center transition-all ${
                    hasWorkout
                      ? 'bg-blue-500/20 border border-blue-500/30'
                      : isToday
                      ? 'bg-neutral-800 border border-neutral-700'
                      : 'bg-neutral-900/50 border border-neutral-800/30'
                  }`}>
                    {hasWorkout && <Dumbbell size={12} className="text-blue-400" />}
                    {isToday && !hasWorkout && <div className="w-1.5 h-1.5 rounded-full bg-neutral-600" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

function MacroChip({ label: macroLabel, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = Math.min(100, (value / target) * 100);
  return (
    <div className="flex-1 bg-neutral-800/50 rounded-lg px-2.5 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[10px] font-bold ${color}`}>{macroLabel}</span>
        <span className="text-[10px] text-neutral-500">{value}/{target}g</span>
      </div>
      <div className="h-1 bg-neutral-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all`} style={{ width: `${pct}%`, backgroundColor: 'currentColor' }} />
      </div>
    </div>
  );
}

function QuickStat({
  icon: Icon,
  label,
  value,
  sub,
  color,
  bgColor,
  progress,
}: {
  icon: typeof Scale;
  label: string;
  value: string;
  sub: string;
  color: string;
  bgColor: string;
  progress?: number;
}) {
  return (
    <div className="bg-neutral-900/60 border border-neutral-800/50 rounded-xl p-3 flex flex-col items-center gap-1">
      <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center`}>
        <Icon size={14} className={color} />
      </div>
      <span className="text-[10px] text-neutral-500 font-medium">{label}</span>
      <span className="text-sm font-bold text-white">{value}</span>
      <span className="text-[10px] text-neutral-500">{sub}</span>
      {progress !== undefined && (
        <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden mt-1">
          <div className="h-full bg-current rounded-full" style={{ width: `${progress}%`, color: color.replace('text-', '').includes('cyan') ? '#06b6d4' : '#3b82f6' }} />
        </div>
      )}
    </div>
  );
}

function WellnessChip({
  icon: Icon,
  value,
  label,
  inverted,
  goodThreshold,
}: {
  icon: typeof Zap;
  value: number | null;
  label: string;
  inverted?: boolean;
  goodThreshold: number;
}) {
  if (!value) return null;
  const isGood = inverted ? value <= goodThreshold : value >= goodThreshold;
  return (
    <div className={`flex flex-col items-center gap-0.5 p-2 rounded-xl border ${
      isGood ? 'bg-green-500/5 border-green-500/20' : 'bg-neutral-900/40 border-neutral-800/40'
    }`}>
      <Icon size={12} className={isGood ? 'text-green-400' : 'text-neutral-400'} />
      <span className="text-xs font-bold text-white">{value}/5</span>
      <span className="text-[9px] text-neutral-500">{label}</span>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  color,
}: {
  icon: typeof Dumbbell;
  label: string;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3.5 py-3 rounded-xl border transition-all hover:scale-[1.02] active:scale-[0.98] ${color}`}
    >
      <Icon size={16} />
      <span className="text-xs font-medium text-white">{label}</span>
    </button>
  );
}
