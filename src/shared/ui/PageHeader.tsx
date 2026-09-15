import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import IconButton from './IconButton';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  onBack?: () => void;
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, backTo, onBack, actions }: PageHeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const showBack = Boolean(backTo || onBack);

  return (
    <header className="flex items-start gap-3 mb-6">
      {showBack && (
        <IconButton
          label={t('common.back')}
          onClick={() => (onBack ? onBack() : backTo ? navigate(backTo) : navigate(-1))}
          className="-ml-2"
        >
          <ArrowLeft size={20} />
        </IconButton>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-semibold text-white tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-400 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </header>
  );
}
