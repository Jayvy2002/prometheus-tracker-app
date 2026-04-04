import { type ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  padding?: boolean;
  glow?: 'blue' | 'green' | 'orange' | 'purple' | false;
}

export default function Card({ children, className = '', onClick, padding = true, glow = false }: CardProps) {
  const glowClass = glow ? `glow-${glow}` : '';

  return (
    <div
      onClick={onClick}
      className={`bg-neutral-900/60 backdrop-blur-sm border border-neutral-800/50 rounded-2xl ${glowClass}
        ${padding ? 'p-4' : ''}
        ${onClick
          ? 'cursor-pointer hover:bg-neutral-900/80 hover:border-neutral-700/70 active:scale-[0.99] transition-all duration-200 card-hover'
          : 'transition-colors duration-200'
        }
        ${className}`}
    >
      {children}
    </div>
  );
}
