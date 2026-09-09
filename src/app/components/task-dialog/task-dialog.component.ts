import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Task, Status } from '../../models/task.model';
import { TaskService } from '../../services/task.service';
import { TeamService } from '../../services/team.service';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-task-dialog',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './task-dialog.component.html',
  styleUrl: './task-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDialogComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) mode!: 'create' | 'edit';
  @Input() defaultStatus: Status = 'todo';
  @Input() task?: Task;
  @Output() closed = new EventEmitter<void>();
  @Output() taskSaved = new EventEmitter<Task>();

  private fb = inject(FormBuilder);
  private taskService = inject(TaskService);
  private teamService = inject(TeamService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private doc = inject(DOCUMENT);
  protected i18n = inject(I18nService);

  /** Active-team roster for the assignee select (Pass B). */
  protected readonly members = this.teamService.members;

  /** Element focused before the dialog opened, restored on close. */
  private previouslyFocused: HTMLElement | null = null;

  isSubmitting = signal(false);
  /** Translation key for a save failure, or null. Set instead of silently
   *  swallowing the error so the user knows the task wasn't saved; the dialog
   *  stays open so they can retry. */
  error = signal<string | null>(null);

  form = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    dueDate: [''],
    status: ['todo' as Status],
    priority: ['medium' as Task['priority']],
    assigneeId: [''],
  });

  /** The native date input — focus is returned here when the clear button
   *  unmounts itself on clear. */
  private dueInput = viewChild<ElementRef<HTMLInputElement>>('dueInput');

  get isEdit() {
    return this.mode === 'edit';
  }

  ngOnInit() {
    this.previouslyFocused = this.doc.activeElement as HTMLElement | null;

    // Ensure the assignee <select> has an up-to-date roster to bind against.
    this.teamService.loadActiveMembers();

    if (this.isEdit && this.task) {
      this.form.patchValue({
        title: this.task.title,
        description: this.task.description ?? '',
        dueDate: this.task.dueDate ?? '',
        status: this.task.status,
        priority: this.task.priority,
        assigneeId: this.task.assigneeId ?? '',
      });
    } else {
      this.form.patchValue({ status: this.defaultStatus });
    }
  }

  ngAfterViewInit() {
    // Move focus into the dialog so keyboard/screen-reader users start inside it.
    this.host.nativeElement.querySelector<HTMLInputElement>('#task-title')?.focus();
  }

  ngOnDestroy() {
    // Return focus to whatever opened the dialog.
    this.previouslyFocused?.focus?.();
  }

  /** Escape closes; Tab / Shift+Tab stay trapped inside .modal. */
  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closed.emit();
      return;
    }
    if (event.key === 'Tab') {
      this.trapTab(event);
    }
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

  setPriority(priority: Task['priority']) {
    this.form.patchValue({ priority });
  }

  clearDueDate() {
    this.form.patchValue({ dueDate: '' });
    this.dueInput()?.nativeElement.focus();
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { title, description, dueDate, status, priority, assigneeId } = this.form.value;
    const patch = {
      title: title!,
      description: description || undefined,
      dueDate: dueDate || undefined,
      status: status!,
      priority: priority!,
      assigneeId: assigneeId || null,
    };

    this.isSubmitting.set(true);
    this.error.set(null);

    const request$ =
      this.isEdit && this.task
        ? this.taskService.updateTask(this.task.id, patch)
        : this.taskService.createTask(patch);

    request$.subscribe({
      next: (saved) => {
        this.isSubmitting.set(false);
        this.taskSaved.emit(saved);
        this.closed.emit();
      },
      error: () => {
        this.isSubmitting.set(false);
        this.error.set('dialog.error.save');
      },
    });
  }
}
