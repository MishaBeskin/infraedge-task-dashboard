import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { PointerDragService, ColumnDragHandle } from './pointer-drag.service';
import { Status } from '../models/task.model';

/** A fake column: N `.card-slot` rows, each 40px tall, stacked from `firstTop`. */
function fakeColumn(status: Status, slotCount: number, firstTop = 100) {
  const slots = Array.from({ length: slotCount }, (_, i) => ({
    getBoundingClientRect: () => ({ top: firstTop + i * 40, height: 40 }) as DOMRect,
  }));
  const element = {
    getAttribute: (name: string) => (name === 'data-status' ? status : null),
    querySelectorAll: () => slots as unknown as NodeListOf<HTMLElement>,
  } as unknown as HTMLElement;

  const drops: Array<{ taskId: string; targetIndex: number }> = [];
  const handle: ColumnDragHandle & {
    dragOver: boolean;
    dropIndex: number | null;
    drops: typeof drops;
  } = {
    status,
    element,
    dragOver: false,
    dropIndex: null,
    drops,
    setDragOver(v) {
      this.dragOver = v;
    },
    setDropIndex(i) {
      this.dropIndex = i;
    },
    emitDrop(taskId, targetIndex) {
      drops.push({ taskId, targetIndex });
    },
  };
  return handle;
}

describe('PointerDragService', () => {
  let svc: PointerDragService;
  let elementFromPoint: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    elementFromPoint = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { elementFromPoint } }],
    });
    svc = TestBed.inject(PointerDragService);
  });

  /** Point `elementFromPoint` at a given column's element. */
  const pointAt = (handle: ColumnDragHandle) =>
    elementFromPoint.mockReturnValue({ closest: () => handle.element });

  it('tracks the dragging id / isDragging flag', () => {
    expect(svc.isDragging()).toBe(false);
    svc.start('t1');
    expect(svc.isDragging()).toBe(true);
    expect(svc.draggingId()).toBe('t1');
  });

  it('moveTo ignores calls when no drag is active', () => {
    const todo = fakeColumn('todo', 2);
    svc.register(todo);
    pointAt(todo);
    expect(svc.moveTo(10, 10)).toBeNull();
  });

  it('resolves the hovered column and an insert-before index at a card top-half', () => {
    const todo = fakeColumn('todo', 3); // slots at y=100,140,180 (mids 120,160,200)
    svc.register(todo);
    pointAt(todo);

    svc.start('t1');
    // y=150 is past slot0 mid(120), before slot1 mid(160) -> index 1
    expect(svc.moveTo(50, 150)).toEqual({ status: 'todo', index: 1 });
    expect(todo.dragOver).toBe(true);
    expect(todo.dropIndex).toBe(1);
  });

  it('appends (index = slot count) past the last card midpoint', () => {
    const todo = fakeColumn('todo', 2); // mids 120, 160
    svc.register(todo);
    pointAt(todo);

    svc.start('t1');
    expect(svc.moveTo(50, 999)).toEqual({ status: 'todo', index: 2 });
  });

  it('an empty column resolves to index 0', () => {
    const done = fakeColumn('done', 0);
    svc.register(done);
    pointAt(done);

    svc.start('t1');
    expect(svc.moveTo(5, 5)).toEqual({ status: 'done', index: 0 });
  });

  it('clears the highlight / indicator on every other column while hovering one', () => {
    const todo = fakeColumn('todo', 1);
    const done = fakeColumn('done', 0);
    svc.register(todo);
    svc.register(done);
    todo.setDragOver(true);
    todo.setDropIndex(0);
    pointAt(done);

    svc.start('t1');
    svc.moveTo(5, 5);

    expect(todo.dragOver).toBe(false);
    expect(todo.dropIndex).toBeNull();
    expect(done.dragOver).toBe(true);
  });

  it('drop() emits taskDropped on the resolved column then resets', () => {
    const todo = fakeColumn('todo', 2);
    const done = fakeColumn('done', 1); // mid 120
    svc.register(todo);
    svc.register(done);

    pointAt(done);
    svc.start('t9');
    svc.moveTo(10, 90); // above slot0 mid -> index 0
    svc.drop();

    expect(done.drops).toEqual([{ taskId: 't9', targetIndex: 0 }]);
    expect(svc.isDragging()).toBe(false);
    expect(done.dragOver).toBe(false);
    expect(done.dropIndex).toBeNull();
  });

  it('drop() with no resolved target emits nothing', () => {
    const todo = fakeColumn('todo', 1);
    svc.register(todo);
    elementFromPoint.mockReturnValue({ closest: () => null }); // finger outside any column

    svc.start('t1');
    svc.moveTo(0, 0);
    svc.drop();

    expect(todo.drops).toEqual([]);
    expect(svc.isDragging()).toBe(false);
  });

  it('cancel() ends the drag without emitting', () => {
    const todo = fakeColumn('todo', 1);
    svc.register(todo);
    pointAt(todo);

    svc.start('t1');
    svc.moveTo(5, 5);
    svc.cancel();

    expect(svc.isDragging()).toBe(false);
    expect(todo.drops).toEqual([]);
    expect(todo.dragOver).toBe(false);
  });

  it('unregister() drops a column from coordination', () => {
    const todo = fakeColumn('todo', 1);
    svc.register(todo);
    svc.unregister('todo');
    pointAt(todo);

    svc.start('t1');
    // The element still reports data-status="todo", but it is no longer registered.
    expect(svc.moveTo(5, 5)).toBeNull();
  });
});
