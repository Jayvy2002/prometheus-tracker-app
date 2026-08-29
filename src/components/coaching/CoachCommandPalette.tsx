import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { useCoachingStore } from '../../stores/coachingStore';
import { answerCoachAsk, parseCoachAsk } from '../../lib/coachAsk';

export default function CoachCommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const { opsRows, priorities, rosterSignals } = useCoachingStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (coachingRole !== 'coach') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [coachingRole]);

  if (coachingRole !== 'coach' || !open) return null;

  const answer = query.trim()
    ? answerCoachAsk(parseCoachAsk(query), opsRows, priorities, rosterSignals)
    : null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-start justify-center px-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-3 border-b border-neutral-800">
          <Search size={16} className="text-neutral-500" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('coaching.ask.placeholder')}
            className="flex-1 bg-transparent text-sm text-white outline-none"
            onKeyDown={e => {
              if (e.key === 'Enter' && query.trim()) {
                navigate(`/prometheus?q=${encodeURIComponent(query.trim())}`);
                setOpen(false);
              }
            }}
          />
          <span className="text-[10px] text-neutral-600">esc</span>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {answer?.hits.map(hit => (
            <button
              key={`${hit.clientId}-${hit.href}`}
              type="button"
              onClick={() => { navigate(hit.href); setOpen(false); }}
              className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-900"
            >
              <p className="text-sm text-white truncate">{hit.clientName}</p>
              <p className="text-[11px] text-neutral-500 truncate">{hit.reason}</p>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              navigate(query.trim() ? `/prometheus?q=${encodeURIComponent(query.trim())}` : '/prometheus');
              setOpen(false);
            }}
            className="w-full text-left px-3 py-2 rounded-xl text-xs text-blue-400 hover:bg-neutral-900"
          >
            {t('coaching.ask.openPage')}
          </button>
        </div>
      </div>
    </div>
  );
}
