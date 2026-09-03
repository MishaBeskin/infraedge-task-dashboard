import { TestBed } from '@angular/core/testing';
import { KanbanColumnComponent } from './kanban-column.component';
import { Status } from '../../models/task.model';

function make(status: Status = 'todo') {
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(KanbanColumnComponent);
  fixture.componentRef.setInput('status', status);
  fixture.detectChanges();
  return fixture;
}

const dragEvent = (over: Partial<DragEvent> = {}) =>
  ({ preventDefault: () => {}, ...over }) as unknown as DragEvent;

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
    const events: Array<{ taskId: string; newStatus: Status }> = [];
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
    expect(events).toEqual([{ taskId: 'task-42', newStatus: 'done' }]);

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
});
