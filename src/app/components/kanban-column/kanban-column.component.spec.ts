import { TestBed } from '@angular/core/testing';
import { KanbanColumnComponent, TaskDropEvent } from './kanban-column.component';
import { Task, Status } from '../../models/task.model';

const mk = (id: string): Task => ({
  id,
  title: `Task ${id}`,
  status: 'todo',
  priority: 'medium',
  position: Number(id),
  createdAt: 't0',
  updatedAt: 't0',
});

function make(status: Status = 'todo', tasks: Task[] = []) {
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(KanbanColumnComponent);
  fixture.componentRef.setInput('status', status);
  fixture.componentRef.setInput('tasks', tasks);
  fixture.detectChanges();
  return fixture;
}

const dragEvent = (over: Partial<DragEvent> = {}) =>
  ({ preventDefault: () => {}, ...over }) as unknown as DragEvent;

/** A dragover event positioned over a card whose bounding box is `top`..`top+height`. */
const cardDragEvent = (clientY: number, top: number, height: number) =>
  ({
    preventDefault: () => {},
    stopPropagation: () => {},
    clientY,
    currentTarget: { getBoundingClientRect: () => ({ top, height }) },
    dataTransfer: { dropEffect: '' } as unknown as DataTransfer,
  }) as unknown as DragEvent;

describe('KanbanColumnComponent', () => {
  it('balances the drag counter and toggles isDragOver', () => {
    const comp = make().componentInstance;

    comp.onDragEnter(dragEvent());
    expect(comp.isDragOver()).toBe(true);

    comp.onDragLeave();
    expect(comp.isDragOver()).toBe(false);
  });

  it('stays highlighted while the pointer crosses between child elements', () => {
    const comp = make().componentInstance;

    comp.onDragEnter(dragEvent()); // enter the column
    comp.onDragEnter(dragEvent()); // enter a child
    comp.onDragLeave(); // leave that child
    expect(comp.isDragOver()).toBe(true);

    comp.onDragLeave(); // leave the real column boundary
    expect(comp.isDragOver()).toBe(false);
  });

  it('resets the counter on drop and emits taskDropped from dataTransfer', () => {
    const comp = make('done').componentInstance;
    const events: TaskDropEvent[] = [];
    comp.taskDropped.subscribe((e) => events.push(e));

    comp.onDragEnter(dragEvent());
    comp.onDragEnter(dragEvent());
    comp.onDragEnter(dragEvent());

    comp.onDrop(
      dragEvent({
        dataTransfer: {
          getData: (k: string) => (k === 'taskId' ? 'task-42' : ''),
        } as unknown as DataTransfer,
      }),
    );

    expect(comp.isDragOver()).toBe(false);
    // No dragover happened, so the card lands at the end (empty list -> index 0).
    expect(events).toEqual([{ taskId: 'task-42', newStatus: 'done', targetIndex: 0 }]);

    // The counter is back to 0: one enter/leave pair clears the highlight again.
    comp.onDragEnter(dragEvent());
    expect(comp.isDragOver()).toBe(true);
    comp.onDragLeave();
    expect(comp.isDragOver()).toBe(false);
  });

  it('does not emit when the drop carries no taskId', () => {
    const comp = make().componentInstance;
    const spy = vi.fn();
    comp.taskDropped.subscribe(spy);

    comp.onDrop(
      dragEvent({
        dataTransfer: { getData: () => '' } as unknown as DataTransfer,
      }),
    );

    expect(spy).not.toHaveBeenCalled();
  });

  // ── drop-at-index ───────────────────────────────────────────────

  it('sets dropIndex to the card index when the pointer is in its top half', () => {
    const comp = make('todo', [mk('1'), mk('2'), mk('3')]).componentInstance;

    comp.onCardDragOver(cardDragEvent(105, 100, 40), 1); // midpoint 120, above it

    expect(comp.dropIndex()).toBe(1);
  });

  it('sets dropIndex to index + 1 when the pointer is in the card bottom half', () => {
    const comp = make('todo', [mk('1'), mk('2'), mk('3')]).componentInstance;

    comp.onCardDragOver(cardDragEvent(135, 100, 40), 1); // midpoint 120, below it

    expect(comp.dropIndex()).toBe(2);
  });

  it('appends (dropIndex = list length) when dragging over the column background', () => {
    const comp = make('todo', [mk('1'), mk('2'), mk('3')]).componentInstance;

    comp.onDragOver(dragEvent({ dataTransfer: { dropEffect: '' } as unknown as DataTransfer }));

    expect(comp.dropIndex()).toBe(3);
  });

  it('emits the tracked targetIndex on drop and clears the indicator', () => {
    const comp = make('in-progress', [mk('1'), mk('2'), mk('3')]).componentInstance;
    const events: TaskDropEvent[] = [];
    comp.taskDropped.subscribe((e) => events.push(e));

    comp.onCardDragOver(cardDragEvent(135, 100, 40), 1); // -> dropIndex 2
    comp.onDrop(
      dragEvent({
        dataTransfer: {
          getData: (k: string) => (k === 'taskId' ? 'task-7' : ''),
        } as unknown as DataTransfer,
      }),
    );

    expect(events).toEqual([{ taskId: 'task-7', newStatus: 'in-progress', targetIndex: 2 }]);
    expect(comp.dropIndex()).toBeNull();
  });

  it('clears dropIndex when the pointer leaves the column boundary', () => {
    const comp = make('todo', [mk('1'), mk('2')]).componentInstance;

    comp.onDragEnter(dragEvent()); // enter column
    comp.onDragEnter(dragEvent()); // enter a child
    comp.onCardDragOver(cardDragEvent(105, 100, 40), 1);
    expect(comp.dropIndex()).toBe(1);

    comp.onDragLeave(); // leave the child — still inside the column
    expect(comp.dropIndex()).toBe(1);

    comp.onDragLeave(); // leave the column boundary
    expect(comp.dropIndex()).toBeNull();
  });
});
