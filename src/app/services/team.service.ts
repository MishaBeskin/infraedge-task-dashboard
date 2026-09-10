import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, from, of, throwError } from 'rxjs';
import { catchError, map, pairwise, switchMap, tap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Team, TeamInvitation, TeamMember, TeamRole } from '../models/team.model';
import { activeTeamKey, readCacheRaw, teamsCacheKey, writeCache } from './cache.util';

const MAX_TEAM_NAME_LENGTH = 60;

const isLastTeamError = (e: unknown): boolean =>
  /last_team/.test(String((e as { message?: string })?.message ?? e));

interface TeamRef {
  id: string;
  name: string;
}
interface MembershipRow {
  role: TeamRole;
  teams: TeamRef | TeamRef[] | null;
}
interface InvitationRow {
  id: string;
  email: string | null;
  token: string;
  role: TeamRole;
  created_at: string;
  expires_at: string;
}

const toInvitation = (r: InvitationRow): TeamInvitation => ({
  id: r.id,
  email: r.email,
  token: r.token,
  role: r.role,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
});

/**
 * Owns the signed-in user's teams (one team == one shared board) and which one
 * is active. Mirrors TaskService: BehaviorSubjects exposed as `asObservable`,
 * `from(promise).pipe(...)`, optimistic writes reverted on error,
 * translation-key error strings, and a stale-while-revalidate localStorage cache.
 *
 * DI note: this service injects AuthService (one direction only). AuthService
 * never references TeamService — instead this service watches
 * `AuthService.currentUser$` and resets itself when it goes null on sign-out.
 * That inversion keeps AuthService's async auth callback injector-free.
 */
@Injectable({ providedIn: 'root' })
export class TeamService {
  private supabase = inject(SupabaseService).client;
  private auth = inject(AuthService);

  private teamsSubject = new BehaviorSubject<Team[]>([]);
  private errorSubject = new BehaviorSubject<string | null>(null);

  constructor() {
    // Self-clear only on a real logout transition (user -> null), not the
    // initial null. Inverts the dependency so AuthService never reaches for
    // TeamService (no DI cycle, no injector use in async callbacks).
    this.auth.currentUser$.pipe(pairwise(), takeUntilDestroyed()).subscribe(([prev, cur]) => {
      if (prev && !cur) this.clear();
    });
  }

  teams$ = this.teamsSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  private readonly teamsSig = signal<Team[]>([]);
  /** Reactive view of the caller's teams (mirrors `teams$`). */
  readonly teams = this.teamsSig.asReadonly();
  readonly activeTeamId = signal<string | null>(this.readActiveTeamId());
  readonly activeTeam = computed(
    () => this.teamsSig().find((t) => t.id === this.activeTeamId()) ?? null,
  );
  /** false until `loadTeams()` has resolved (or failed) at least once — the
   *  board keeps its skeleton up until then to avoid a cold empty-columns flash. */
  private readonly teamsLoadedSig = signal(false);
  readonly teamsLoaded = this.teamsLoadedSig.asReadonly();

  /** Members of the active team (Pass B). Filled by `loadActiveMembers()` on
   *  every team change and consumed by the task dialog's assignee select and the
   *  task-card avatar chip. Left untouched on a fetch failure so the board just
   *  shows initials-less chips rather than losing the roster. */
  private readonly membersSig = signal<TeamMember[]>([]);
  readonly members = this.membersSig.asReadonly();

  // ── Reads ────────────────────────────────────────────────────────

  /** Loads the caller's teams (with role). Seeds synchronously from cache, then
   *  overwrites with the server list. Reconciles the active team afterwards. */
  loadTeams(): Observable<void> {
    const uid = this.auth.getCurrentUser()?.id;
    if (!uid) {
      this.teamsSubject.next([]);
      this.teamsSig.set([]);
      this.teamsLoadedSig.set(true);
      return of(undefined);
    }

    const cached = this.readCachedTeams();
    if (cached) {
      this.teamsSubject.next(cached);
      this.teamsSig.set(cached);
      this.reconcileActive(cached);
    }
    this.errorSubject.next(null);

    return from(this.fetchTeams(uid)).pipe(
      tap((teams) => {
        this.setTeams(teams);
        this.reconcileActive(teams);
        this.teamsLoadedSig.set(true);
      }),
      map(() => undefined),
      catchError(() => {
        this.teamsLoadedSig.set(true);
        if (cached) {
          console.warn('[TeamService] team refresh failed; showing cached list');
        } else {
          this.errorSubject.next('errors.loadTeams');
        }
        return of(undefined);
      }),
    );
  }

