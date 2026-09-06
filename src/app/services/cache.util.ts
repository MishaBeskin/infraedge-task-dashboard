/**
 * localStorage-backed stale-while-revalidate cache for board data.
 *
 * Keys are `stack_cache_v1:<name>:<uid>` — per-user so a shared browser never
 * shows another account's data, and version-tagged (`v1`) so a future `Task`
 * shape change can bump the segment and ignore stale blobs instead of crashing.
 *
 * Every access is wrapped in try/catch and no-ops on failure — private-mode
 * Safari, blocked storage and some test environments throw or omit
 * `localStorage` (same reasoning as ThemeService / I18nService).
 */

export const CACHE_PREFIX = 'stack_cache_v1:';

export const tasksCacheKey = (uid: string): string => `${CACHE_PREFIX}tasks:${uid}`;
export const boardNameCacheKey = (uid: string): string => `${CACHE_PREFIX}boardName:${uid}`;

/** Raw string read; caller does its own JSON.parse + validation. */
export function readCacheRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function removeCache(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Drop every `stack_cache_v1:` entry — called on sign-out. */
export function clearAllCache(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
