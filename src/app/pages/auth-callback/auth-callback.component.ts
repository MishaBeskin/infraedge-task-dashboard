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
    const hash = window.location.hash;

    // An OAuth error comes back in the hash (e.g. consent denied, bad secret).
    if (/[#&]error=/.test(hash)) {
      this.failed.set(true);
      return;
    }

    // A password-recovery link lands here too. Don't navigate immediately —
    // that would strip the `#access_token=…&type=recovery` fragment and can
    // race the Supabase client still parsing it. Wait until the recovery
    // session is actually in place, then route on (keeping the fragment as a
    // belt-and-braces in case reset-password needs to re-read it).
    if (hash.includes('type=recovery')) {
      this.authService.whenReady().then(() => {
        if (this.authService.isLoggedIn()) {
          this.router.navigate(['/reset-password'], { preserveFragment: true });
        } else {
          this.failed.set(true);
        }
      });
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
