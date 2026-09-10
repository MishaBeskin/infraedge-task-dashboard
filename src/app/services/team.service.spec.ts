import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { TeamService } from './team.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { activeTeamKey, teamsCacheKey } from './cache.util';

/** In-memory localStorage — the runner's global is a method-less stub. */
function memoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  } as Storage;
}

let idSeq = 0;

class FakeClient {
  data: Record<string, unknown[]> = {};
  inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  updates: Array<{
    table: string;
    payload: Record<string, unknown>;
    filters: [string, unknown][];
  }> = [];
  deletes: Array<{ table: string; filters: [string, unknown][] }> = [];
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
  fnCalls: Array<{ name: string; body: unknown }> = [];
  fnResult: { data: unknown; error: unknown } = { data: { ok: true, token: 'tok' }, error: null };
  failNext = false;

  from(table: string) {
    return new FakeQ(this, table);
  }

  rpc(fn: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ fn, args });
    const res = this.failNext ? { data: null, error: { message: 'boom' } } : this.rpcResult;
    this.failNext = false;
    return Promise.resolve(res);
  }

  functions = {
    invoke: (name: string, opts: { body: unknown }) => {
      this.fnCalls.push({ name, body: opts.body });
      return Promise.resolve(this.fnResult);
    },
  };
}

class FakeQ {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Record<string, unknown> = {};
  private filters: [string, unknown][] = [];
  private wantSingle = false;

  constructor(
    private c: FakeClient,
    private table: string,
  ) {}

  select() {
    return this;
  }
  order() {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push([`is:${col}`, val]);
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push([`gt:${col}`, val]);
    return this;
  }
  in(col: string, val: unknown) {
    this.filters.push([`in:${col}`, val]);
    return this;
  }
  single() {
    this.wantSingle = true;
    return this;
  }
  insert(p: Record<string, unknown>) {
    this.op = 'insert';
    this.payload = { id: (p['id'] as string) ?? `gen-${++idSeq}`, ...p };
    this.c.inserts.push({ table: this.table, payload: this.payload });
    return this;
  }
  update(p: Record<string, unknown>) {
    this.op = 'update';
    this.payload = p;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }

  private run(): { data: unknown; error: unknown } {
    if (this.c.failNext) {
      this.c.failNext = false;
      return { data: null, error: { message: 'boom' } };
    }
    if (this.op === 'insert') {
      return { data: this.wantSingle ? this.payload : [this.payload], error: null };
    }
    if (this.op === 'update') {
      this.c.updates.push({ table: this.table, payload: this.payload, filters: this.filters });
      return { data: null, error: null };
    }
    if (this.op === 'delete') {
      this.c.deletes.push({ table: this.table, filters: this.filters });
      return { data: null, error: null };
    }
    const rows = this.c.data[this.table] ?? [];
    return { data: this.wantSingle ? (rows[0] ?? null) : rows, error: null };
  }

  then<T>(cb?: (v: { data: unknown; error: unknown }) => T | PromiseLike<T>) {
    return Promise.resolve(this.run()).then(cb ?? undefined);
  }
}

const membershipRows = () => [
  { role: 'owner', teams: { id: 't1', name: 'Alpha' } },
  { role: 'member', teams: { id: 't2', name: 'Beta' } },
];

