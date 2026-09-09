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
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { I18nService } from '../../services/i18n.service';
import { TeamService } from '../../services/team.service';
import { Team } from '../../models/team.model';

/**
 * Minimal "create a team" modal. Hoisted to the board (like TaskDialogComponent)
 * rather than living inside the team switcher's `<h1>`. Same overlay shell,
 * focus trap and Escape handling as TaskDialogComponent; keeps
 * submitting/error state and only closes on success.
 */
@Component({
  selector: 'app-new-team-dialog',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './new-team-dialog.component.html',
  styleUrl: './new-team-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewTeamDialogComponent implements OnInit, AfterViewInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<Team>();

  private fb = inject(FormBuilder);
  private teamService = inject(TeamService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private doc = inject(DOCUMENT);
  protected i18n = inject(I18nService);

  /** Element focused before the dialog opened, restored on close. */
  private previouslyFocused: HTMLElement | null = null;

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  form = this.fb.group({ name: ['', Validators.required] });

  ngOnInit() {
    this.previouslyFocused = this.doc.activeElement as HTMLElement | null;
  }

  ngAfterViewInit() {
    this.host.nativeElement.querySelector<HTMLInputElement>('#new-team-name')?.focus();
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

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    this.teamService.createTeam(this.form.value.name!.trim()).subscribe({
      next: (team) => {
        this.submitting.set(false);
        this.created.emit(team);
        this.closed.emit();
      },
      error: () => {
        this.submitting.set(false);
        this.error.set('team.create.error');
      },
    });
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
