import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { User } from '../models/task.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  currentUser$ = this.currentUserSubject.asObservable();

  constructor() {
    const stored = localStorage.getItem('stack_user');
    if (stored) {
      this.currentUserSubject.next(JSON.parse(stored) as User);
    }
  }

  login(email: string, password: string) {
    return this.http
      .get<User[]>(`http://localhost:3000/users?email=${email}&password=${password}`)
      .pipe(
        tap(users => {
          if (users.length > 0) {
            localStorage.setItem('stack_user', JSON.stringify(users[0]));
            this.currentUserSubject.next(users[0]);
          }
        })
      );
  }

  logout() {
    localStorage.removeItem('stack_user');
    this.currentUserSubject.next(null);
  }

  isLoggedIn(): boolean {
    return this.currentUserSubject.getValue() !== null;
  }

  getToken(): string | null {
    return this.currentUserSubject.getValue()?.token ?? null;
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.getValue();
  }
}
