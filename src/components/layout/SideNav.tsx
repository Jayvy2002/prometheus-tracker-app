import { NavLink, Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCoachingStore } from '../../stores/coachingStore';
import { useAccountContext } from '../../lib/useAccountContext';
import { desktopSections, navPersona, quickAddActions } from '../../navigation/navConfig';

export default function SideNav() {
  const { t } = useTranslation();
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const unreadMessageCount = useCoachingStore(s => s.unreadMessageCount);
  const tracking = useCoachingStore(s => s.myTrackingConfig);
  const context = useAccountContext();
  const persona = navPersona(context);
  const sections = desktopSections(persona, tracking);
  const quickActions = persona === 'coaching' ? [] : quickAddActions(tracking);

  return (
    <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-64 bg-neutral-950 border-r border-neutral-800/60 z-40">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-neutral-800/60 animate-fade-in-down">
        <div className="w-8 h-8 flex items-center justify-center">
          <img src="/logo.svg" alt="Prometheus" className="w-8 h-8" />
        </div>
        <span className="text-white font-bold text-lg tracking-tight">Prometheus</span>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-3 overflow-y-auto scrollbar-hide">
        {sections.map(section => (
          <div key={section.id}>
            {section.labelKey && (
              <p className="text-[10px] font-semibold text-neutral-600 uppercase tracking-widest mb-1 px-4">
                {t(section.labelKey)}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map(tab => {
                const Icon = tab.icon;
                const muted = section.tone === 'muted';
                return (
                  <NavLink
                    key={tab.id}
                    to={tab.path}
                    end={tab.end}
                    aria-current="page"
                    aria-label={
                      tab.badge === 'unreadMessages' && unreadMessageCount > 0
                        ? t('nav.messagesUnread', { count: unreadMessageCount })
                        : t(tab.labelKey)
                    }
                    className={({ isActive }) => `relative w-full flex items-center gap-3.5 px-4 py-2 min-h-11 rounded-xl text-sm font-medium transition-colors duration-200
                      ${isActive
                        ? 'bg-blue-600/15 text-white'
                        : muted
                          ? 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/60'
                          : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'
                      }`}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="nav-active-indicator" />}
                        <Icon
                          size={18}
                          strokeWidth={isActive ? 2.5 : 1.8}
                          className={isActive ? 'text-blue-400' : ''}
                        />
                        <span>{t(tab.labelKey)}</span>
                        {tab.badge === 'unreadMessages' && unreadMessageCount > 0 && (
                          <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full bg-blue-600 text-white">
                            {unreadMessageCount}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}

        {quickActions.length > 0 && (
          <div className="border-t border-neutral-800/60 pt-3">
            <p className="text-[10px] font-semibold text-neutral-600 uppercase tracking-widest mb-2 px-2">
              {t('nav.quickAdd')}
            </p>
            <div className="space-y-1">
              {quickActions.map((action, i) => {
                const Icon = action.icon;
                const isHovered = hoveredAction === action.id;
                return (
                  <Link
                    key={action.id}
                    to={action.path}
                    onMouseEnter={() => setHoveredAction(action.id)}
                    onMouseLeave={() => setHoveredAction(null)}
                    className="sidebar-item w-full flex items-center gap-3 px-4 py-2 rounded-xl text-sm text-neutral-500 hover:text-white hover:bg-blue-600/10 hover:border-blue-600/20 border border-transparent transition-all duration-200 group"
                    style={{ animationDelay: `${(i + 5) * 50}ms` }}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200
                      ${isHovered ? 'bg-blue-600/25 text-blue-400' : 'bg-neutral-800 text-neutral-500 group-hover:bg-blue-600/20 group-hover:text-blue-400'}`}>
                      <Icon size={13} />
                    </div>
                    <span className="font-medium">{t(action.labelKey)}</span>
                    <Plus size={13} className="ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>
    </aside>
  );
}
