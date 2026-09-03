import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
  signal,
} from '@angular/core';
import { Task, Status } from '../../models/task.model';
import { TaskCardComponent } from '../task-card/task-card.component';
import { I18nService } from '../../services/i18n.service';

/** Payload the column emits when a card is dropped on it.
 *  `targetIndex` is the slot in THIS column's currently rendered (filtered) card
 *  list where the card should land, 0..list.length. */
export interface TaskDropEvent {
  taskId: string;
  newStatus: Status;
  targetIndex: number;
}

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
  @Output() taskDropped = new EventEmitter<TaskDropEvent>();

  protected i18n = inject(I18nService);

  isDragOver = signal(false);

  /** Index where a thin insertion indicator is drawn while a card is dragged
   *  over this column, or null when nothing is being dragged over it. A value of
   *  `tasks.length` means "append to the end". */
  dropIndex = signal<number | null>(null);

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
    if (this.dragCounter <= 0) {
      this.dragCounter = 0;
      this.isDragOver.set(false);
      this.dropIndex.set(null);
    }
  }

  /** Fires for the column background / gaps between cards — dropping here appends
   *  to the end of the list. Card slots stop propagation so this does not run
   *  when the pointer is over a card. */
  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    this.dropIndex.set(this.tasks.length);
  }

  /** Fires while the pointer is over the card at `index`. The pointer's vertical
   *  position within the card decides insert-before (top half) vs insert-after
   *  (bottom half). */
  onCardDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer!.dropEffect = 'move';
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const inBottomHalf = event.clientY > rect.top + rect.height / 2;
    this.dropIndex.set(inBottomHalf ? index + 1 : index);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragCounter = 0;
    this.isDragOver.set(false);
    const targetIndex = this.dropIndex() ?? this.tasks.length;
    this.dropIndex.set(null);
    const taskId = event.dataTransfer!.getData('taskId');
    if (taskId) {
      this.taskDropped.emit({ taskId, newStatus: this.status, targetIndex });
    }
  }
}
