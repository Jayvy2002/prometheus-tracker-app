import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Dumbbell, Apple, User, ClipboardCheck, Users, CalendarRange, MessageSquare, Sparkles, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCoachingStore } from '../../stores/coachingStore';
import { resolveAccountContext } from '../../lib/accountContext';

export default function BottomNav() {
  const { t } = useTranslation();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const unreadMessageCount = useCoachingStore(s => s.unreadMessageCount);
  const tracking = useCoachingStore(s => s.myTrackingConfig);
  const roleReady = useCoachingStore(s => s.roleReady);
  const snapshot = useCoachingStore(s => s.accountSnapshot);
  const workspace = useCoachingStore(s => s.accountWorkspace);
  const context = resolveAccountContext(coachingRole, myCoach, roleReady, snapshot, workspace);
  const coached = context.personalCoaching === 'coached';

  const tabs = context.activeWorkspace === 'coaching'
    ? [
        { path: '/dashboard', icon: LayoutDashboard, label: t('nav.today') },
        { path: '/clients', icon: Users, label: t('nav.clients') },
        { path: '/programs', icon: CalendarRange, label: t('nav.programs') },
        { path: '/messages', icon: MessageSquare, label: t('nav.messages') },
        { path: '/prometheus', icon: Sparkles, label: t('nav.prometheus') },
      ]
    : coached
      ? [
          { path: '/dashboard', icon: LayoutDashboard, label: t('nav.today'), show: true },
          { path: '/workout', icon: Dumbbell, label: t('nav.workout'), show: tracking.track_workouts },
          { path: '/checkin', icon: ClipboardCheck, label: t('nav.checkin'), show: tracking.track_checkins },
          { path: '/messages', icon: MessageSquare, label: t('nav.messages'), show: true },
          { path: '/profile', icon: User, label: t('nav.profile'), show: true },
        ].filter(tab => tab.show !== false)
      : [
          { path: '/dashboard', icon: LayoutDashboard, label: t('nav.today'), show: true },
          { path: '/workout', icon: Dumbbell, label: t('nav.workout'), show: tracking.track_workouts },
          { path: '/exercise-progress', icon: TrendingUp, label: t('nav.exerciseProgress'), show: tracking.track_workouts },
          { path: '/nutrition', icon: Apple, label: t('nav.nutrition'), show: tracking.track_nutrition },
          { path: '/profile', icon: User, label: t('nav.profile'), show: true },
        ].filter(tab => tab.show !== false);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-neutral-950/95 backdrop-blur-md border-t border-neutral-800 z-40 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center max-w-lg mx-auto px-1 py-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) => `flex flex-1 flex-col items-center justify-center gap-0.5 min-h-11 py-1.5 rounded-xl
              ${isActive ? 'text-blue-400' : 'text-neutral-400 hover:text-neutral-200'}`}
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <tab.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                  {tab.path === '/messages' && unreadMessageCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-blue-600 text-white text-[10px] leading-[14px] text-center">
                      {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                    </span>
                  )}
                </span>
                <span className="text-xs font-medium leading-tight text-center">{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
