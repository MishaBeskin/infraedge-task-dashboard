import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, from, of, throwError } from 'rxjs';
import { catchError, map, pairwise, tap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { TeamService } from './team.service';
import { NewSprint, Sprint, SprintStatus } from '../models/sprint.model';
import { readCacheRaw, sprintsCacheKey, writeCache } from './cache.util';

interface SprintRow {
  id: string;
  team_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  status: SprintStatus;
  position: number;
  created_at: string;
}

const fromRow = (r: SprintRow): Sprint => ({
  id: r.id,
  teamId: r.team_id,
  name: r.name,
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  status: r.status,
  position: r.position,
  createdAt: r.created_at,
});

/**
 * Owns the active team's sprints. Mirrors TeamService / TaskService: a signal
 * exposing the current list, `from(promise).pipe(...)` writes with optimistic
 * updates reverted on error, and a stale-while-revalidate localStorage cache
 * keyed per user + team (same reasoning as TaskService's task cache — never
 * flash another team's sprints on switch).
 *
 * Load failures (no cache to fall back on) are reported via `error$`
 * (`sprintPanel.loadError`); write failures are left to the caller's
 * `subscribe({ error })`, same split as TaskService.
 */
@Injectable({ providedIn: 'root' })
export class SprintService {
  private supabase = inject(SupabaseService).client;
  private auth = inject(AuthService);
  private teamService = inject(TeamService);

  private errorSubject = new BehaviorSubject<string | null>(null);
  error$ = this.errorSubject.asObservable();

  private readonly sprintsSig = signal<Sprint[]>([]);
  readonly sprints = this.sprintsSig.asReadonly();

  readonly activeSprint = computed(
    () => this.sprintsSig().find((s) => s.status === 'active') ?? null,
  );

  constructor() {
    // Self-clear only on a real logout transition (mirrors TeamService).
    this.auth.currentUser$.pipe(pairwise(), takeUntilDestroyed()).subscribe(([prev, cur]) => {
      if (prev && !cur) this.clear();
    });
  }

  // ── Reads ────────────────────────────────────────────────────────

  /** Loads the active team's sprints. Seeds synchronously from cache, then
   *  overwrites with the server list. No-ops with an empty list when no team
   *  is active. */
  loadSprints(): Observable<void> {
    const teamId = this.teamService.activeTeamId();
    if (!teamId) {
      this.sprintsSig.set([]);
      return of(undefined);
    }

    const cached = this.readCachedSprints(teamId);
    if (cached) this.sprintsSig.set(cached);
    this.errorSubject.next(null);

    return from(this.fetchSprints(teamId)).pipe(
      tap((rows) => this.setSprints(teamId, rows.map(fromRow))),
      map(() => undefined),
      catchError(() => {
        if (cached) {
          console.warn('[SprintService] sprint refresh failed; showing cached list');
        } else {
          this.errorSubject.next('sprintPanel.loadError');
        }
        return of(undefined);
      }),
    );
  }

  // ── Writes ───────────────────────────────────────────────────────

  /** Creates a sprint (status `'planned'`, position = max + 1) and appends it
   *  locally. */
  createSprint(input: NewSprint): Observable<Sprint> {
    const teamId = this.teamService.activeTeamId();
    if (!teamId) return throwError(() => new Error('no_active_team'));
    const existing = this.sprintsSig();
    const position = existing.length ? Math.max(...existing.map((s) => s.position)) + 1 : 1;
    return from(this.insertSprint(teamId, input, position)).pipe(
      tap((created) => this.setSprints(teamId, [...this.sprintsSig(), created])),
    );
  }

  /** Trimmed rename; empty is a no-op. Optimistic with revert. */
  renameSprint(id: string, name: string): Observable<void> {
    const next = name.trim();
    if (!next) return of(undefined);
    return this.patch(id, { name: next });
  }

  /** Sets (or clears) the start/end dates. Optimistic with revert. */
  setSprintDates(id: string, startsOn: string | null, endsOn: string | null): Observable<void> {
    return this.patch(id, { starts_on: startsOn, ends_on: endsOn });
  }

  /** Flips the team's currently active sprint (if any, and if it isn't `id`)
   *  to `'planned'` and activates `id` — both flips happen in a single
   *  `set_active_sprint` RPC transaction server-side (see
   *  `0008_set_active_sprint.sql`), so the partial unique index on
   *  `sprints (team_id) where status = 'active'` never sees two active rows
   *  at once, and a failure can't leave the DB in a state the optimistic
   *  local update didn't already predict (no more "first write succeeded,
   *  second failed" straddle — it's one all-or-nothing call). Also closes the
   *  race between two members activating different sprints concurrently, which
   *  the old two-step client sequencing couldn't. Optimistic with revert. */
  setActiveSprint(id: string): Observable<void> {
    const teamId = this.teamService.activeTeamId();
    if (!teamId) return of(undefined);
    const snapshot = this.sprintsSig();
    const current = snapshot.find((s) => s.status === 'active' && s.id !== id);

    this.setSprints(
      teamId,
      snapshot.map((s) => {
        if (s.id === id) return { ...s, status: 'active' as SprintStatus };
        if (current && s.id === current.id) return { ...s, status: 'planned' as SprintStatus };
        return s;
      }),
    );

    return from(
      this.supabase.rpc('set_active_sprint', { p_team_id: teamId, p_sprint_id: id }),
    ).pipe(
      map((res) => this.unwrap(res)),
      catchError((err) => {
        this.setSprints(teamId, snapshot);
        return throwError(() => err);
      }),
    );
  }

  completeSprint(id: string): Observable<void> {
    return this.patch(id, { status: 'completed' });
  }

  reopenSprint(id: string): Observable<void> {
    return this.patch(id, { status: 'planned' });
  }

  /** Deletes the sprint. `tasks.sprint_id` references it `on delete set
   *  null`, so every task in it falls back to the backlog server-side; the
   *  caller (SprintPanelComponent) reloads tasks to reflect that. Optimistic
   *  with revert. */
  deleteSprint(id: string): Observable<void> {
    const teamId = this.teamService.activeTeamId();
    if (!teamId) return of(undefined);
    const snapshot = this.sprintsSig();
    this.setSprints(
      teamId,
      snapshot.filter((s) => s.id !== id),
    );

    return from(this.removeSprint(id)).pipe(
      catchError((err) => {
        this.setSprints(teamId, snapshot);
        return throwError(() => err);
      }),
    );
  }

  /** Swaps `id`'s position with its neighbour in `direction`. Optimistic;
   *  PATCHes only the two changed rows. */
  reorderSprint(id: string, direction: 'up' | 'down'): Observable<void> {
    const teamId = this.teamService.activeTeamId();
    if (!teamId) return of(undefined);
    const ordered = [...this.sprintsSig()].sort((a, b) => a.position - b.position);
    const idx = ordered.findIndex((s) => s.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return of(undefined);

    const a = ordered[idx];
    const b = ordered[swapIdx];
    const snapshot = this.sprintsSig();
    this.setSprints(
      teamId,
      snapshot.map((s) => {
        if (s.id === a.id) return { ...s, position: b.position };
        if (s.id === b.id) return { ...s, position: a.position };
        return s;
      }),
    );

    const write = async () => {
      await this.updateRow(a.id, { position: b.position });
      await this.updateRow(b.id, { position: a.position });
    };

    return from(write()).pipe(
      catchError((err) => {
        this.setSprints(teamId, snapshot);
        return throwError(() => err);
      }),
    );
  }

  /** Reset in-memory state — runs on a logout transition. */
  clear(): void {
    this.sprintsSig.set([]);
    this.errorSubject.next(null);
  }

  // ── Internals ────────────────────────────────────────────────────

  private patch(id: string, row: Record<string, unknown>): Observable<void> {
    const teamId = this.teamService.activeTeamId();
    if (!teamId) return of(undefined);
    const snapshot = this.sprintsSig();
    this.setSprints(teamId, this.applyLocalPatch(snapshot, id, row));

    return from(this.updateRow(id, row)).pipe(
      catchError((err) => {
        this.setSprints(teamId, snapshot);
        return throwError(() => err);
      }),
    );
  }

  private applyLocalPatch(sprints: Sprint[], id: string, row: Record<string, unknown>): Sprint[] {
    return sprints.map((s) => {
      if (s.id !== id) return s;
      const next = { ...s };
      if ('name' in row) next.name = row['name'] as string;
      if ('starts_on' in row) next.startsOn = row['starts_on'] as string | null;
      if ('ends_on' in row) next.endsOn = row['ends_on'] as string | null;
      if ('status' in row) next.status = row['status'] as SprintStatus;
      return next;
    });
  }

  private unwrap(res: unknown): void {
    const r = res as { error: unknown };
    if (r && r.error) throw r.error;
  }

  private setSprints(teamId: string, sprints: Sprint[]): void {
    this.sprintsSig.set(sprints);
    const uid = this.auth.getCurrentUser()?.id;
    if (uid) writeCache(sprintsCacheKey(uid, teamId), sprints);
  }

  private readCachedSprints(teamId: string): Sprint[] | null {
    const uid = this.auth.getCurrentUser()?.id;
    if (!uid) return null;
    const raw = readCacheRaw(sprintsCacheKey(uid, teamId));
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const ok = parsed.every(
        (s) =>
          !!s && typeof (s as Sprint).id === 'string' && typeof (s as Sprint).name === 'string',
      );
      return ok ? (parsed as Sprint[]) : null;
    } catch {
      return null;
    }
  }

  // ── Supabase calls ───────────────────────────────────────────────

  private async fetchSprints(teamId: string): Promise<SprintRow[]> {
    const { data, error } = await this.supabase
      .from('sprints')
      .select('*')
      .eq('team_id', teamId)
      .order('position', { ascending: true });
    if (error) throw error;
    return (data ?? []) as SprintRow[];
  }

  private async insertSprint(teamId: string, input: NewSprint, position: number): Promise<Sprint> {
    const { data, error } = await this.supabase
      .from('sprints')
      .insert({
        team_id: teamId,
        name: input.name.trim(),
        starts_on: input.startsOn ?? null,
        ends_on: input.endsOn ?? null,
        status: 'planned',
        position,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as SprintRow);
  }

  private async updateRow(id: string, row: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.from('sprints').update(row).eq('id', id);
    if (error) throw error;
  }

  private async removeSprint(id: string): Promise<void> {
    const { error } = await this.supabase.from('sprints').delete().eq('id', id);
    if (error) throw error;
  }
}
