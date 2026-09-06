import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { BoardSettingsService } from './board-settings.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { boardNameCacheKey } from './cache.util';

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

// ── Minimal in-memory fake of the Supabase query builder ─────────────────────
// Mirrors the approach in task.service.spec.ts: enough of
// .from(table).select/update/eq/single to exercise BoardSettingsService.
// Every builder is thenable so `await` resolves it.

interface ProfileRow {
  id: string;
  board_name: string | null;
}

class FakeTable {
  rows: ProfileRow[] = [{ id: 'u1', board_name: null }];
  /** When true the next query resolves with an error and clears the flag. */
  failNext = false;
  /** Every UPDATE that reached the fake, in call order. */
  updates: Array<{ id: unknown; payload: Record<string, unknown> }> = [];
}

class FakeQuery {
  private op: 'select' | 'update' = 'select';
  private payload: Record<string, unknown> | undefined;
  private filters: Array<[string, unknown]> = [];
  private wantSingle = false;

  constructor(private table: FakeTable) {}

  select() {
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
  update(payload: Record<string, unknown>) {
    this.op = 'update';
    this.payload = payload;
    return this;
  }

  private match = (r: ProfileRow) =>
    this.filters.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v);

  private run(): { data: unknown; error: unknown } {
    if (this.table.failNext) {
      this.table.failNext = false;
      return { data: null, error: { message: 'boom' } };
    }
    if (this.op === 'update') {
      const idFilter = this.filters.find(([c]) => c === 'id')?.[1];
      this.table.updates.push({
        id: idFilter,
        payload: (this.payload ?? {}) as Record<string, unknown>,
      });
      let updated: ProfileRow | null = null;
      this.table.rows = this.table.rows.map((r) => {
        if (this.match(r)) {
          updated = { ...r, ...(this.payload as Partial<ProfileRow>) };
          return updated;
        }
        return r;
      });
      return { data: updated ? [updated] : [], error: null };
    }
    const rows = this.table.rows.filter(this.match);
    return { data: this.wantSingle ? (rows[0] ?? null) : rows, error: null };
  }

  then<T>(onfulfilled?: (value: { data: unknown; error: unknown }) => T | PromiseLike<T>) {
    return Promise.resolve(this.run()).then(onfulfilled ?? undefined);
  }
}

