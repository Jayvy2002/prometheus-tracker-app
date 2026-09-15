import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface CardLinkProps {
  to: string;
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}

export default function CardLink({ to, children, className = '', ...rest }: CardLinkProps) {
  const testId = rest['data-testid'];
  return (
    <Link
      to={to}
      {...(testId ? { 'data-testid': testId } : {})}
      className={`block bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4
        hover:bg-neutral-900/80 hover:border-neutral-700/70 transition-colors ${className}`}
    >
      {children}
    </Link>
  );
}
