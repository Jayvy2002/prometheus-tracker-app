import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface CardLinkProps {
  to: string;
  children: ReactNode;
  className?: string;
}

export default function CardLink({ to, children, className = '' }: CardLinkProps) {
  return (
    <Link
      to={to}
      className={`block bg-neutral-900/60 border border-neutral-800/50 rounded-2xl p-4
        hover:bg-neutral-900/80 hover:border-neutral-700/70 transition-colors ${className}`}
    >
      {children}
    </Link>
  );
}
