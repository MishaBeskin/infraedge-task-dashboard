import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Task, Status } from '../../models/task.model';
import { TaskService } from '../../services/task.service';
import { AuthService } from '../../services/auth.service';
import { HeaderComponent } from '../../components/header/header.component';
import { KanbanColumnComponent } from '../../components/kanban-column/kanban-column.component';
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
  private authService = inject(AuthService);

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
    if (pf !== 'all') tasks = tasks.filter(t => t.priority === pf);
    if (sq) tasks = tasks.filter(t => t.title.toLowerCase().includes(sq));
    return tasks;
  });

  todoTasks = computed(() => this.filtered().filter(t => t.status === 'todo'));
  inProgressTasks = computed(() => this.filtered().filter(t => t.status === 'in-progress'));
  doneTasks = computed(() => this.filtered().filter(t => t.status === 'done'));
  filteredCount = computed(() => this.filtered().length);

  ngOnInit() {
    const user = this.authService.getCurrentUser();
    if (user) {
      this.taskService.loadTasksForUser(user.id).subscribe();
    }
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

  onTaskDropped({ taskId, newStatus }: { taskId: string; newStatus: Status }) {
    const task = this.allTasks().find(t => String(t.id) === taskId);
    if (task && task.status !== newStatus) {
      this.taskService.updateTask(task.id, { status: newStatus }).subscribe();
    }
  }
}
