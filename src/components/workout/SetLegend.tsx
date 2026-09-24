import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const SEEN_KEY = 'prometheus_set_legend_seen';

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Until « Compris »: what « S », « É » and « RIR » mean in the set rows.
 * One compact line; the full explanation opens on demand. Once dismissed it
 * stays gone on this device.
 */
export default function SetLegend() {
  const { t } = useTranslation();
  const [seen, setSeen] = useState(readSeen);
  const [open, setOpen] = useState(false);
  if (seen) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Private window: the legend simply shows again next time.
    }
    setSeen(true);
  };
  return (
    <div
      className="mb-3 rounded-xl border border-neutral-800 bg-neutral-900/60 pl-3 text-xs text-neutral-300"
      data-testid="set-legend"
      role="note"
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
        >
          <span className="line-clamp-2 min-w-0 flex-1">{t('workout.legend.compact')}</span>
          {open
            ? <ChevronUp size={14} className="shrink-0 text-neutral-500" aria-hidden="true" />
            : <ChevronDown size={14} className="shrink-0 text-neutral-500" aria-hidden="true" />}
        </button>
        <button type="button" onClick={dismiss} className="min-h-11 shrink-0 px-3 text-xs font-medium text-blue-400">
          {t('workout.legend.gotIt')}
        </button>
      </div>
      {open && (
        <div className="space-y-1 pb-2 pr-3 text-neutral-400">
          <p>{t('workout.legend.setTypes')}</p>
          <p>{t('workout.legend.rir')}</p>
        </div>
      )}
    </div>
  );
}
