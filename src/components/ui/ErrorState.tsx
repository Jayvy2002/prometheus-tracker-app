import { useTranslation } from 'react-i18next';
import Button from './Button';

interface ErrorStateProps {
  title: string;
  onRetry?: () => void;
}

export default function ErrorState({ title, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 px-5 py-8 text-center" role="alert">
      <p className="text-base font-semibold text-white">{title}</p>
      {onRetry && (
        <div className="mt-4 flex justify-center">
          <Button size="sm" variant="secondary" onClick={onRetry}>{t('errors.retry')}</Button>
        </div>
      )}
    </div>
  );
}
