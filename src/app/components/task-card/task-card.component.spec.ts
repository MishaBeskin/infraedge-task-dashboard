import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { TaskCardComponent } from './task-card.component';
import { TaskService } from '../../services/task.service';
import { Task } from '../../models/task.model';

/** Fake TaskService — each call hands back a fresh Subject the test can drive. */
class FakeTaskService {
  lastUpdate!: Subject<Task>;
  lastDelete!: Subject<void>;

  updateTask = vi.fn(() => {
    this.lastUpdate = new Subject<Task>();
    return this.lastUpdate.asObservable();
  });

  deleteTask = vi.fn(() => {
    this.lastDelete = new Subject<void>();
    return this.lastDelete.asObservable();
  });
}

const baseTask: Task = {
  id: '1',
  title: 'Task',
  status: 'todo',
  priority: 'medium',
  position: 1,
  createdAt: 't0',
  updatedAt: 't0',
};

function mount() {
  const fixture = TestBed.createComponent(TaskCardComponent);
  fixture.componentRef.setInput('task', baseTask);
  fixture.detectChanges();
  return fixture;
}

describe('TaskCardComponent', () => {
  let svc: FakeTaskService;

  beforeEach(() => {
    svc = new FakeTaskService();
    TestBed.configureTestingModule({
      providers: [{ provide: TaskService, useValue: svc }],
    });
  });

  it('is created', () => {
    expect(mount().componentInstance).toBeTruthy();
  });

  it('renders the current status as the selected option', () => {
    const select: HTMLSelectElement = mount().nativeElement.querySelector('select');
    expect(select.value).toBe('todo');
  });

  it('resets the select and isUpdating when a status update fails', () => {
    const fixture = mount();
    const comp = fixture.componentInstance;
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');

    select.value = 'done';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(comp.isUpdating()).toBe(true);

    svc.lastUpdate.error(new Error('boom'));
    fixture.detectChanges();

    expect(comp.isUpdating()).toBe(false);
    expect(select.value).toBe('todo');
  });

  it('calls deleteTask once even on a rapid double confirm-click', () => {
    const comp = mount().componentInstance;

    comp.onDeleteClick(); // arm the confirm
    comp.onDeleteClick(); // confirm -> delete fires
    comp.onDeleteClick(); // repeat click is swallowed

    expect(svc.deleteTask).toHaveBeenCalledTimes(1);
  });

  it('still resets the confirm state after the 5s timeout', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const comp = mount().componentInstance;
      comp.onDeleteClick();
      expect(comp.showDeleteConfirm()).toBe(true);

      vi.advanceTimersByTime(5000);
      expect(comp.showDeleteConfirm()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows an inline error and resets state when the delete fails', () => {
    const fixture = mount();
    const comp = fixture.componentInstance;

    comp.onDeleteClick();
    comp.onDeleteClick();
    svc.lastDelete.error(new Error('boom'));
    fixture.detectChanges();

    expect(comp.deleting()).toBe(false);
    expect(comp.showDeleteConfirm()).toBe(false);
    expect(comp.deleteError()).toBe('card.deleteError');
    expect(fixture.nativeElement.querySelector('.card-error')).toBeTruthy();
  });
});
