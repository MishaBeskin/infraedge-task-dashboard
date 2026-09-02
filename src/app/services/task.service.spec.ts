import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { TaskService } from './task.service';
import { SupabaseService } from './supabase.service';

// ── Minimal in-memory fake of the Supabase query builder ──────────────────────
// Implements just enough of .from(table).select/insert/update/delete/eq/order/
// single to exercise TaskService. Every builder is thenable, so `await` works.

interface Row {
  id: string;
  title: string;
  status: string;
  priority: string;
  description: string | null;
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

  beforeEach(() => {
    table = new FakeTable();
    const supabaseMock = {
      client: { from: () => new FakeQuery(table) },
    };
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseMock }],
    });
    service = TestBed.inject(TaskService);
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
});
