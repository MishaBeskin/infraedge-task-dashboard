import { Component, Input, Output, EventEmitter, signal, inject, ChangeDetectionStrategy, OnDestroy } from '@angular/core';
import { Task } from '../../models/task.model';
import { TaskService } from '../../services/task.service';

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
  private deleteTimer?: ReturnType<typeof setTimeout>;

  isUpdating = signal(false);
  showDeleteConfirm = signal(false);
  isDragging = signal(false);

  get priorityLabel(): string {
    const labels: Record<Task['priority'], string> = {
      high: 'גבוהה',
      medium: 'בינונית',
      low: 'נמוכה',
    };
    return labels[this.task.priority];
  }

  onStatusChange(event: Event) {
    const newStatus = (event.target as HTMLSelectElement).value as Task['status'];
    this.isUpdating.set(true);
    this.taskService.updateTask(this.task.id, { status: newStatus }).subscribe({
      next: () => this.isUpdating.set(false),
      error: () => this.isUpdating.set(false),
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
    if (!this.showDeleteConfirm()) {
      this.showDeleteConfirm.set(true);
      this.deleteTimer = setTimeout(() => {
        this.showDeleteConfirm.set(false);
      }, 5000);
      return;
    }
    clearTimeout(this.deleteTimer);
    this.taskService.deleteTask(this.task.id).subscribe();
  }

  ngOnDestroy() {
    clearTimeout(this.deleteTimer);
  }
}
