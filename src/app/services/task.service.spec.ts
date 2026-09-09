import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { TaskService } from './task.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { tasksCacheKey } from './cache.util';

/** The test runner's `localStorage` is a stub without methods, so persistence
 *  specs install a real in-memory one (matches theme/i18n specs). */
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

// ── Minimal in-memory fake of the Supabase query builder ──────────────────────
// Implements just enough of .from(table).select/insert/update/delete/eq/order/
// single to exercise TaskService. Every builder is thenable, so `await` works.

interface Row {
  id: string;
  title: string;
  status: string;
  priority: string;
  description: string | null;
  due_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  user_id: string;
}

class FakeTable {
  rows: Row[] = [];
  private seq = 100;
  /** When true, the next query resolves with an error and clears the flag. */
  failNext = false;
  /** Every UPDATE that reached the fake, in call order. */
  updates: Array<{ id: unknown; payload: Record<string, unknown> }> = [];

  nextId(): string {
    return String(++this.seq);
  }

  seed(rows: Partial<Row>[]): void {
    this.rows = rows.map((r, i) => ({
      id: String(i + 1),
      title: 'Task',
      status: 'todo',
      priority: 'medium',
      description: null,
      due_date: null,
      position: i + 1,
      created_at: 't0',
      updated_at: 't0',
      user_id: 'u1',
      ...r,
    }));
  }
}

class FakeQuery {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Record<string, unknown> | undefined;
  private filters: Array<[string, unknown]> = [];
  private wantSingle = false;

  constructor(private table: FakeTable) {}

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
    if (this.table.failNext) {
      this.table.failNext = false;
      return { data: null, error: { message: 'boom' } };
    }
    switch (this.op) {
      case 'select': {
        const rows = this.table.rows.filter(this.match);
        return { data: this.wantSingle ? (rows[0] ?? null) : rows, error: null };
      }
      case 'insert': {
        const row: Row = {
          id: this.table.nextId(),
          title: '',
          status: 'todo',
          priority: 'medium',
          description: null,
          due_date: null,
          position: 0,
          created_at: 't1',
          updated_at: 't1',
          user_id: 'u1',
          ...(this.payload as Partial<Row>),
        };
        this.table.rows.push(row);
        return { data: this.wantSingle ? row : [row], error: null };
      }
      case 'update': {
        const idFilter = this.filters.find(([c]) => c === 'id')?.[1];
        this.table.updates.push({
          id: idFilter,
          payload: (this.payload ?? {}) as Record<string, unknown>,
        });
        let updated: Row | null = null;
        this.table.rows = this.table.rows.map((r) => {
          if (this.match(r)) {
            updated = { ...r, ...(this.payload as Partial<Row>) };
            return updated;
          }
          return r;
        });
        return { data: this.wantSingle ? updated : updated ? [updated] : [], error: null };
      }
      case 'delete': {
        this.table.rows = this.table.rows.filter((r) => !this.match(r));
        return { data: null, error: null };
      }
    }
  }

  then<T>(onfulfilled?: (value: { data: unknown; error: unknown }) => T | PromiseLike<T>) {
    return Promise.resolve(this.run()).then(onfulfilled ?? undefined);
  }
}

const mkTask = (over: Partial<Row> = {}): Partial<Row> => ({
  title: 'Test task',
  status: 'todo',
  priority: 'medium',
  ...over,
});

