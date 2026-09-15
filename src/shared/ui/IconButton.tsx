import { type ButtonHTMLAttributes, type ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  loading?: boolean;
  children: ReactNode;
}

export default function IconButton({
  label,
  loading,
  children,
  className = '',
  disabled,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center min-h-11 min-w-11 rounded-xl text-ink-muted
        hover:text-ink hover:bg-surface-hover/80 disabled:opacity-50 disabled:cursor-not-allowed
        touch-manipulation ${className}`}
      {...props}
    >
      {loading ? (
        <svg aria-hidden="true" className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : children}
    </button>
  );
}
