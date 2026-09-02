import { useTranslation } from 'react-i18next';
import Loader from '../kokonutui/loader';
import { cn } from '../../lib/cn';

type GymLoaderProps = {
  title?: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export default function GymLoader({
  title,
  subtitle,
  size = 'sm',
  className,
}: GymLoaderProps) {
  const { t } = useTranslation();
  return (
    <Loader
      size={size}
      title={title ?? t('common.loading')}
      subtitle={subtitle ?? t('common.loadingHint')}
      className={cn(size === 'sm' ? 'gap-4 p-3' : 'gap-6 p-6', className)}
    />
  );
}
