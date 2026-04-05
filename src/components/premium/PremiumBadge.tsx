import { useTranslation } from 'react-i18next';
import { Crown, Lock } from 'lucide-react';

interface PremiumBadgeProps {
  variant?: 'crown' | 'lock';
  size?: 'xs' | 'sm';
  className?: string;
}

export default function PremiumBadge({
  variant = 'crown',
  size = 'xs',
  className = '',
}: PremiumBadgeProps) {
  const { t } = useTranslation();
  const Icon = variant === 'lock' ? Lock : Crown;
  const iconSize = size === 'xs' ? 9 : 11;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 font-semibold ${
        size === 'xs' ? 'text-[10px]' : 'text-xs'
      } ${className}`}
    >
      <Icon size={iconSize} />
      {size !== 'xs' && t('profile.premium')}
    </span>
  );
}
