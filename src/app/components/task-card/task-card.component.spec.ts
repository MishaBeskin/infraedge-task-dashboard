import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { TaskCardComponent } from './task-card.component';
import { TaskService } from '../../services/task.service';
import { PointerDragService } from '../../services/pointer-drag.service';
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

/** Fake PointerDragService — records the touch-drag lifecycle calls. */
class FakePointerDragService {
  start = vi.fn();
  moveTo = vi.fn();
  drop = vi.fn();
  cancel = vi.fn();
}

/** Minimal PointerEvent stand-in (jsdom has no PointerEvent constructor). */
function pointer(type: string, props: Record<string, unknown>): Event {
  const e = new Event(type, { bubbles: true });
  Object.assign(e, props);
  return e;
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

/** `YYYY-MM-DD` for `n` days from today (n<0 = past). */
function isoInDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function mount(task: Task = baseTask) {
  const fixture = TestBed.createComponent(TaskCardComponent);
  fixture.componentRef.setInput('task', task);
  fixture.detectChanges();
  return fixture;
}

describe('TaskCardComponent', () => {
  let svc: FakeTaskService;
  let drag: FakePointerDragService;

  beforeEach(() => {
    svc = new FakeTaskService();
    drag = new FakePointerDragService();
    TestBed.configureTestingModule({
      providers: [
        { provide: TaskService, useValue: svc },
        { provide: PointerDragService, useValue: drag },
      ],
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

  // ── Due-date badge ─────────────────────────────────────────────

  it('renders no due badge when the task has no due date', () => {
    const badge = mount().nativeElement.querySelector('.due-badge');
    expect(badge).toBeNull();
  });

  it('renders a role="img" badge with a non-empty aria-label when a due date is set', () => {
    const fixture = mount({
      ...baseTask,
      createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      dueDate: isoInDays(20),
    });
    const badge: HTMLElement = fixture.nativeElement.querySelector('.due-badge');

    expect(badge).toBeTruthy();
    expect(badge.getAttribute('role')).toBe('img');
    expect(badge.getAttribute('aria-label')?.length).toBeGreaterThan(0);
  });

  it('shows the calendar icon for a future due date and the alert-triangle when overdue', () => {
    const future: HTMLElement = mount({
      ...baseTask,
      createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      dueDate: isoInDays(20),
    }).nativeElement.querySelector('.due-badge');
    // Feather calendar has a <rect>; alert-triangle does not.
    expect(future.querySelector('rect')).toBeTruthy();
    expect(future.classList.contains('is-overdue')).toBe(false);

    const overdue: HTMLElement = mount({
      ...baseTask,
      createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      dueDate: isoInDays(-3),
    }).nativeElement.querySelector('.due-badge');
    expect(overdue.querySelector('rect')).toBeNull();
    expect(overdue.querySelector('path')).toBeTruthy();
    expect(overdue.classList.contains('is-overdue')).toBe(true);
  });

  // ── Touch drag via the grip handle ──────────────────────────────

  it('starts a pointer drag from the grip handle on a touch pointerdown', () => {
    const fixture = mount();
    const comp = fixture.componentInstance;
    const handle: HTMLElement = fixture.nativeElement.querySelector('.drag-handle');

    handle.dispatchEvent(
      pointer('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 5, clientY: 5 }),
    );

    expect(comp.isDragging()).toBe(true);
    expect(drag.start).toHaveBeenCalledWith('1');
    expect(drag.moveTo).toHaveBeenCalledWith(5, 5);
  });

  it('feeds pointermove to the service and drops on pointerup', () => {
    const fixture = mount();
    const comp = fixture.componentInstance;
    const handle: HTMLElement = fixture.nativeElement.querySelector('.drag-handle');

    handle.dispatchEvent(
      pointer('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 0, clientY: 0 }),
    );
    handle.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 0, clientY: 60 }));
    expect(drag.moveTo).toHaveBeenLastCalledWith(0, 60);

    handle.dispatchEvent(pointer('pointerup', { pointerId: 1 }));
    expect(drag.drop).toHaveBeenCalledTimes(1);
    expect(comp.isDragging()).toBe(false);
  });

  it('ignores a mouse pointerdown so the native HTML5 path is left alone', () => {
    const fixture = mount();
    const comp = fixture.componentInstance;
    const handle: HTMLElement = fixture.nativeElement.querySelector('.drag-handle');

    handle.dispatchEvent(pointer('pointerdown', { pointerId: 1, pointerType: 'mouse' }));

    expect(comp.isDragging()).toBe(false);
    expect(drag.start).not.toHaveBeenCalled();
  });

  it('cancels the drag on pointercancel', () => {
    const fixture = mount();
    const comp = fixture.componentInstance;
    const handle: HTMLElement = fixture.nativeElement.querySelector('.drag-handle');

    handle.dispatchEvent(
      pointer('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 0, clientY: 0 }),
    );
    handle.dispatchEvent(pointer('pointercancel', { pointerId: 1 }));

    expect(drag.cancel).toHaveBeenCalledTimes(1);
    expect(comp.isDragging()).toBe(false);
  });
});
