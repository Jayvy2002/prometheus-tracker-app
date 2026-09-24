import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, X } from 'lucide-react';
import IconButton from './IconButton';

export type ListRowTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

const TONE: Record<ListRowTone, { row: string; icon: string; subtitle: string }> = {
  neutral: {
    row: 'bg-neutral-900/60 border-neutral-800/50 hover:border-neutral-700/70',
    icon: 'bg-neutral-800 text-neutral-300',
    subtitle: 'text-neutral-400',
  },
  info: {
    row: 'bg-blue-500/10 border-blue-500/25 hover:border-blue-500/40',
    icon: 'bg-blue-500/20 text-blue-300',
    subtitle: 'text-blue-100/80',
  },
  warning: {
    row: 'bg-amber-500/10 border-amber-500/25 hover:border-amber-500/40',
    icon: 'bg-amber-500/20 text-amber-300',
    subtitle: 'text-amber-100/80',
  },
  success: {
    row: 'bg-emerald-500/10 border-emerald-500/25 hover:border-emerald-500/40',
    icon: 'bg-emerald-500/20 text-emerald-300',
    subtitle: 'text-emerald-100/80',
  },
  danger: {
    row: 'bg-rose-500/10 border-rose-500/25 hover:border-rose-500/40',
    icon: 'bg-rose-500/20 text-rose-300',
    subtitle: 'text-rose-100/80',
  },
};

interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  leading?: ReactNode;
  badge?: ReactNode;
  tone?: ListRowTone;
  to?: string;
  onClick?: () => void;
  onDismiss?: () => void;
  dismissLabel?: string;
  trailing?: ReactNode;
  chevron?: boolean;
  disabled?: boolean;
  className?: string;
  'data-testid'?: string;
}

export default function ListRow({
  title,
  subtitle,
  icon,
  leading,
  badge,
  tone = 'neutral',
  to,
  onClick,
  onDismiss,
  dismissLabel,
  trailing,
  chevron,
  disabled,
  className = '',
  'data-testid': testId,
}: ListRowProps) {
  const palette = TONE[tone];
  const interactive = Boolean(to || onClick) && !disabled;
  const showChevron = chevron ?? (interactive && !trailing && !onDismiss);
  const mark = leading ?? (icon != null ? (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${palette.icon}`}>
      {icon}
    </div>
  ) : null);

  const body = (
    <>
      {mark}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-sm font-medium text-white truncate">{title}</div>
          {badge != null ? (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-blue-600 text-white shrink-0">
              {badge}
            </span>
          ) : null}
        </div>
        {subtitle != null ? (
          <div className={`text-xs mt-0.5 line-clamp-2 ${palette.subtitle}`}>{subtitle}</div>
        ) : null}
      </div>
      {showChevron ? <ChevronRight size={16} className="text-neutral-500 shrink-0" /> : null}
    </>
  );

  const mainClass = `flex items-center gap-3 flex-1 min-w-0 ${disabled ? 'opacity-50 pointer-events-none' : ''}`;

  const main = to ? (
    <Link to={to} className={mainClass} aria-disabled={disabled || undefined}>
      {body}
    </Link>
  ) : onClick ? (
    <button type="button" onClick={onClick} disabled={disabled} className={`${mainClass} text-left`}>
      {body}
    </button>
  ) : (
    <div className={mainClass}>{body}</div>
  );

  return (
    <div data-testid={testId} className={`flex items-center gap-2 w-full rounded-2xl border px-3.5 py-3 min-h-11 transition-colors ${palette.row} ${className}`}>
      {main}
      {trailing}
      {onDismiss ? (
        <IconButton label={dismissLabel ?? ''} onClick={onDismiss} className="-mr-1.5 shrink-0">
          <X size={16} />
        </IconButton>
      ) : null}
    </div>
  );
}
