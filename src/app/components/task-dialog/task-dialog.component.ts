import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Task, Status } from '../../models/task.model';
import { TaskService } from '../../services/task.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-task-dialog',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './task-dialog.component.html',
  styleUrl: './task-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDialogComponent implements OnInit {
  @Input({ required: true }) mode!: 'create' | 'edit';
  @Input() defaultStatus: Status = 'todo';
  @Input() task?: Task;
  @Output() closed = new EventEmitter<void>();
  @Output() taskSaved = new EventEmitter<Task>();

  private fb = inject(FormBuilder);
  private taskService = inject(TaskService);
  private authService = inject(AuthService);

  isSubmitting = signal(false);

  form = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    status: ['todo' as Status],
    priority: ['medium' as Task['priority']],
  });

  get isEdit() { return this.mode === 'edit'; }

  ngOnInit() {
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

    const request$ = this.isEdit && this.task
      ? this.taskService.updateTask(this.task.id, patch)
      : this.taskService.createTask({ ...patch, userId: this.authService.getCurrentUser()!.id });

    request$.subscribe({
      next: saved => {
        this.isSubmitting.set(false);
        this.taskSaved.emit(saved);
        this.closed.emit();
      },
      error: () => this.isSubmitting.set(false),
    });
  }
}
