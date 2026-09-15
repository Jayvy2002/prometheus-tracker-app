import { type ReactNode } from 'react';

interface AnimatedListProps {
  children: ReactNode[];
  className?: string;
  baseDelay?: number;
  staggerMs?: number;
}

export default function AnimatedList({
  children,
  className = '',
  baseDelay = 0,
  staggerMs = 60,
}: AnimatedListProps) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <div
          key={i}
          className="animate-fade-in-up"
          style={{ animationDelay: `${baseDelay + i * staggerMs}ms` }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
