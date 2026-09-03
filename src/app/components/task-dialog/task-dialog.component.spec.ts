import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { TaskDialogComponent } from './task-dialog.component';
import { TaskService } from '../../services/task.service';
import { Task } from '../../models/task.model';

class FakeTaskService {
  lastCreate!: Subject<Task>;
  lastUpdate!: Subject<Task>;

  createTask = vi.fn(() => {
    this.lastCreate = new Subject<Task>();
    return this.lastCreate.asObservable();
  });

  updateTask = vi.fn(() => {
    this.lastUpdate = new Subject<Task>();
    return this.lastUpdate.asObservable();
  });
}

const attached: HTMLElement[] = [];

/** `attach` puts the host in the document so focus assertions are meaningful. */
function mountCreate(attach = false) {
  const fixture = TestBed.createComponent(TaskDialogComponent);
  fixture.componentRef.setInput('mode', 'create');
  if (attach) {
    document.body.appendChild(fixture.nativeElement);
    attached.push(fixture.nativeElement);
  }
  fixture.detectChanges();
  fixture.componentInstance.form.setValue({
    title: 'A title',
    description: '',
    status: 'todo',
    priority: 'medium',
  });
  return fixture;
}

describe('TaskDialogComponent', () => {
  let svc: FakeTaskService;

  beforeEach(() => {
    svc = new FakeTaskService();
    TestBed.configureTestingModule({
      providers: [{ provide: TaskService, useValue: svc }],
    });
  });

  afterEach(() => {
    while (attached.length) attached.pop()!.remove();
  });

  it('sets the error key and keeps the dialog open when the save fails', () => {
    const fixture = mountCreate();
    const comp = fixture.componentInstance;
    let closed = false;
    comp.closed.subscribe(() => (closed = true));

    comp.submit();
    expect(comp.isSubmitting()).toBe(true);

    svc.lastCreate.error(new Error('boom'));
    fixture.detectChanges();

    expect(comp.isSubmitting()).toBe(false);
    expect(comp.error()).toBe('dialog.error.save');
    expect(closed).toBe(false);
    expect(fixture.nativeElement.querySelector('.form-error')).toBeTruthy();
  });

  it('clears any previous error and closes on a successful save', () => {
    const fixture = mountCreate();
    const comp = fixture.componentInstance;
    comp.error.set('dialog.error.save');
    let closed = false;
    comp.closed.subscribe(() => (closed = true));

    comp.submit();
    svc.lastCreate.next({
      id: '9',
      title: 'A title',
      status: 'todo',
      priority: 'medium',
      position: 1,
      createdAt: 't',
      updatedAt: 't',
    });

    expect(comp.error()).toBeNull();
    expect(comp.isSubmitting()).toBe(false);
    expect(closed).toBe(true);
  });

  it('moves focus to the title input when it opens', () => {
    const fixture = mountCreate(true);
    const title = fixture.nativeElement.querySelector('#task-title');
    expect(document.activeElement).toBe(title);
  });

  it('emits closed when Escape is pressed', () => {
    const fixture = mountCreate(true);
    let closed = false;
    fixture.componentInstance.closed.subscribe(() => (closed = true));

    fixture.nativeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(closed).toBe(true);
  });

  it('exposes aria-pressed on the priority buttons for the selected priority', () => {
    const fixture = mountCreate();
    fixture.componentInstance.form.controls.priority.setValue('high');
    fixture.detectChanges();

    const group = fixture.nativeElement.querySelector('.priority-toggle');
    expect(group.getAttribute('role')).toBe('group');

    const pressed = Array.from(
      group.querySelectorAll('.priority-btn') as NodeListOf<HTMLElement>,
    ).map((b) => b.getAttribute('aria-pressed'));
    expect(pressed).toEqual(['true', 'false', 'false']);
  });
});