describe('TaskService', () => {
  let service: TaskService;
  let table: FakeTable;
  let auth: { getCurrentUser: () => { id: string } | null };

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    table = new FakeTable();
    auth = { getCurrentUser: () => ({ id: 'u1' }) };
    const supabaseMock = {
      client: { from: () => new FakeQuery(table) },
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: AuthService, useValue: auth },
      ],
    });
    service = TestBed.inject(TaskService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Construction ────────────────────────────────────────────────

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  it('starts empty, not loading, no error', async () => {
    expect(await firstValueFrom(service.tasks$)).toEqual([]);
    expect(await firstValueFrom(service.loading$)).toBe(false);
    expect(await firstValueFrom(service.error$)).toBeNull();
  });

  // ── loadTasks() ────────────────────────────────────────────────

  it('populates tasks$ with mapped rows', async () => {
    table.seed([
      mkTask({ id: '1', title: 'One', position: 1 }),
      mkTask({ id: '2', title: 'Two', position: 2 }),
    ]);

    await firstValueFrom(service.loadTasks());

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks.map((t) => t.title)).toEqual(['One', 'Two']);
    expect(tasks[0]).toMatchObject({ id: '1', createdAt: 't0', updatedAt: 't0' });
    expect(tasks[0]).not.toHaveProperty('user_id');
  });

  it('toggles loading true then false', async () => {
    const seen: boolean[] = [];
    service.loading$.subscribe((l) => seen.push(l));
    await firstValueFrom(service.loadTasks());
    expect(seen).toContain(true);
    expect(seen[seen.length - 1]).toBe(false);
  });

  it('sets error$ to the translation key on failure', async () => {
    table.failNext = true;
    await firstValueFrom(service.loadTasks());
    expect(await firstValueFrom(service.error$)).toBe('errors.loadTasks');
    expect(await firstValueFrom(service.loading$)).toBe(false);
  });

  it('clears error$ before a new load', async () => {
    table.failNext = true;
    await firstValueFrom(service.loadTasks());
    await firstValueFrom(service.loadTasks());
    expect(await firstValueFrom(service.error$)).toBeNull();
  });

  // ── createTask() ───────────────────────────────────────────────

  it('appends the created task and assigns position max+1', async () => {
    table.seed([mkTask({ id: '1', position: 4 })]);
    await firstValueFrom(service.loadTasks());

    const created = await firstValueFrom(
      service.createTask({ title: 'New', status: 'todo', priority: 'high' }),
    );

    expect(created.position).toBe(5);
    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks.map((t) => t.title)).toEqual(['Test task', 'New']);
  });

  it('creates with position 1 when there are no tasks', async () => {
    const created = await firstValueFrom(
      service.createTask({ title: 'First', status: 'todo', priority: 'low' }),
    );
    expect(created.position).toBe(1);
  });

  // ── updateTask() ───────────────────────────────────────────────

  it('reflects the new status immediately, before the request resolves', async () => {
    table.seed([mkTask({ id: '1', status: 'todo' })]);
    await firstValueFrom(service.loadTasks());

    service.updateTask('1', { status: 'in-progress' }); // not awaited

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks[0].status).toBe('in-progress');
  });

  it('replaces the task with the server row on success', async () => {
    table.seed([mkTask({ id: '1', status: 'todo' })]);
    await firstValueFrom(service.loadTasks());

    await firstValueFrom(service.updateTask('1', { status: 'done' }));

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks[0].status).toBe('done');
  });

  it('keeps the newer status when a second update supersedes an in-flight one', async () => {
    table.seed([mkTask({ id: '1', status: 'todo' })]);
    await firstValueFrom(service.loadTasks());

    service.updateTask('1', { status: 'in-progress' });
    service.updateTask('1', { status: 'done' });

    // let both microtask chains settle
    await new Promise((r) => setTimeout(r));

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks[0].status).toBe('done');
  });

  it('terminates a superseded update observable instead of leaving it hanging', async () => {
    table.seed([mkTask({ id: '1', status: 'todo' })]);
    await firstValueFrom(service.loadTasks());

    const first$ = service.updateTask('1', { status: 'in-progress' });
    const settled = firstValueFrom(first$).then(
      () => 'settled',
      () => 'settled',
    );

    service.updateTask('1', { status: 'done' }); // supersedes the first

    const outcome = await Promise.race([
      settled,
      new Promise((r) => setTimeout(() => r('hung'), 50)),
    ]);
    expect(outcome).toBe('settled');
  });

  it('leaves tasks$ on the newest patch after a superseded update resolves', async () => {
    table.seed([mkTask({ id: '1', status: 'todo' })]);
    await firstValueFrom(service.loadTasks());

    service.updateTask('1', { status: 'in-progress' });
    await firstValueFrom(service.updateTask('1', { status: 'done' }));
    await new Promise((r) => setTimeout(r));

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks[0].status).toBe('done');
  });

  it('reverts the optimistic change if the request fails', async () => {
    table.seed([mkTask({ id: '1', status: 'todo' })]);
    await firstValueFrom(service.loadTasks());

    table.failNext = true;
    let errored = false;
    await new Promise<void>((resolve) => {
      service.updateTask('1', { status: 'in-progress' }).subscribe({
        error: () => {
          errored = true;
          resolve();
        },
      });
    });

    expect(errored).toBe(true);
    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks[0].status).toBe('todo');
  });

  // ── deleteTask() ───────────────────────────────────────────────

  it('removes the deleted task from tasks$', async () => {
    table.seed([mkTask({ id: '1' }), mkTask({ id: '2', title: 'Keep' })]);
    await firstValueFrom(service.loadTasks());

    await firstValueFrom(service.deleteTask('1'));

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks.map((t) => t.id)).toEqual(['2']);
  });

  it('removes the task optimistically, before the request resolves', async () => {
    table.seed([mkTask({ id: '1' }), mkTask({ id: '2', title: 'Keep' })]);
    await firstValueFrom(service.loadTasks());

    service.deleteTask('1').subscribe({ error: () => undefined }); // not awaited

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks.map((t) => t.id)).toEqual(['2']);
  });

  it('restores the row if the delete request fails', async () => {
    table.seed([mkTask({ id: '1' }), mkTask({ id: '2', title: 'Keep' })]);
    await firstValueFrom(service.loadTasks());

    table.failNext = true;
    let errored = false;
    await new Promise<void>((resolve) => {
      service.deleteTask('1').subscribe({
        error: () => {
          errored = true;
          resolve();
        },
      });
    });

    expect(errored).toBe(true);
    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks.map((t) => t.id)).toEqual(['1', '2']);
  });

  // ── reorderColumn() ────────────────────────────────────────────

  it('assigns sequential positions 1..N optimistically and PATCHes only moved rows', async () => {
    table.seed([
      mkTask({ id: '1', status: 'todo', position: 1 }),
      mkTask({ id: '2', status: 'todo', position: 2 }),
      mkTask({ id: '3', status: 'todo', position: 3 }),
    ]);
    await firstValueFrom(service.loadTasks());

    // Swap the last two: new order [1, 3, 2] -> positions 1, 2, 3.
    service.reorderColumn('todo', ['1', '3', '2']); // not awaited

    const optimistic = await firstValueFrom(service.tasks$);
    const pos = Object.fromEntries(optimistic.map((t) => [t.id, t.position]));
    expect(pos).toEqual({ '1': 1, '3': 2, '2': 3 });

    await new Promise((r) => setTimeout(r));

    // id 1 kept position 1 -> not rewritten. Only 2 and 3 changed.
    expect(table.updates.map((u) => u.id).sort()).toEqual(['2', '3']);
    expect(table.updates.every((u) => !('status' in u.payload))).toBe(true);
  });

  it('issues no request when the requested order matches the current one', async () => {
    table.seed([
      mkTask({ id: '1', status: 'todo', position: 1 }),
      mkTask({ id: '2', status: 'todo', position: 2 }),
    ]);
    await firstValueFrom(service.loadTasks());

    await firstValueFrom(service.reorderColumn('todo', ['1', '2']));

    expect(table.updates).toHaveLength(0);
  });

  it('flips status for a card that entered the column from elsewhere', async () => {
    table.seed([
      mkTask({ id: '1', status: 'done', position: 1 }),
      mkTask({ id: '2', status: 'todo', position: 5 }), // dragged in from "todo"
    ]);
    await firstValueFrom(service.loadTasks());

    await firstValueFrom(service.reorderColumn('done', ['1', '2']));

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks.find((t) => t.id === '2')).toMatchObject({ status: 'done', position: 2 });

    const moved = table.updates.find((u) => u.id === '2');
    expect(moved?.payload).toMatchObject({ status: 'done', position: 2 });
  });

  it('reverts every row to the pre-move snapshot if a PATCH fails', async () => {
    table.seed([
      mkTask({ id: '1', status: 'todo', position: 1 }),
      mkTask({ id: '2', status: 'todo', position: 2 }),
      mkTask({ id: '3', status: 'todo', position: 3 }),
    ]);
    await firstValueFrom(service.loadTasks());

    table.failNext = true;
    let errored = false;
    await new Promise<void>((resolve) => {
      service.reorderColumn('todo', ['3', '2', '1']).subscribe({
        error: () => {
          errored = true;
          resolve();
        },
      });
    });

    expect(errored).toBe(true);
    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks.map((t) => [t.id, t.position])).toEqual([
      ['1', 1],
      ['2', 2],
      ['3', 3],
    ]);
  });

  // ── due_date ⇄ dueDate ─────────────────────────────────────────

  it('maps due_date → dueDate on load and leaves it undefined when null', async () => {
    table.seed([mkTask({ id: '1', due_date: '2026-10-01' }), mkTask({ id: '2', due_date: null })]);
    await firstValueFrom(service.loadTasks());

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks[0].dueDate).toBe('2026-10-01');
    expect(tasks[1].dueDate).toBeUndefined();
  });

  it('sends due_date on insert and maps it back on the created task', async () => {
    const created = await firstValueFrom(
      service.createTask({
        title: 'With date',
        status: 'todo',
        priority: 'medium',
        dueDate: '2026-12-24',
      }),
    );
    expect(created.dueDate).toBe('2026-12-24');
    expect(table.rows.at(-1)!.due_date).toBe('2026-12-24');
  });

  it('PATCHes due_date on update, and clears it with null', async () => {
    table.seed([mkTask({ id: '1', due_date: '2026-10-01' })]);
    await firstValueFrom(service.loadTasks());

    await firstValueFrom(service.updateTask('1', { dueDate: '2026-11-15' }));
    expect(table.updates.at(-1)!.payload).toEqual({ due_date: '2026-11-15' });

    await firstValueFrom(service.updateTask('1', { dueDate: undefined }));
    expect(table.updates.at(-1)!.payload).toEqual({ due_date: null });
    expect((await firstValueFrom(service.tasks$))[0].dueDate).toBeUndefined();
  });

  it('round-trips a dueDate-bearing task through the localStorage cache', async () => {
    table.seed([mkTask({ id: '1', due_date: '2027-01-05', title: 'Dated' })]);
    await firstValueFrom(service.loadTasks());

    const blob = JSON.parse(localStorage.getItem(tasksCacheKey('u1'))!);
    expect(blob[0]).toMatchObject({ id: '1', dueDate: '2027-01-05' });

    // Server now unavailable — the cached blob is re-seeded, dueDate intact.
    table.failNext = true;
    await firstValueFrom(service.loadTasks());
    expect((await firstValueFrom(service.tasks$))[0].dueDate).toBe('2027-01-05');
  });

  // ── localStorage cache (stale-while-revalidate) ────────────────

  const seedCache = (uid: string, rows: Partial<Row>[]) =>
    localStorage.setItem(
      tasksCacheKey(uid),
      JSON.stringify(
        rows.map((r, i) => ({
          id: String(i + 1),
          title: 'Cached',
          status: 'todo',
          priority: 'medium',
          position: i + 1,
          createdAt: 't0',
          updatedAt: 't0',
          ...r,
        })),
      ),
    );

  it('seeds tasks$ synchronously from cache before the fetch resolves', async () => {
    seedCache('u1', [{ id: '1', title: 'FromCache' }]);
    table.seed([mkTask({ id: '9', title: 'FromServer', position: 1 })]);

    service.loadTasks().subscribe(); // not awaited — check the synchronous seed

    expect((await firstValueFrom(service.tasks$)).map((t) => t.title)).toEqual(['FromCache']);
  });

  it('does not show the skeleton when a cache hit seeds the list', async () => {
    seedCache('u1', [{ id: '1' }]);
    const seen: boolean[] = [];
    service.loading$.subscribe((l) => seen.push(l));

    await firstValueFrom(service.loadTasks());

    expect(seen).not.toContain(true);
  });

  it('overwrites the cached list with server data once the fetch resolves', async () => {
    seedCache('u1', [{ id: '1', title: 'Stale' }]);
    table.seed([mkTask({ id: '9', title: 'Fresh', position: 1 })]);

    await firstValueFrom(service.loadTasks());

    expect((await firstValueFrom(service.tasks$)).map((t) => t.title)).toEqual(['Fresh']);
    const cached = JSON.parse(localStorage.getItem(tasksCacheKey('u1'))!);
    expect(cached.map((t: { title: string }) => t.title)).toEqual(['Fresh']);
  });

  it('keeps the cached list and raises no error banner when the fetch fails', async () => {
    seedCache('u1', [{ id: '1', title: 'Offline copy' }]);
    table.failNext = true;

    await firstValueFrom(service.loadTasks());

    expect((await firstValueFrom(service.tasks$)).map((t) => t.title)).toEqual(['Offline copy']);
    expect(await firstValueFrom(service.error$)).toBeNull();
    expect(await firstValueFrom(service.loading$)).toBe(false);
  });

  it('write-throughs create / update / delete / reorder to the cache key', async () => {
    table.seed([
      mkTask({ id: '1', status: 'todo', position: 1 }),
      mkTask({ id: '2', status: 'todo', position: 2 }),
    ]);
    await firstValueFrom(service.loadTasks());

    const cache = () =>
      JSON.parse(localStorage.getItem(tasksCacheKey('u1'))!) as Array<{
        id: string;
        title: string;
        status: string;
        position: number;
      }>;

    await firstValueFrom(service.createTask({ title: 'C', status: 'todo', priority: 'low' }));
    expect(cache().map((t) => t.title)).toContain('C');

    await firstValueFrom(service.updateTask('1', { status: 'done' }));
    expect(cache().find((t) => t.id === '1')!.status).toBe('done');

    await firstValueFrom(service.reorderColumn('todo', ['2', '1']));
    const reordered = cache();
    expect(reordered.find((t) => t.id === '2')!.position).toBe(1);

    await firstValueFrom(service.deleteTask('2'));
    expect(cache().some((t) => t.id === '2')).toBe(false);
  });

  it('does not read cache written under a different uid', async () => {
    seedCache('other-user', [{ id: '1', title: 'Someone else' }]);
    table.seed([mkTask({ id: '9', title: 'Mine', position: 1 })]);

    service.loadTasks().subscribe();

    // uid is 'u1' — the 'other-user' blob must be ignored (no synchronous seed).
    expect(await firstValueFrom(service.tasks$)).toEqual([]);
    await new Promise((r) => setTimeout(r));
    expect((await firstValueFrom(service.tasks$)).map((t) => t.title)).toEqual(['Mine']);
  });

  it('ignores a corrupt / non-array cache blob and falls through to the network', async () => {
    localStorage.setItem(tasksCacheKey('u1'), '{"not":"an array"}');
    table.seed([mkTask({ id: '9', title: 'Server', position: 1 })]);

    service.loadTasks().subscribe();
    expect(await firstValueFrom(service.tasks$)).toEqual([]); // no bad seed

    await new Promise((r) => setTimeout(r));
    expect((await firstValueFrom(service.tasks$)).map((t) => t.title)).toEqual(['Server']);
  });
});
