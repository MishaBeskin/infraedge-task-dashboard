import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription, from, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { Task, NewTask, TaskPatch, Status, Priority } from '../models/task.model';
import { SupabaseService } from './supabase.service';

interface TaskRow {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  description: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  user_id: string;
}

const fromRow = (r: TaskRow): Task => ({
  id: r.id,
  title: r.title,
  status: r.status,
  priority: r.priority,
  description: r.description ?? undefined,
  position: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toRow = (patch: TaskPatch): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row['title'] = patch.title;
  if (patch.status !== undefined) row['status'] = patch.status;
  if (patch.priority !== undefined) row['priority'] = patch.priority;
  if (patch.position !== undefined) row['position'] = patch.position;
  if ('description' in patch) row['description'] = patch.description ?? null;
  return row;
};

@Injectable({ providedIn: 'root' })
export class TaskService {
  private supabase = inject(SupabaseService).client;

  private tasksSubject = new BehaviorSubject<Task[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);
  /** In-flight PATCHes keyed by task id. Kept so a newer update for the same
   *  task can supersede an older one — both the Supabase subscription and the
   *  result Subject handed to the caller are cleaned up on supersede so an
   *  awaiting caller (firstValueFrom) never hangs. */
  private pendingUpdates = new Map<string, { sub: Subscription; result: Subject<Task> }>();
  /** In-flight column reorders keyed by `reorder:<status>`, so a rapid second
   *  drag of the same column can supersede an earlier, still-pending one. */
  private pendingReorders = new Map<string, { sub: Subscription; result: Subject<void> }>();

  tasks$ = this.tasksSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  /** Loads every task the signed-in user owns. RLS scopes the query on the
   *  server, so no user id is passed. */
  loadTasks(): Observable<void> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);
    return from(this.fetchTasks()).pipe(
      tap((rows) => {
        this.tasksSubject.next(rows.map(fromRow));
        this.loadingSubject.next(false);
      }),
      map(() => undefined),
      catchError(() => {
        // Emit a translation key; the board resolves it via I18nService.
        this.errorSubject.next('errors.loadTasks');
        this.loadingSubject.next(false);
        return of(undefined);
      }),
    );
  }

  createTask(input: NewTask): Observable<Task> {
    const existing = this.tasksSubject.getValue();
    const position = existing.length ? Math.max(...existing.map((t) => t.position)) + 1 : 1;
    return from(this.insertTask(input, position)).pipe(
      tap((created) => {
        this.tasksSubject.next([...this.tasksSubject.getValue(), created]);
      }),
    );
  }

  updateTask(id: string, patch: TaskPatch): Observable<Task> {
    const tasks = this.tasksSubject.getValue();
    const previous = tasks.find((t) => t.id === id);

    // Apply the change immediately so a slow connection can't leave a card in a
    // column the user already dragged it out of.
    this.tasksSubject.next(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));

    // A newer change for the same task makes an in-flight one obsolete. Drop it
    // so its (possibly out-of-order) response can't overwrite the newer state,
    // and terminate its result Subject so a caller awaiting it doesn't hang.
    // The optimistic patch above already reflects the newest intent, so we
    // resolve the superseded caller with that row (no error — nothing failed).
    const stale = this.pendingUpdates.get(id);
    if (stale) {
      stale.sub.unsubscribe();
      const latest = this.tasksSubject.getValue().find((t) => t.id === id);
      if (latest) stale.result.next(latest);
      stale.result.complete();
      this.pendingUpdates.delete(id);
    }

    const result = new Subject<Task>();
    const sub = from(this.patchTask(id, patch)).subscribe({
      next: (updated) => {
        const current = this.tasksSubject.getValue();
        this.tasksSubject.next(current.map((t) => (t.id === id ? updated : t)));
        if (this.pendingUpdates.get(id)?.result === result) this.pendingUpdates.delete(id);
        result.next(updated);
        result.complete();
      },
      error: (err) => {
        if (previous) {
          const current = this.tasksSubject.getValue();
          this.tasksSubject.next(current.map((t) => (t.id === id ? previous : t)));
        }
        if (this.pendingUpdates.get(id)?.result === result) this.pendingUpdates.delete(id);
        result.error(err);
      },
    });
    this.pendingUpdates.set(id, { sub, result });

    return result.asObservable();
  }

  /** Persists a new within-column ordering. `orderedIds` is the full, ordered id
   *  list for `status` (front to back). Any id whose status differs is treated as
   *  a cross-column move and gets `status` flipped too.
   *
   *  Optimistic: `tasksSubject` is rewritten with the new positions/status right
   *  away, then only the rows that actually changed are PATCHed in parallel. Any
   *  failure reverts the whole list to the pre-move snapshot and errors the
   *  returned observable. A rapid second reorder of the same column supersedes an
   *  in-flight one (key `reorder:<status>`). */
  reorderColumn(status: Status, orderedIds: string[]): Observable<void> {
    const snapshot = this.tasksSubject.getValue();
    const byId = new Map(snapshot.map((t) => [t.id, t]));

    // Rows whose position and/or status differ from the requested order.
    const changed: { id: string; position: number; status?: Status }[] = [];
    orderedIds.forEach((id, i) => {
      const task = byId.get(id);
      if (!task) return;
      const position = i + 1;
      const statusChanged = task.status !== status;
      if (task.position !== position || statusChanged) {
        changed.push({ id, position, status: statusChanged ? status : undefined });
      }
    });

    // Nothing to do — same column, identical order. No network call.
    if (changed.length === 0) return of(undefined);

    const patchById = new Map(changed.map((c) => [c.id, c]));
    this.tasksSubject.next(
      snapshot.map((t) => {
        const c = patchById.get(t.id);
        return c ? { ...t, position: c.position, status: c.status ?? t.status } : t;
      }),
    );

    const key = `reorder:${status}`;
    const stale = this.pendingReorders.get(key);
    if (stale) {
      stale.sub.unsubscribe();
      stale.result.complete();
      this.pendingReorders.delete(key);
    }

    const result = new Subject<void>();
    const sub = from(this.persistReorder(changed)).subscribe({
      next: () => {
        if (this.pendingReorders.get(key)?.result === result) this.pendingReorders.delete(key);
        result.next();
        result.complete();
      },
      error: (err) => {
        this.tasksSubject.next(snapshot);
        if (this.pendingReorders.get(key)?.result === result) this.pendingReorders.delete(key);
        result.error(err);
      },
    });
    this.pendingReorders.set(key, { sub, result });

    return result.asObservable();
  }

  deleteTask(id: string): Observable<void> {
    const previous = this.tasksSubject.getValue();

    // Optimistic removal — mirrors updateTask so the card disappears at once and
    // the row is restored if the server rejects the delete.
    if (previous.some((t) => t.id === id)) {
      this.tasksSubject.next(previous.filter((t) => t.id !== id));
    }

    return from(this.removeTask(id)).pipe(
      map(() => undefined),
      catchError((err) => {
        this.tasksSubject.next(previous);
        return throwError(() => err);
      }),
    );
  }

  // ── Supabase calls ────────────────────────────────────────────────

  private async fetchTasks(): Promise<TaskRow[]> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as TaskRow[];
  }

  private async insertTask(input: NewTask, position: number): Promise<Task> {
    const { data, error } = await this.supabase
      .from('tasks')
      .insert({
        title: input.title,
        status: input.status,
        priority: input.priority,
        description: input.description ?? null,
        position,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as TaskRow);
  }

  private async patchTask(id: string, patch: TaskPatch): Promise<Task> {
    const { data, error } = await this.supabase
      .from('tasks')
      .update(toRow(patch))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as TaskRow);
  }

  private async removeTask(id: string): Promise<void> {
    const { error } = await this.supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
  }

  /** One targeted UPDATE per changed row, in parallel. Rows left untouched are
   *  not rewritten. Rejects on the first error so the caller can revert. */
  private async persistReorder(
    changed: { id: string; position: number; status?: Status }[],
  ): Promise<void> {
    await Promise.all(
      changed.map(async ({ id, position, status }) => {
        const patch: Record<string, unknown> = { position };
        if (status !== undefined) patch['status'] = status;
        const { error } = await this.supabase.from('tasks').update(patch).eq('id', id);
        if (error) throw error;
      }),
    );
  }
}
