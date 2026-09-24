import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useClientTracking } from '@/features/coaching/hooks/useClientTracking';
import { quickAddActions } from '@/app/navigation/navConfig';

export default function FAB({ raised = false }: { raised?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tracking = useClientTracking();
  const [open, setOpen] = useState(false);

  // One source for mobile and desktop quick add (navConfig), not a second list.
  const actions = quickAddActions(tracking).map(action => ({
    label: t(action.labelKey),
    icon: action.icon,
    onClick: () => { navigate(action.path, action.state ? { state: action.state } : undefined); setOpen(false); },
  }));

  if (actions.length === 0) return null;

  return (
    <>
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      <div className={`md:hidden fixed left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 ${raised
        ? 'bottom-[calc(8.25rem+env(safe-area-inset-bottom))]'
        : 'bottom-[calc(4.75rem+env(safe-area-inset-bottom))]'}`}>
        {open && (
          <div className="flex flex-col items-center gap-2 mb-1 animate-fade-in-up">
            {actions.map((action, i) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  className="flex items-center gap-3 bg-neutral-900 border border-neutral-700 rounded-full pl-4 pr-5 py-3 shadow-xl hover:bg-neutral-800 hover:border-[#525252] transition-all active:scale-95"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center">
                    <Icon size={14} className="text-blue-400" />
                  </div>
                  <span className="text-sm font-medium text-white whitespace-nowrap">{action.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          aria-label={t('nav.quickAdd')}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 active:scale-95
            ${open ? 'bg-neutral-800 border border-[#525252] rotate-45' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/40'}`}
        >
          <Plus size={22} className="text-white" aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
