import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  inject,
  ChangeDetectionStrategy,
  OnDestroy,
} from '@angular/core';
import { Task } from '../../models/task.model';
import { TaskService } from '../../services/task.service';
import { I18nService } from '../../services/i18n.service';
import { PointerDragService } from '../../services/pointer-drag.service';
import {
  dueStatus as computeDueStatus,
  isOverdue as computeIsOverdue,
  dueLabel as computeDueLabel,
  dueDateLong as computeDueDateLong,
  DueStatus,
} from '../../utils/due-date.util';

@Component({
  selector: 'app-task-card',
  standalone: true,
  imports: [],
  templateUrl: './task-card.component.html',
  styleUrl: './task-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskCardComponent implements OnDestroy {
  // Backed by a signal so the due-date derivations below memoise across change
  // detection instead of rebuilding an Intl.DateTimeFormat every pass.
  private readonly taskSig = signal<Task | null>(null);

  @Input({ required: true })
  set task(value: Task) {
    this.taskSig.set(value);
  }
  get task(): Task {
    return this.taskSig()!;
  }

  @Output() editTask = new EventEmitter<Task>();

  private taskService = inject(TaskService);
  protected i18n = inject(I18nService);
  private pointerDrag = inject(PointerDragService);
  private deleteTimer?: ReturnType<typeof setTimeout>;
  /** pointerId of the in-progress touch/pen drag, or null. */
  private dragPointerId: number | null = null;

  isUpdating = signal(false);
  showDeleteConfirm = signal(false);
  isDragging = signal(false);
  /** True once the confirmed delete request is in flight — blocks a fast
   *  double-click from calling deleteTask twice. */
  deleting = signal(false);
  /** Translation key for an inline "delete failed" message, or null. */
  deleteError = signal<string | null>(null);

  get priorityLabel(): string {
    return this.i18n.t(`priority.${this.task.priority}`);
  }

  /**
   * All due-date derivations for the current task, recomputed only when the task
   * or the UI language changes (`new Date()` / `Intl.DateTimeFormat` run once per
   * change, not once per change-detection pass). Reads `i18n.lang()` so a
   * language switch still refreshes the label.
   */
  private readonly due = computed(() => {
    const task = this.taskSig();
    const lang = this.i18n.lang();
    const status: DueStatus = task ? computeDueStatus(task.createdAt, task.dueDate) : 'none';
    if (!task || !task.dueDate || status === 'none') {
      return { status, isOverdue: false, label: '', long: '', aria: '' };
    }
    const label = computeDueLabel(task.dueDate, this.i18n);
    const long = computeDueDateLong(task.dueDate, lang);
    return {
      status,
      isOverdue: computeIsOverdue(task.dueDate),
      label,
      long,
      aria: this.i18n.t('card.dueDate.aria').replace('{date}', long).replace('{label}', label),
    };
  });

  get dueStatus(): DueStatus {
    return this.due().status;
  }

  get isOverdue(): boolean {
    return this.due().isOverdue;
  }

  get dueLabelText(): string {
    return this.due().label;
  }

  get dueDateLong(): string {
    return this.due().long;
  }

  get dueAriaLabel(): string {
    return this.due().aria;
  }

  onStatusChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    // Captured before the optimistic update mutates the bound task, so the
    // control can be snapped back to where it was if the request fails.
    const previousStatus = this.task.status;
    const newStatus = select.value as Task['status'];
    this.isUpdating.set(true);
    this.taskService.updateTask(this.task.id, { status: newStatus }).subscribe({
      next: () => this.isUpdating.set(false),
      error: () => {
        this.isUpdating.set(false);
        // The service reverted its state; realign the native control too.
        select.value = previousStatus;
      },
    });
  }

  onDragStart(event: DragEvent) {
    event.dataTransfer!.setData('taskId', String(this.task.id));
    event.dataTransfer!.effectAllowed = 'move';
    this.isDragging.set(true);
  }

  onDragEnd() {
    this.isDragging.set(false);
  }

  // ── Touch / Pointer-Events drag (via the grip handle) ───────────────
  // HTML5 drag events don't fire on touch. The handle carries
  // `touch-action: none`, so a drag that starts on it never scrolls the page;
  // touches anywhere else on the card scroll the list as normal.

  onHandlePointerDown(event: PointerEvent) {
    // Mouse keeps the native HTML5 draggable path.
    if (event.pointerType === 'mouse') return;
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture?.(event.pointerId);
    this.dragPointerId = event.pointerId;
    this.isDragging.set(true);
    this.pointerDrag.start(this.task.id);
    this.pointerDrag.moveTo(event.clientX, event.clientY);
  }

  onHandlePointerMove(event: PointerEvent) {
    if (this.dragPointerId !== event.pointerId || !this.isDragging()) return;
    // Stop the browser from turning the drag into a scroll / gesture.
    event.preventDefault();
    this.pointerDrag.moveTo(event.clientX, event.clientY);
  }

  onHandlePointerUp(event: PointerEvent) {
    if (this.dragPointerId !== event.pointerId) return;
    this.releaseCapture(event);
    if (this.isDragging()) {
      this.isDragging.set(false);
      this.pointerDrag.drop();
    }
  }

  onHandlePointerCancel(event: PointerEvent) {
    if (this.dragPointerId !== event.pointerId) return;
    this.releaseCapture(event);
    this.isDragging.set(false);
    this.pointerDrag.cancel();
  }

  private releaseCapture(event: PointerEvent) {
    const el = event.currentTarget as HTMLElement | null;
    if (el?.hasPointerCapture?.(event.pointerId)) {
      el.releasePointerCapture(event.pointerId);
    }
    this.dragPointerId = null;
  }

  onDeleteClick() {
    // Ignore any further clicks once a delete is already committed.
    if (this.deleting()) {
      return;
    }
    if (!this.showDeleteConfirm()) {
      this.showDeleteConfirm.set(true);
      this.deleteTimer = setTimeout(() => {
        this.showDeleteConfirm.set(false);
      }, 5000);
      return;
    }
    clearTimeout(this.deleteTimer);
    this.deleting.set(true);
    this.deleteError.set(null);
    this.taskService.deleteTask(this.task.id).subscribe({
      error: () => {
        this.deleting.set(false);
        this.showDeleteConfirm.set(false);
        this.deleteError.set('card.deleteError');
      },
    });
  }

  ngOnDestroy() {
    clearTimeout(this.deleteTimer);
  }
}
