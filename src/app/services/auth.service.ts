import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { User } from '../models/task.model';
import { environment } from '../../environments/environment';

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
      .get<User[]>(`${environment.apiUrl}/users?email=${email}&password=${password}`)
      .pipe(
        tap(users => {
          if (users.length > 0) {
            localStorage.setItem('stack_user', JSON.stringify(users[0]));
            this.currentUserSubject.next(users[0]);
          }
        })
      );
  }

  // Render.com free tier spins down after 15 min of inactivity.
  // Call this when the login page loads so the server is warm before the user submits.
  warmUp() {
    this.http.get(`${environment.apiUrl}/users`, { params: { _limit: '1' } })
      .pipe(catchError(() => of(null)))
      .subscribe();
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
