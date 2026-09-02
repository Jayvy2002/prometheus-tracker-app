"use client";

/**
 * @author: @dorianbaffier
 * @description: Attract Button
 * @version: 1.0.0
 * @date: 2025-06-26
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { Magnet } from "lucide-react";
import { motion, useAnimation, useReducedMotion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/shadcn-button";
import { cn } from "@/lib/utils";

interface AttractButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  particleCount?: number;
  attractRadius?: number;
  children?: ReactNode;
}

interface Particle {
  id: number;
  x: number;
  y: number;
}

export default function AttractButton({
  className,
  particleCount = 12,
  attractRadius = 36,
  children,
  disabled,
  ...props
}: AttractButtonProps) {
  const reduceMotion = useReducedMotion();
  const [isAttracting, setIsAttracting] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const particlesControl = useAnimation();

  useEffect(() => {
    const spread = attractRadius * 2;
    const newParticles = Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      x: Math.random() * spread - attractRadius,
      y: Math.random() * spread - attractRadius,
    }));
    setParticles(newParticles);
  }, [particleCount, attractRadius]);

  const handleInteractionStart = useCallback(async () => {
    if (disabled || reduceMotion) return;
    setIsAttracting(true);
    await particlesControl.start({
      x: 0,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 50,
        damping: 10,
      },
    });
  }, [particlesControl, disabled, reduceMotion]);

  const handleInteractionEnd = useCallback(async () => {
    setIsAttracting(false);
    if (reduceMotion) return;
    await particlesControl.start((i) => ({
      x: particles[i]?.x ?? 0,
      y: particles[i]?.y ?? 0,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15,
      },
    }));
  }, [particlesControl, particles, reduceMotion]);

  return (
    <Button
      className={cn(
        "relative min-w-0 overflow-visible touch-none",
        "bg-blue-600 text-white",
        "[@media(hover:hover)]:hover:bg-blue-500",
        "border border-blue-300/50",
        "shadow-[0_0_18px_rgba(37,99,235,0.35)]",
        "transition-all duration-300",
        className
      )}
      disabled={disabled}
      onMouseEnter={handleInteractionStart}
      onMouseLeave={handleInteractionEnd}
      onTouchEnd={handleInteractionEnd}
      onTouchStart={handleInteractionStart}
      {...props}
    >
      {!reduceMotion &&
        particles.map((_, index) => (
          <motion.div
            animate={particlesControl}
            className={cn(
              "pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full",
              "bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.85)]",
              "transition-opacity duration-300",
              isAttracting ? "opacity-100" : "opacity-80"
            )}
            custom={index}
            initial={{ x: particles[index]?.x ?? 0, y: particles[index]?.y ?? 0 }}
            key={index}
          />
        ))}
      <span className="relative z-10 flex w-full items-center justify-center gap-2">
        {children}
        <Magnet
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-300",
            isAttracting && "scale-110"
          )}
        />
      </span>
    </Button>
  );
}
