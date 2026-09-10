import { getSessionOwner } from './sessionScope';

const CACHE_KEY = 'prometheus_offline_cache';

interface CacheEntry {
  key: string;
  data: unknown;
  timestamp: number;
  /** Owner du compte ayant écrit l'entrée. Absent = entrée legacy (jamais relue une fois un owner posé). */
  owner?: string | null;
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
    // localStorage full — evict the oldest half of entries and retry
    if (store.entries.length > 1) {
      store.entries.sort((a, b) => a.timestamp - b.timestamp);
      store.entries = store.entries.slice(Math.ceil(store.entries.length / 2));
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(store));
      } catch {
        // Still failing — clear the cache entirely to avoid a broken state
        try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
      }
    }
  }
}

export function setCacheItem<T>(key: string, data: T) {
  const owner = getSessionOwner();
  const store = readCache();
  const idx = store.entries.findIndex(e => e.key === key && (e.owner ?? null) === owner);
  const entry: CacheEntry = { key, data, timestamp: Date.now(), owner };
  if (idx >= 0) {
    store.entries[idx] = entry;
  } else {
    store.entries.push(entry);
  }
  writeCache(store);
}

/**
 * S05 : ne relit que les entrées du compte courant. Déconnecté (owner null),
 * seules les entrées écrites déconnecté sont lisibles — jamais celles d'un compte.
 */
export function getCacheItem<T>(key: string): T | null {
  const owner = getSessionOwner();
  const store = readCache();
  const entry = store.entries.find(e => e.key === key && (e.owner ?? null) === owner);
  return entry ? (entry.data as T) : null;
}

export function clearCacheItem(key: string) {
  const owner = getSessionOwner();
  const store = readCache();
  store.entries = store.entries.filter(e => !(e.key === key && (e.owner ?? null) === owner));
  writeCache(store);
}

/** Purge toutes les entrées d'un compte (logout). */
export function clearCachesForOwner(owner: string | null) {
  const store = readCache();
  const before = store.entries.length;
  store.entries = store.entries.filter(e => (e.owner ?? null) !== owner);
  if (store.entries.length !== before) writeCache(store);
}

/** Purge tout le cache offline (changement de compte). */
export function clearAllCaches() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch { /* ignore */ }
}

export function workoutCacheKey(workoutId: string) {
  return `workout_draft_${workoutId}`;
}
