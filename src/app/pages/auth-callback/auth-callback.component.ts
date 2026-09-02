import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { filter, first, race, timer, map } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { I18nService } from '../../services/i18n.service';

/**
 * Landing route for OAuth and magic-link redirects. The Supabase client parses
 * the session out of the URL on its own (detectSessionInUrl) and then fires
 * onAuthStateChange; we wait for the resulting user (or time out) and route on.
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './auth-callback.component.html',
  styleUrl: './auth-callback.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCallbackComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  protected i18n = inject(I18nService);

  failed = signal(false);

  constructor() {
    // A password-recovery link lands here too; send those on to set a new password.
    if (window.location.hash.includes('type=recovery')) {
      this.router.navigate(['/reset-password']);
      return;
    }

    // An OAuth error comes back in the hash (e.g. consent denied, bad secret).
    if (/[#&]error=/.test(window.location.hash)) {
      this.failed.set(true);
      return;
    }

    const signedIn$ = this.authService.currentUser$.pipe(
      filter((user) => user !== null),
      map(() => true),
    );

    race(signedIn$, timer(6000).pipe(map(() => false)))
      .pipe(first(), takeUntilDestroyed())
      .subscribe((ok) => {
        if (ok) this.router.navigate(['/board']);
        else this.failed.set(true);
      });
  }
}
