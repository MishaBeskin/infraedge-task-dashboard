import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { I18nService } from '../../services/i18n.service';
import { AuthService } from '../../services/auth.service';
import { TeamService } from '../../services/team.service';
import { TeamInvitation } from '../../models/team.model';

/**
 * Team-management modal (Pass B). Reuses the overlay / focus-trap / Escape shell
 * of the other dialogs. Everything is read straight off `TeamService` — the
 * service already owns the roster (`members` signal) and every Pass-B write.
 *
 * Owner sees: invite by email, a shareable link (+ revoke), the pending-invite
 * list, per-member remove, "Delete team". Everyone sees the roster and "Leave
 * team". Both destructive actions are disabled when this is the caller's only
 * team (the RPCs enforce the same guard server-side).
 *
 * `changed` fires after a member is removed so the board can reload tasks — the
 * DB trigger nulls that member's `assignee_id`, which the cached list wouldn't
 * otherwise reflect.
 */
@Component({
  selector: 'app-team-panel',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './team-panel.component.html',
  styleUrl: './team-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPanelComponent implements OnInit, AfterViewInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();
  /** A membership change the board should react to (member removed). */
  @Output() changed = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private teamService = inject(TeamService);
  private auth = inject(AuthService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private doc = inject(DOCUMENT);
  protected i18n = inject(I18nService);

  private previouslyFocused: HTMLElement | null = null;

  protected readonly team = this.teamService.activeTeam;
  protected readonly members = this.teamService.members;
  protected readonly myId = this.auth.getCurrentUser()?.id ?? null;
  protected readonly isOwner = computed(() => this.team()?.role === 'owner');
  /** Both "leave" and "delete" are refused when it's the caller's last team. */
  protected readonly canLeave = computed(() => this.teamService.teams().length > 1);

  protected readonly invites = signal<TeamInvitation[]>([]);
  protected readonly emailInvites = computed(() => this.invites().filter((i) => i.email));
  protected readonly linkInvite = computed(() => this.invites().find((i) => !i.email) ?? null);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  /** Token of the invite whose link was just copied (drives the "Copied" label). */
  protected readonly copiedToken = signal<string | null>(null);
  /** userIds shown with an armed "remove" confirm, plus the delete-team arm. */
  protected readonly confirmRemove = signal<Set<string>>(new Set());
  protected readonly confirmDelete = signal(false);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  ngOnInit() {
    this.previouslyFocused = this.doc.activeElement as HTMLElement | null;
    this.teamService.loadActiveMembers();
    if (this.isOwner()) this.refreshInvites();
  }

  ngAfterViewInit() {
    this.host.nativeElement.querySelector<HTMLElement>('.modal')?.focus();
  }

  ngOnDestroy() {
    this.previouslyFocused?.focus?.();
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closed.emit();
      return;
    }
    if (event.key === 'Tab') this.trapTab(event);
  }

  roleLabel(role: 'owner' | 'member'): string {
    return this.i18n.t(role === 'owner' ? 'team.role.owner' : 'team.role.member');
  }

  initials(name: string): string {
    const n = name.trim();
    if (!n) return '?';
    return n
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  // ── Invites ────────────────────────────────────────────────────────

  private refreshInvites() {
    const id = this.team()?.id;
    if (!id) return;
    this.teamService.loadInvitations(id).subscribe((list) => this.invites.set(list));
  }

  inviteByEmail() {
    const id = this.team()?.id;
    // Normalise first — a pasted address often carries surrounding whitespace
    // that would otherwise fail `Validators.email`.
    const email = (this.form.value.email ?? '').trim();
    this.form.controls.email.setValue(email);
    if (!id || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.teamService.inviteByEmail(id, email).subscribe({
      next: () => {
        this.busy.set(false);
        this.notice.set('teamPanel.invite.sent');
        this.form.reset({ email: '' });
        this.refreshInvites();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.mapInviteError(err));
      },
    });
  }

  createLink() {
    const id = this.team()?.id;
    if (!id) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.teamService.createLinkInvite(id).subscribe({
      next: () => {
        this.busy.set(false);
        this.refreshInvites();
      },
      error: () => {
        this.busy.set(false);
        this.error.set('teamPanel.error.generic');
      },
    });
  }

  linkUrl(token: string): string {
    const origin = this.doc.defaultView?.location.origin ?? '';
    return `${origin}/invite/${token}`;
  }

  copyLink(token: string) {
    const text = this.linkUrl(token);
    const clip = this.doc.defaultView?.navigator?.clipboard;
    if (!clip) {
      this.error.set('teamPanel.error.copy');
      return;
    }
    void clip.writeText(text).then(
      () => {
        this.copiedToken.set(token);
        setTimeout(() => {
          if (this.copiedToken() === token) this.copiedToken.set(null);
        }, 2000);
      },
      () => this.error.set('teamPanel.error.copy'),
    );
  }

  revokeInvite(id: string) {
    this.error.set(null);
    this.teamService.revokeInvite(id).subscribe({
      next: () => this.refreshInvites(),
      error: () => this.error.set('teamPanel.error.generic'),
    });
  }

  // ── Members ────────────────────────────────────────────────────────

  armRemove(userId: string) {
    this.confirmRemove.update((s) => new Set(s).add(userId));
    setTimeout(() => {
      this.confirmRemove.update((s) => {
        const next = new Set(s);
        next.delete(userId);
        return next;
      });
    }, 5000);
  }

  removeMember(userId: string) {
    const id = this.team()?.id;
    if (!id) return;
    if (!this.confirmRemove().has(userId)) {
      this.armRemove(userId);
      return;
    }
    this.confirmRemove.update((s) => {
      const next = new Set(s);
      next.delete(userId);
      return next;
    });
    this.busy.set(true);
    this.error.set(null);
    this.teamService.removeMember(id, userId).subscribe({
      next: () => {
        this.busy.set(false);
        this.teamService.loadActiveMembers();
        this.changed.emit();
      },
      error: () => {
        this.busy.set(false);
        this.error.set('teamPanel.error.generic');
      },
    });
  }

  // ── Leave / delete ─────────────────────────────────────────────────

  leaveTeam() {
    const id = this.team()?.id;
    if (!id || !this.canLeave()) return;
    this.busy.set(true);
    this.error.set(null);
    this.teamService.leaveTeam(id).subscribe({
      next: () => {
        this.busy.set(false);
        this.closed.emit();
      },
      error: () => {
        this.busy.set(false);
        this.error.set('errors.lastTeam');
      },
    });
  }

  deleteTeam() {
    const id = this.team()?.id;
    if (!id || !this.isOwner() || !this.canLeave()) return;
    if (!this.confirmDelete()) {
      this.confirmDelete.set(true);
      setTimeout(() => this.confirmDelete.set(false), 5000);
      return;
    }
    this.confirmDelete.set(false);
    this.busy.set(true);
    this.error.set(null);
    this.teamService.deleteTeam(id).subscribe({
      next: () => {
        this.busy.set(false);
        this.changed.emit();
        this.closed.emit();
      },
      error: () => {
        this.busy.set(false);
        this.error.set('teamPanel.error.generic');
      },
    });
  }

  // ── Internals ──────────────────────────────────────────────────────

  private mapInviteError(err: unknown): string {
    const msg = String((err as { message?: string })?.message ?? err);
    if (/no_account/.test(msg)) return 'teamPanel.invite.error.noAccount';
    if (/already_member/.test(msg)) return 'teamPanel.invite.error.alreadyMember';
    if (/already_invited/.test(msg)) return 'teamPanel.invite.email.alreadyInvited';
    if (/not_owner/.test(msg)) return 'teamPanel.error.notOwner';
    return 'teamPanel.error.generic';
  }

  private trapTab(event: KeyboardEvent) {
    const focusable = this.focusableElements();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.doc.activeElement;
    if (!this.host.nativeElement.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusableElements(): HTMLElement[] {
    const modal = this.host.nativeElement.querySelector('.modal');
    if (!modal) return [];
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(modal.querySelectorAll<HTMLElement>(selector));
  }
}
