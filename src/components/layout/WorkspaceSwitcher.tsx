import { Briefcase, Dumbbell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { type AccountWorkspace } from '../../lib/accountContext';
import { useAccountContext } from '../../lib/useAccountContext';
import { useCoachingStore } from '../../stores/coachingStore';

export default function WorkspaceSwitcher({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const select = useCoachingStore(s => s.selectAccountWorkspace);
  const context = useAccountContext();
  if (!context.ready || !context.capabilities.coach || !context.personalToolsAvailable) return null;

  const choose = (next: AccountWorkspace) => {
    select(next);
    navigate('/dashboard');
  };
  const options = [
    { value: 'personal' as const, icon: Dumbbell, label: t('accountSpaces.personal') },
    { value: 'coaching' as const, icon: Briefcase, label: t('accountSpaces.coaching') },
  ];
  return (
    <div className={`grid grid-cols-2 gap-1 rounded-xl bg-neutral-900 p-1 ${className}`} role="group" aria-label={t('accountSpaces.label')}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          aria-pressed={context.activeWorkspace === option.value}
          onClick={() => choose(option.value)}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${context.activeWorkspace === option.value ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
        >
          <option.icon size={15} aria-hidden="true" />
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