  /** Validates membership, then sets + persists the active team. */
  setActiveTeam(id: string): void {
    if (!this.teamsSig().some((t) => t.id === id)) {
      this.errorSubject.next('errors.switchTeam');
      return;
    }
    this.activeTeamId.set(id);
    this.writeActiveTeamId(id);
    this.errorSubject.next(null);
  }

  // ── Writes ───────────────────────────────────────────────────────

  /** Owner-only rename. Trimmed + capped at 60; empty is a no-op (a team must
   *  keep a name). Optimistic with revert. */
  renameTeam(id: string, name: string): Observable<void> {
    const team = this.teamsSig().find((t) => t.id === id);
    if (!team || team.role !== 'owner') return of(undefined);

    const next = name.trim().slice(0, MAX_TEAM_NAME_LENGTH).trim();
    if (!next || next === team.name) return of(undefined);

    const snapshot = this.teamsSig();
    this.setTeams(snapshot.map((t) => (t.id === id ? { ...t, name: next } : t)));
    this.errorSubject.next(null);

    return from(this.persistRename(id, next)).pipe(
      map(() => undefined),
      catchError((err) => {
        this.setTeams(snapshot);
        this.errorSubject.next('errors.renameTeam');
        return throwError(() => err);
      }),
    );
  }

  /** Creates a team via the `create_team` RPC (a plain client insert can't
   *  bootstrap under the new RLS — the RETURNING select and the owner-membership
   *  insert both need a membership that doesn't exist yet). Appends it locally
   *  and makes it active. */
  createTeam(name: string): Observable<Team> {
    const trimmed = name.trim().slice(0, MAX_TEAM_NAME_LENGTH).trim() || 'Board';
    return from(this.supabase.rpc('create_team', { p_name: trimmed })).pipe(
      map((res) => {
        const r = res as { data: TeamRef | null; error: unknown };
        if (r.error) throw r.error;
        const row = r.data!;
        return { id: row.id, name: row.name, role: 'owner' } as Team;
      }),
      tap((team) => {
        this.setTeams([...this.teamsSig(), team]);
        this.activeTeamId.set(team.id);
        this.writeActiveTeamId(team.id);
      }),
    );
  }

  // ── Pass-B API (implemented now; only the UI is deferred) ─────────

  loadMembers(teamId: string): Observable<TeamMember[]> {
    return from(this.fetchMembers(teamId)).pipe(catchError(() => of([])));
  }

  /** Refreshes the `members` signal for the currently active team. Fire-and-
   *  forget: the board calls it on every team change, the team panel after a
   *  membership edit. No active team clears the list. */
  loadActiveMembers(): void {
    const teamId = this.activeTeamId();
    if (!teamId) {
      this.membersSig.set([]);
      return;
    }
    this.fetchMembers(teamId)
      .then((m) => this.membersSig.set(m))
      .catch(() => {
        /* keep whatever roster we had */
      });
  }

  /** Owner removing another member (Pass B). Leaving your own team goes through
   *  `leaveTeam` / the `leave_team` RPC instead. */
  removeMember(teamId: string, userId: string): Observable<void> {
    return from(this.deleteMember(teamId, userId)).pipe(
      map(() => undefined),
      catchError((err) => throwError(() => err)),
    );
  }

  /** Leave a team. The `leave_team` RPC enforces the "not your last team" guard
   *  server-side; the client check is only a fast path. */
  leaveTeam(teamId: string): Observable<void> {
    if (this.teamsSig().length <= 1) {
      this.errorSubject.next('errors.lastTeam');
      return throwError(() => new Error('last_team'));
    }
    return from(this.supabase.rpc('leave_team', { p_team_id: teamId })).pipe(
      map((res) => this.unwrap(res)),
      switchMap(() => this.loadTeams()),
      catchError((err) => {
        if (isLastTeamError(err)) this.errorSubject.next('errors.lastTeam');
        return throwError(() => err);
      }),
    );
  }

