# CLAUDE.md

# Stack — Task Management App

## Project overview

Build a SaaS-style Kanban task management app called "Stack" using Angular 17+.
Backend is json-server running on http://localhost:3000 with db.json already provided.
The app is in Hebrew and RTL direction throughout.
Do NOT use any component library (no Angular Material, no PrimeNG). All UI is custom SCSS.

## Tech stack

- Angular 17, standalone components, strict TypeScript
- No NgModules anywhere
- SCSS for styling, CSS custom properties for design tokens
- json-server on port 3000 as the mock backend
- Functional guards and interceptors (not class-based)
- OnPush change detection on all components
- Angular 17 control flow syntax (@if, @for) — never *ngIf or *ngFor

## Design system

CSS custom properties to define in styles.scss:

- --brand: #E05A20
- --brand-hover: #c44d18
- --bg: #FAF8F4
- --surface: #ffffff
- --border: #e8e4dc
- --text-primary: #1a1a1a
- --text-muted: #888780
- --priority-high: #E24B4A
- --priority-medium: #E05A20
- --priority-low: #888780
- --radius: 10px

Global body: direction rtl, font system-ui, background var(--bg).

## Data models

File: src/app/models/task.model.ts

interface User { id, name, email, password, token }
interface Task { id, title, status: 'todo'|'in-progress'|'done', priority: 'high'|'medium'|'low', userId, description? }
type Priority = Task['priority']
type Status = Task['status']

## API endpoints (json-server on port 3000)

- GET /users?email=EMAIL&password=PASSWORD → login
- GET /tasks?userId=N → get user tasks
- POST /tasks → create task
- PATCH /tasks/:id → update task
- DELETE /tasks/:id → delete task

All outgoing requests must include Authorization: Bearer TOKEN header.

## File structure to create

src/app/
models/
task.model.ts
services/
auth.service.ts
task.service.ts
guards/
auth.guard.ts
interceptors/
auth.interceptor.ts
pages/
login/
login.component.ts
login.component.html
login.component.scss
board/
board.component.ts
board.component.html
board.component.scss
components/
header/
header.component.ts
header.component.html
header.component.scss
kanban-column/
kanban-column.component.ts
kanban-column.component.html
kanban-column.component.scss
task-card/
task-card.component.ts
task-card.component.html
task-card.component.scss
new-task-dialog/
new-task-dialog.component.ts
new-task-dialog.component.html
new-task-dialog.component.scss

## AuthService (src/app/services/auth.service.ts)

- Injectable providedIn root
- HttpClient calls GET /users?email=&password= to login
- On success: saves user to localStorage key 'stack_user', updates BehaviorSubject<User|null> currentUser$
- On app init: reads localStorage and restores session
- Methods: login(email,password), logout(), isLoggedIn(), getToken(), getCurrentUser()

## Auth interceptor (src/app/interceptors/auth.interceptor.ts)

- Functional HttpInterceptorFn named authInterceptor
- Reads token from AuthService.getToken()
- Clones request with Authorization: Bearer TOKEN header if token exists

## Auth guard (src/app/guards/auth.guard.ts)

- Functional CanActivateFn named authGuard
- Returns true if AuthService.isLoggedIn(), else navigates to /login and returns false

## App routes (src/app/app.routes.ts)

- /login → LoginComponent (lazy loaded)
- /board → BoardComponent (lazy loaded, canActivate: authGuard)
- '' → redirect to /board
- \*\* → redirect to /board

## App config (src/app/app.config.ts)

- provideRouter(routes)
- provideHttpClient(withInterceptors([authInterceptor]))

## App component (src/app/app.component.ts)

- Just a router outlet, nothing else

## TaskService (src/app/services/task.service.ts)

- Injectable providedIn root
- BehaviorSubject<Task[]> tasks$ (private, expose as asObservable)
- BehaviorSubject<boolean> loading$
- BehaviorSubject<string|null> error$
- loadTasksForUser(userId): GET /tasks?userId=N, updates tasks$, loading$, error$
- createTask(task): POST /tasks, appends to tasks$ BehaviorSubject
- updateTask(id, patch): PATCH /tasks/:id, updates matching item in tasks$
- deleteTask(id): DELETE /tasks/:id, removes from tasks$

## LoginComponent

Two-column layout (50/50 split), RTL.

