import { useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCoachingStore } from '../../stores/coachingStore';
import { useAccountContext } from '@/features/account/hooks/useAccountContext';
import { mobileTabs, navPersona, pathMatchesItem } from '@/app/navigation/navConfig';
import WorkspaceSwitcher from './WorkspaceSwitcher';

export default function BottomNav() {
  const { t } = useTranslation();
  const unreadMessageCount = useCoachingStore(s => s.unreadMessageCount);
  const tracking = useCoachingStore(s => s.myTrackingConfig);
  const context = useAccountContext();
  const { pathname } = useLocation();
  const tabs = mobileTabs(navPersona(context), tracking);
  const [spaceOpen, setSpaceOpen] = useState(false);
  const hold = useRef<number | null>(null);
  const longFired = useRef(false);

  const startHold = (id: string) => {
    if (id !== 'you') return;
    longFired.current = false;
    hold.current = window.setTimeout(() => {
      longFired.current = true;
      setSpaceOpen(true);
    }, 450);
  };
  const clearHold = () => {
    if (hold.current) window.clearTimeout(hold.current);
    hold.current = null;
  };

  return (
    <>
      {spaceOpen && (
        <div className="md:hidden fixed inset-x-0 bottom-16 z-50 px-3" data-workspace-sheet="true">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3 shadow-xl">
            <WorkspaceSwitcher />
            <button type="button" className="mt-2 min-h-11 w-full text-sm text-neutral-400" onClick={() => setSpaceOpen(false)}>
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-neutral-950/95 backdrop-blur-md border-t border-neutral-800 z-40 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center max-w-lg mx-auto px-1 py-1">
          {tabs.map(tab => {
            // A hub stays lit on its sub-pages (Corps on /nutrition, Suivi on /calendar).
            const active = pathMatchesItem(pathname, tab);
            const Icon = tab.icon;
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
              onPointerDown={() => startHold(tab.id)}
              onPointerUp={clearHold}
              onPointerCancel={clearHold}
              onContextMenu={(event) => {
                if (tab.id !== 'you') return;
                event.preventDefault();
                setSpaceOpen(true);
              }}
              onClick={(event) => {
                if (!longFired.current) return;
                event.preventDefault();
                longFired.current = false;
              }}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 min-h-11 py-1.5 rounded-xl
                ${active ? 'text-blue-400' : 'text-neutral-400 hover:text-neutral-200'}`}
            >
                  <>
                    <span className="relative">
                      <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                      {tab.badge === 'unreadMessages' && unreadMessageCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-blue-600 text-white text-xs leading-[14px] text-center">
                          {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                        </span>
                      )}
                    </span>
                    <span className="text-xs font-medium leading-tight text-center">{t(tab.labelKey)}</span>
                  </>
            </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}