  loadInvitations(teamId: string): Observable<TeamInvitation[]> {
    return from(this.fetchInvitations(teamId)).pipe(catchError(() => of([])));
  }

  createLinkInvite(teamId: string, role: TeamRole = 'member'): Observable<TeamInvitation> {
    return from(this.insertLinkInvite(teamId, role));
  }

  /**
   * Emails a join link. Goes through the `send-team-invite` Edge Function, which
   * calls the `invite_to_team` RPC (owner / no_account / already_member /
   * already_invited checks) and then SendGrid. The function always answers 200
   * with `{ ok, error?, token? }` so the outcome is in `data`, not the HTTP
   * status: `error: 'email_failed'` means the invitation row exists but the mail
   * bounced — the caller should fall back to the copy-link UI. Throws an
   * `Error(<code>)` the panel maps to a `teamPanel.invite.error.*` key.
   */
  inviteByEmail(teamId: string, email: string, role: TeamRole = 'member'): Observable<void> {
    return from(
      this.supabase.functions.invoke('send-team-invite', {
        body: { teamId, email, role },
      }),
    ).pipe(
      map((res) => {
        const r = res as {
          data: { ok?: boolean; error?: string } | null;
          error: unknown;
        };
        if (r.error) throw r.error;
        if (!r.data?.ok) throw new Error(r.data?.error ?? 'invite_failed');
      }),
    );
  }

  revokeInvite(id: string): Observable<void> {
    return from(this.supabase.from('team_invitations').delete().eq('id', id)).pipe(
      map((res) => this.unwrap(res)),
    );
  }

  deleteTeam(teamId: string): Observable<void> {
    if (this.teamsSig().length <= 1) {
      this.errorSubject.next('errors.lastTeam');
      return throwError(() => new Error('last_team'));
    }
    return from(this.supabase.rpc('delete_team', { p_team_id: teamId })).pipe(
      map((res) => this.unwrap(res)),
      switchMap(() => this.loadTeams()),
      catchError((err) => {
        if (isLastTeamError(err)) this.errorSubject.next('errors.lastTeam');
        return throwError(() => err);
      }),
    );
  }

  acceptInvite(token: string): Observable<string> {
    return from(this.supabase.rpc('accept_invitation', { tok: token })).pipe(
      map((res) => {
        const r = res as { data: string | null; error: unknown };
        if (r.error) throw r.error;
        return r.data as string;
      }),
      switchMap((teamId) =>
        this.loadTeams().pipe(
          tap(() => this.setActiveTeam(teamId)),
          map(() => teamId),
        ),
      ),
    );
  }

  pendingInvitesForMe(): Observable<TeamInvitation[]> {
    const email = this.auth.getCurrentUser()?.email;
    if (!email) return of([]);
    return from(this.fetchPendingForEmail(email)).pipe(catchError(() => of([])));
  }

  /** Reset in-memory state — runs on a logout transition. */
  clear(): void {
    this.teamsSubject.next([]);
    this.teamsSig.set([]);
    this.membersSig.set([]);
    this.errorSubject.next(null);
    this.activeTeamId.set(null);
    this.teamsLoadedSig.set(false);
  }

  // ── Internals ────────────────────────────────────────────────────

  private setTeams(teams: Team[]): void {
    this.teamsSubject.next(teams);
    this.teamsSig.set(teams);
    const uid = this.auth.getCurrentUser()?.id;
    if (uid) writeCache(teamsCacheKey(uid), teams);
  }

  private reconcileActive(teams: Team[]): void {
    if (teams.length === 0) {
      this.activeTeamId.set(null);
      this.writeActiveTeamId(null);
      return;
    }
    const current = this.activeTeamId();
    if (current && teams.some((t) => t.id === current)) return;
    const persisted = this.readActiveTeamId();
    const next = persisted && teams.some((t) => t.id === persisted) ? persisted : teams[0].id;
    this.activeTeamId.set(next);
    this.writeActiveTeamId(next);
  }

