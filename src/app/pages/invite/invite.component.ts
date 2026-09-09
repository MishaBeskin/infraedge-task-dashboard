import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { TeamService } from '../../services/team.service';
import { I18nService } from '../../services/i18n.service';

/** localStorage key holding an invite token to resume after sign-in. Read by
 *  BoardComponent — the OAuth / magic-link round-trip lands on /board, not back
 *  on the redirect URL, so the token can't ride through on the query string. */
export const PENDING_INVITE_KEY = 'stack_pending_invite';

/**
 * Target of a shareable invite link (`/invite/:token`). Logged in → accepts the
 * invitation, makes that team active and lands on the board. Logged out → stashes
 * the token and bounces through /login (which honours `?redirect=`), then this
 * component runs again authenticated.
 */
@Component({
  selector: 'app-invite',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './invite.component.html',
  styleUrl: './invite.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private teams = inject(TeamService);
  protected i18n = inject(I18nService);

  /** 'working' while the RPC is in flight; 'error' with a message key otherwise. */
  protected readonly state = signal<'working' | 'error'>('working');
  protected readonly errorKey = signal<string>('invite.error.generic');

  async ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.fail('invite.error.generic');
      return;
    }

    await this.auth.whenReady();

    if (!this.auth.isLoggedIn()) {
      this.stash(token);
      this.router.navigate(['/login'], { queryParams: { redirect: `/invite/${token}` } });
      return;
    }

    this.teams.acceptInvite(token).subscribe({
      next: () => {
        this.clearStash();
        this.router.navigate(['/board']);
      },
      error: (err) => this.fail(this.mapError(err)),
    });
  }

  private fail(key: string) {
    this.clearStash();
    this.errorKey.set(key);
    this.state.set('error');
  }

  private mapError(err: unknown): string {
    const msg = String((err as { message?: string })?.message ?? err);
    if (/invitation_not_found/.test(msg)) return 'invite.error.notFound';
    if (/invitation_used/.test(msg)) return 'invite.error.used';
    if (/invitation_expired/.test(msg)) return 'invite.error.expired';
    if (/invitation_wrong_account/.test(msg)) return 'invite.wrongAccount';
    return 'invite.error.generic';
  }

  private stash(token: string) {
    try {
      localStorage.setItem(PENDING_INVITE_KEY, token);
    } catch {
      /* ignore */
    }
  }

  private clearStash() {
    try {
      localStorage.removeItem(PENDING_INVITE_KEY);
    } catch {
      /* ignore */
    }
  }
}