describe('TeamService', () => {
  let client: FakeClient;

  function make(): TeamService {
    client = new FakeClient();
    client.data['team_members'] = membershipRows();
    const user = { id: 'u1', email: 'me@x.co', name: 'Me' };
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client } },
        {
          provide: AuthService,
          useValue: {
            getCurrentUser: () => user,
            currentUser$: new BehaviorSubject(user),
          },
        },
      ],
    });
    return TestBed.inject(TeamService);
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  // ── loadTeams ────────────────────────────────────────────────────

  it('maps role + team and sorts by name', async () => {
    const svc = make();
    await firstValueFrom(svc.loadTeams());
    expect(svc.teams()).toEqual([
      { id: 't1', name: 'Alpha', role: 'owner' },
      { id: 't2', name: 'Beta', role: 'member' },
    ]);
  });

  it('activates the first team when nothing is persisted', async () => {
    const svc = make();
    await firstValueFrom(svc.loadTeams());
    expect(svc.activeTeamId()).toBe('t1');
    expect(svc.activeTeam()?.name).toBe('Alpha');
  });

  it('keeps the persisted active team when it is still valid', async () => {
    localStorage.setItem(activeTeamKey('u1'), 't2');
    const svc = make();
    await firstValueFrom(svc.loadTeams());
    expect(svc.activeTeamId()).toBe('t2');
  });

  it('seeds teams synchronously from cache before the fetch resolves', async () => {
    localStorage.setItem(
      teamsCacheKey('u1'),
      JSON.stringify([{ id: 't9', name: 'Cached', role: 'owner' }]),
    );
    const svc = make();
    svc.loadTeams().subscribe();
    expect(svc.teams().map((t) => t.name)).toEqual(['Cached']);
  });

  // ── setActiveTeam ────────────────────────────────────────────────

  it('rejects a non-member team and reports errors.switchTeam', async () => {
    const svc = make();
    await firstValueFrom(svc.loadTeams());

    svc.setActiveTeam('nope');

    expect(svc.activeTeamId()).toBe('t1');
    expect(await firstValueFrom(svc.error$)).toBe('errors.switchTeam');
  });

  // ── renameTeam ───────────────────────────────────────────────────

  it('optimistically renames and persists for an owner', async () => {
    const svc = make();
    await firstValueFrom(svc.loadTeams());

    await firstValueFrom(svc.renameTeam('t1', '  Renamed  '));

    expect(svc.teams().find((t) => t.id === 't1')?.name).toBe('Renamed');
    expect(client.updates.at(-1)).toMatchObject({ table: 'teams', payload: { name: 'Renamed' } });
  });

  it('caps the name at 60 chars and no-ops an empty name', async () => {
    const svc = make();
    await firstValueFrom(svc.loadTeams());

    await firstValueFrom(svc.renameTeam('t1', 'x'.repeat(80)));
    expect((client.updates.at(-1)!.payload['name'] as string).length).toBe(60);

    client.updates = [];
    await firstValueFrom(svc.renameTeam('t1', '   '));
    expect(client.updates).toHaveLength(0);
  });

  it('does nothing when the caller is not an owner of that team', async () => {
    const svc = make();
    await firstValueFrom(svc.loadTeams());

    await firstValueFrom(svc.renameTeam('t2', 'Nope'));

    expect(svc.teams().find((t) => t.id === 't2')?.name).toBe('Beta');
    expect(client.updates).toHaveLength(0);
  });

  it('reverts the optimistic rename and errors when the UPDATE fails', async () => {
    const svc = make();
    await firstValueFrom(svc.loadTeams());

    client.failNext = true;
    let errored = false;
    await new Promise<void>((resolve) => {
      svc.renameTeam('t1', 'Broken').subscribe({
        error: () => {
          errored = true;
          resolve();
        },
      });
    });

    expect(errored).toBe(true);
    expect(svc.teams().find((t) => t.id === 't1')?.name).toBe('Alpha');
    expect(await firstValueFrom(svc.error$)).toBe('errors.renameTeam');
  });

  // ── createTeam ───────────────────────────────────────────────────

  it('calls the create_team RPC, appends the team and makes it active', async () => {
    const svc = make();
    await firstValueFrom(svc.loadTeams());
    client.rpcResult = { data: { id: 't-new', name: 'Marketing' }, error: null };

    const created = await firstValueFrom(svc.createTeam('  Marketing  '));

    expect(client.rpcCalls.at(-1)).toEqual({
      fn: 'create_team',
      args: { p_name: 'Marketing' },
    });
    expect(created).toEqual({ id: 't-new', name: 'Marketing', role: 'owner' });
    expect(svc.activeTeamId()).toBe('t-new');
    expect(svc.teams().some((t) => t.id === 't-new')).toBe(true);
  });

  // ── RPC wrappers ─────────────────────────────────────────────────

  it('inviteByEmail invokes the send-team-invite function with the right body', async () => {
    const svc = make();
    await firstValueFrom(svc.inviteByEmail('t1', 'x@y.co', 'member'));
    expect(client.fnCalls.at(-1)).toEqual({
      name: 'send-team-invite',
      body: { teamId: 't1', email: 'x@y.co', role: 'member' },
    });
  });

  it('inviteByEmail throws the function error code (e.g. email_failed) for the panel to map', async () => {
    const svc = make();
    client.fnResult = { data: { ok: false, error: 'email_failed', token: 'tk' }, error: null };
    await expect(firstValueFrom(svc.inviteByEmail('t1', 'x@y.co'))).rejects.toThrow('email_failed');
  });

  it('acceptInvite calls accept_invitation, reloads teams and activates the returned team', async () => {
    const svc = make();
    client.rpcResult = { data: 't2', error: null };

    const teamId = await firstValueFrom(svc.acceptInvite('tok-123'));

    expect(client.rpcCalls[0]).toEqual({ fn: 'accept_invitation', args: { tok: 'tok-123' } });
    expect(teamId).toBe('t2');
    expect(svc.activeTeamId()).toBe('t2');
  });

  it('deleteTeam refuses the last team and otherwise calls delete_team', async () => {
    const svc = make();
    await firstValueFrom(svc.loadTeams());

    await firstValueFrom(svc.deleteTeam('t2'));
    expect(client.rpcCalls.at(-1)).toEqual({ fn: 'delete_team', args: { p_team_id: 't2' } });

    client.data['team_members'] = [{ role: 'owner', teams: { id: 't1', name: 'Alpha' } }];
    await firstValueFrom(svc.loadTeams());
    client.rpcCalls = [];
    let errored = false;
    await new Promise<void>((resolve) => {
      svc.deleteTeam('t1').subscribe({ error: () => ((errored = true), resolve()) });
    });
    expect(errored).toBe(true);
    expect(client.rpcCalls).toHaveLength(0);
    expect(await firstValueFrom(svc.error$)).toBe('errors.lastTeam');
  });

  it('leaveTeam calls the leave_team RPC and refuses the last team client-side', async () => {
    const svc = make();
    await firstValueFrom(svc.loadTeams());

    await firstValueFrom(svc.leaveTeam('t2'));
    expect(client.rpcCalls.at(-1)).toEqual({ fn: 'leave_team', args: { p_team_id: 't2' } });

    client.data['team_members'] = [{ role: 'owner', teams: { id: 't1', name: 'Alpha' } }];
    await firstValueFrom(svc.loadTeams());
    client.rpcCalls = [];
    let errored = false;
    await new Promise<void>((resolve) => {
      svc.leaveTeam('t1').subscribe({ error: () => ((errored = true), resolve()) });
    });
    expect(errored).toBe(true);
    expect(client.rpcCalls).toHaveLength(0);
    expect(await firstValueFrom(svc.error$)).toBe('errors.lastTeam');
  });

  it('loadActiveMembers joins team_members to profiles and puts owners first', async () => {
    const svc = make();
    await firstValueFrom(svc.loadTeams()); // activates t1
    client.data['team_members'] = [
      { user_id: 'u2', role: 'member' },
      { user_id: 'u1', role: 'owner' },
    ];
    client.data['profiles'] = [
      { id: 'u1', name: 'Me' },
      { id: 'u2', name: 'Bob Roe' },
    ];

    svc.loadActiveMembers();
    await new Promise((r) => setTimeout(r));

    expect(svc.members()).toEqual([
      { userId: 'u1', name: 'Me', email: '', role: 'owner' },
      { userId: 'u2', name: 'Bob Roe', email: '', role: 'member' },
    ]);
  });

  it('loadActiveMembers clears the roster when no team is active', async () => {
    const svc = make();
    svc.loadActiveMembers();
    await new Promise((r) => setTimeout(r));
    expect(svc.members()).toEqual([]);
  });

  it('pendingInvitesForMe maps snake_case rows to TeamInvitation', async () => {
    const svc = make();
    client.data['team_invitations'] = [
      {
        id: 'i1',
        email: 'me@x.co',
        token: 'tk',
        role: 'member',
        created_at: '2026-01-01',
        expires_at: '2026-01-08',
      },
    ];

    const invites = await firstValueFrom(svc.pendingInvitesForMe());

    expect(invites).toEqual([
      {
        id: 'i1',
        email: 'me@x.co',
        token: 'tk',
        role: 'member',
        createdAt: '2026-01-01',
        expiresAt: '2026-01-08',
      },
    ]);
  });

  it('clear() resets teams + active id + roster', async () => {
    const svc = make();
    await firstValueFrom(svc.loadTeams());
    client.data['team_members'] = [{ user_id: 'u1', role: 'owner' }];
    client.data['profiles'] = [{ id: 'u1', name: 'Me' }];
    svc.loadActiveMembers();
    await new Promise((r) => setTimeout(r));
    expect(svc.teams().length).toBe(2);
    expect(svc.members().length).toBe(1);

    svc.clear();

    expect(svc.teams()).toEqual([]);
    expect(svc.members()).toEqual([]);
    expect(svc.activeTeamId()).toBeNull();
  });
});