  private activeKey(): string | null {
    const uid = this.auth.getCurrentUser()?.id;
    return uid ? activeTeamKey(uid) : null;
  }

  private readActiveTeamId(): string | null {
    const key = this.activeKey();
    if (!key) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeActiveTeamId(id: string | null): void {
    const key = this.activeKey();
    if (!key) return;
    try {
      if (id) localStorage.setItem(key, id);
      else localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  private readCachedTeams(): Team[] | null {
    const uid = this.auth.getCurrentUser()?.id;
    if (!uid) return null;
    const raw = readCacheRaw(teamsCacheKey(uid));
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const ok = parsed.every(
        (t) =>
          !!t &&
          typeof (t as Team).id === 'string' &&
          typeof (t as Team).name === 'string' &&
          ((t as Team).role === 'owner' || (t as Team).role === 'member'),
      );
      return ok ? (parsed as Team[]) : null;
    } catch {
      return null;
    }
  }

  private unwrap(res: unknown): void {
    const r = res as { error: unknown };
    if (r && r.error) throw r.error;
  }

  // ── Supabase calls ───────────────────────────────────────────────

  private async fetchTeams(uid: string): Promise<Team[]> {
    const { data, error } = await this.supabase
      .from('team_members')
      .select('role, teams(id, name)')
      .eq('user_id', uid);
    if (error) throw error;
    return (data ?? [])
      .map((r) => {
        const row = r as MembershipRow;
        const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
        return team ? ({ id: team.id, name: team.name, role: row.role } as Team) : null;
      })
      .filter((t): t is Team => t !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async persistRename(id: string, name: string): Promise<void> {
    const { error } = await this.supabase.from('teams').update({ name }).eq('id', id);
    if (error) throw error;
  }

  private async fetchMembers(teamId: string): Promise<TeamMember[]> {
    // Two steps, not a `profiles(name)` embed: there is no FK between
    // `team_members` and `profiles` (both only reference `auth.users`), so
    // PostgREST can't resolve the embed and the whole query fails.
    const { data: rows, error } = await this.supabase
      .from('team_members')
      .select('user_id, role')
      .eq('team_id', teamId);
    if (error) throw error;

    const members = (rows ?? []) as { user_id: string; role: TeamRole }[];
    if (members.length === 0) return [];

    const ids = members.map((m) => m.user_id);
    const { data: profiles } = await this.supabase
      .from('profiles')
      .select('id, name')
      .in('id', ids);
    const nameById = new Map(
      ((profiles ?? []) as { id: string; name: string | null }[]).map((p) => [p.id, p.name ?? '']),
    );

    return members
      .map((m) => ({
        userId: m.user_id,
        name: nameById.get(m.user_id) ?? '',
        email: '',
        role: m.role,
      }))
      .sort((a, b) => {
        // Owners first, then by name.
        if (a.role !== b.role) return a.role === 'owner' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  private async deleteMember(teamId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  private async fetchInvitations(teamId: string): Promise<TeamInvitation[]> {
    const { data, error } = await this.supabase
      .from('team_invitations')
      .select('id, email, token, role, created_at, expires_at')
      .eq('team_id', teamId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as InvitationRow[]).map(toInvitation);
  }

  private async insertLinkInvite(teamId: string, role: TeamRole): Promise<TeamInvitation> {
    // One open link per team — drop the previous one first (the partial unique
    // index is the backstop).
    await this.supabase
      .from('team_invitations')
      .delete()
      .eq('team_id', teamId)
      .is('email', null)
      .is('accepted_at', null);
    const { data, error } = await this.supabase
      .from('team_invitations')
      .insert({ team_id: teamId, email: null, role })
      .select('id, email, token, role, created_at, expires_at')
      .single();
    if (error) throw error;
    return toInvitation(data as InvitationRow);
  }

  private async fetchPendingForEmail(email: string): Promise<TeamInvitation[]> {
    const { data, error } = await this.supabase
      .from('team_invitations')
      .select('id, email, token, role, created_at, expires_at')
      .eq('email', email.toLowerCase())
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString());
    if (error) throw error;
    return ((data ?? []) as InvitationRow[]).map(toInvitation);
  }
}
