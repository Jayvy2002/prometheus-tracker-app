import { useCallback, useEffect, useRef, useState } from 'react';
import { OffSearchError, searchOpenFoodFacts } from './openFoodFacts';
import type { FoodProduct } from './types';
import {
  FOOD_SEARCH_DEBOUNCE_MS,
  FOOD_SEARCH_MIN_CHARS,
  mergeRankedFoodHits,
  type RankedFoodHit,
} from './pickerSearch';
import { useNutritionStore } from '../stores/nutritionStore';

export type OffStatus = 'idle' | 'loading' | 'ok' | 'rate_limited' | 'error';

/**
 * D06 — recherche alimentaire conforme OFF :
 * - à la frappe (debounce) : LOCALE uniquement (récents, favoris, base Supabase) ;
 * - Open Food Facts : UNIQUEMENT sur action explicite (bouton/Entrée → searchNow),
 *   avec timeout, annulation et budget partagé. Un échec OFF ne casse jamais
 *   les résultats locaux.
 */
export function useFoodCatalogSearch(active: boolean, lang: string, country = 'fr') {
  const searchProducts = useNutritionStore(s => s.searchProducts);
  const batchSaveProducts = useNutritionStore(s => s.batchSaveProducts);
  const recents = useNutritionStore(s => s.recentProducts);
  const favorites = useNutritionStore(s => s.favorites);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RankedFoodHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [offStatus, setOffStatus] = useState<OffStatus>('idle');
  const [offQuery, setOffQuery] = useState('');
  const localRunId = useRef(0);
  const offRunId = useRef(0);
  const offAbort = useRef<AbortController | null>(null);
  const offCache = useRef<{ query: string; hits: FoodProduct[] }>({ query: '', hits: [] });
  const dbCache = useRef<{ query: string; hits: FoodProduct[] }>({ query: '', hits: [] });

  const mergeAll = useCallback((q: string) => mergeRankedFoodHits({
    query: q,
    db: dbCache.current.query === q ? dbCache.current.hits : [],
    off: offCache.current.query === q ? offCache.current.hits : [],
    recents,
    favorites,
  }), [favorites, recents]);

  // À la frappe : locale uniquement (rapide, sans budget distant).
  useEffect(() => {
    if (!active) return;
    const q = query.trim();
    if (q.length < FOOD_SEARCH_MIN_CHARS) {
      localRunId.current += 1;
      setSearching(false);
      setSearched(false);
      setResults(q ? mergeRankedFoodHits({ query: q, db: [], off: [], recents, favorites }) : []);
      return;
    }
    const id = ++localRunId.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        const dbResults = await searchProducts(q);
        if (localRunId.current !== id) return;
        dbCache.current = { query: q, hits: dbResults };
        setResults(mergeRankedFoodHits({
          query: q,
          db: dbResults,
          off: offCache.current.query === q ? offCache.current.hits : [],
          recents,
          favorites,
        }));
        setSearching(false);
      })();
    }, FOOD_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [active, query, searchProducts, recents, favorites]);

  // Explicite (bouton/Entrée) : locale + OFF en parallèle, sources indépendantes.
  const searchNow = useCallback(() => {
    const q = query.trim();
    if (q.length < FOOD_SEARCH_MIN_CHARS) return;
    const localId = ++localRunId.current;
    const offId = ++offRunId.current;
    offAbort.current?.abort();
    const aborter = new AbortController();
    offAbort.current = aborter;
    setSearching(true);
    setSearched(false);
    setOffStatus('loading');

    void searchProducts(q).then(dbResults => {
      if (localRunId.current !== localId) return;
      dbCache.current = { query: q, hits: dbResults };
      setResults(mergeAll(q));
      setSearching(false);
      setSearched(true);
    });

    void (async () => {
      try {
        const offResults = await searchOpenFoodFacts(q, { lang, country, signal: aborter.signal });
        if (offRunId.current !== offId) return;
        offCache.current = { query: q, hits: offResults };
        setOffQuery(q);
        setOffStatus('ok');
        setResults(mergeAll(q));
        if (offResults.length > 0) void batchSaveProducts(offResults);
      } catch (err) {
        if (offRunId.current !== offId) return;
        if (err instanceof OffSearchError && err.kind === 'aborted') return;
        setOffStatus(err instanceof OffSearchError && err.kind === 'rate_limited' ? 'rate_limited' : 'error');
      }
    })();
  }, [query, searchProducts, batchSaveProducts, lang, country, mergeAll]);

  const resetSearch = useCallback(() => {
    localRunId.current += 1;
    offRunId.current += 1;
    offAbort.current?.abort();
    offCache.current = { query: '', hits: [] };
    dbCache.current = { query: '', hits: [] };
    setQuery('');
    setResults([]);
    setSearching(false);
    setSearched(false);
    setOffStatus('idle');
    setOffQuery('');
  }, []);

  // Compat d'affichage : 'openfoodfacts' pendant l'appel explicite OFF.
  const phase = offStatus === 'loading' ? 'openfoodfacts' : searching ? 'db' : 'idle';

  return {
    query,
    setQuery,
    results,
    searching,
    searched,
    phase,
    offStatus,
    offQuery,
    searchNow,
    resetSearch,
  };
}
