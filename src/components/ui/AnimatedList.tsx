import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface AnimatedListProps {
  children: ReactNode[];
  className?: string;
  baseDelay?: number;
  staggerMs?: number;
}

const LIST_EASE = [0.16, 1, 0.3, 1] as const;

export default function AnimatedList({
  children,
  className = '',
  baseDelay = 40,
  staggerMs = 70,
}: AnimatedListProps) {
  const reduceMotion = useReducedMotion();

  const items = children.filter(child => child != null && child !== false);

  return (
    <div className={className}>
      {items.map((child, i) => (
        <motion.div
          key={i}
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.42,
            ease: LIST_EASE,
            delay: (baseDelay + i * staggerMs) / 1000,
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
