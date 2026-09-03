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

  it('onTaskDropped is a no-op when the status is unchanged', () => {
    const { svc, comp } = setup([mk('1', 'x', 'todo', 'high', 1)]);

    comp.onTaskDropped({ taskId: '1', newStatus: 'todo' });

    expect(svc.updateTask).not.toHaveBeenCalled();
  });

  it('onTaskDropped moves a card to the bottom of a populated column', () => {
    const { svc, comp } = setup([
      mk('1', 'x', 'todo', 'high', 1),
      mk('2', 'y', 'done', 'high', 4),
      mk('3', 'z', 'done', 'high', 5),
    ]);

    comp.onTaskDropped({ taskId: '1', newStatus: 'done' });

    expect(svc.updateTask).toHaveBeenCalledWith('1', { status: 'done', position: 6 });
  });

  it('onTaskDropped into an empty column sends position 1', () => {
    const { svc, comp } = setup([mk('1', 'x', 'todo', 'high', 1), mk('2', 'y', 'done', 'high', 9)]);

    comp.onTaskDropped({ taskId: '1', newStatus: 'in-progress' });

    expect(svc.updateTask).toHaveBeenCalledWith('1', { status: 'in-progress', position: 1 });
  });

  it('computes columnMax from all tasks, not the filtered set', () => {
    const { svc, comp } = setup([
      mk('1', 'move me', 'todo', 'high', 1),
      mk('2', 'hidden big', 'done', 'low', 99), // filtered out by the priority pill
      mk('3', 'shown', 'done', 'high', 50),
    ]);

    comp.setPriorityFilter('high'); // the done column now only shows id 3

    comp.onTaskDropped({ taskId: '1', newStatus: 'done' });

    // max position across ALL done tasks is 99 -> 100, not 51
    expect(svc.updateTask).toHaveBeenCalledWith('1', { status: 'done', position: 100 });
  });
});
