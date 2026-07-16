import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Check, AlertCircle, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { useCheckinStore } from '../../../stores/checkinStore';
import { useCoachingStore } from '../../../stores/coachingStore';

export default function CoachingWidget() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { todayCheckin, fetchTodayCheckin } = useCheckinStore();
  const { recommendations } = useCoachingStore();

  useEffect(() => {
    if (user) fetchTodayCheckin(user.id);
  }, [user]);

  const pendingCount = recommendations.filter(r => r.status === 'pending').length;
  const hasCritical = recommendations.some(r => r.status === 'pending' && r.priority === 'critical');

  return (
    <button
      onClick={() => navigate('/coaching')}
      className="w-full text-left bg-gradient-to-br from-neutral-900/80 to-neutral-900/40 border border-neutral-800/60 rounded-2xl p-4 hover:border-blue-500/30 transition-all group"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            hasCritical ? 'bg-red-500/20' : 'bg-blue-500/20'
          }`}>
            <Brain size={16} className={hasCritical ? 'text-red-400' : 'text-blue-400'} />
          </div>
          <span className="text-sm font-semibold text-white">Coach</span>
        </div>
        <ChevronRight size={14} className="text-neutral-600 group-hover:text-blue-400 transition-colors" />
      </div>

      {!todayCheckin ? (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
          <p className="text-xs text-orange-300">Check-in a completer</p>
        </div>
      ) : pendingCount > 0 ? (
        <div className="flex items-center gap-2">
          <AlertCircle size={12} className={hasCritical ? 'text-red-400' : 'text-blue-400'} />
          <p className="text-xs text-neutral-300">{pendingCount} recommandation{pendingCount > 1 ? 's' : ''}</p>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Check size={12} className="text-green-400" />
          <p className="text-xs text-green-300">Tout est en ordre</p>
        </div>
      )}
    </button>
  );
}
