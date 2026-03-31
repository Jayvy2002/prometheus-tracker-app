const CACHE_KEY = 'prometheus_offline_cache';

interface CacheEntry {
  key: string;
  data: unknown;
  timestamp: number;
}

interface CacheStore {
  entries: CacheEntry[];
}

function readCache(): CacheStore {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { entries: [] };
    return JSON.parse(raw) as CacheStore;
  } catch {
    return { entries: [] };
  }
}

function writeCache(store: CacheStore) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    // localStorage full or unavailable
  }
}

export function setCacheItem<T>(key: string, data: T) {
  const store = readCache();
  const idx = store.entries.findIndex(e => e.key === key);
  const entry: CacheEntry = { key, data, timestamp: Date.now() };
  if (idx >= 0) {
    store.entries[idx] = entry;
  } else {
    store.entries.push(entry);
  }
  writeCache(store);
}

export function getCacheItem<T>(key: string): T | null {
  const store = readCache();
  const entry = store.entries.find(e => e.key === key);
  return entry ? (entry.data as T) : null;
}

export function clearCacheItem(key: string) {
  const store = readCache();
  store.entries = store.entries.filter(e => e.key !== key);
  writeCache(store);
}

export function workoutCacheKey(workoutId: string) {
  return `workout_draft_${workoutId}`;
}
