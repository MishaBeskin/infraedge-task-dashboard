import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
  Signal,
} from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Task, Status } from '../../models/task.model';
import { TaskService } from '../../services/task.service';
import { I18nService } from '../../services/i18n.service';
import { HeaderComponent } from '../../components/header/header.component';
import {
  KanbanColumnComponent,
  TaskDropEvent,
} from '../../components/kanban-column/kanban-column.component';
import { TaskDialogComponent } from '../../components/task-dialog/task-dialog.component';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [AsyncPipe, HeaderComponent, KanbanColumnComponent, TaskDialogComponent],
  templateUrl: './board.component.html',
  styleUrl: './board.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoardComponent implements OnInit {
  private taskService = inject(TaskService);
  protected i18n = inject(I18nService);

  loading$ = this.taskService.loading$;
  error$ = this.taskService.error$;

  priorityFilter = signal<'all' | 'high' | 'medium' | 'low'>('all');
  searchQuery = signal<string>('');

  // Plain booleans (not signals) are fine here because they are only ever toggled
  // from template events, which already trigger change detection on OnPush components.
  showDialog = false;
  dialogStatus = signal<Status>('todo');
  showEditDialog = false;
  editingTask: Task | null = null;

  // toSignal bridges the Observable into the signal graph so computed() below can
  // derive column arrays reactively without manual subscriptions or markForCheck().
  // An earlier approach using subscribe() + markForCheck() was unreliable under
  // OnPush because the check ran before the new value had propagated.
  private allTasks = toSignal(this.taskService.tasks$, { initialValue: [] as Task[] });

  private filtered = computed(() => {
    let tasks = this.allTasks();
    const pf = this.priorityFilter();
    const sq = this.searchQuery().trim().toLowerCase();
    if (pf !== 'all') tasks = tasks.filter((t) => t.priority === pf);
    if (sq) tasks = tasks.filter((t) => t.title.toLowerCase().includes(sq));
    return tasks;
  });

  todoTasks = computed(() => this.filtered().filter((t) => t.status === 'todo'));
  inProgressTasks = computed(() => this.filtered().filter((t) => t.status === 'in-progress'));
  doneTasks = computed(() => this.filtered().filter((t) => t.status === 'done'));
  filteredCount = computed(() => this.filtered().length);

  // Hoisted so the template @for doesn't reallocate the array on every CD pass.
  protected readonly skeletonCols = [1, 2, 3] as const;

  // One source of truth for the three columns instead of three near-identical
  // <app-kanban-column> blocks. Each `tasks` is the existing computed signal.
  protected readonly columns: ReadonlyArray<{
    status: Status;
    titleKey: string;
    tasks: Signal<Task[]>;
  }> = [
    { status: 'todo', titleKey: 'status.todo', tasks: this.todoTasks },
    { status: 'in-progress', titleKey: 'status.in-progress', tasks: this.inProgressTasks },
    { status: 'done', titleKey: 'status.done', tasks: this.doneTasks },
  ];

  ngOnInit() {
    this.taskService.loadTasks().subscribe();
  }

  setPriorityFilter(f: 'all' | 'high' | 'medium' | 'low') {
    this.priorityFilter.set(f);
  }

  setSearchQuery(q: string) {
    this.searchQuery.set(q);
  }

  openDialog(status: Status) {
    this.dialogStatus.set(status);
    this.showDialog = true;
  }

  openDefaultDialog() {
    this.dialogStatus.set('todo');
    this.showDialog = true;
  }

  closeDialog() {
    this.showDialog = false;
  }

  openEditDialog(task: Task) {
    this.editingTask = task;
    this.showEditDialog = true;
  }

  closeEditDialog() {
    this.showEditDialog = false;
    this.editingTask = null;
  }

  onTaskDropped({ taskId, newStatus, targetIndex }: TaskDropEvent) {
    const all = this.allTasks();
    const task = all.find((t) => t.id === taskId);
    if (!task) return;

    const byPosition = (a: Task, b: Task) => a.position - b.position;

    // The target column's FULL ordered id list, from the unfiltered set.
    const unfilteredColumn = all.filter((t) => t.status === newStatus).sort(byPosition);

    // `targetIndex` indexes the FILTERED card list the column actually rendered.
    // Translate it into the unfiltered list: land the card just before whichever
    // unfiltered task the filtered task at that index corresponds to. When a
    // filter/search hides cards and the slot maps past the last visible card
    // (or the mapping is otherwise ambiguous), appending within the status is an
    // accepted fallback.
    const filteredColumn = this.filtered()
      .filter((t) => t.status === newStatus)
      .sort(byPosition);
    const clampedIndex = Math.max(0, Math.min(targetIndex, filteredColumn.length));
    const anchorId = clampedIndex < filteredColumn.length ? filteredColumn[clampedIndex].id : null;

    const orderedIds = unfilteredColumn.map((t) => t.id).filter((id) => id !== taskId);
    const anchorPos = anchorId ? orderedIds.indexOf(anchorId) : -1;
    const insertAt = anchorPos >= 0 ? anchorPos : orderedIds.length;
    orderedIds.splice(insertAt, 0, taskId);

    // Same column and the order is unchanged — nothing to persist.
    if (task.status === newStatus) {
      const current = unfilteredColumn.map((t) => t.id);
      if (current.length === orderedIds.length && current.every((id, i) => id === orderedIds[i])) {
        return;
      }
    }

    this.taskService.reorderColumn(newStatus, orderedIds).subscribe({ error: () => undefined });
  }
}
