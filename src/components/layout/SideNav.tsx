import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Dumbbell, Apple, User, TrendingUp, Plus, Brain, Repeat } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function SideNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const links = [
    { path: '/dashboard', icon: LayoutDashboard, label: t('nav.home') },
    { path: '/workout', icon: Dumbbell, label: t('nav.workouts') },
    { path: '/coaching', icon: Brain, label: 'Coach' },
    { path: '/nutrition', icon: Apple, label: t('nav.nutrition') },
    { path: '/progress', icon: TrendingUp, label: 'Progression' },
    { path: '/routines', icon: Repeat, label: 'Routines' },
    { path: '/profile', icon: User, label: t('nav.profile') },
  ];

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-neutral-950 border-r border-neutral-800/50 flex-col z-30">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6">
        <img src="/logo.svg" alt="Prometheus" className="w-8 h-8" />
        <span className="text-base font-bold text-white tracking-tight">Prometheus</span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 space-y-1">
        {links.map(link => {
          const active = location.pathname === link.path || location.pathname.startsWith(link.path + '/');
          return (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all
                ${active ? 'bg-blue-600/15 text-blue-400 font-medium' : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'}`}
            >
              <link.icon size={18} />
              {link.label}
            </button>
          );
        })}
      </nav>

      {/* Quick action */}
      <div className="p-4 border-t border-neutral-800/50">
        <button
          onClick={() => navigate('/workout/new')}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Nouvelle seance
        </button>
      </div>
    </aside>
  );
}
