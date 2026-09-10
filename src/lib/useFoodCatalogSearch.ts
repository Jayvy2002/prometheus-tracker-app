import { useCallback, useEffect, useRef, useState } from 'react';
import { searchOpenFoodFacts } from './openFoodFacts';
import {
  FOOD_SEARCH_DEBOUNCE_MS,
  FOOD_SEARCH_MIN_CHARS,
  mergeRankedFoodHits,
  type RankedFoodHit,
} from './pickerSearch';
import { useNutritionStore } from '../stores/nutritionStore';

export function useFoodCatalogSearch(active: boolean, lang: string) {
  const searchProducts = useNutritionStore(s => s.searchProducts);
  const batchSaveProducts = useNutritionStore(s => s.batchSaveProducts);
  const recents = useNutritionStore(s => s.recentProducts);
  const favorites = useNutritionStore(s => s.favorites);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RankedFoodHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'db' | 'openfoodfacts'>('idle');
  const runId = useRef(0);

  const localHits = useCallback((q: string) => mergeRankedFoodHits({
    query: q,
    db: [],
    off: [],
    recents,
    favorites,
  }), [favorites, recents]);

  const runSearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (q.length < FOOD_SEARCH_MIN_CHARS) return;
    const id = ++runId.current;
    setSearching(true);
    setSearched(false);
    setPhase('db');

    const dbPromise = searchProducts(q);
    const offPromise = searchOpenFoodFacts(q, lang);

    const dbResults = await dbPromise;
    if (runId.current !== id) return;
    const early = mergeRankedFoodHits({
      query: q,
      db: dbResults,
      off: [],
      recents,
      favorites,
    });
    if (early.length > 0) {
      setResults(early);
      setSearching(false);
    }
    setPhase('openfoodfacts');

    const offResults = await offPromise;
    if (runId.current !== id) return;
    setResults(mergeRankedFoodHits({
      query: q,
      db: dbResults,
      off: offResults,
      recents,
      favorites,
    }));
    setSearched(true);
    setSearching(false);
    setPhase('idle');
    if (offResults.length > 0) void batchSaveProducts(offResults);
  }, [batchSaveProducts, favorites, lang, recents, searchProducts]);

  useEffect(() => {
    if (!active) return;
    const q = query.trim();
    if (q.length < FOOD_SEARCH_MIN_CHARS) {
      runId.current += 1;
      setSearching(false);
      setSearched(false);
      setPhase('idle');
      setResults(q ? localHits(q) : []);
      return;
    }
    const timer = window.setTimeout(() => {
      void runSearch(q);
    }, FOOD_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [active, localHits, query, runSearch]);

  const searchNow = useCallback(() => {
    const q = query.trim();
    if (q.length < FOOD_SEARCH_MIN_CHARS) return;
    void runSearch(q);
  }, [query, runSearch]);

  const resetSearch = useCallback(() => {
    runId.current += 1;
    setQuery('');
    setResults([]);
    setSearching(false);
    setSearched(false);
    setPhase('idle');
  }, []);

  return {
    query,
    setQuery,
    results,
    searching,
    searched,
    phase,
    searchNow,
    resetSearch,
  };
}
