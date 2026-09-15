import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCoachingStore } from '../../stores/coachingStore';
import { useAccountContext } from '@/features/account/hooks/useAccountContext';
import { mobileTabs, navPersona } from '@/app/navigation/navConfig';

export default function BottomNav() {
  const { t } = useTranslation();
  const unreadMessageCount = useCoachingStore(s => s.unreadMessageCount);
  const tracking = useCoachingStore(s => s.myTrackingConfig);
  const context = useAccountContext();
  const tabs = mobileTabs(navPersona(context), tracking);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-neutral-950/95 backdrop-blur-md border-t border-neutral-800 z-40 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center max-w-lg mx-auto px-1 py-1">
        {tabs.map(tab => (
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
            className={({ isActive }) => `flex flex-1 flex-col items-center justify-center gap-0.5 min-h-11 py-1.5 rounded-xl
              ${isActive ? 'text-blue-400' : 'text-neutral-400 hover:text-neutral-200'}`}
          >
            {({ isActive }) => {
              const Icon = tab.icon;
              return (
                <>
                  <span className="relative">
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                    {tab.badge === 'unreadMessages' && unreadMessageCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-blue-600 text-white text-[10px] leading-[14px] text-center">
                        {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-medium leading-tight text-center">{t(tab.labelKey)}</span>
                </>
              );
            }}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