describe('BoardSettingsService', () => {
  let service: BoardSettingsService;
  let table: FakeTable;
  let auth: { getCurrentUser: () => { id: string } | null };

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    table = new FakeTable();
    auth = { getCurrentUser: () => ({ id: 'u1' }) };
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: { from: () => new FakeQuery(table) } } },
        { provide: AuthService, useValue: auth },
      ],
    });
    service = TestBed.inject(BoardSettingsService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is created, starts null with no error', async () => {
    expect(service).toBeTruthy();
    expect(await firstValueFrom(service.boardName$)).toBeNull();
    expect(await firstValueFrom(service.error$)).toBeNull();
  });

  // ── loadBoardName() ───────────────────────────────────────────────

  it('populates boardName$ from the profile row', async () => {
    table.rows = [{ id: 'u1', board_name: 'Roadmap' }];
    await firstValueFrom(service.loadBoardName());
    expect(await firstValueFrom(service.boardName$)).toBe('Roadmap');
  });

  it('keeps boardName$ null when the row has no custom name', async () => {
    await firstValueFrom(service.loadBoardName());
    expect(await firstValueFrom(service.boardName$)).toBeNull();
  });

  it('emits errors.loadBoardName on failure without throwing', async () => {
    table.failNext = true;
    await firstValueFrom(service.loadBoardName()); // resolves, does not reject
    expect(await firstValueFrom(service.error$)).toBe('errors.loadBoardName');
    expect(await firstValueFrom(service.boardName$)).toBeNull();
  });

  // ── renameBoard() ────────────────────────────────────────────────

  it('optimistically updates boardName$ before the request resolves', async () => {
    service.renameBoard('New name'); // not awaited
    expect(await firstValueFrom(service.boardName$)).toBe('New name');
  });

  it('persists the trimmed name via UPDATE on profiles', async () => {
    await firstValueFrom(service.renameBoard('  Sprint 4  '));
    expect(table.updates).toEqual([{ id: 'u1', payload: { board_name: 'Sprint 4' } }]);
    expect(await firstValueFrom(service.boardName$)).toBe('Sprint 4');
  });

  it('treats an empty / whitespace name as clearing back to the default (null)', async () => {
    table.rows = [{ id: 'u1', board_name: 'Something' }];
    await firstValueFrom(service.loadBoardName());

    await firstValueFrom(service.renameBoard('   '));

    expect(table.updates.at(-1)).toEqual({ id: 'u1', payload: { board_name: null } });
    expect(await firstValueFrom(service.boardName$)).toBeNull();
  });

  it('caps the persisted name at 60 characters', async () => {
    const long = 'x'.repeat(80);
    await firstValueFrom(service.renameBoard(long));
    const saved = table.updates.at(-1)!.payload['board_name'] as string;
    expect(saved.length).toBe(60);
  });

  it('makes no network call when the name is unchanged', async () => {
    table.rows = [{ id: 'u1', board_name: 'Same' }];
    await firstValueFrom(service.loadBoardName());

    await firstValueFrom(service.renameBoard('Same'));

    expect(table.updates).toHaveLength(0);
  });

  it('reverts boardName$ and errors the observable when the UPDATE fails', async () => {
    table.rows = [{ id: 'u1', board_name: 'Original' }];
    await firstValueFrom(service.loadBoardName());

    table.failNext = true;
    let errored = false;
    await new Promise<void>((resolve) => {
      service.renameBoard('Broken').subscribe({
        error: () => {
          errored = true;
          resolve();
        },
      });
    });

    expect(errored).toBe(true);
    expect(await firstValueFrom(service.boardName$)).toBe('Original');
    expect(await firstValueFrom(service.error$)).toBe('errors.renameBoard');
  });

  // ── localStorage cache (stale-while-revalidate) ───────────────────

  it('seeds boardName$ synchronously from cache before the fetch resolves', async () => {
    localStorage.setItem(boardNameCacheKey('u1'), JSON.stringify('Cached title'));
    table.rows = [{ id: 'u1', board_name: 'Server title' }];

    service.loadBoardName().subscribe(); // not awaited

    expect(await firstValueFrom(service.boardName$)).toBe('Cached title');
  });

  it('overwrites the cache with the server value after the fetch', async () => {
    localStorage.setItem(boardNameCacheKey('u1'), JSON.stringify('Stale'));
    table.rows = [{ id: 'u1', board_name: 'Fresh' }];

    await firstValueFrom(service.loadBoardName());

    expect(await firstValueFrom(service.boardName$)).toBe('Fresh');
    expect(JSON.parse(localStorage.getItem(boardNameCacheKey('u1'))!)).toBe('Fresh');
  });

  it('keeps the cached name but still reports the error when the fetch fails', async () => {
    localStorage.setItem(boardNameCacheKey('u1'), JSON.stringify('Last known'));
    table.failNext = true;

    await firstValueFrom(service.loadBoardName());

    expect(await firstValueFrom(service.boardName$)).toBe('Last known');
    expect(await firstValueFrom(service.error$)).toBe('errors.loadBoardName');
  });

  it('write-throughs a rename to the cache key', async () => {
    await firstValueFrom(service.renameBoard('Sprint 5'));
    expect(JSON.parse(localStorage.getItem(boardNameCacheKey('u1'))!)).toBe('Sprint 5');
  });

  it('removes the cache key when the name is cleared to the default', async () => {
    table.rows = [{ id: 'u1', board_name: 'Something' }];
    await firstValueFrom(service.loadBoardName());
    expect(localStorage.getItem(boardNameCacheKey('u1'))).not.toBeNull();

    await firstValueFrom(service.renameBoard('   '));

    expect(localStorage.getItem(boardNameCacheKey('u1'))).toBeNull();
  });

  it('does not read a name cached under a different uid', async () => {
    localStorage.setItem(boardNameCacheKey('other'), JSON.stringify('Not mine'));
    table.rows = [{ id: 'u1', board_name: null }];

    service.loadBoardName().subscribe();

    expect(await firstValueFrom(service.boardName$)).toBeNull(); // no cross-user seed
  });
});
