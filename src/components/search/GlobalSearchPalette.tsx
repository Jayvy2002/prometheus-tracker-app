import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Search, Sparkles } from 'lucide-react';
import { useCoachingStore } from '../../stores/coachingStore';
import { useAccountContext } from '../../lib/useAccountContext';
import { answerCoachAsk, parseCoachAsk } from '../../lib/coachAsk';
import { useGlobalSearch } from '../../features/search/hooks/useGlobalSearch';
import { SEARCH_CATEGORIES, searchReady, type SearchItem } from '../../features/search/domain/globalSearch';
import { OPEN_SEARCH_EVENT } from '../../features/search/openSearch';

/**
 * Vision §33 — one search, contextual to the displayed workspace. The
 * workspace chooses what is listed; RLS decides what can be read.
 * In the coaching workspace, « Demander à Prometheus » stays one keystroke away.
 */
export default function GlobalSearchPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const context = useAccountContext();
  const scope = context.activeWorkspace === 'coaching' ? 'coach' : 'personal';
  const { opsRows, priorities, rosterSignals } = useCoachingStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const titleId = useId();
  const listId = useId();
  const returnFocus = useRef<HTMLElement | null>(null);
  const { groups, loading } = useGlobalSearch(open, scope, query);

  useEffect(() => {
    const show = () => {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, show);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, show);
    };
  }, []);

  useEffect(() => { setActive(0); }, [query, scope]);

  const flat = useMemo(() => groups.flatMap(group => group.items.filter(item => item.href)), [groups]);
  // Real questions (« qui n'a pas… », « squat de Léa ») get Prometheus' answer;
  // a plain name is already covered by the Clients group.
  const parsed = scope === 'coach' && query.trim() ? parseCoachAsk(query) : null;
  const answer = parsed && (parsed.type === 'roster' || parsed.type === 'client_lift')
    ? answerCoachAsk(parsed, opsRows, priorities, rosterSignals)
    : null;

  const close = () => {
    setOpen(false);
    setQuery('');
    returnFocus.current?.focus?.();
  };

  const go = (item: SearchItem) => {
    if (!item.href) return;
    if (item.external) window.open(item.href, '_blank', 'noopener,noreferrer');
    else navigate(item.href);
    close();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-start justify-center px-4 pt-[8vh] md:pt-[12vh]"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        data-testid="global-search"
      >
        <h2 id={titleId} className="sr-only">{t('search.title')}</h2>
        <div className="flex items-center gap-2 px-3 py-3 border-b border-neutral-800">
          <Search size={16} className="text-neutral-500" aria-hidden="true" />
          <input
            autoFocus
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls={listId}
            aria-activedescendant={flat[active] ? `${listId}-${flat[active].id}` : undefined}
            aria-label={t('search.title')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t(scope === 'coach' ? 'search.placeholderCoach' : 'search.placeholderPersonal')}
            className="flex-1 bg-transparent text-sm text-white outline-none min-h-11"
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); close(); return; }
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, Math.max(0, flat.length - 1))); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); return; }
              if (e.key === 'Enter') {
                e.preventDefault();
                if (flat[active]) go(flat[active]);
                else if (scope === 'coach' && query.trim()) {
                  navigate(`/prometheus?q=${encodeURIComponent(query.trim())}`);
                  close();
                }
              }
            }}
          />
          <button type="button" onClick={close} className="min-h-11 px-2 text-[11px] text-neutral-500 hover:text-neutral-300">
            {t('search.close')}
          </button>
        </div>

        <div id={listId} role="listbox" aria-label={t('search.results')} className="max-h-[60vh] overflow-y-auto p-2 space-y-3">
          {!searchReady(query) ? (
            <p className="px-3 py-2 text-xs text-neutral-500">
              {t('search.hint', { what: SEARCH_CATEGORIES[scope].map(c => t(`search.groups.${c}`).toLowerCase()).join(', ') })}
            </p>
          ) : null}

          {answer?.hits.length ? (
            <div>
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-neutral-600">{t('search.groups.attention')}</p>
              {answer.hits.map(hit => (
                <button
                  key={`${hit.clientId}-${hit.href}`}
                  type="button"
                  onClick={() => { navigate(hit.href); close(); }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-900"
                >
                  <p className="text-sm text-white truncate">{hit.clientName}</p>
                  <p className="text-[11px] text-neutral-500 truncate">{hit.reason}</p>
                </button>
              ))}
            </div>
          ) : null}

          {groups.map(group => (
            <div key={group.category} role="group" aria-label={t(`search.groups.${group.category}`)}>
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-neutral-600">{t(`search.groups.${group.category}`)}</p>
              {group.items.map(item => {
                const index = flat.indexOf(item);
                const selected = index === active && index >= 0;
                const body = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-white truncate">{item.title}</span>
                      {item.subtitle ? <span className="block text-[11px] text-neutral-500 truncate">{item.subtitle}</span> : null}
                    </span>
                    {item.external ? <ExternalLink size={14} className="text-neutral-500 shrink-0" aria-hidden="true" /> : null}
                  </>
                );
                return item.href ? (
                  <button
                    key={item.id}
                    id={`${listId}-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => index >= 0 && setActive(index)}
                    onClick={() => go(item)}
                    className={`w-full min-h-11 flex items-center gap-2 text-left px-3 py-2 rounded-xl ${selected ? 'bg-neutral-900' : 'hover:bg-neutral-900'}`}
                  >
                    {body}
                  </button>
                ) : (
                  <div key={item.id} className="flex items-center gap-2 px-3 py-2">{body}</div>
                );
              })}
            </div>
          ))}

          {searchReady(query) && !loading && groups.length === 0 && !answer?.hits.length ? (
            <p className="px-3 py-2 text-sm text-neutral-400" role="status">{t('search.empty')}</p>
          ) : null}
          {loading ? <p className="px-3 py-1 text-[11px] text-neutral-600" role="status">{t('common.loading')}</p> : null}

          {scope === 'coach' ? (
            <button
              type="button"
              onClick={() => {
                navigate(query.trim() ? `/prometheus?q=${encodeURIComponent(query.trim())}` : '/prometheus');
                close();
              }}
              className="w-full min-h-11 flex items-center gap-2 text-left px-3 py-2 rounded-xl text-xs text-blue-400 hover:bg-neutral-900"
            >
              <Sparkles size={14} aria-hidden="true" /> {t('coaching.ask.openPage')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
