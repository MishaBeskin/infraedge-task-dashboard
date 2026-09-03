import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { AuthChangeEvent, Session, User as SbUser } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { AppUser } from '../models/task.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseService).client;

  private currentUserSubject = new BehaviorSubject<AppUser | null>(null);
  currentUser$ = this.currentUserSubject.asObservable();

  /**
   * Resolves once the initial session has been read from storage. The auth
   * guard and an APP_INITIALIZER both await this so a hard refresh never
   * bounces an already-logged-in user to /login.
   */
  private readonly ready: Promise<void>;

  constructor() {
    this.ready = this.supabase.auth
      .getSession()
      .then(({ data }) => {
        this.currentUserSubject.next(toAppUser(data.session?.user ?? null));
      })
      // A failed initial read must not reject `ready` — provideAppInitializer
      // would blank the page and the guard would throw. Treat it as logged out.
      .catch(() => this.currentUserSubject.next(null));

    this.supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      this.currentUserSubject.next(toAppUser(session?.user ?? null));
    });
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  /** Email + password. Rejects (throws in the awaited call) on bad credentials. */
  signInWithPassword(email: string, password: string) {
    return this.supabase.auth.signInWithPassword({ email, password });
  }

  /** Register with email + password. With email confirmation off this returns a
   *  live session immediately. */
  signUp(email: string, password: string, name: string) {
    return this.supabase.auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: callbackUrl() },
    });
  }

  /** Passwordless: emails a one-time login link. Creates the user if new. */
  signInWithMagicLink(email: string) {
    return this.supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true },
    });
  }

  /** Redirects the browser to Google, then back to /auth/callback. */
  signInWithGoogle() {
    return this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl() },
    });
  }

  sendPasswordReset(email: string) {
    return this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
  }

  updatePassword(password: string) {
    return this.supabase.auth.updateUser({ password });
  }

  signOut() {
    return this.supabase.auth.signOut();
  }

  isLoggedIn(): boolean {
    return this.currentUserSubject.getValue() !== null;
  }

  getCurrentUser(): AppUser | null {
    return this.currentUserSubject.getValue();
  }
}

function callbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

function toAppUser(user: SbUser | null): AppUser | null {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const name =
    (meta['name'] as string | undefined) ||
    (meta['full_name'] as string | undefined) ||
    (user.email ? user.email.split('@')[0] : 'User');
  return { id: user.id, email: user.email ?? '', name };
}
