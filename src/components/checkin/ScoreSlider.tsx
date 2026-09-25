import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CHECKIN_SCORE_MAX,
  CHECKIN_SCORE_MIN,
  scoreFromKey,
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

/**
 * One 0–10 score. « Not answered yet » looks nothing like 0: dashed track, no
 * thumb, « Touch to answer ». A value exists only after a tap, a drag or a key,
 * and « Clear » brings the answer back to not answered (absence ≠ 0).
 */
export default function ScoreSlider({
  label,
  low,
  high,
  value,
  unsetLabel,
  onChange,
}: ScoreSliderProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const set = value != null;
  const pct = set ? ((value - CHECKIN_SCORE_MIN) / (CHECKIN_SCORE_MAX - CHECKIN_SCORE_MIN)) * 100 : 0;

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
    const next = scoreFromKey(value, e.key);
    if (next === undefined) return;
    e.preventDefault();
    onChange(next);
  };

  return (
    <div className="space-y-1" data-answered={set ? 'true' : 'false'}>
      <div className="flex min-h-11 items-center justify-between gap-2">
        <p className="text-sm font-medium text-white">
          {label}
          {set && (
            <span className="ml-2 text-blue-400 font-semibold">{value}/{CHECKIN_SCORE_MAX}</span>
          )}
        </p>
        {set ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={t('checkin.clearAnswerLabel', { field: label })}
            className="-mr-2 inline-flex min-h-11 items-center rounded-xl px-2 text-xs text-neutral-400 hover:text-white"
          >
            {t('checkin.clearAnswer')}
          </button>
        ) : (
          <span className="text-xs text-neutral-400" aria-hidden="true">{t('checkin.tapToAnswer')}</span>
        )}
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="horizontal"
        aria-valuemin={CHECKIN_SCORE_MIN}
        aria-valuemax={CHECKIN_SCORE_MAX}
        aria-valuenow={set ? value : undefined}
        aria-valuetext={set ? t('checkin.scoreValueText', { value, max: CHECKIN_SCORE_MAX }) : unsetLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className="relative h-11 px-3.5 select-none touch-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-full"
      >
        <div ref={trackRef} className="relative h-full">
          {set ? (
            <>
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-neutral-800" />
              <div
                className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full bg-blue-600"
                style={{ width: `${pct}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full border-2 shadow-md bg-blue-500 border-white"
                style={{ left: `${pct}%` }}
              />
            </>
          ) : (
            // Not answered: a neutral dashed track and no thumb, so nothing reads as « 0 ».
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full border border-dashed border-neutral-600" />
          )}
        </div>
      </div>

      <div className="flex justify-between text-[11px] text-neutral-500">
        <span>0 · {low}</span>
        <span>{high} · 10</span>
      </div>
    </div>
  );
}
