import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import Modal from '../ui/Modal';

const PRESETS = [30, 60, 90, 120, 180];

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

export default function RestTimer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [duration, setDuration] = useState(90);
  const [remaining, setRemaining] = useState(90);
  const [active, setActive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const firedRef = useRef(false);

  useEffect(() => {
    if (active && remaining > 0) {
      firedRef.current = false;
      intervalRef.current = setInterval(() => {
        setRemaining(r => {
          if (r <= 1) {
            setActive(false);
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [active, remaining]);

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
    const d = dur ?? duration;
    setDuration(d);
    setRemaining(d);
  };

  const pct = (remaining / duration) * 100;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const isFinished = remaining === 0;

  return (
    <Modal open={open} onClose={onClose} title="Rest Timer">
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
              className="transition-all duration-1000 ease-linear"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-4xl font-bold font-mono ${isFinished ? 'text-emerald-400 animate-pulse' : 'text-white'}`}>
              {isFinished ? 'GO!' : `${mins}:${secs.toString().padStart(2, '0')}`}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 mb-6">
          <button onClick={() => reset()} className="p-3 rounded-xl bg-neutral-900 text-neutral-300 hover:text-white transition-colors">
            <RotateCcw size={20} />
          </button>
          <button
            onClick={() => setActive(!active)}
            className={`p-4 rounded-2xl text-white hover:opacity-90 transition-all shadow-lg
              ${isFinished ? 'bg-emerald-600 shadow-emerald-900/30' : 'bg-blue-600 shadow-blue-900/30'}`}
          >
            {active ? <Pause size={24} /> : <Play size={24} />}
          </button>
        </div>

        <div className="flex gap-2 justify-center">
          {PRESETS.map(p => (
            <button
              key={p}
              onClick={() => reset(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-transform active:scale-90
                ${duration === p ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-400 hover:text-white'}`}
            >
              {p}s
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
