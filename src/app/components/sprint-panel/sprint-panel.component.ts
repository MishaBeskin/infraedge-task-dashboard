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
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { forkJoin, Observable } from 'rxjs';
import { I18nService } from '../../services/i18n.service';
import { TeamService } from '../../services/team.service';
import { SprintService } from '../../services/sprint.service';
import { TaskService } from '../../services/task.service';
import { Sprint } from '../../models/sprint.model';
import { Task } from '../../models/task.model';
import { formatSprintRange, sprintEndHint, SprintHintTone } from '../../utils/sprint.util';

/**
 * Sprint-management modal. Same overlay / focus-trap / Escape shell as
 * `TeamPanelComponent` (copied verbatim — see that file for the canonical
 * trapTab/focusableElements implementation). Any team member can manage
 * sprints — no owner/member gating, unlike the team panel.
 *
 * `changed` fires after a sprint is deleted so the board can reload tasks —
 * `tasks.sprint_id` references the sprint `on delete set null`, which the
 * cached task list wouldn't otherwise reflect.
 */
@Component({
  selector: 'app-sprint-panel',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './sprint-panel.component.html',
  styleUrl: './sprint-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SprintPanelComponent implements OnInit, AfterViewInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private sprintService = inject(SprintService);
  private teamService = inject(TeamService);
  private taskService = inject(TaskService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private doc = inject(DOCUMENT);
  protected i18n = inject(I18nService);

  private previouslyFocused: HTMLElement | null = null;

  protected readonly team = this.teamService.activeTeam;
  protected readonly sprints = computed(() =>
    [...this.sprintService.sprints()].sort((a, b) => a.position - b.position),
  );
  private readonly tasks = toSignal(this.taskService.tasks$, { initialValue: [] as Task[] });

  protected readonly loading = signal(false);
  private readonly serviceError = toSignal(this.sprintService.error$, {
    initialValue: null as string | null,
  });
  protected readonly loadFailed = computed(() => this.serviceError() === 'sprintPanel.loadError');

  protected readonly busy = signal(false);
  /** Translation key for the last failed write, or null. */
  protected readonly error = signal<string | null>(null);

  /** Sprint ids shown with an armed "delete" confirm. */
  protected readonly confirmDelete = signal<Set<string>>(new Set());
  /** Sprint ids shown with an armed "replace active sprint?" confirm. */
  protected readonly confirmActivate = signal<Set<string>>(new Set());

  protected readonly editingId = signal<string | null>(null);
  editForm = this.fb.group({
    name: ['', Validators.required],
    startsOn: [''],
    endsOn: [''],
  });

  protected readonly creating = signal(false);
  protected readonly createSubmitting = signal(false);
  createForm = this.fb.group({
    name: ['', Validators.required],
    startsOn: [''],
    endsOn: [''],
  });

  ngOnInit() {
    this.previouslyFocused = this.doc.activeElement as HTMLElement | null;
    this.loading.set(true);
    this.sprintService.loadSprints().subscribe(() => this.loading.set(false));
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

  // ── Row helpers ──────────────────────────────────────────────────

  isFirst(sprint: Sprint): boolean {
    return this.sprints()[0]?.id === sprint.id;
  }

  isLast(sprint: Sprint): boolean {
    const list = this.sprints();
    return list[list.length - 1]?.id === sprint.id;
  }

  taskCount(sprintId: string): number {
    return this.tasks().filter((t) => t.sprintId === sprintId).length;
  }

  dateRange(sprint: Sprint): string {
    return (
      formatSprintRange(sprint.startsOn, sprint.endsOn, this.i18n.lang()) ??
      this.i18n.t('sprintPanel.row.noDates')
    );
  }

  activeHint(sprint: Sprint): { text: string; tone: SprintHintTone } | null {
    if (sprint.status !== 'active') return null;
    return sprintEndHint(sprint.endsOn, this.i18n);
  }

  // ── Reorder ──────────────────────────────────────────────────────

  reorder(id: string, direction: 'up' | 'down') {
    this.busy.set(true);
    this.error.set(null);
    this.sprintService.reorderSprint(id, direction).subscribe({
      next: () => this.busy.set(false),
      error: () => {
        this.busy.set(false);
        this.error.set('teamPanel.error.generic');
      },
    });
  }

  // ── Status transitions ───────────────────────────────────────────

  setActive(sprint: Sprint) {
    const current = this.sprints().find((s) => s.status === 'active');
    if (current && current.id !== sprint.id && !this.confirmActivate().has(sprint.id)) {
      this.confirmActivate.update((s) => new Set(s).add(sprint.id));
      setTimeout(() => {
        this.confirmActivate.update((s) => {
          const next = new Set(s);
          next.delete(sprint.id);
          return next;
        });
      }, 5000);
      return;
    }
    this.confirmActivate.update((s) => {
      const next = new Set(s);
      next.delete(sprint.id);
      return next;
    });
    this.busy.set(true);
    this.error.set(null);
    this.sprintService.setActiveSprint(sprint.id).subscribe({
      next: () => this.busy.set(false),
      error: () => {
        this.busy.set(false);
        this.error.set('teamPanel.error.generic');
      },
    });
  }

  complete(sprint: Sprint) {
    this.busy.set(true);
    this.error.set(null);
    this.sprintService.completeSprint(sprint.id).subscribe({
      next: () => this.busy.set(false),
      error: () => {
        this.busy.set(false);
        this.error.set('teamPanel.error.generic');
      },
    });
  }

  reopen(sprint: Sprint) {
    this.busy.set(true);
    this.error.set(null);
    this.sprintService.reopenSprint(sprint.id).subscribe({
      next: () => this.busy.set(false),
      error: () => {
        this.busy.set(false);
        this.error.set('teamPanel.error.generic');
      },
    });
  }

  // ── Delete ───────────────────────────────────────────────────────

  deleteSprint(sprint: Sprint) {
    if (!this.confirmDelete().has(sprint.id)) {
      this.confirmDelete.update((s) => new Set(s).add(sprint.id));
      setTimeout(() => {
        this.confirmDelete.update((s) => {
          const next = new Set(s);
          next.delete(sprint.id);
          return next;
        });
      }, 5000);
      return;
    }
    this.confirmDelete.update((s) => {
      const next = new Set(s);
      next.delete(sprint.id);
      return next;
    });
    this.busy.set(true);
    this.error.set(null);
    this.sprintService.deleteSprint(sprint.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.changed.emit();
      },
      error: () => {
        this.busy.set(false);
        this.error.set('teamPanel.error.generic');
      },
    });
  }

  // ── Edit (rename + dates) ────────────────────────────────────────

  startEdit(sprint: Sprint) {
    this.editingId.set(sprint.id);
    this.editForm.reset({
      name: sprint.name,
      startsOn: sprint.startsOn ?? '',
      endsOn: sprint.endsOn ?? '',
    });
  }

  cancelEdit() {
    this.editingId.set(null);
  }

  saveEdit(sprint: Sprint) {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const { name, startsOn, endsOn } = this.editForm.value;
    const trimmedName = (name ?? '').trim();
    const nextStart = startsOn || null;
    const nextEnd = endsOn || null;

    const ops: Observable<void>[] = [];
    if (trimmedName && trimmedName !== sprint.name) {
      ops.push(this.sprintService.renameSprint(sprint.id, trimmedName));
    }
    if (nextStart !== (sprint.startsOn ?? null) || nextEnd !== (sprint.endsOn ?? null)) {
      ops.push(this.sprintService.setSprintDates(sprint.id, nextStart, nextEnd));
    }
    if (ops.length === 0) {
      this.editingId.set(null);
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    forkJoin(ops).subscribe({
      next: () => {
        this.busy.set(false);
        this.editingId.set(null);
      },
      error: () => {
        this.busy.set(false);
        this.error.set('teamPanel.error.generic');
      },
    });
  }

  // ── Create ───────────────────────────────────────────────────────

  openCreate() {
    this.creating.set(true);
    this.createForm.reset({ name: '', startsOn: '', endsOn: '' });
  }

  cancelCreate() {
    this.creating.set(false);
  }

  submitCreate() {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    const { name, startsOn, endsOn } = this.createForm.value;
    this.createSubmitting.set(true);
    this.error.set(null);
    this.sprintService
      .createSprint({
        name: (name ?? '').trim(),
        startsOn: startsOn || null,
        endsOn: endsOn || null,
      })
      .subscribe({
        next: () => {
          this.createSubmitting.set(false);
          this.creating.set(false);
        },
        error: () => {
          this.createSubmitting.set(false);
          this.error.set('teamPanel.error.generic');
        },
      });
  }

  // ── Internals ──────────────────────────────────────────────────────

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
