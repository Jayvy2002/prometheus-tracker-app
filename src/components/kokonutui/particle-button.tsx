"use client";

/**
 * @author: @dorianbaffier
 * @description: Particle Button
 * @version: 1.0.0
 * @date: 2025-06-26
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { MousePointerClick } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type MouseEvent, type RefObject, useRef, useState } from "react";
import type { ButtonProps } from "@/components/ui/shadcn-button";
import { Button } from "@/components/ui/shadcn-button";
import { cn } from "@/lib/utils";

interface ParticleButtonProps extends ButtonProps {
  onSuccess?: () => void;
  successDuration?: number;
}

function SuccessParticles({
  buttonRef,
}: {
  buttonRef: RefObject<HTMLButtonElement>;
}) {
  const rect = buttonRef.current?.getBoundingClientRect();
  if (!rect) return null;

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  return (
    <AnimatePresence>
      {[...Array(12)].map((_, i) => (
        <motion.div
          animate={{
            scale: [0, 1.4, 0],
            x: [0, (i % 2 ? 1 : -1) * (Math.random() * 70 + 28)],
            y: [0, -Math.random() * 70 - 28],
          }}
          className="fixed h-2.5 w-2.5 rounded-full bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.9)]"
          initial={{
            scale: 0,
            x: 0,
            y: 0,
          }}
          key={i}
          style={{ left: centerX, top: centerY }}
          transition={{
            duration: 0.7,
            delay: i * 0.05,
            ease: "easeOut",
          }}
        />
      ))}
    </AnimatePresence>
  );
}

export default function ParticleButton({
  children,
  onClick,
  onSuccess,
  successDuration = 1000,
  className,
  ...props
}: ParticleButtonProps) {
  const [showParticles, setShowParticles] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = async (e: MouseEvent<HTMLButtonElement>) => {
    setShowParticles(true);
    onClick?.(e);
    onSuccess?.();
    setTimeout(() => {
      setShowParticles(false);
    }, successDuration);
  };

  return (
    <>
      {showParticles && (
        <SuccessParticles
          buttonRef={buttonRef as RefObject<HTMLButtonElement>}
        />
      )}
      <Button
        {...props}
        className={cn(
          "relative",
          showParticles && "scale-95",
          "transition-transform duration-100",
          className
        )}
        onClick={handleClick}
        ref={buttonRef}
      >
        {children}
        <MousePointerClick className="h-4 w-4" />
      </Button>
    </>
  );
}
