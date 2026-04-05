import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Dumbbell, Apple, User, BarChart2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = [
    { path: '/dashboard', icon: LayoutDashboard, label: t('nav.home') },
    { path: '/workout', icon: Dumbbell, label: t('nav.workout') },
    { path: '/stats', icon: BarChart2, label: t('nav.stats') },
    { path: '/nutrition', icon: Apple, label: t('nav.nutrition') },
    { path: '/profile', icon: User, label: t('nav.profile') },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-neutral-950/95 backdrop-blur-md border-t border-neutral-800 z-40 safe-area-bottom">
      <div className="flex items-center max-w-lg mx-auto px-1 py-1">
        {tabs.map((tab, i) => {
          const active = location.pathname.startsWith(tab.path);
          const isMid = i === 2;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center gap-0.5 py-2 rounded-xl transition-transform duration-200
                ${isMid ? 'flex-none w-16 mx-auto' : 'flex-1'}
                ${active ? 'text-blue-400 scale-105' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              <tab.icon size={isMid ? 20 : 22} strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{tab.label}</span>
              {active && <div className="w-1 h-1 rounded-full bg-blue-400 mt-0.5 animate-scale-in" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
