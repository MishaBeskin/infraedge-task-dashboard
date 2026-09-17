import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { SprintService } from './sprint.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { TeamService } from './team.service';
import { sprintsCacheKey } from './cache.util';

const TEAM = 't1';

/** The test runner's `localStorage` is a stub without methods, so persistence
 *  specs install a real in-memory one (matches team/task service specs). */
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

interface Row {
  id: string;
  team_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
  position: number;
  created_at: string;
}

// ── Minimal in-memory fake of the Supabase query builder — same shape as
// task.service.spec.ts's fake, scoped to a single `sprints` table. ─────────
class FakeClient {
  rows: Row[] = [];
  private seq = 100;
  failNext = false;
  updates: Array<{ id: unknown; payload: Record<string, unknown> }> = [];
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  /** When set, `rpc()` fails with this instead of consulting `failNext`. */
  failRpc: string | null = null;

  nextId(): string {
    return String(++this.seq);
  }

  seed(rows: Partial<Row>[]): void {
    this.rows = rows.map((r, i) => ({
      id: String(i + 1),
      team_id: TEAM,
      name: 'Sprint',
      starts_on: null,
      ends_on: null,
      status: 'planned',
      position: i + 1,
      created_at: 't0',
      ...r,
    }));
  }

  from(_table: string) {
    return new FakeQuery(this);
  }

  /** Fakes `set_active_sprint`: same all-or-nothing semantics as the real RPC
   *  — on success it flips both rows server-side in one shot, matching what a
   *  single transaction would do; `failRpc` simulates the whole call failing
   *  (nothing committed), which is the only failure mode left once the two
   *  writes are one transaction. */
  rpc(fn: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ fn, args });
    if (this.failRpc === fn) {
      this.failRpc = null;
      return Promise.resolve({ data: null, error: { message: 'boom' } });
    }
    if (fn === 'set_active_sprint') {
      const teamId = args['p_team_id'];
      const sprintId = args['p_sprint_id'];
      this.rows = this.rows.map((r) => {
        if (r.team_id !== teamId) return r;
        if (r.id === sprintId) return { ...r, status: 'active' };
        if (r.status === 'active') return { ...r, status: 'planned' };
        return r;
      });
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }
}

class FakeQuery {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload?: Record<string, unknown>;
  private filters: Array<[string, unknown]> = [];
  private wantSingle = false;

  constructor(private c: FakeClient) {}

  select() {
    return this;
  }
  order() {
    return this;
  }
  single() {
    this.wantSingle = true;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  insert(payload: Record<string, unknown>) {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Record<string, unknown>) {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }

  private match = (r: Row) =>
    this.filters.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v);

  private run(): { data: unknown; error: unknown } {
    if (this.c.failNext) {
      this.c.failNext = false;
      return { data: null, error: { message: 'boom' } };
    }
    switch (this.op) {
      case 'select': {
        const rows = this.c.rows.filter(this.match);
        return { data: this.wantSingle ? (rows[0] ?? null) : rows, error: null };
      }
      case 'insert': {
        const row: Row = {
          id: this.c.nextId(),
          team_id: TEAM,
          name: '',
          starts_on: null,
          ends_on: null,
          status: 'planned',
          position: 0,
          created_at: 't1',
          ...(this.payload as Partial<Row>),
        };
        this.c.rows.push(row);
        return { data: this.wantSingle ? row : [row], error: null };
      }
      case 'update': {
        const idFilter = this.filters.find(([c]) => c === 'id')?.[1];
        this.c.updates.push({
          id: idFilter,
          payload: (this.payload ?? {}) as Record<string, unknown>,
        });
        let updated: Row | null = null;
        this.c.rows = this.c.rows.map((r) => {
          if (this.match(r)) {
            updated = { ...r, ...(this.payload as Partial<Row>) };
            return updated;
          }
          return r;
        });
        return { data: this.wantSingle ? updated : updated ? [updated] : [], error: null };
      }
      case 'delete': {
        this.c.rows = this.c.rows.filter((r) => !this.match(r));
        return { data: null, error: null };
      }
    }
  }

