import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Dumbbell, Apple, User, ClipboardCheck, Users, CalendarRange, MessageSquare, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCoachingStore } from '../../stores/coachingStore';

export default function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const unreadMessageCount = useCoachingStore(s => s.unreadMessageCount);
  const tracking = useCoachingStore(s => s.myTrackingConfig);

  const tabs = coachingRole === 'coach'
    ? [
        { path: '/dashboard', icon: LayoutDashboard, label: t('nav.today') },
        { path: '/clients', icon: Users, label: t('nav.clients') },
        { path: '/programs', icon: CalendarRange, label: t('nav.programs') },
        { path: '/messages', icon: MessageSquare, label: t('nav.messages') },
        { path: '/prometheus', icon: Sparkles, label: t('nav.prometheus') },
      ]
    : [
        { path: '/dashboard', icon: LayoutDashboard, label: t('nav.home'), show: true },
        { path: '/workout', icon: Dumbbell, label: t('nav.workout'), show: tracking.track_workouts },
        { path: '/checkin', icon: ClipboardCheck, label: t('nav.checkin'), show: tracking.track_checkins },
        { path: '/nutrition', icon: Apple, label: t('nav.nutrition'), show: tracking.track_nutrition },
        { path: '/profile', icon: User, label: t('nav.profile'), show: true },
      ].filter(tab => tab.show !== false);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-neutral-950/95 backdrop-blur-md border-t border-neutral-800 z-40 safe-area-bottom">
      <div className="flex items-center max-w-lg mx-auto px-1 py-1">
        {tabs.map((tab) => {
          const active = location.pathname.startsWith(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 rounded-xl transition-transform duration-200
                ${active ? 'text-blue-400 scale-105' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              <span className="relative">
                <tab.icon size={20} strokeWidth={active ? 2.5 : 2} />
                {tab.path === '/messages' && unreadMessageCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-blue-600 text-white text-[8px] leading-[14px] text-center">
                    {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                  </span>
                )}
              </span>
              <span className="text-[9px] font-medium leading-tight text-center">{tab.label}</span>
              {active && <div className="w-1 h-1 rounded-full bg-blue-400 mt-0.5 animate-scale-in" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
