/**
 * localStorage-backed stale-while-revalidate cache for board data.
 *
 * Keys are `stack_cache_v1:<name>:<uid>[:<scope>]` — per-user so a shared browser
 * never shows another account's data, and version-tagged (`v1`) so a future
 * shape change can bump the segment and ignore stale blobs instead of crashing.
 *
 * Every access is wrapped in try/catch and no-ops on failure — private-mode
 * Safari, blocked storage and some test environments throw or omit
 * `localStorage` (same reasoning as ThemeService / I18nService).
 */

export const CACHE_PREFIX = 'stack_cache_v1:';

/** The last-selected team pointer is per-user, its own prefix so
 *  `clearAllCache()` sweeps it alongside the versioned cache. */
export const ACTIVE_TEAM_PREFIX = 'stack_active_team:';

export const activeTeamKey = (uid: string): string => `${ACTIVE_TEAM_PREFIX}${uid}`;

/** Tasks are cached per user AND per team, so switching teams never flashes the
 *  other team's cards. */
export const tasksCacheKey = (uid: string, teamId: string): string =>
  `${CACHE_PREFIX}tasks:${uid}:${teamId}`;

export const teamsCacheKey = (uid: string): string => `${CACHE_PREFIX}teams:${uid}`;

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

/** Drop every `stack_cache_v1:` entry plus every per-user active-team pointer —
 *  called on sign-out so a shared browser never surfaces the previous account's
 *  data. */
export function clearAllCache(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(CACHE_PREFIX) || k.startsWith(ACTIVE_TEAM_PREFIX))) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
