import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Dumbbell, Apple, User, CalendarDays, Plus, Scale, Flame, BarChart2, TrendingUp, ClipboardCheck, Users, CalendarRange, MessageSquare, Sparkles, Camera } from 'lucide-react';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCoachingStore } from '../../stores/coachingStore';
import { resolveAccountContext } from '../../lib/accountContext';
import WorkspaceSwitcher from './WorkspaceSwitcher';

export default function SideNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const myCoach = useCoachingStore(s => s.myCoach);
  const unreadMessageCount = useCoachingStore(s => s.unreadMessageCount);
  const tracking = useCoachingStore(s => s.myTrackingConfig);
  const roleReady = useCoachingStore(s => s.roleReady);
  const snapshot = useCoachingStore(s => s.accountSnapshot);
  const workspace = useCoachingStore(s => s.accountWorkspace);
  const context = resolveAccountContext(coachingRole, myCoach, roleReady, snapshot, workspace);
  const isCoach = context.activeWorkspace === 'coaching';
  const coached = context.personalCoaching === 'coached';

  const tabs = isCoach
    ? [
        { path: '/dashboard', icon: LayoutDashboard, label: t('nav.today') },
        { path: '/clients', icon: Users, label: t('nav.clients') },
        { path: '/programs', icon: CalendarRange, label: t('nav.programs') },
        { path: '/messages', icon: MessageSquare, label: t('nav.messages') },
        { path: '/prometheus', icon: Sparkles, label: t('nav.prometheus') },
      ]
    : [
        { path: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard'), show: true },
        { path: '/workout', icon: Dumbbell, label: t('nav.workouts'), show: tracking.track_workouts },
        { path: '/checkin', icon: ClipboardCheck, label: t('nav.checkin'), show: tracking.track_checkins },
        { path: '/nutrition', icon: Apple, label: t('nav.nutrition'), show: tracking.track_nutrition },
        { path: '/messages', icon: MessageSquare, label: t('nav.messages'), show: coached },
        { path: '/programs', icon: CalendarRange, label: t('nav.myProgram'), show: tracking.track_workouts },
        { path: '/weight', icon: Scale, label: t('nav.weight'), show: tracking.track_weight },
        { path: '/photos', icon: Camera, label: t('nav.photos'), show: true },
        { path: '/calendar', icon: CalendarDays, label: t('nav.calendar'), show: !coached },
        { path: '/stats', icon: BarChart2, label: t('nav.stats'), show: !coached },
        { path: '/exercise-progress', icon: TrendingUp, label: t('nav.exerciseProgress'), show: tracking.track_workouts && !coached },
        { path: '/profile', icon: User, label: t('nav.profile'), show: true },
      ].filter(tab => !('show' in tab) || tab.show);

  const quickActions = [
    ...(tracking.track_workouts ? [{ label: t('nav.newWorkout'), icon: Dumbbell, path: '/workout/new' }] : []),
    ...(tracking.track_weight ? [{ label: t('nav.logWeight'), icon: Scale, path: '/weight?log=1' }] : []),
    ...(tracking.track_nutrition ? [{ label: t('nav.addMeal'), icon: Flame, path: '/nutrition?add=1' }] : []),
  ];

  return (
    <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-64 bg-neutral-950 border-r border-neutral-800/60 z-40">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-neutral-800/60 animate-fade-in-down">
        <div className="w-8 h-8 flex items-center justify-center">
          <img src="/logo.svg" alt="Prometheus" className="w-8 h-8" />
        </div>
        <span className="text-white font-bold text-lg tracking-tight">Prometheus</span>
      </div>
      <div className="px-3 pt-3">
        <WorkspaceSwitcher />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-hide">
        {tabs.map((tab, i) => {
          const active = location.pathname.startsWith(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`sidebar-item relative w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
                ${active
                  ? 'bg-blue-600/15 text-white'
                  : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/60'
                }`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {active && <span className="nav-active-indicator" />}
              <tab.icon
                size={18}
                strokeWidth={active ? 2.5 : 1.8}
                className={active ? 'text-blue-400' : ''}
              />
              <span>{tab.label}</span>
              {tab.path === '/messages' && unreadMessageCount > 0 && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-blue-600 text-white">
                  {unreadMessageCount}
                </span>
              )}
              {active && tab.path !== '/messages' && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 animate-scale-in" />
              )}
            </button>
          );
        })}
      </nav>

      {isCoach && (
        <div className="px-3 pb-4 border-t border-neutral-800/60 pt-3">
          <button
            onClick={() => navigate('/profile')}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-neutral-500 hover:text-white hover:bg-neutral-800/60"
          >
            <User size={16} />
            {t('nav.profile')}
          </button>
        </div>
      )}

      {!isCoach && (
        <div className="px-3 pb-4 border-t border-neutral-800/60 pt-4">
          <p className="text-[10px] font-semibold text-neutral-600 uppercase tracking-widest mb-2 px-2">
            {t('nav.quickAdd')}
          </p>
          <div className="space-y-1">
            {quickActions.map((action, i) => {
              const Icon = action.icon;
              const isHovered = hoveredAction === action.label;
              return (
                <button
                  key={action.label}
                  onClick={() => navigate(action.path)}
                  onMouseEnter={() => setHoveredAction(action.label)}
                  onMouseLeave={() => setHoveredAction(null)}
                  className="sidebar-item w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-neutral-500 hover:text-white hover:bg-blue-600/10 hover:border-blue-600/20 border border-transparent transition-all duration-200 group"
                  style={{ animationDelay: `${(i + 5) * 50}ms` }}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200
                    ${isHovered ? 'bg-blue-600/25 text-blue-400' : 'bg-neutral-800 text-neutral-500 group-hover:bg-blue-600/20 group-hover:text-blue-400'}`}>
                    <Icon size={13} />
                  </div>
                  <span className="font-medium">{action.label}</span>
                  <Plus size={13} className="ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
