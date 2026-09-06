import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, from, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { boardNameCacheKey, readCacheRaw, removeCache, writeCache } from './cache.util';

/** Board titles longer than this are silently truncated on save. */
const MAX_BOARD_NAME_LENGTH = 60;

/**
 * Owns the signed-in user's custom board title, stored on `public.profiles`
 * (`board_name`, nullable — `null` means "show the localized default").
 *
 * Mirrors TaskService: BehaviorSubjects exposed as `asObservable`,
 * `from(promise).pipe(...)`, optimistic writes reverted on error, and a
 * translation-key string emitted on `error$`.
 */
@Injectable({ providedIn: 'root' })
export class BoardSettingsService {
  private supabase = inject(SupabaseService).client;
  private auth = inject(AuthService);

  private nameSubject = new BehaviorSubject<string | null>(null);
  private errorSubject = new BehaviorSubject<string | null>(null);

  /** Custom board name, or `null` when unset / not yet loaded. */
  boardName$ = this.nameSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  /** Emit a board name AND write it through to the per-user cache. A `null`
   *  value clears the cache key (no custom name → show the default). */
  private setName(value: string | null): void {
    this.nameSubject.next(value);
    const uid = this.auth.getCurrentUser()?.id;
    if (!uid) return;
    const key = boardNameCacheKey(uid);
    if (value === null) removeCache(key);
    else writeCache(key, value);
  }

  /** Last-known board name for the signed-in user; `null` = no uid / no cache /
   *  corrupt blob. A stored name is always a non-empty string. */
  private readCachedName(): string | null {
    const uid = this.auth.getCurrentUser()?.id;
    if (!uid) return null;
    const raw = readCacheRaw(boardNameCacheKey(uid));
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === 'string' && parsed.length > 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  /** Reads `profiles.board_name` for the current user. A failure is surfaced on
   *  `error$` but never rejects — the board must still render. */
  loadBoardName(): Observable<void> {
    // Stale-while-revalidate: seed synchronously from cache, then let the fetch
    // overwrite. Raw `next` (not setName) so we don't re-write what we just read.
    const cached = this.readCachedName();
    if (cached !== null) this.nameSubject.next(cached);
    this.errorSubject.next(null);

    return from(this.fetchBoardName()).pipe(
      tap((name) => this.setName(name)),
      map(() => undefined),
      catchError(() => {
        // Header keeps showing the last-known (cached) name.
        this.errorSubject.next('errors.loadBoardName');
        return of(undefined);
      }),
    );
  }

  /**
   * Renames the board. The value is trimmed and capped at 60 chars; an
   * empty/whitespace-only name clears the custom title back to `null` (default).
   * Optimistic: `boardName$` updates immediately, then reverts and the observable
   * errors if the UPDATE fails. A no-op change makes no network call.
   */
  renameBoard(name: string): Observable<void> {
    const trimmed = name.trim().slice(0, MAX_BOARD_NAME_LENGTH).trim();
    const value: string | null = trimmed.length > 0 ? trimmed : null;
    const previous = this.nameSubject.getValue();

    if (value === previous) return of(undefined);

    this.setName(value);
    this.errorSubject.next(null);

    return from(this.persistBoardName(value)).pipe(
      map(() => undefined),
      catchError((err) => {
        this.setName(previous);
        this.errorSubject.next('errors.renameBoard');
        return throwError(() => err);
      }),
    );
  }

  // ── Supabase calls ────────────────────────────────────────────────

  private uid(): string {
    const id = this.auth.getCurrentUser()?.id;
    if (!id) throw new Error('not authenticated');
    return id;
  }

  private async fetchBoardName(): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('board_name')
      .eq('id', this.uid())
      .single();
    if (error) throw error;
    return ((data as { board_name: string | null } | null)?.board_name ?? null) as string | null;
  }

  private async persistBoardName(value: string | null): Promise<void> {
    const { error } = await this.supabase
      .from('profiles')
      .update({ board_name: value })
      .eq('id', this.uid());
    if (error) throw error;
  }
}
