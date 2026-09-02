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
  baseDelay = 0,
  staggerMs = 60,
}: AnimatedListProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={className}>
      {children.map((child, i) => (
        <motion.div
          key={i}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.38,
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
