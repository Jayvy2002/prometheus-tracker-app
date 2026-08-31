import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import {
  CHECKIN_SCORE_MAX,
  CHECKIN_SCORE_MIN,
  scoreFromTrackRatio,
} from '../../lib/checkinScale';

interface ScoreSliderProps {
  label: string;
  low: string;
  high: string;
  value: number | null;
  unsetLabel: string;
  onChange: (value: number | null) => void;
}

function scoreFromPointer(clientX: number, rect: DOMRect): number {
  if (rect.width <= 0) return CHECKIN_SCORE_MIN;
  return scoreFromTrackRatio((clientX - rect.left) / rect.width);
}

export default function ScoreSlider({
  label,
  low,
  high,
  value,
  unsetLabel,
  onChange,
}: ScoreSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const set = value != null;
  const visual = value ?? CHECKIN_SCORE_MIN;
  const pct = ((visual - CHECKIN_SCORE_MIN) / (CHECKIN_SCORE_MAX - CHECKIN_SCORE_MIN)) * 100;

  const applyClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    onChange(scoreFromPointer(clientX, el.getBoundingClientRect()));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    applyClientX(e.clientX);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    applyClientX(e.clientX);
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = value ?? CHECKIN_SCORE_MIN;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(CHECKIN_SCORE_MAX, current + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(Math.max(CHECKIN_SCORE_MIN, value == null ? CHECKIN_SCORE_MIN : current - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(CHECKIN_SCORE_MIN);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(CHECKIN_SCORE_MAX);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white">
          {label}
          {set ? (
            <span className="ml-2 text-blue-400 font-semibold">{value}/{CHECKIN_SCORE_MAX}</span>
          ) : (
            <span className="ml-2 text-neutral-600 font-normal">{unsetLabel}</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-[10px] text-neutral-500 hover:text-neutral-300"
        >
          {set ? '×' : '—'}
        </button>
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="horizontal"
        aria-valuemin={CHECKIN_SCORE_MIN}
        aria-valuemax={CHECKIN_SCORE_MAX}
        aria-valuenow={set ? visual : undefined}
        aria-valuetext={set ? String(value) : unsetLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className="relative h-10 px-3.5 select-none touch-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-full"
      >
        <div ref={trackRef} className="relative h-full">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-neutral-800" />
          <div
            className={`absolute top-1/2 -translate-y-1/2 h-2 rounded-full ${set ? 'bg-blue-600' : 'bg-transparent'}`}
            style={{ width: `${pct}%` }}
          />
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full border-2 shadow-md
              ${set
                ? 'bg-blue-500 border-white'
                : 'bg-neutral-700 border-neutral-500'}`}
            style={{ left: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-neutral-600">
        <span>0 · {low}</span>
        <span>{high} · 10</span>
      </div>
    </div>
  );
}
