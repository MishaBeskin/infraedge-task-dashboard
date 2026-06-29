import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { Task } from '../models/task.model';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private http = inject(HttpClient);

  private tasksSubject = new BehaviorSubject<Task[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);

  tasks$ = this.tasksSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  loadTasksForUser(userId: number) {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);
    return this.http
      .get<Task[]>(`http://localhost:3000/tasks?userId=${userId}`)
      .pipe(
        tap(tasks => {
          this.tasksSubject.next(tasks);
          this.loadingSubject.next(false);
        }),
        catchError(() => {
          this.errorSubject.next('שגיאה בטעינת המשימות');
          this.loadingSubject.next(false);
          return of([]);
        })
      );
  }

  createTask(task: Omit<Task, 'id'>) {
    return this.http.post<Task>('http://localhost:3000/tasks', task).pipe(
      tap(created => {
        this.tasksSubject.next([...this.tasksSubject.getValue(), created]);
      })
    );
  }

  updateTask(id: number, patch: Partial<Task>) {
    return this.http.patch<Task>(`http://localhost:3000/tasks/${id}`, patch).pipe(
      tap(updated => {
        const tasks = this.tasksSubject.getValue().map(t => (t.id === id ? updated : t));
        this.tasksSubject.next(tasks);
      })
    );
  }

  deleteTask(id: number) {
    return this.http.delete<void>(`http://localhost:3000/tasks/${id}`).pipe(
      tap(() => {
        const tasks = this.tasksSubject.getValue().filter(t => t.id !== id);
        this.tasksSubject.next(tasks);
      })
    );
  }
}
