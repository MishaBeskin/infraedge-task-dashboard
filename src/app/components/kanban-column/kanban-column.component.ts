import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { Task, Status } from '../../models/task.model';
import { TaskCardComponent } from '../task-card/task-card.component';

@Component({
  selector: 'app-kanban-column',
  standalone: true,
  imports: [TaskCardComponent],
  templateUrl: './kanban-column.component.html',
  styleUrl: './kanban-column.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KanbanColumnComponent {
  @Input() title = '';
  @Input() tasks: Task[] = [];
  @Input({ required: true }) status!: Status;
  @Output() addTask = new EventEmitter<Status>();
  @Output() editTask = new EventEmitter<Task>();
  @Output() taskDropped = new EventEmitter<{ taskId: string; newStatus: Status }>();

  isDragOver = signal(false);

  // The browser fires dragleave on the column whenever the pointer crosses into a
  // child element, even though the drag is still visually inside the column.
  // Tracking entry depth means we only clear the highlight when the pointer
  // genuinely leaves the column boundary.
  private dragCounter = 0;

  onDragEnter(event: DragEvent) {
    event.preventDefault();
    this.dragCounter++;
    this.isDragOver.set(true);
  }

  onDragLeave() {
    this.dragCounter--;
    if (this.dragCounter === 0) this.isDragOver.set(false);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragCounter = 0;
    this.isDragOver.set(false);
    const taskId = event.dataTransfer!.getData('taskId');
    if (taskId) {
      this.taskDropped.emit({ taskId, newStatus: this.status });
    }
  }
}
