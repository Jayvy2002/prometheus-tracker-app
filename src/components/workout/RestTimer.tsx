import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import Modal from '../ui/Modal';
import { countdownEndAt, countdownRemaining } from '../../lib/restTimer';

const PRESETS = [
  { label: '30s', value: 30 },
  { label: '45s', value: 45 },
  { label: '1:00', value: 60 },
  { label: '1:30', value: 90 },
  { label: '2:00', value: 120 },
  { label: '3:00', value: 180 },
];

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const sequences = [
      { freq: 880, start: 0, duration: 0.12 },
      { freq: 1100, start: 0.15, duration: 0.18 },
    ];
    for (const { freq, start, duration } of sequences) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + start + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    }
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // AudioContext not supported
  }
}

function vibrate() {
  if ('vibrate' in navigator) {
    navigator.vibrate([200, 100, 200]);
  }
}

export default function RestTimer({
  open,
  onClose,
  onReopen,
  initialSeconds,
  autoStart = false,
}: {
  open: boolean;
  onClose: () => void;
  onReopen?: () => void;
  initialSeconds?: number;
  autoStart?: boolean;
}) {
  const { t } = useTranslation();
  const seed = initialSeconds && initialSeconds > 0 ? initialSeconds : 90;
  const [duration, setDuration] = useState(seed);
  const [remaining, setRemaining] = useState(seed);
  const [active, setActive] = useState(autoStart && open);
  const [inputMin, setInputMin] = useState(String(Math.floor(seed / 60)));
  const [inputSec, setInputSec] = useState(String(seed % 60));
  const remainingRef = useRef(seed);
  const firedRef = useRef(false);
  const endAtRef = useRef<number | null>(null);

  remainingRef.current = remaining;

  useEffect(() => {
    if (!autoStart || open) return;
    firedRef.current = false;
    endAtRef.current = null;
    const next = initialSeconds && initialSeconds > 0 ? initialSeconds : seed;
    setDuration(next);
    setRemaining(next);
    remainingRef.current = next;
    setInputMin(String(Math.floor(next / 60)));
    setInputSec(String(next % 60));
    setActive(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    // Fermer le modal ne tue pas le chrono : on ne reseed que si rien n'est en cours.
    const inFlight = active || (remainingRef.current > 0 && remainingRef.current < duration);
    if (inFlight) return;
    firedRef.current = false;
    const next = initialSeconds && initialSeconds > 0 ? initialSeconds : duration;
    setDuration(next);
    setRemaining(next);
    remainingRef.current = next;
    setInputMin(String(Math.floor(next / 60)));
    setInputSec(String(next % 60));
    setActive(autoStart);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!active) return;
    if (endAtRef.current == null) endAtRef.current = countdownEndAt(remainingRef.current, Date.now());
    const tick = () => {
      const left = countdownRemaining(endAtRef.current ?? countdownEndAt(0, Date.now()), Date.now());
      remainingRef.current = left;
      setRemaining(left);
      if (left <= 0) setActive(false);
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (remaining === 0 && !firedRef.current) {
      firedRef.current = true;
      playBeep();
      vibrate();
    }
  }, [remaining]);

  const reset = (dur?: number) => {
    setActive(false);
    firedRef.current = false;
    endAtRef.current = null;
    const d = dur ?? duration;
    setDuration(d);
    setRemaining(d);
    remainingRef.current = d;
    setInputMin(String(Math.floor(d / 60)));
    setInputSec(String(d % 60));
  };

  const applyCustom = () => {
    const m = Math.max(0, parseInt(inputMin, 10) || 0);
    const s = Math.max(0, Math.min(59, parseInt(inputSec, 10) || 0));
    const total = m * 60 + s;
    if (total > 0 && total <= 600) {
      reset(total);
    }
  };

  const nudge = (delta: number) => {
    const base = endAtRef.current != null ? countdownRemaining(endAtRef.current, Date.now()) : remainingRef.current;
    const next = Math.max(0, Math.min(600, base + delta));
    endAtRef.current = countdownEndAt(next, Date.now());
    remainingRef.current = next;
    setRemaining(next);
    setDuration(d => Math.max(d, next));
    if (next === 0) setActive(false);
    else setActive(true);
  };

  const skip = () => {
    setActive(false);
    firedRef.current = true;
    endAtRef.current = null;
    remainingRef.current = duration;
    setRemaining(duration);
  };

  const pct = duration > 0 ? (remaining / duration) * 100 : 0;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const isFinished = remaining === 0;
  const showBar = !open && (active || (remaining > 0 && remaining < duration) || isFinished);

  return (
    <>
      {showBar && (
        <div
          data-rest-bar="true"
          className="fixed z-40 left-1/2 -translate-x-1/2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6 flex items-center gap-1 rounded-full bg-neutral-900 border border-blue-500/40 px-2 py-1 text-sm text-white shadow-xl"
        >
          <button type="button" className="min-h-11 min-w-11 rounded-full text-sm font-medium" onClick={() => nudge(-15)} aria-label={t('workout.restTimer.minus15')}>−15</button>
          <button type="button" className="min-h-11 px-3 font-mono" onClick={() => onReopen?.()}>
            {isFinished ? t('workout.restTimer.go') : `${mins}:${secs.toString().padStart(2, '0')}`}
          </button>
          <button type="button" className="min-h-11 min-w-11 rounded-full text-sm font-medium" onClick={() => nudge(15)} aria-label={t('workout.restTimer.plus15')}>+15</button>
          <button type="button" className="min-h-11 px-3 text-sm" onClick={skip}>{t('workout.restTimer.skip')}</button>
        </div>
      )}
    <Modal open={open} onClose={onClose} title={t('workout.restTimer.title')}>
      <div className="text-center">
        <div className="relative w-48 h-48 mx-auto mb-6 animate-fade-in-scale">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#0a0a0a" strokeWidth="6" />
            <circle
              cx="50" cy="50" r="45" fill="none"
              stroke={isFinished ? '#10b981' : '#2563eb'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 45}`}
              strokeDashoffset={`${2 * Math.PI * 45 * (1 - pct / 100)}`}
              className="transition-all duration-200 ease-linear"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-4xl font-bold font-mono ${isFinished ? 'text-emerald-400 animate-pulse' : 'text-white'}`}>
              {isFinished ? t('workout.restTimer.go') : `${mins}:${secs.toString().padStart(2, '0')}`}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 mb-6">
          <IconButton
            label={t('workout.restTimer.reset')}
            onClick={() => reset()}
            className="bg-neutral-900"
          >
            <RotateCcw size={20} />
          </IconButton>
          <button
            type="button"
            aria-label={active ? t('workout.restTimer.pause') : t('workout.restTimer.play')}
            onClick={() => setActive(!active)}
            className={`p-4 rounded-2xl text-white hover:opacity-90 transition-all shadow-lg min-h-11 min-w-11
              ${isFinished ? 'bg-emerald-600 shadow-emerald-900/30' : 'bg-blue-600 shadow-blue-900/30'}`}
          >
            {active ? <Pause size={24} /> : <Play size={24} />}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 justify-center mb-5">
          {PRESETS.map(p => (
            <Button
              key={p.value}
              type="button"
              size="sm"
              variant={duration === p.value ? 'primary' : 'secondary'}
              onClick={() => reset(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>

        {/* Minutes:Seconds picker */}
        <div className="flex items-center justify-center gap-1">
          <div className="flex flex-col items-center">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              value={inputMin}
              onChange={e => setInputMin(e.target.value)}
              onBlur={applyCustom}
              className="w-14 h-12 bg-neutral-900 border border-neutral-800 rounded-xl text-center text-lg font-mono text-white focus:outline-none focus:border-blue-500 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-[10px] text-neutral-500 mt-1">min</span>
          </div>
          <span className="text-xl font-bold text-neutral-500 mb-4">:</span>
          <div className="flex flex-col items-center">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              value={inputSec}
              onChange={e => setInputSec(e.target.value)}
              onBlur={applyCustom}
              onKeyDown={e => { if (e.key === 'Enter') applyCustom(); }}
              className="w-14 h-12 bg-neutral-900 border border-neutral-800 rounded-xl text-center text-lg font-mono text-white focus:outline-none focus:border-blue-500 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-[10px] text-neutral-500 mt-1">sec</span>
          </div>
        </div>
      </div>
    </Modal>
    </>
  );
}
