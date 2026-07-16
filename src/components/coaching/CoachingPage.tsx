import { useEffect, useState } from 'react';
import {
  Brain, TrendingUp, AlertTriangle, Check, X,
  ChevronDown, ChevronUp, RefreshCw, Loader2, Calendar, Dumbbell,
  Utensils, Moon, Heart, Zap, Target, Award
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useCheckinStore } from '../../stores/checkinStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { CoachingRecommendation } from '../../lib/types';
import DailyCheckinForm from './DailyCheckinForm';

export default function CoachingPage() {
  const { user } = useAuthStore();
  const { profile } = useProfileStore();
  const { checkins, todayCheckin, fetchCheckins } = useCheckinStore();
  const { recommendations, loading, analyzing, fetchRecommendations, runWeeklyAnalysis, acceptRecommendation, dismissRecommendation } = useCoachingStore();
  const [showCheckin, setShowCheckin] = useState(false);
  const [expandedRec, setExpandedRec] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchCheckins(user.id);
      fetchRecommendations(user.id);
    }
  }, [user]);

  const handleRunAnalysis = async () => {
    if (!user || !profile) return;
    await runWeeklyAnalysis(user.id, profile);
  };

  const pendingRecs = recommendations.filter(r => r.status === 'pending');
  const pastRecs = recommendations.filter(r => r.status !== 'pending').slice(0, 10);

  // Weekly check-in streak
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });
  const checkinDays = new Set(checkins.map(c => c.checked_at));

  return (
    <div className="pb-28 md:pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="text-blue-400" size={24} />
            Mon Coach
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Recommandations basees sur tes donnees reelles
          </p>
        </div>
        <button
          onClick={handleRunAnalysis}
          disabled={analyzing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600/15 text-blue-400 text-sm font-medium hover:bg-blue-600/25 transition-colors disabled:opacity-50"
        >
          {analyzing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Analyser
        </button>
      </div>

      {/* Daily Check-in Card */}
      <div className="bg-neutral-900/60 border border-neutral-800/60 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowCheckin(!showCheckin)}
          className="w-full flex items-center justify-between px-5 py-4"
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              todayCheckin ? 'bg-green-500/20' : 'bg-orange-500/20'
            }`}>
              {todayCheckin ? <Check size={18} className="text-green-400" /> : <Calendar size={18} className="text-orange-400" />}
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">
                {todayCheckin ? 'Check-in du jour complete' : 'Check-in quotidien'}
              </p>
              <p className="text-xs text-neutral-500">
                {todayCheckin ? 'Modifier mes reponses' : 'Remplis pour recevoir tes recommandations'}
              </p>
            </div>
          </div>
          {showCheckin ? <ChevronUp size={18} className="text-neutral-500" /> : <ChevronDown size={18} className="text-neutral-500" />}
        </button>

        {showCheckin && (
          <div className="px-5 pb-5 border-t border-neutral-800/60 pt-4">
            <DailyCheckinForm onComplete={() => setShowCheckin(false)} />
          </div>
        )}
      </div>

      {/* Weekly Streak */}
      <div className="bg-neutral-900/60 border border-neutral-800/60 rounded-2xl px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-white">Check-ins cette semaine</p>
          <p className="text-xs text-neutral-500">{last7Days.filter(d => checkinDays.has(d)).length}/7 jours</p>
        </div>
        <div className="flex gap-2">
          {last7Days.map(date => {
            const hasCheckin = checkinDays.has(date);
            const isToday = date === new Date().toISOString().split('T')[0];
            const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'narrow' });
            return (
              <div key={date} className="flex-1 flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                  hasCheckin
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : isToday
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-neutral-800/50 text-neutral-600'
                }`}>
                  {hasCheckin ? <Check size={12} /> : dayLabel.toUpperCase()}
                </div>
                {isToday && <div className="w-1 h-1 rounded-full bg-blue-400" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Metrics Overview */}
      {todayCheckin && <MetricsOverview checkin={todayCheckin as unknown as Record<string, number | string | null>} />}

      {/* Pending Recommendations */}
      {pendingRecs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Target size={18} className="text-blue-400" />
            Recommandations actives
          </h2>
          {pendingRecs.map(rec => (
            <RecommendationCard
              key={rec.id}
              rec={rec}
              expanded={expandedRec === rec.id}
              onToggle={() => setExpandedRec(expandedRec === rec.id ? null : rec.id)}
              onAccept={() => acceptRecommendation(rec.id)}
              onDismiss={() => dismissRecommendation(rec.id)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && pendingRecs.length === 0 && (
        <div className="bg-neutral-900/40 border border-neutral-800/40 rounded-2xl p-8 text-center">
          <Award size={32} className="text-neutral-600 mx-auto mb-3" />
          <p className="text-sm text-neutral-400">
            {checkins.length < 4
              ? 'Remplis ton check-in quotidien pendant au moins 4 jours pour recevoir tes premieres recommandations.'
              : 'Aucune recommandation en attente. Clique sur "Analyser" pour lancer une nouvelle analyse.'}
          </p>
        </div>
      )}

      {/* Past Recommendations */}
      {pastRecs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">Historique</h2>
          {pastRecs.map(rec => (
            <div
              key={rec.id}
              className={`px-4 py-3 rounded-xl border ${
                rec.status === 'accepted'
                  ? 'bg-green-500/5 border-green-500/20'
                  : 'bg-neutral-900/30 border-neutral-800/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <CategoryIcon category={rec.category} size={14} />
                <p className="text-sm text-neutral-300 flex-1">{rec.reasoning.slice(0, 80)}...</p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  rec.status === 'accepted' ? 'bg-green-500/20 text-green-400' : 'bg-neutral-700 text-neutral-400'
                }`}>
                  {rec.status === 'accepted' ? 'Acceptee' : 'Ignoree'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricsOverview({ checkin }: { checkin: Record<string, number | string | null> }) {
  const metrics = [
    { key: 'energy_level', label: 'Energie', icon: Zap, color: 'yellow' },
    { key: 'sleep_quality', label: 'Sommeil', icon: Moon, color: 'indigo' },
    { key: 'stress', label: 'Stress', icon: Brain, color: 'red', inverted: true },
    { key: 'motivation', label: 'Motivation', icon: Heart, color: 'green' },
    { key: 'fatigue', label: 'Fatigue', icon: Dumbbell, color: 'orange', inverted: true },
    { key: 'hunger', label: 'Faim', icon: Utensils, color: 'blue' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {metrics.map(m => {
        const value = checkin[m.key] as number | null;
        if (!value) return null;
        const Icon = m.icon;
        const isGood = m.inverted ? value <= 2 : value >= 4;
        const isBad = m.inverted ? value >= 4 : value <= 2;
        return (
          <div
            key={m.key}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
              isGood ? 'bg-green-500/5 border-green-500/20' :
              isBad ? 'bg-red-500/5 border-red-500/20' :
              'bg-neutral-900/40 border-neutral-800/40'
            }`}
          >
            <Icon size={14} className={isGood ? 'text-green-400' : isBad ? 'text-red-400' : 'text-neutral-400'} />
            <span className="text-lg font-bold text-white">{value}/5</span>
            <span className="text-[10px] text-neutral-500">{m.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function RecommendationCard({
  rec,
  expanded,
  onToggle,
  onAccept,
  onDismiss,
}: {
  rec: CoachingRecommendation;
  expanded: boolean;
  onToggle: () => void;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const priorityColors: Record<string, string> = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    medium: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    low: 'bg-green-500/20 text-green-400 border-green-500/30',
  };

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${
      rec.priority === 'critical' ? 'border-red-500/30 bg-red-500/5' :
      rec.priority === 'high' ? 'border-orange-500/20 bg-orange-500/5' :
      'border-neutral-800/60 bg-neutral-900/60'
    }`}>
      <button onClick={onToggle} className="w-full px-5 py-4 flex items-start gap-3 text-left">
        <CategoryIcon category={rec.category} size={18} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${priorityColors[rec.priority] || priorityColors.medium}`}>
              {rec.priority === 'critical' ? 'URGENT' : rec.priority === 'high' ? 'IMPORTANT' : rec.priority === 'medium' ? 'CONSEIL' : 'INFO'}
            </span>
            <span className="text-[10px] text-neutral-600">{rec.category}</span>
          </div>
          <p className="text-sm text-white font-medium leading-relaxed">{rec.reasoning}</p>
        </div>
        {expanded ? <ChevronUp size={16} className="text-neutral-500 mt-1" /> : <ChevronDown size={16} className="text-neutral-500 mt-1" />}
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-3 border-t border-neutral-800/40 pt-3 animate-fade-in">
          {rec.calorie_adjustment !== 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800/50">
              <Utensils size={14} className="text-blue-400" />
              <span className="text-sm text-neutral-300">
                Calories : <strong className="text-white">{rec.calorie_adjustment > 0 ? '+' : ''}{rec.calorie_adjustment} kcal</strong>
                {rec.new_calorie_target && <span className="text-neutral-500"> ({rec.new_calorie_target} kcal/jour)</span>}
              </span>
            </div>
          )}
          {rec.training_recommendation && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-neutral-800/50">
              <Dumbbell size={14} className="text-green-400 mt-0.5" />
              <span className="text-sm text-neutral-300">{rec.training_recommendation}</span>
            </div>
          )}
          {rec.cardio_recommendation && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-neutral-800/50">
              <TrendingUp size={14} className="text-orange-400 mt-0.5" />
              <span className="text-sm text-neutral-300">{rec.cardio_recommendation}</span>
            </div>
          )}
          {rec.lifestyle_recommendation && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-neutral-800/50">
              <Heart size={14} className="text-pink-400 mt-0.5" />
              <span className="text-sm text-neutral-300">{rec.lifestyle_recommendation}</span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onAccept}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600/20 hover:bg-green-600/30 text-green-400 text-sm font-medium transition-colors border border-green-500/20"
            >
              <Check size={14} /> Appliquer
            </button>
            <button
              onClick={onDismiss}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-sm font-medium transition-colors border border-neutral-700"
            >
              <X size={14} /> Ignorer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryIcon({ category, size = 18 }: { category: string; size?: number }) {
  const iconMap: Record<string, { icon: typeof Brain; color: string }> = {
    nutrition: { icon: Utensils, color: 'text-blue-400' },
    training: { icon: Dumbbell, color: 'text-green-400' },
    recovery: { icon: Moon, color: 'text-indigo-400' },
    lifestyle: { icon: Heart, color: 'text-pink-400' },
    deload: { icon: AlertTriangle, color: 'text-orange-400' },
  };
  const config = iconMap[category] || iconMap.lifestyle;
  const Icon = config.icon;
  return <Icon size={size} className={config.color} />;
}
