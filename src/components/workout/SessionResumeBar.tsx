import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { currentElapsedMs, loadSessionTimer } from '../../lib/sessionTimer';
import { useResumableWorkout } from '../../features/workout/hooks/useResumableWorkout';

/** Barre globale : une séance ouverte aujourd'hui ou hier se reprend depuis n'importe quel écran. */
export default function SessionResumeBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore(s => s.user);
  const fetchWorkouts = useWorkoutStore(s => s.fetchWorkouts);
  const open = useResumableWorkout();

  useEffect(() => {
    if (user) void fetchWorkouts(user.id);
  }, [user, fetchWorkouts]);

  if (location.pathname.startsWith('/workout/') || !open) return null;
  const elapsed = Math.floor(currentElapsedMs(loadSessionTimer(open.id)) / 1000);
  const minutes = Math.max(1, Math.round((elapsed || open.duration_seconds || 0) / 60) || 1);

  return (
    <button
      type="button"
      data-session-resume="true"
      onClick={() => navigate(`/workout/${open.id}`)}
      className="fixed z-30 left-3 right-3 md:left-72 md:right-6 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 min-h-11 rounded-2xl bg-blue-600 px-4 text-sm font-medium text-white shadow-lg"
    >
      {t('workout.resumeBar', { minutes })}
    </button>
  );
}