RIGHT panel (branding):

- Logo "● stack" top-left
- Hebrew headline: "תכנן את העבודה. ואז בצע אותה." (large, bold, "בצע" in orange italic)
- Subtitle in Hebrew about the app
- Footer: © Stack 2026 · פרטיות · תנאים

LEFT panel (form):

- Title: "ברוך שובך"
- Subtitle: "התחבר למרחב העבודה שלך."
- Email field (label: דוא"ל), text input LTR direction
- Password field (label: סיסמה) with show/hide toggle eye button
- Submit button "→ התחברות" full width, orange
- Error message in red: "פרטי ההתחברות שגויים"
- Loading state: button disabled with text "מתחבר..."

Behavior: ReactiveFormsModule, on submit call AuthService.login(), on success navigate to /board.

## HeaderComponent

Inputs: taskCount: number
Outputs: addTask: EventEmitter<void>

RTL horizontal bar, white background, 64px height.

- Right side: orange avatar circle with user initials, orange "משימה חדשה +" button
- Center: "[N] משימות" in muted color
- Left side: "● stack" logo, logout arrow button that calls AuthService.logout() then navigates to /login

## KanbanColumnComponent

Inputs: title: string, tasks: Task[], status: Status
Outputs: addTask: EventEmitter<Status>

White card column, rounded corners, max-height with overflow-y scroll.

- Header: column title right-aligned, count badge circle, + button left-aligned
- List of TaskCardComponent
- Empty state: dashed border placeholder "אין משימות"
- - button emits addTask with the column's status

## TaskCardComponent

Input: task: Task

White card with colored right border by priority (high=red, medium=orange, low=gray).

- Task title
- Priority badge pill (גבוהה/בינונית/נמוכה) colored by priority
- Native <select> for status change (לעשות/בתהליך/הושלם) — on change calls TaskService.updateTask()
- Trash button — first click shows "למחוק?" confirm inline, second click calls TaskService.deleteTask()
- isUpdating flag: opacity 0.5 and disabled during PATCH request

## NewTaskDialogComponent

Inputs: defaultStatus: Status
Outputs: closed: EventEmitter<void>, taskCreated: EventEmitter<Task>

IMPORTANT: Use a normal-flow overlay div with min-height: 100vh — NOT position:fixed.
White modal centered, 480px wide, RTL.

Fields (ReactiveFormsModule):

- כותרת: required text input
- תיאור: optional textarea (labeled "תיאור · אופציונלי")
- סטטוס: native select pre-filled from defaultStatus
- עדיפות: 3-button pill toggle (גבוהה/בינונית/נמוכה), default בינונית, selected = dark filled

Footer: "POST /tasks" hint on right, ביטול + "צור משימה" buttons on left.
On submit: call TaskService.createTask() with form values + userId from AuthService, emit taskCreated, close.

## BoardComponent

Main page after login.

On init:

- Get current user from AuthService
- Call TaskService.loadTasksForUser(userId)
- Subscribe to tasks$ and store locally, re-apply filters on every emission

State:

- priorityFilter: signal<'all'|'high'|'medium'|'low'>('all')
- searchQuery: signal<string>('')
- showDialog: boolean
- dialogStatus: signal<Status>('todo')
- filtered: Task[] — derived by applying both filters to the tasks array

Computed column arrays (getters):

- todoTasks: filtered where status === 'todo'
- inProgressTasks: filtered where status === 'in-progress'
- doneTasks: filtered where status === 'done'

Template:

- <app-header> with taskCount and addTask handler
- Toolbar: search input (right), priority filter pill buttons (left) — הכל/גבוהה/בינונית/נמוכה
- @if loading: skeleton (3 columns, each with sk-header + 2 sk-card divs, shimmer animation)
- @else if error: red error banner
- @else: 3 <app-kanban-column> components in a flex row
- @if showDialog: <app-new-task-dialog>

## index.html change

<html lang="he" dir="rtl">

## Coding rules

- Every component must list all its dependencies in imports: []
- Never use *ngIf or *ngFor — always @if and @for
- Services injected via inject() not constructor
- takeUntilDestroyed for any long-lived subscriptions
- All components are standalone: true
- Commit message convention: feat(scope): description

## Mock API

Run backend:

```bash
npx json-server db.json --port 3000
```
