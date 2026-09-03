import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { BoardComponent } from './board.component';
import { TaskService } from '../../services/task.service';
import { Task, Status } from '../../models/task.model';

const mk = (
  id: string,
  title: string,
  status: Status,
  priority: Task['priority'],
  position: number,
): Task => ({
  id,
  title,
  status,
  priority,
  position,
  createdAt: 't0',
  updatedAt: 't0',
});

class FakeTaskService {
  tasks$ = new BehaviorSubject<Task[]>([]);
  loading$ = new BehaviorSubject<boolean>(false);
  error$ = new BehaviorSubject<string | null>(null);
  loadTasks = vi.fn(() => of(undefined));
  updateTask = vi.fn((_id: string, _patch: unknown) => of({} as Task));
  reorderColumn = vi.fn((_status: Status, _orderedIds: string[]) => of(undefined));
}

function setup(tasks: Task[]) {
  const svc = new FakeTaskService();
  svc.tasks$.next(tasks);
  TestBed.configureTestingModule({
    providers: [{ provide: TaskService, useValue: svc }],
  });
  const fixture = TestBed.createComponent(BoardComponent);
  return { svc, comp: fixture.componentInstance, fixture };
}

describe('BoardComponent', () => {
  it('composes the priority filter and search with AND', () => {
    const { comp } = setup([
      mk('1', 'Alpha one', 'todo', 'high', 1),
      mk('2', 'Beta', 'todo', 'high', 2), // fails the search
      mk('3', 'Alpha two', 'in-progress', 'high', 3),
      mk('4', 'Alpha three', 'done', 'low', 4), // fails the priority
      mk('5', 'Alpha four', 'done', 'high', 5),
    ]);

    comp.setPriorityFilter('high');
    comp.setSearchQuery('alpha');

    expect(comp.filteredCount()).toBe(3);
    expect(comp.todoTasks().map((t) => t.id)).toEqual(['1']);
    expect(comp.inProgressTasks().map((t) => t.id)).toEqual(['3']);
    expect(comp.doneTasks().map((t) => t.id)).toEqual(['5']);
  });

  it('partitions the filtered tasks across the three columns without overlap', () => {
    const { comp } = setup([
      mk('1', 'a', 'todo', 'medium', 1),
      mk('2', 'b', 'todo', 'medium', 2),
      mk('3', 'c', 'in-progress', 'medium', 3),
      mk('4', 'd', 'done', 'medium', 4),
      mk('5', 'e', 'done', 'medium', 5),
    ]);

    const union = [...comp.todoTasks(), ...comp.inProgressTasks(), ...comp.doneTasks()];

    expect(comp.filteredCount()).toBe(5);
    expect(union).toHaveLength(comp.filteredCount());
    expect(comp.todoTasks().every((t) => t.status === 'todo')).toBe(true);
    expect(comp.inProgressTasks().every((t) => t.status === 'in-progress')).toBe(true);
    expect(comp.doneTasks().every((t) => t.status === 'done')).toBe(true);
  });

  it('keeps filteredCount in step with the visible cards after filtering', () => {
    const { comp } = setup([
      mk('1', 'keep', 'todo', 'high', 1),
      mk('2', 'drop', 'todo', 'low', 2),
      mk('3', 'keep too', 'done', 'high', 3),
    ]);

    comp.setPriorityFilter('high');

    expect(comp.filteredCount()).toBe(2);
    expect(comp.todoTasks().length + comp.inProgressTasks().length + comp.doneTasks().length).toBe(
      2,
    );
  });

  it('same-column reorder builds the full ordered id list and calls reorderColumn', () => {
    const { svc, comp } = setup([
      mk('1', 'a', 'todo', 'high', 1),
      mk('2', 'b', 'todo', 'high', 2),
      mk('3', 'c', 'todo', 'high', 3),
    ]);

    // Drop card 3 into the top slot of its own column.
    comp.onTaskDropped({ taskId: '3', newStatus: 'todo', targetIndex: 0 });

    expect(svc.reorderColumn).toHaveBeenCalledWith('todo', ['3', '1', '2']);
  });

  it('cross-column drop inserts the card at the target index with the new status', () => {
    const { svc, comp } = setup([
      mk('a', 'a', 'todo', 'high', 1),
      mk('x', 'x', 'done', 'high', 1),
      mk('y', 'y', 'done', 'high', 2),
    ]);

    comp.onTaskDropped({ taskId: 'a', newStatus: 'done', targetIndex: 1 });

    expect(svc.reorderColumn).toHaveBeenCalledWith('done', ['x', 'a', 'y']);
  });

  it('a drop that leaves the order unchanged issues no reorderColumn call', () => {
    const { svc, comp } = setup([
      mk('1', 'a', 'todo', 'high', 1),
      mk('2', 'b', 'todo', 'high', 2),
      mk('3', 'c', 'todo', 'high', 3),
    ]);

    // Dropping card 3 back at the end of its own column.
    comp.onTaskDropped({ taskId: '3', newStatus: 'todo', targetIndex: 3 });

    expect(svc.reorderColumn).not.toHaveBeenCalled();
  });

  it('clamps an out-of-range targetIndex to an append within the status', () => {
    const { svc, comp } = setup([mk('1', 'a', 'todo', 'high', 1), mk('2', 'b', 'todo', 'high', 2)]);

    comp.onTaskDropped({ taskId: '1', newStatus: 'todo', targetIndex: 99 });

    expect(svc.reorderColumn).toHaveBeenCalledWith('todo', ['2', '1']);
  });

  it('translates a filtered targetIndex to a position in the unfiltered column', () => {
    const { svc, comp } = setup([
      mk('a', 'a', 'todo', 'high', 1),
      mk('x', 'x', 'done', 'high', 1),
      mk('z', 'z', 'done', 'low', 2), // hidden by the priority pill
      mk('y', 'y', 'done', 'high', 3),
    ]);

    comp.setPriorityFilter('high'); // done column now renders [x, y]

    // Drop before the visible card at filtered index 1 (that is 'y'). The hidden
    // 'z' must stay ahead of 'y' in the persisted order.
    comp.onTaskDropped({ taskId: 'a', newStatus: 'done', targetIndex: 1 });

    expect(svc.reorderColumn).toHaveBeenCalledWith('done', ['x', 'z', 'a', 'y']);
  });
});
