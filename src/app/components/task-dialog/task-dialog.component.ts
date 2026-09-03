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
  ChangeDetectionStrategy,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Task, Status } from '../../models/task.model';
import { TaskService } from '../../services/task.service';
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
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private doc = inject(DOCUMENT);
  protected i18n = inject(I18nService);

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
    status: ['todo' as Status],
    priority: ['medium' as Task['priority']],
  });

  get isEdit() {
    return this.mode === 'edit';
  }

  ngOnInit() {
    this.previouslyFocused = this.doc.activeElement as HTMLElement | null;

    if (this.isEdit && this.task) {
      this.form.patchValue({
        title: this.task.title,
        description: this.task.description ?? '',
        status: this.task.status,
        priority: this.task.priority,
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

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { title, description, status, priority } = this.form.value;
    const patch = {
      title: title!,
      description: description || undefined,
      status: status!,
      priority: priority!,
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