  then<T>(onfulfilled?: (value: { data: unknown; error: unknown }) => T | PromiseLike<T>) {
    return Promise.resolve(this.run()).then(onfulfilled ?? undefined);
  }
}

describe('SprintService', () => {
  let service: SprintService;
  let client: FakeClient;
  let activeTeamId: string | null;
  const user = { id: 'u1', email: 'me@x.co', name: 'Me' };

  function make(): SprintService {
    client = new FakeClient();
    activeTeamId = TEAM;
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client } },
        {
          provide: AuthService,
          useValue: { getCurrentUser: () => user, currentUser$: new BehaviorSubject(user) },
        },
        { provide: TeamService, useValue: { activeTeamId: () => activeTeamId } },
      ],
    });
    return TestBed.inject(SprintService);
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  // ── loadSprints ──────────────────────────────────────────────────

  it('starts empty', () => {
    service = make();
    expect(service.sprints()).toEqual([]);
  });

  it('maps rows to Sprint, ordered as returned', async () => {
    service = make();
    client.seed([
      { id: 's1', name: 'Sprint 1', status: 'planned', position: 1 },
      { id: 's2', name: 'Sprint 2', status: 'active', position: 2 },
    ]);

    await firstValueFrom(service.loadSprints());

    expect(service.sprints()).toEqual([
      {
        id: 's1',
        teamId: TEAM,
        name: 'Sprint 1',
        startsOn: null,
        endsOn: null,
        status: 'planned',
        position: 1,
        createdAt: 't0',
      },
      {
        id: 's2',
        teamId: TEAM,
        name: 'Sprint 2',
        startsOn: null,
        endsOn: null,
        status: 'active',
        position: 2,
        createdAt: 't0',
      },
    ]);
    expect(service.activeSprint()?.id).toBe('s2');
  });

  it('no-ops with an empty list when no team is active', async () => {
    service = make();
    activeTeamId = null;
    await firstValueFrom(service.loadSprints());
    expect(service.sprints()).toEqual([]);
  });

  it('sets error$ to sprintPanel.loadError when the fetch fails with no cache', async () => {
    service = make();
    client.failNext = true;
    await firstValueFrom(service.loadSprints());
    expect(await firstValueFrom(service.error$)).toBe('sprintPanel.loadError');
  });

  it('seeds synchronously from cache before the fetch resolves', () => {
    service = make();
    localStorage.setItem(
      sprintsCacheKey('u1', TEAM),
      JSON.stringify([
        {
          id: 's9',
          teamId: TEAM,
          name: 'Cached',
          startsOn: null,
          endsOn: null,
          status: 'planned',
          position: 1,
          createdAt: 't0',
        },
      ]),
    );
    service.loadSprints().subscribe();
    expect(service.sprints().map((s) => s.name)).toEqual(['Cached']);
  });

  // ── createSprint ─────────────────────────────────────────────────

  it('creates a sprint at position max + 1 and appends it', async () => {
    service = make();
    client.seed([{ id: 's1', position: 3 }]);
    await firstValueFrom(service.loadSprints());

    const created = await firstValueFrom(
      service.createSprint({ name: '  New Sprint  ', startsOn: '2026-02-01', endsOn: null }),
    );

    expect(created.name).toBe('New Sprint');
    expect(created.status).toBe('planned');
    expect(client.rows.at(-1)).toMatchObject({ team_id: TEAM, position: 4, name: 'New Sprint' });
    expect(service.sprints().some((s) => s.id === created.id)).toBe(true);
  });

  // ── renameSprint ─────────────────────────────────────────────────

  it('optimistically renames and persists', async () => {
    service = make();
    client.seed([{ id: 's1', name: 'Old' }]);
    await firstValueFrom(service.loadSprints());

    await firstValueFrom(service.renameSprint('s1', '  New Name  '));

    expect(service.sprints()[0].name).toBe('New Name');
    expect(client.updates.at(-1)).toMatchObject({ payload: { name: 'New Name' } });
  });

  it('no-ops an empty rename', async () => {
    service = make();
    client.seed([{ id: 's1', name: 'Old' }]);
    await firstValueFrom(service.loadSprints());

    await firstValueFrom(service.renameSprint('s1', '   '));

    expect(service.sprints()[0].name).toBe('Old');
    expect(client.updates).toHaveLength(0);
  });

  it('reverts the optimistic rename and errors on failure', async () => {
    service = make();
    client.seed([{ id: 's1', name: 'Old' }]);
    await firstValueFrom(service.loadSprints());

    client.failNext = true;
    let errored = false;
    await new Promise<void>((resolve) => {
      service
        .renameSprint('s1', 'Broken')
        .subscribe({ error: () => ((errored = true), resolve()) });
    });

    expect(errored).toBe(true);
    expect(service.sprints()[0].name).toBe('Old');
  });

  // ── setSprintDates ───────────────────────────────────────────────

  it('sets and clears dates', async () => {
    service = make();
    client.seed([{ id: 's1' }]);
    await firstValueFrom(service.loadSprints());

    await firstValueFrom(service.setSprintDates('s1', '2026-02-01', '2026-02-14'));
    expect(service.sprints()[0]).toMatchObject({ startsOn: '2026-02-01', endsOn: '2026-02-14' });

    await firstValueFrom(service.setSprintDates('s1', null, null));
    expect(service.sprints()[0]).toMatchObject({ startsOn: null, endsOn: null });
  });

  // ── setActiveSprint ──────────────────────────────────────────────

  it('activates directly when nothing else is active', async () => {
    service = make();
    client.seed([{ id: 's1', status: 'planned' }]);
    await firstValueFrom(service.loadSprints());

    await firstValueFrom(service.setActiveSprint('s1'));

    expect(service.sprints()[0].status).toBe('active');
    expect(client.rpcCalls).toEqual([
      { fn: 'set_active_sprint', args: { p_team_id: TEAM, p_sprint_id: 's1' } },
    ]);
  });

  it('flips the current active sprint to planned and activates the new one in a single RPC call', async () => {
    service = make();
    client.seed([
      { id: 's1', status: 'active', position: 1 },
      { id: 's2', status: 'planned', position: 2 },
    ]);
    await firstValueFrom(service.loadSprints());

    await firstValueFrom(service.setActiveSprint('s2'));

    expect(client.rpcCalls).toEqual([
      { fn: 'set_active_sprint', args: { p_team_id: TEAM, p_sprint_id: 's2' } },
    ]);
    expect(service.sprints().find((s) => s.id === 's1')?.status).toBe('planned');
    expect(service.sprints().find((s) => s.id === 's2')?.status).toBe('active');
  });

  it('reverts both flips on total RPC failure', async () => {
    service = make();
    client.seed([
      { id: 's1', status: 'active', position: 1 },
      { id: 's2', status: 'planned', position: 2 },
    ]);
    await firstValueFrom(service.loadSprints());

    client.failRpc = 'set_active_sprint';
    let errored = false;
    await new Promise<void>((resolve) => {
      service.setActiveSprint('s2').subscribe({ error: () => ((errored = true), resolve()) });
    });

    expect(errored).toBe(true);
    // The RPC is one transaction — either both rows flip or neither does, so
    // a failure never leaves a "nothing active" straddle: local state reverts
    // exactly to what's still true in the DB.
    expect(service.sprints().find((s) => s.id === 's1')?.status).toBe('active');
    expect(service.sprints().find((s) => s.id === 's2')?.status).toBe('planned');
  });

  it('leaves the DB-side row set untouched on RPC failure, so reverted local state matches it', async () => {
    // Regression guard for the pre-fix bug: the old two-step client
    // sequencing could have write 1 (old sprint -> planned) succeed and write
    // 2 (new sprint -> active) fail, leaving the DB with *no* active sprint
    // while the client reverted to showing the *old* sprint as still active —
    // a real client/server disagreement. `failRpc` fails the whole
    // `set_active_sprint` call before it mutates `client.rows` at all (the
    // fake's stand-in for a rolled-back transaction), so the DB-side truth
    // still has exactly the one active sprint the reverted local state
    // (asserted above) agrees with — that intermediate "nothing active" state
    // is no longer reachable through the client.
    service = make();
    client.seed([
      { id: 's1', status: 'active', position: 1 },
      { id: 's2', status: 'planned', position: 2 },
    ]);
    await firstValueFrom(service.loadSprints());

    client.failRpc = 'set_active_sprint';
    await new Promise<void>((resolve) => {
      service.setActiveSprint('s2').subscribe({ error: () => resolve() });
    });

    const activeInDb = client.rows.filter((r) => r.status === 'active');
    expect(activeInDb).toHaveLength(1);
    expect(activeInDb[0].id).toBe('s1');
  });

  // ── completeSprint / reopenSprint ────────────────────────────────

  it('completes and reopens a sprint', async () => {
    service = make();
    client.seed([{ id: 's1', status: 'active' }]);
    await firstValueFrom(service.loadSprints());

    await firstValueFrom(service.completeSprint('s1'));
    expect(service.sprints()[0].status).toBe('completed');

    await firstValueFrom(service.reopenSprint('s1'));
    expect(service.sprints()[0].status).toBe('planned');
  });

  // ── deleteSprint ─────────────────────────────────────────────────

  it('optimistically removes a sprint and persists the delete', async () => {
    service = make();
    client.seed([{ id: 's1' }, { id: 's2', position: 2 }]);
    await firstValueFrom(service.loadSprints());

    await firstValueFrom(service.deleteSprint('s1'));

    expect(service.sprints().map((s) => s.id)).toEqual(['s2']);
    expect(client.rows.some((r) => r.id === 's1')).toBe(false);
  });

  it('reverts the optimistic delete on failure', async () => {
    service = make();
    client.seed([{ id: 's1' }]);
    await firstValueFrom(service.loadSprints());

    client.failNext = true;
    let errored = false;
    await new Promise<void>((resolve) => {
      service.deleteSprint('s1').subscribe({ error: () => ((errored = true), resolve()) });
    });

    expect(errored).toBe(true);
    expect(service.sprints().map((s) => s.id)).toEqual(['s1']);
  });

  // ── reorderSprint ────────────────────────────────────────────────

  it('swaps position with the previous sprint on "up"', async () => {
    service = make();
    client.seed([
      { id: 's1', position: 1 },
      { id: 's2', position: 2 },
      { id: 's3', position: 3 },
    ]);
    await firstValueFrom(service.loadSprints());

    await firstValueFrom(service.reorderSprint('s2', 'up'));

    const byId = new Map(service.sprints().map((s) => [s.id, s.position]));
    expect(byId.get('s1')).toBe(2);
    expect(byId.get('s2')).toBe(1);
    // The moved sprint (s2) is patched first, taking its neighbour's old slot;
    // the neighbour (s1) is patched second, taking the moved sprint's old slot.
    expect(client.updates).toEqual([
      { id: 's2', payload: { position: 1 } },
      { id: 's1', payload: { position: 2 } },
    ]);
  });

  it('is a no-op past either boundary', async () => {
    service = make();
    client.seed([
      { id: 's1', position: 1 },
      { id: 's2', position: 2 },
    ]);
    await firstValueFrom(service.loadSprints());

    await firstValueFrom(service.reorderSprint('s1', 'up'));
    await firstValueFrom(service.reorderSprint('s2', 'down'));

    expect(client.updates).toHaveLength(0);
  });

  // ── clear ────────────────────────────────────────────────────────

  it('clear() resets the sprint list and error', async () => {
    service = make();
    client.seed([{ id: 's1' }]);
    await firstValueFrom(service.loadSprints());
    expect(service.sprints().length).toBe(1);

    service.clear();

    expect(service.sprints()).toEqual([]);
    expect(await firstValueFrom(service.error$)).toBeNull();
  });
});
