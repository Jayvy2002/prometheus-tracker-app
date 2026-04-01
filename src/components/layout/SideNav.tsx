import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Dumbbell, Apple, User, CalendarDays, Plus, Scale, Flame } from 'lucide-react';
import { useState } from 'react';

const tabs = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/workout', icon: Dumbbell, label: 'Workouts' },
  { path: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { path: '/nutrition', icon: Apple, label: 'Nutrition' },
  { path: '/profile', icon: User, label: 'Profile' },
];

const quickActions = [
  { label: 'New Workout', icon: Dumbbell, path: '/workout/new' },
  { label: 'Log Weight', icon: Scale, path: '/weight?log=1' },
  { label: 'Add Meal', icon: Flame, path: '/nutrition?add=1' },
];

export default function SideNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);

  return (
    <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-64 bg-neutral-950 border-r border-neutral-800/60 z-40">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-neutral-800/60 animate-fade-in-down">
        <div className="w-8 h-8 flex items-center justify-center">
          <img src="/logo.svg" alt="Prometheus" className="w-8 h-8" />
        </div>
        <span className="text-white font-bold text-lg tracking-tight">Prometheus</span>
      </div>

      {/* Navigation */}
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
              {active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 animate-scale-in" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Quick Actions */}
      <div className="px-3 pb-4 border-t border-neutral-800/60 pt-4">
        <p className="text-[10px] font-semibold text-neutral-600 uppercase tracking-widest mb-2 px-2">
          Quick Add
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
    </aside>
  );
}
