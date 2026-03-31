import { type ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  padding?: boolean;
}

export default function Card({ children, className = '', onClick, padding = true }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-neutral-900/60 backdrop-blur-sm border border-neutral-800/50 rounded-2xl
        ${padding ? 'p-4' : ''}
        ${onClick ? 'cursor-pointer hover:bg-neutral-900 active:scale-[0.99] transition-all duration-200' : ''}
        ${className}`}
    >
      {children}
    </div>
  );
}
