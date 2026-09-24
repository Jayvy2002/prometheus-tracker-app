import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const SEEN_KEY = 'prometheus_set_legend_seen';

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** First session only: what « S », « W » and « RIR » mean in the set rows. */
export default function SetLegend() {
  const { t } = useTranslation();
  const [seen, setSeen] = useState(readSeen);
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
    <div className="mb-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2.5 text-sm text-neutral-300" data-testid="set-legend">
      <p>{t('workout.legend.setTypes')}</p>
      <p className="mt-1">{t('workout.legend.rir')}</p>
      <button type="button" onClick={dismiss} className="mt-1 min-h-11 text-sm font-medium text-blue-400">
        {t('workout.legend.gotIt')}
      </button>
    </div>
  );
}
