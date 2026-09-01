import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { TaskService } from './task.service';
import { Task } from '../models/task.model';

const mockTask = (overrides: Partial<Task> = {}): Task => ({
  id: 1,
  title: 'Test task',
  status: 'todo',
  priority: 'medium',
  userId: 1,
  ...overrides,
});

describe('TaskService', () => {
  let service: TaskService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TaskService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ── Construction ──────────────────────────────────────────────

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with empty tasks', async () => {
    expect(await firstValueFrom(service.tasks$)).toEqual([]);
  });

  it('should start with loading false', async () => {
    expect(await firstValueFrom(service.loading$)).toBe(false);
  });

  it('should start with no error', async () => {
    expect(await firstValueFrom(service.error$)).toBeNull();
  });

  // ── loadTasksForUser() ────────────────────────────────────────

  it('should call the correct URL', () => {
    service.loadTasksForUser(1).subscribe();
    const req = http.expectOne('http://localhost:3000/tasks?userId=1');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('should set loading true before response and false after', async () => {
    const loadingStates: boolean[] = [];
    service.loading$.subscribe(l => loadingStates.push(l));

    service.loadTasksForUser(1).subscribe();
    expect(loadingStates).toContain(true);

    http.expectOne(r => r.url.includes('/tasks')).flush([mockTask()]);
    expect(loadingStates[loadingStates.length - 1]).toBe(false);
  });

  it('should populate tasks$ with the server response', async () => {
    const tasks = [mockTask({ id: 1 }), mockTask({ id: 2, title: 'Another' })];
    service.loadTasksForUser(1).subscribe();
    http.expectOne(r => r.url.includes('/tasks')).flush(tasks);

    expect(await firstValueFrom(service.tasks$)).toEqual(tasks);
  });

  it('should set error$ on HTTP failure', async () => {
    service.loadTasksForUser(1).subscribe();
    http.expectOne(r => r.url.includes('/tasks')).flush(null, { status: 500, statusText: 'Error' });

    // The service emits a translation key; the board resolves it via I18nService.
    expect(await firstValueFrom(service.error$)).toBe('errors.loadTasks');
  });

  it('should set loading false on HTTP failure', async () => {
    service.loadTasksForUser(1).subscribe();
    http.expectOne(r => r.url.includes('/tasks')).flush(null, { status: 500, statusText: 'Error' });

    expect(await firstValueFrom(service.loading$)).toBe(false);
  });

  it('should clear error$ before a new load', async () => {
    service.loadTasksForUser(1).subscribe();
    http.expectOne(r => r.url.includes('/tasks')).flush(null, { status: 500, statusText: 'Error' });

    service.loadTasksForUser(1).subscribe();
    expect(await firstValueFrom(service.error$)).toBeNull();
    http.expectOne(r => r.url.includes('/tasks')).flush([]);
  });

  // ── createTask() ──────────────────────────────────────────────

  it('should POST to /tasks', () => {
    service.createTask({ title: 'New', status: 'todo', priority: 'medium', userId: 1 }).subscribe();
    const req = http.expectOne('http://localhost:3000/tasks');
    expect(req.request.method).toBe('POST');
    req.flush(mockTask({ id: 99, title: 'New' }));
  });

  it('should append the created task to tasks$', async () => {
    const created = mockTask({ id: 99, title: 'New' });
    service.createTask({ title: 'New', status: 'todo', priority: 'medium', userId: 1 }).subscribe();
    http.expectOne('http://localhost:3000/tasks').flush(created);

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks).toContain(created);
  });

  it('should preserve existing tasks when creating a new one', async () => {
    const existing = mockTask({ id: 1 });
    service.loadTasksForUser(1).subscribe();
    http.expectOne(r => r.url.includes('/tasks')).flush([existing]);

    const added = mockTask({ id: 2, title: 'Added' });
    service.createTask({ title: 'Added', status: 'todo', priority: 'low', userId: 1 }).subscribe();
    http.expectOne('http://localhost:3000/tasks').flush(added);

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks.length).toBe(2);
    expect(tasks).toContain(existing);
    expect(tasks).toContain(added);
  });

  // ── updateTask() ──────────────────────────────────────────────

  it('should PATCH /tasks/:id with the given patch', () => {
    service.updateTask(1, { status: 'done' }).subscribe();
    const req = http.expectOne('http://localhost:3000/tasks/1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'done' });
    req.flush(mockTask({ status: 'done' }));
  });

  it('should replace the updated task in tasks$', async () => {
    const original = mockTask({ id: 1, status: 'todo' });
    service.loadTasksForUser(1).subscribe();
    http.expectOne(r => r.url.includes('/tasks')).flush([original]);

    const updated = { ...original, status: 'in-progress' } as Task;
    service.updateTask(1, { status: 'in-progress' }).subscribe();
    http.expectOne('http://localhost:3000/tasks/1').flush(updated);

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks[0].status).toBe('in-progress');
  });

  it('should not affect other tasks when updating one', async () => {
    const t1 = mockTask({ id: 1 });
    const t2 = mockTask({ id: 2, title: 'Other' });
    service.loadTasksForUser(1).subscribe();
    http.expectOne(r => r.url.includes('/tasks')).flush([t1, t2]);

    service.updateTask(1, { status: 'done' }).subscribe();
    http.expectOne('http://localhost:3000/tasks/1').flush({ ...t1, status: 'done' });

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks.find(t => t.id === 2)).toEqual(t2);
  });

  // Regression: dragging a card across columns twice in quick succession (e.g.
  // over a slow connection) used to leave it sitting in the first column until
  // the first PATCH resolved, and a late/out-of-order response for that first
  // PATCH could clobber the second, newer status. updateTask() must apply the
  // status optimistically and cancel any still-pending PATCH for the same task.
  it('reflects the new status immediately, before the PATCH resolves', async () => {
    const original = mockTask({ id: 1, status: 'todo' });
    service.loadTasksForUser(1).subscribe();
    http.expectOne(r => r.url.includes('/tasks')).flush([original]);

    service.updateTask(1, { status: 'in-progress' }).subscribe();

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks[0].status).toBe('in-progress');

    http.expectOne('http://localhost:3000/tasks/1').flush({ ...original, status: 'in-progress' });
  });

  it('cancels an in-flight update when a newer one for the same task is issued', async () => {
    const original = mockTask({ id: 1, status: 'todo' });
    service.loadTasksForUser(1).subscribe();
    http.expectOne(r => r.url.includes('/tasks')).flush([original]);

    // First drag: todo -> in-progress. Its response never arrives before the
    // second drag happens (slow connection).
    service.updateTask(1, { status: 'in-progress' }).subscribe();
    const staleReq = http.expectOne('http://localhost:3000/tasks/1');

    // Second drag before the first resolves: in-progress -> done.
    service.updateTask(1, { status: 'done' }).subscribe();
    expect(staleReq.cancelled).toBe(true);

    // Even though the stale request now resolves, it must not overwrite
    // the newer status.
    const freshReq = http.expectOne('http://localhost:3000/tasks/1');
    freshReq.flush({ ...original, status: 'done' });

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks[0].status).toBe('done');
  });

  it('reverts the optimistic status if the PATCH fails', async () => {
    const original = mockTask({ id: 1, status: 'todo' });
    service.loadTasksForUser(1).subscribe();
    http.expectOne(r => r.url.includes('/tasks')).flush([original]);

    let error: unknown;
    service.updateTask(1, { status: 'in-progress' }).subscribe({ error: e => (error = e) });
    http.expectOne('http://localhost:3000/tasks/1').flush(null, { status: 500, statusText: 'Error' });

    expect(error).toBeTruthy();
    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks[0].status).toBe('todo');
  });

  // ── deleteTask() ──────────────────────────────────────────────

  it('should DELETE /tasks/:id', () => {
    service.deleteTask(1).subscribe();
    const req = http.expectOne('http://localhost:3000/tasks/1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('should remove the deleted task from tasks$', async () => {
    const t1 = mockTask({ id: 1 });
    const t2 = mockTask({ id: 2, title: 'Keep me' });
    service.loadTasksForUser(1).subscribe();
    http.expectOne(r => r.url.includes('/tasks')).flush([t1, t2]);

    service.deleteTask(1).subscribe();
    http.expectOne('http://localhost:3000/tasks/1').flush(null);

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe(2);
  });

  it('should leave all other tasks intact after deletion', async () => {
    const t1 = mockTask({ id: 1 });
    const t2 = mockTask({ id: 2 });
    const t3 = mockTask({ id: 3 });
    service.loadTasksForUser(1).subscribe();
    http.expectOne(r => r.url.includes('/tasks')).flush([t1, t2, t3]);

    service.deleteTask(2).subscribe();
    http.expectOne('http://localhost:3000/tasks/2').flush(null);

    const tasks = await firstValueFrom(service.tasks$);
    expect(tasks.map(t => t.id)).toEqual([1, 3]);
  });
});
