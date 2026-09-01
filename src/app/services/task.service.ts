import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { Task } from '../models/task.model';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private http = inject(HttpClient);

  private tasksSubject = new BehaviorSubject<Task[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private pendingUpdates = new Map<number, Subscription>();

  tasks$ = this.tasksSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  loadTasksForUser(userId: number) {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);
    return this.http
      .get<Task[]>(`${environment.apiUrl}/tasks?userId=${userId}`)
      .pipe(
        tap(tasks => {
          this.tasksSubject.next(tasks);
          this.loadingSubject.next(false);
        }),
        catchError(() => {
          // Emit a translation key; the board resolves it via I18nService.
          this.errorSubject.next('errors.loadTasks');
          this.loadingSubject.next(false);
          return of([]);
        })
      );
  }

  createTask(task: Omit<Task, 'id'>) {
    return this.http.post<Task>(`${environment.apiUrl}/tasks`, task).pipe(
      tap(created => {
        this.tasksSubject.next([...this.tasksSubject.getValue(), created]);
      })
    );
  }

  updateTask(id: number, patch: Partial<Task>) {
    const tasks = this.tasksSubject.getValue();
    const previous = tasks.find(t => t.id === id);

    // Apply the change immediately so a slow connection can't leave the card
    // sitting in a column the user already dragged it away from.
    this.tasksSubject.next(tasks.map(t => (t.id === id ? { ...t, ...patch } : t)));

    // A drop that fires before the previous one for this task has resolved
    // makes that earlier request obsolete. Cancel it so its (possibly
    // out-of-order) response can never overwrite the newer status.
    this.pendingUpdates.get(id)?.unsubscribe();

    const result = new Subject<Task>();
    const subscription = this.http.patch<Task>(`${environment.apiUrl}/tasks/${id}`, patch).subscribe({
      next: updated => {
        const current = this.tasksSubject.getValue();
        this.tasksSubject.next(current.map(t => (t.id === id ? updated : t)));
        result.next(updated);
        result.complete();
      },
      error: err => {
        if (previous) {
          const current = this.tasksSubject.getValue();
          this.tasksSubject.next(current.map(t => (t.id === id ? previous : t)));
        }
        result.error(err);
      },
    });
    this.pendingUpdates.set(id, subscription);

    return result.asObservable();
  }

  deleteTask(id: number) {
    return this.http.delete<void>(`${environment.apiUrl}/tasks/${id}`).pipe(
      tap(() => {
        const tasks = this.tasksSubject.getValue().filter(t => t.id !== id);
        this.tasksSubject.next(tasks);
      })
    );
  }
}
