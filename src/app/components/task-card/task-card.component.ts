import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  inject,
  ChangeDetectionStrategy,
  OnDestroy,
} from '@angular/core';
import { Task } from '../../models/task.model';
import { TaskService } from '../../services/task.service';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-task-card',
  standalone: true,
  imports: [],
  templateUrl: './task-card.component.html',
  styleUrl: './task-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskCardComponent implements OnDestroy {
  @Input({ required: true }) task!: Task;
  @Output() editTask = new EventEmitter<Task>();

  private taskService = inject(TaskService);
  protected i18n = inject(I18nService);
  private deleteTimer?: ReturnType<typeof setTimeout>;

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
