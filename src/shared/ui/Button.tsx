import { type ButtonHTMLAttributes, type ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  /** No :hover styles — first tap on touch must fire click, not "stick" on hover. */
  pressOnly?: boolean;
  children: ReactNode;
}

const variants = {
  primary: {
    base: 'bg-primary text-ink',
    hover: 'hover:bg-primary-hover',
  },
  secondary: {
    base: 'bg-surface-hover text-ink-secondary border border-line',
    hover: 'hover:bg-surface-active hover:border-ink-disabled',
  },
  ghost: {
    base: 'bg-transparent text-ink-secondary',
    hover: 'hover:bg-surface-hover/80',
  },
  danger: {
    base: 'bg-danger text-ink shadow-lg shadow-danger/20',
    hover: 'hover:bg-danger-hover',
  },
};

const sizes = {
  sm: 'min-h-11 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-6 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading,
  pressOnly = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const palette = variants[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-medium rounded-xl
        transition-all duration-200 ease-out touch-manipulation
        ${palette.base} ${pressOnly ? '' : palette.hover} ${sizes[size]}
        ${disabled || loading
          ? 'opacity-50 cursor-not-allowed'
          : pressOnly
            ? 'active:opacity-90'
            : 'active:opacity-90'
        }
        ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && (
        <svg aria-hidden="true" focusable="false" className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
