import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription, from, of } from 'rxjs';
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
  private pendingUpdates = new Map<string, Subscription>();

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
    // so its (possibly out-of-order) response can't overwrite the newer state.
    this.pendingUpdates.get(id)?.unsubscribe();

    const result = new Subject<Task>();
    const subscription = from(this.patchTask(id, patch)).subscribe({
      next: (updated) => {
        const current = this.tasksSubject.getValue();
        this.tasksSubject.next(current.map((t) => (t.id === id ? updated : t)));
        this.pendingUpdates.delete(id);
        result.next(updated);
        result.complete();
      },
      error: (err) => {
        if (previous) {
          const current = this.tasksSubject.getValue();
          this.tasksSubject.next(current.map((t) => (t.id === id ? previous : t)));
        }
        this.pendingUpdates.delete(id);
        result.error(err);
      },
    });
    this.pendingUpdates.set(id, subscription);

    return result.asObservable();
  }

  deleteTask(id: string): Observable<void> {
    return from(this.removeTask(id)).pipe(
      tap(() => {
        this.tasksSubject.next(this.tasksSubject.getValue().filter((t) => t.id !== id));
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
}
